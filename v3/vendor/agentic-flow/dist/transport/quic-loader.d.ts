/** TLS configuration for wss:// peers (ADR-107). */
export interface TlsConfig {
    /** Path to PEM cert file (server side — bind certs for the listener). */
    certPath?: string;
    /** Path to PEM key file (server side). */
    keyPath?: string;
    /**
     * Pinned `sha256/<base64>` fingerprints of acceptable peer certs
     * (client side — outbound connections).
     *
     * When set, ONLY these exact certs are accepted. CA validation is
     * skipped — the fingerprint IS the trust anchor. Fail-closed: if the
     * peer's cert rotates and the fingerprint doesn't match, the
     * connection is refused (operator must update config + restart).
     *
     * This prevents:
     *   - Compromised public CAs issuing rogue certs for our domain
     *   - TLS-MITM attacks where the attacker holds a valid cert chain
     */
    pinnedFingerprints?: string[];
    /**
     * Optional CA bundle path for non-pinned mode (e.g. private CA).
     * Used only when `pinnedFingerprints` is empty/unset.
     */
    caPath?: string;
}
/** Caller-facing config — minimal common surface across both backends. */
export interface QuicTransportConfig {
    serverName?: string;
    maxIdleTimeoutMs?: number;
    maxConcurrentStreams?: number;
    enable0Rtt?: boolean;
    /** TLS materials for wss:// listeners + clients (ADR-107). */
    tls?: TlsConfig;
}
export interface AgentMessage {
    id: string;
    type: 'task' | 'result' | 'status' | 'coordination' | 'heartbeat' | string;
    payload: unknown;
    metadata?: Record<string, unknown>;
    /**
     * Stream multiplexing identifier. Messages with different streamIds
     * to the same peer are independent — receive queues and onMessage
     * handlers can scope per-stream, eliminating head-of-line blocking
     * for sequential `await` patterns on a single peer connection.
     *
     * Defaults to `'default'` if omitted (backward compat). Common
     * patterns:
     *   - One stream per logical request type (`'rpc'`, `'event'`,
     *     `'control'`)
     *   - One stream per task (`taskId` doubled as streamId)
     *   - One stream per priority class (`'high'`, `'normal'`, `'low'`)
     *
     * Maps cleanly to native QUIC streams when AGENTIC_FLOW_QUIC_NATIVE=1
     * (each app-layer streamId becomes a QUIC stream id at that point).
     */
    streamId?: string | number;
}
/** Default streamId when caller omits it. Backward-compat sentinel. */
export declare const DEFAULT_STREAM_ID = "default";
export interface PoolStatistics {
    active: number;
    idle: number;
    created: number;
    closed: number;
}
/** Inbound message handler — called for every received message. */
export type InboundMessageHandler = (address: string, message: AgentMessage) => void | Promise<void>;
/**
 * Per-stream subscription options. Pass to `onMessage` to scope a
 * handler to a specific streamId (only fires for messages with that
 * exact streamId). Omit to receive all streams.
 */
export interface OnMessageOptions {
    readonly streamId?: string | number;
}
/** Common interface both real-QUIC and fallback transports satisfy. */
export interface AgentTransport {
    send(address: string, message: AgentMessage): Promise<void>;
    /**
     * Receive the next message from a peer. Optional `streamId` scopes
     * to that stream's queue (independent of other streams to the same
     * peer). Omit to use the default stream — backward-compat behavior.
     */
    receive(address: string, streamId?: string | number): Promise<AgentMessage>;
    request(address: string, message: AgentMessage): Promise<AgentMessage>;
    sendBatch(address: string, messages: AgentMessage[]): Promise<void>;
    getStats(): Promise<PoolStatistics>;
    close(): Promise<void>;
    /**
     * Subscribe to inbound messages. The handler fires for every received
     * message that matches `options.streamId` (if provided) or for every
     * message regardless of streamId (if options omitted).
     *
     * Multiple handlers may be registered (per-stream OR all-streams or
     * a mix). Errors thrown by a handler are logged but do not stop
     * delivery to other handlers.
     *
     * Optional method — implementations that don't support push-style
     * delivery may omit it. Callers should use `transport.onMessage?.(h)`
     * to gracefully degrade.
     */
    onMessage?(handler: InboundMessageHandler, options?: OnMessageOptions): void;
}
/**
 * WebSocket fallback transport.
 *
 * Spec compliance: implements the AgentTransport interface using
 * `ws://` (or `wss://` if address starts with `wss://`). Each call to
 * `send` lazily opens (or reuses) a connection to `address`. The
 * `receive(address)` call drains the next queued message for that
 * address; if none is queued it polls every 100ms until one arrives.
 *
 * Limits vs real QUIC: no 0-RTT resumption, no multiplexed streams
 * (one TCP connection per peer), TLS handled by the WS layer (use
 * `wss://` for encryption). Performance is "good enough" for federation
 * messages at human/agent rates (≤ 100 RPS per peer).
 */
