"use strict";
/**
 * Embedding provenance — ADR-210 D0 cross-cutting invariant.
 *
 * Every persisted vector store written through the embedding path records
 * `{ embedderKind, modelId, dimension, normalize, prefixPolicy }`. Inserts
 * whose provenance does not match the store's recorded provenance are
 * REFUSED (clear error naming both sides), never coerced. Stores that
 * predate provenance metadata are treated as legacy hash stores and open
 * read-only for vector writes until re-embedded (`swarmvector hooks reembed`).
 *
 * This module is the single source of truth for:
 *   - the provenance record type + compare/refuse logic (D0),
 *   - legacy-default derivation for pre-ADR-210 stores (D0),
 *   - per-model query/passage prefix policies (D4),
 *   - rollout flag resolution: RUVECTOR_EMBEDDER / RUVECTOR_ONNX /
 *     RUVECTOR_REEMBED (D5),
 *   - the once-per-process loud hash-fallback warning (D1).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvenanceMismatchError = exports.MAX_PROVENANCE_DIMENSION = exports.MODEL_PREFIXES = exports.BGE_QUERY_INSTRUCTION = void 0;
exports.getModelPrefixSpec = getModelPrefixSpec;
exports.prefixText = prefixText;
exports.embedderKindForModel = embedderKindForModel;
exports.legacyHashProvenance = legacyHashProvenance;
exports.describeProvenance = describeProvenance;
exports.compareProvenance = compareProvenance;
exports.sanitizeProvenance = sanitizeProvenance;
exports.assertProvenanceMatch = assertProvenanceMatch;
exports.resolveEmbedderSelection = resolveEmbedderSelection;
exports.resolveReembedPolicy = resolveReembedPolicy;
exports.warnHashFallbackOnce = warnHashFallbackOnce;
exports.hashFallbackWarned = hashFallbackWarned;
exports.resetHashFallbackWarningForTests = resetHashFallbackWarningForTests;
const NO_PREFIX = { prefixPolicy: 'none', queryPrefix: '', passagePrefix: '' };
/** BGE en v1.5 documented query instruction (short query → long passage). */
exports.BGE_QUERY_INSTRUCTION = 'Represent this sentence for searching relevant passages: ';
/**
 * Prefix conventions per model card:
 * - all-MiniLM-L6-v2 / L12: general semantic search, NO prefixes.
 * - e5-small-v2: REQUIRES 'query: ' / 'passage: ' (quality degrades without).
 * - bge-small/base-en-v1.5: query instruction recommended for retrieval;
 *   passages need no instruction.
 * - gte-small: no prefixes documented.
 */
exports.MODEL_PREFIXES = {
    'all-MiniLM-L6-v2': { ...NO_PREFIX },
    'all-MiniLM-L12-v2': { ...NO_PREFIX },
    'e5-small-v2': { prefixPolicy: 'required', queryPrefix: 'query: ', passagePrefix: 'passage: ' },
    'bge-small-en-v1.5': { prefixPolicy: 'query-recommended', queryPrefix: exports.BGE_QUERY_INSTRUCTION, passagePrefix: '' },
    'bge-base-en-v1.5': { prefixPolicy: 'query-recommended', queryPrefix: exports.BGE_QUERY_INSTRUCTION, passagePrefix: '' },
    'gte-small': { ...NO_PREFIX },
};
/**
 * Prefix spec for a model; unknown models get the no-prefix policy.
 * Own-property lookup only: a hostile model id like '__proto__' or
 * 'constructor' must resolve to NO_PREFIX, not to a prototype member
 * (ADR-210 security pass).
 */
function getModelPrefixSpec(modelId) {
    if (modelId && Object.prototype.hasOwnProperty.call(exports.MODEL_PREFIXES, modelId)) {
        return exports.MODEL_PREFIXES[modelId];
    }
    return NO_PREFIX;
}
/**
 * Pure prefix application (D4): the exact text handed to the tokenizer for a
 * query/passage embed of `text` under `modelId`'s registered policy.
 * MiniLM applies NO prefix on either entry point (acceptance gates 6–7).
 */
