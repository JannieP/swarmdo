/**
 * Tests for ADR-109 — inbound dispatcher.
 *
 * Pins the security gates the receive path enforces:
 *   1. PEER_UNKNOWN — sender not in discovery → reject, no event
 *   2. PEER_SUSPENDED — defense-in-depth (outbound short-circuit
 *      already prevents this in normal flow, but receive enforces too)
 *   3. PEER_EVICTED — same
 *   4. MISSING_METADATA — no sourceNodeId → reject
 *   5. Happy path — known ACTIVE peer → audit `message_received`,
 *      typed event emitted, peer.markSeen() called
 *   6. EventBus throw doesn't crash the dispatcher
 */

import { describe, it, expect, vi } from 'vitest';
import {
  dispatchInbound,
  FEDERATION_INBOUND_EVENT_PREFIX,
  type InboundDispatchDeps,
} from '../../src/application/inbound-dispatcher.js';
import { FederationNode } from '../../src/domain/entities/federation-node.js';
import { FederationNodeState } from '../../src/domain/value-objects/federation-node-state.js';
import type { AgentMessage } from 'agentic-flow/transport/loader';

function mkPeer(nodeId: string, state?: FederationNodeState) {
  return FederationNode.create({
    nodeId,
    publicKey: `pk-${nodeId}`,
    endpoint: `ws://${nodeId}:9100`,
    capabilities: {
      agentTypes: [],
      maxConcurrentSessions: 1,
      supportedProtocols: [],
      complianceModes: [],
    },
    metadata: {},
    state,
  });
}

function mkDeps(peers: FederationNode[] = []): {
  deps: InboundDispatchDeps;
  audits: { eventType: string; data: unknown }[];
  events: { event: string; data: unknown }[];
} {
  const peerMap = new Map(peers.map((p) => [p.nodeId, p]));
  const audits: { eventType: string; data: unknown }[] = [];
  const events: { event: string; data: unknown }[] = [];
  return {
    audits,
    events,
    deps: {
      discovery: { getPeer: (id: string) => peerMap.get(id) },
      audit: {
        log: (async (eventType: string, data: unknown) => {
          audits.push({ eventType, data });
        }) as InboundDispatchDeps['audit']['log'],
      },
      eventBus: {
        emit: (event, data) => {
          events.push({ event, data });
        },
      },
      logger: { debug: vi.fn(), warn: vi.fn() },
    },
  };
}

const baseMsg = (sourceNodeId: string | undefined, type = 'task'): AgentMessage => ({
  id: 'msg-1',
  type,
  payload: { test: true },
  metadata: sourceNodeId ? { sourceNodeId } : undefined,
});

describe('dispatchInbound — security gates (ADR-109)', () => {
  it('rejects MISSING_METADATA when no sourceNodeId in metadata', async () => {
    const { deps, audits, events } = mkDeps();
    const r = await dispatchInbound('1.2.3.4:55555', baseMsg(undefined), deps);
    expect(r).toEqual({ accepted: false, reason: 'MISSING_METADATA' });
    expect(audits[0].eventType).toBe('message_rejected');
    expect(events).toEqual([]);
  });

  it('rejects PEER_UNKNOWN when sender not in discovery', async () => {
    const { deps, audits, events } = mkDeps([]);
    const r = await dispatchInbound('1.2.3.4:55555', baseMsg('ghost-node'), deps);
    expect(r).toEqual({ accepted: false, reason: 'PEER_UNKNOWN' });
    expect(audits[0].eventType).toBe('message_rejected');
    expect((audits[0].data as { metadata: { reason: string } }).metadata.reason).toBe('PEER_UNKNOWN');
    expect(events).toEqual([]);
  });

  it('rejects PEER_SUSPENDED (defense-in-depth)', async () => {
    const peer = mkPeer('alpha', FederationNodeState.SUSPENDED);
    const { deps, audits, events } = mkDeps([peer]);
    const r = await dispatchInbound('1.2.3.4:55555', baseMsg('alpha'), deps);
    expect(r).toEqual({ accepted: false, reason: 'PEER_SUSPENDED' });
    expect(audits[0].eventType).toBe('message_rejected');
    expect(events).toEqual([]);
  });

  it('rejects PEER_EVICTED (defense-in-depth)', async () => {
    const peer = mkPeer('alpha', FederationNodeState.EVICTED);
    const { deps, audits, events } = mkDeps([peer]);
    const r = await dispatchInbound('1.2.3.4:55555', baseMsg('alpha'), deps);
    expect(r).toEqual({ accepted: false, reason: 'PEER_EVICTED' });
    expect(events).toEqual([]);
  });
});