declare class WebSocketFallbackTransport implements AgentTransport {
    private readonly config;
    private connections;
    /**
     * Per-(address, streamId) message queue. Composite key shape
     * `${address}#${streamId}` — see {@link queueKey}. Each stream gets
     * its own FIFO so receive(addr, streamA) is independent of
     * receive(addr, streamB) — eliminates head-of-line blocking on a
     * single peer connection.
     */
    private messageQueue;
    private connectionsCreated;
    private connectionsClosed;
    private servers;
    /**
     * Inbound handlers. Each entry is { handler, streamId? }. When
     * streamId is undefined the handler receives ALL messages
     * regardless of stream; otherwise only messages with the matching
     * streamId. Lets callers register both per-stream + catch-all.
     */
    private inboundHandlers;
    /** Compose the per-(address, streamId) queue key. */
    private queueKey;
    /** Resolve the streamId for a message — defaults to DEFAULT_STREAM_ID. */
    private streamOf;
    constructor(config: Required<QuicTransportConfig>);
    static create(config?: QuicTransportConfig): Promise<WebSocketFallbackTransport>;
    /**
     * Bind a server-side listener so this transport instance can RECEIVE
     * messages from a remote peer (in addition to sending). Federation
     * peers run BOTH a listener and a client — calling listen(9100) plus
     * send('peer:9100', ...) gives bidirectional connectivity.
     *
     * Enables `permessage-deflate` compression with thresholds chosen
     * for federation envelopes (typically JSON, 100B-10KB):
     *   - threshold: 256B — don't waste CPU compressing tiny pings
     *   - level: 3 — balanced compression vs CPU (zlib's BEST_SPEED→6 range)
     *   - serverNoContextTakeover: true — bound per-conn memory growth
     */
    listen(port: number, host?: string): Promise<void>;
    /**
     * Wire the server's `connection` and per-socket `message` handlers.
     * Extracted so the wss:// path (where the WebSocketServer is attached
     * to a pre-created https.Server) can share the same logic.
     */
    private attachServerHandlers;
    private getOrCreateConnection;
    send(address: string, message: AgentMessage): Promise<void>;
    /**
     * Register an inbound handler. Optional `options.streamId` scopes
     * the handler to a specific stream (only fires for messages with
     * matching streamId). Omit to subscribe to ALL streams.
     *
     * Patterns:
     *   onMessage(h)                              — receives all
     *   onMessage(h, { streamId: 'rpc' })         — receives only rpc
     *   onMessage(h, { streamId: 'event' })       — receives only event
     *   (both registered)                         — both fire on
     *                                                their respective streams
     */
    onMessage(handler: InboundMessageHandler, options?: OnMessageOptions): void;
    /**
     * Fire all matching handlers for a received message. Stream-scoped
     * handlers only fire when the message's streamId matches; all-stream
     * handlers always fire. Errors thrown sync OR async-rejected by one
     * handler don't stop delivery to others.
     */
    private dispatchInbound;
    receive(address: string, streamId?: string | number): Promise<AgentMessage>;
    request(address: string, message: AgentMessage): Promise<AgentMessage>;
    sendBatch(address: string, messages: AgentMessage[]): Promise<void>;
    getStats(): Promise<PoolStatistics>;
    close(): Promise<void>;
}
/**
 * Public API — load a working transport, preferring real QUIC when
 * available, falling back to WebSocket otherwise. The returned object
 * satisfies the AgentTransport interface in both cases.
 *
 * Example:
 *   const t = await loadQuicTransport({ serverName: 'ruvultra:9100' });
 *   await t.send('ruvultra:9100', { id: '1', type: 'task', payload: {...} });
 *
 * Federation v1 ships on the WebSocket fallback (this is the actual
 * working transport today). When the native QUIC binding lands, set
 * the AGENTIC_FLOW_QUIC_NATIVE=1 environment variable and the same
 * code path picks up the upgrade with no API changes.
 */
export declare function loadQuicTransport(config?: QuicTransportConfig): Promise<AgentTransport>;
/** Quick capability probe for the doctor / health surface. */
export declare function isQuicAvailable(): Promise<boolean>;
export interface TransportCapabilities {
    quicAvailable: boolean;
    webSocketFallbackAvailable: true;
    selectedBackend: 'quic' | 'websocket';
}
export declare function getTransportCapabilities(): Promise<TransportCapabilities>;
export { WebSocketFallbackTransport };
//# sourceMappingURL=quic-loader.d.ts.map