function prefixText(modelId, kind, text) {
    const spec = getModelPrefixSpec(modelId);
    const prefix = kind === 'query' ? spec.queryPrefix : spec.passagePrefix;
    return prefix ? prefix + text : text;
}
/** Embedder family for an ONNX model id. */
function embedderKindForModel(modelId) {
    return modelId && modelId.startsWith('all-MiniLM') ? 'onnx-minilm' : 'onnx';
}
// ============================================================================
// D0 — provenance compare / refuse / legacy derivation
// ============================================================================
/**
 * Legacy default for stores that predate provenance metadata: hash-embedded,
 * un-normalized as far as we can prove, no prefixes. Such stores open
 * READ-ONLY for vector writes until re-embedded.
 */
function legacyHashProvenance(dimension = 256) {
    return { embedderKind: 'hash', modelId: null, dimension, normalize: false, prefixPolicy: 'none' };
}
/** Human-readable one-liner for error messages. */
function describeProvenance(p) {
    const model = p.modelId ? `, model=${p.modelId}` : '';
    return `{ embedder=${p.embedderKind}${model}, dim=${p.dimension}, normalize=${p.normalize}, prefixPolicy=${p.prefixPolicy} }`;
}
/** Field names on which two provenance records disagree (empty = match). */
function compareProvenance(a, b) {
    const mismatches = [];
    if (a.embedderKind !== b.embedderKind)
        mismatches.push('embedderKind');
    if ((a.modelId ?? null) !== (b.modelId ?? null))
        mismatches.push('modelId');
    if (a.dimension !== b.dimension)
        mismatches.push('dimension');
    if (!!a.normalize !== !!b.normalize)
        mismatches.push('normalize');
    if (a.prefixPolicy !== b.prefixPolicy)
        mismatches.push('prefixPolicy');
    return mismatches;
}
/** Upper bound accepted for a provenance dimension read from disk. */
exports.MAX_PROVENANCE_DIMENSION = 65536;
const VALID_PREFIX_POLICIES = ['none', 'required', 'query-recommended'];
/**
 * Sanitize a provenance record read from DISK (a `.meta.json` sidecar or
 * `intelligence.json`). On-disk JSON is untrusted input: a malformed or
 * adversarial record must never crash the caller. Anything that is not a
 * plausibly-valid record is treated as ABSENT (returns null), which callers
 * already handle as the no-provenance / legacy path — conservative for a
 * corrupted stamp (the store degrades to read-only for vector writes rather
 * than accepting writes under a fabricated identity).
 */
function sanitizeProvenance(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return null;
    const v = value;
    const embedderKind = v.embedderKind;
    if (typeof embedderKind !== 'string' || embedderKind.length === 0 || embedderKind.length > 64) {
        return null;
    }
    const dimension = v.dimension;
    if (typeof dimension !== 'number' ||
        !Number.isInteger(dimension) ||
        dimension < 1 ||
        dimension > exports.MAX_PROVENANCE_DIMENSION) {
        return null;
    }
    let modelId = null;
    if (typeof v.modelId === 'string') {
        if (v.modelId.length === 0 || v.modelId.length > 256)
            return null;
        modelId = v.modelId;
    }
    else if (v.modelId !== null && v.modelId !== undefined) {
        return null;
    }
    let prefixPolicy = 'none';
    if (v.prefixPolicy !== undefined) {
        if (typeof v.prefixPolicy !== 'string' || !VALID_PREFIX_POLICIES.includes(v.prefixPolicy)) {
            return null;
        }
        prefixPolicy = v.prefixPolicy;
    }
    return { embedderKind, modelId, dimension, normalize: !!v.normalize, prefixPolicy };
}
/** Thrown when an insert's provenance does not match the store's (D0). */
class ProvenanceMismatchError extends Error {
    constructor(store, active, mismatches, storeName) {
        super(`Embedding-provenance mismatch (ADR-210): refusing vector write to ${storeName}. ` +
            `Store records ${describeProvenance(store)} but the active embedder is ` +
            `${describeProvenance(active)} (differs on: ${mismatches.join(', ')}). ` +
            `Mixed stores are never created — re-embed the store ('swarmvector hooks reembed') ` +
            `or switch the active embedder (RUVECTOR_EMBEDDER=auto|minilm|hash).`);
        this.code = 'ERR_EMBEDDING_PROVENANCE';
        this.name = 'ProvenanceMismatchError';
        this.store = store;
        this.active = active;
        this.mismatches = mismatches;
    }
}
exports.ProvenanceMismatchError = ProvenanceMismatchError;
/** Refuse mismatched inserts with an error naming both sides (D0). */
function assertProvenanceMatch(store, active, storeName = 'vector store') {
    const mismatches = compareProvenance(store, active);
    if (mismatches.length > 0) {
        throw new ProvenanceMismatchError(store, active, mismatches, storeName);
    }
}
// ============================================================================
// D5 — rollout flags (env overrides config)
// ============================================================================
/**
 * Resolve RUVECTOR_EMBEDDER / RUVECTOR_ONNX.
 * Precedence: RUVECTOR_EMBEDDER wins when both are set; RUVECTOR_ONNX=0 is
 * shorthand for `hash`, =1 for `minilm`. Unrecognized values fall back to
 * 'auto' (MiniLM when loadable, loud hash fallback otherwise).
 */