describe('dispatchInbound — happy path', () => {
  it('accepts ACTIVE peer, audits message_received, emits typed event', async () => {
    const peer = mkPeer('alpha');
    const { deps, audits, events } = mkDeps([peer]);
    const r = await dispatchInbound('1.2.3.4:55555', baseMsg('alpha', 'task'), deps);
    expect(r).toEqual({ accepted: true, sourceNodeId: 'alpha', messageType: 'task' });
    expect(audits[0].eventType).toBe('message_received');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe(`${FEDERATION_INBOUND_EVENT_PREFIX}:task`);
  });

  it('event payload includes address, sourceNodeId, message, peer', async () => {
    const peer = mkPeer('alpha');
    const { deps, events } = mkDeps([peer]);
    await dispatchInbound('1.2.3.4:55555', baseMsg('alpha'), deps);
    const data = events[0].data as Record<string, unknown>;
    expect(data.address).toBe('1.2.3.4:55555');
    expect(data.sourceNodeId).toBe('alpha');
    expect(data.peer).toBe(peer);
    expect((data.message as AgentMessage).id).toBe('msg-1');
  });

  it('different messageTypes produce different event names', async () => {
    const peer = mkPeer('alpha');
    const { deps, events } = mkDeps([peer]);
    await dispatchInbound('a', baseMsg('alpha', 'task'), deps);
    await dispatchInbound('a', baseMsg('alpha', 'memory-query'), deps);
    await dispatchInbound('a', baseMsg('alpha', 'context-share'), deps);
    expect(events.map((e) => e.event)).toEqual([
      'federation:inbound:task',
      'federation:inbound:memory-query',
      'federation:inbound:context-share',
    ]);
  });

  it('marks peer as seen on accepted delivery (drives stale detection)', async () => {
    const peer = mkPeer('alpha');
    const t0 = peer.lastSeen;
    await new Promise((r) => setTimeout(r, 5));
    const { deps } = mkDeps([peer]);
    await dispatchInbound('a', baseMsg('alpha'), deps);
    expect(peer.lastSeen.getTime()).toBeGreaterThan(t0.getTime());
  });
});

describe('dispatchInbound — robustness', () => {
  it('eventBus.emit throw does not crash the dispatcher', async () => {
    const peer = mkPeer('alpha');
    const { deps, audits } = mkDeps([peer]);
    deps.eventBus.emit = () => {
      throw new Error('eventBus is down');
    };
    // Must not throw
    const r = await dispatchInbound('a', baseMsg('alpha'), deps);
    // Audit STILL recorded — only the emit failed
    expect(r.accepted).toBe(true);
    expect(audits[0].eventType).toBe('message_received');
  });
});