function resolveEmbedderSelection(env = process.env) {
    const embedder = (env.RUVECTOR_EMBEDDER || '').trim().toLowerCase();
    if (embedder === 'auto' || embedder === 'minilm' || embedder === 'hash')
        return embedder;
    const onnx = (env.RUVECTOR_ONNX || '').trim();
    if (onnx === '0')
        return 'hash';
    if (onnx === '1')
        return 'minilm';
    return 'auto';
}
/**
 * Resolve RUVECTOR_REEMBED: what happens when opening a store whose
 * provenance mismatches the active embedder.
 *   refuse (default) — error;
 *   warn             — open read-only with a single warning;
 *   auto             — re-embed in place when source text exists, refuse otherwise.
 */
function resolveReembedPolicy(env = process.env) {
    const v = (env.RUVECTOR_REEMBED || '').trim().toLowerCase();
    if (v === 'refuse' || v === 'warn' || v === 'auto')
        return v;
    return 'refuse';
}
// ============================================================================
// D1 — loud (but once-per-process) hash-fallback warning
// ============================================================================
let fallbackWarned = false;
/**
 * Emit exactly ONE stderr warning per process the first time the hash
 * fallback serves an embed that the ONNX embedder was supposed to handle
 * (acceptance gate 2). Returns true when the warning was emitted by this call.
 */
function warnHashFallbackOnce(reason) {
    if (fallbackWarned)
        return false;
    fallbackWarned = true;
    const detail = reason ? ` Reason: ${reason}.` : '';
    process.stderr.write(`swarmvector: ONNX semantic embedder unavailable — using deterministic hash-fallback embeddings ` +
        `(no semantic signal, reduced search quality).${detail} ` +
        `Set RUVECTOR_EMBEDDER=hash to silence this or RUVECTOR_EMBEDDER=minilm to hard-require the model. ` +
        `(warned once per process)\n`);
    return true;
}
/** Whether the once-per-process fallback warning has fired. */
function hashFallbackWarned() {
    return fallbackWarned;
}
/** Test hook: reset the once-per-process warning latch. */
function resetHashFallbackWarningForTests() {
    fallbackWarned = false;
}
exports.default = {
    MODEL_PREFIXES: exports.MODEL_PREFIXES,
    BGE_QUERY_INSTRUCTION: exports.BGE_QUERY_INSTRUCTION,
    getModelPrefixSpec,
    prefixText,
    embedderKindForModel,
    legacyHashProvenance,
    describeProvenance,
    compareProvenance,
    sanitizeProvenance,
    MAX_PROVENANCE_DIMENSION: exports.MAX_PROVENANCE_DIMENSION,
    ProvenanceMismatchError,
    assertProvenanceMatch,
    resolveEmbedderSelection,
    resolveReembedPolicy,
    warnHashFallbackOnce,
    hashFallbackWarned,
    resetHashFallbackWarningForTests,
};