describe('dispatchInbound — signature verification', () => {
  function withVerifier(
    peers: FederationNode[],
    verify: (canon: string, sig: string | null, pk: string) => boolean,
  ) {
    const base = mkDeps(peers);
    return {
      ...base,
      deps: { ...base.deps, verifyEnvelope: verify },
    };
  }

  it('rejects INVALID_SIGNATURE when verifier returns false', async () => {
    const peer = mkPeer('alpha');
    const { deps, audits, events } = withVerifier([peer], () => false);
    const msg = {
      ...baseMsg('alpha'),
      metadata: { sourceNodeId: 'alpha', signature: 'fake-sig' },
    };
    const r = await dispatchInbound('1.2.3.4:9999', msg, deps);
    expect(r).toEqual({ accepted: false, reason: 'INVALID_SIGNATURE' });
    expect(audits[0].eventType).toBe('message_rejected');
    expect((audits[0].data as { metadata: { reason: string } }).metadata.reason).toBe(
      'INVALID_SIGNATURE',
    );
    expect(events).toEqual([]);
  });

  it('rejects when signature is missing from metadata (verifier called with null)', async () => {
    const peer = mkPeer('alpha');
    let calledWith: { sig: string | null } | null = null;
    const { deps, audits } = withVerifier([peer], (_canon, sig) => {
      calledWith = { sig };
      return false;
    });
    // Message has sourceNodeId but no signature — verifier sees sig=null
    const r = await dispatchInbound('a', baseMsg('alpha'), deps);
    expect(r).toEqual({ accepted: false, reason: 'INVALID_SIGNATURE' });
    expect(calledWith).toEqual({ sig: null });
    expect(audits[0].eventType).toBe('message_rejected');
  });

  it('accepts when verifier returns true', async () => {
    const peer = mkPeer('alpha');
    const { deps, audits, events } = withVerifier([peer], () => true);
    const msg = {
      ...baseMsg('alpha'),
      metadata: { sourceNodeId: 'alpha', signature: 'valid-sig' },
    };
    const r = await dispatchInbound('a', msg, deps);
    expect(r).toEqual({ accepted: true, sourceNodeId: 'alpha', messageType: 'task' });
    expect(audits[0].eventType).toBe('message_received');
    expect(events).toHaveLength(1);
  });

  it('verifier is called with peer publicKey (not attacker-supplied)', async () => {
    const peer = mkPeer('alpha');
    let receivedPk = '';
    const { deps } = withVerifier([peer], (_c, _s, pk) => {
      receivedPk = pk;
      return true;
    });
    await dispatchInbound('a', { ...baseMsg('alpha'), metadata: { sourceNodeId: 'alpha', signature: 's' } }, deps);
    // pk-alpha is set in mkPeer, NOT something the attacker can spoof
    expect(receivedPk).toBe('pk-alpha');
  });

  it('peer-state checks fire BEFORE signature check (cheaper rejections first)', async () => {
    const peer = mkPeer('alpha', FederationNodeState.SUSPENDED);
    let verifyCalled = false;
    const { deps } = withVerifier([peer], () => {
      verifyCalled = true;
      return true;
    });
    const r = await dispatchInbound('a', baseMsg('alpha'), deps);
    expect(r.accepted).toBe(false);
    if (!r.accepted) expect(r.reason).toBe('PEER_SUSPENDED');
    // SUSPENDED rejection short-circuits BEFORE the (expensive) sig check
    expect(verifyCalled).toBe(false);
  });

  it('legacy mode (no verifier injected) accepts without sig check — backward compat', async () => {
    const peer = mkPeer('alpha');
    const { deps, events } = mkDeps([peer]); // no verifyEnvelope
    const r = await dispatchInbound('a', baseMsg('alpha'), deps);
    expect(r.accepted).toBe(true);
    expect(events).toHaveLength(1);
  });
});

describe('canonicalizeEnvelopeForVerify', () => {
  it('strips signature from metadata before canonicalization', async () => {
    const { canonicalizeEnvelopeForVerify } = await import(
      '../../src/application/inbound-dispatcher.js'
    );
    const withSig = canonicalizeEnvelopeForVerify({
      id: 'm',
      type: 't',
      payload: { x: 1 },
      metadata: { sourceNodeId: 'a', signature: 'XXX' },
    });
    const withoutSig = canonicalizeEnvelopeForVerify({
      id: 'm',
      type: 't',
      payload: { x: 1 },
      metadata: { sourceNodeId: 'a' },
    });
    expect(withSig).toBe(withoutSig);
  });

  it('produces deterministic output (same fields → same string)', async () => {
    const { canonicalizeEnvelopeForVerify } = await import(
      '../../src/application/inbound-dispatcher.js'
    );
    const a = canonicalizeEnvelopeForVerify({
      id: 'm',
      type: 't',
      payload: { x: 1 },
      metadata: { sourceNodeId: 'a' },
    });
    const b = canonicalizeEnvelopeForVerify({
      // same inputs, different construction order
      metadata: { sourceNodeId: 'a' },
      payload: { x: 1 },
      type: 't',
      id: 'm',
    });
    expect(a).toBe(b);
  });
});
