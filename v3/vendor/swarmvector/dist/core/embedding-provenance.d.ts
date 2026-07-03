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
 *   - rollout flag resolution: SWARMVECTOR_EMBEDDER / SWARMVECTOR_ONNX /
 *     SWARMVECTOR_REEMBED (D5),
 *   - the once-per-process loud hash-fallback warning (D1).
 */
export type PrefixPolicy = 'none' | 'required' | 'query-recommended';
export type EmbedTextKind = 'query' | 'passage';
/** Embedder identity classes. `modelId` carries the exact model. */
export type EmbedderKind = 'onnx-minilm' | 'onnx' | 'hash';
export interface EmbeddingProvenance {
    /** Embedder family that produced the vectors. */
    embedderKind: EmbedderKind | string;
    /** Exact model id (e.g. 'all-MiniLM-L6-v2'); null for the hash embedder. */
    modelId: string | null;
    /** Vector dimension. */
    dimension: number;
    /** Whether vectors were L2-normalized at embed time. */
    normalize: boolean;
    /** Prefix convention the texts were embedded under (D4). */
    prefixPolicy: PrefixPolicy;
}
export type EmbedderSelection = 'auto' | 'minilm' | 'hash';
export type ReembedPolicy = 'refuse' | 'warn' | 'auto';
export interface ModelPrefixSpec {
    prefixPolicy: PrefixPolicy;
    queryPrefix: string;
    passagePrefix: string;
}
/** BGE en v1.5 documented query instruction (short query → long passage). */
export declare const BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: ";
/**
 * Prefix conventions per model card:
 * - all-MiniLM-L6-v2 / L12: general semantic search, NO prefixes.
 * - e5-small-v2: REQUIRES 'query: ' / 'passage: ' (quality degrades without).
 * - bge-small/base-en-v1.5: query instruction recommended for retrieval;
 *   passages need no instruction.
 * - gte-small: no prefixes documented.
 */
export declare const MODEL_PREFIXES: Record<string, ModelPrefixSpec>;
/**
 * Prefix spec for a model; unknown models get the no-prefix policy.
 * Own-property lookup only: a hostile model id like '__proto__' or
 * 'constructor' must resolve to NO_PREFIX, not to a prototype member
 * (ADR-210 security pass).
 */
export declare function getModelPrefixSpec(modelId: string | null | undefined): ModelPrefixSpec;
/**
 * Pure prefix application (D4): the exact text handed to the tokenizer for a
 * query/passage embed of `text` under `modelId`'s registered policy.
 * MiniLM applies NO prefix on either entry point (acceptance gates 6–7).
 */
export declare function prefixText(modelId: string | null | undefined, kind: EmbedTextKind, text: string): string;
/** Embedder family for an ONNX model id. */
export declare function embedderKindForModel(modelId: string | null | undefined): EmbedderKind;
/**
 * Legacy default for stores that predate provenance metadata: hash-embedded,
 * un-normalized as far as we can prove, no prefixes. Such stores open
 * READ-ONLY for vector writes until re-embedded.
 */
export declare function legacyHashProvenance(dimension?: number): EmbeddingProvenance;
/** Human-readable one-liner for error messages. */
export declare function describeProvenance(p: EmbeddingProvenance): string;
/** Field names on which two provenance records disagree (empty = match). */
export declare function compareProvenance(a: EmbeddingProvenance, b: EmbeddingProvenance): string[];
/** Upper bound accepted for a provenance dimension read from disk. */
export declare const MAX_PROVENANCE_DIMENSION = 65536;
/**
 * Sanitize a provenance record read from DISK (a `.meta.json` sidecar or
 * `intelligence.json`). On-disk JSON is untrusted input: a malformed or
 * adversarial record must never crash the caller. Anything that is not a
 * plausibly-valid record is treated as ABSENT (returns null), which callers
 * already handle as the no-provenance / legacy path — conservative for a
 * corrupted stamp (the store degrades to read-only for vector writes rather
 * than accepting writes under a fabricated identity).
 */
export declare function sanitizeProvenance(value: unknown): EmbeddingProvenance | null;
/** Thrown when an insert's provenance does not match the store's (D0). */
export declare class ProvenanceMismatchError extends Error {
    code: string;
    store: EmbeddingProvenance;
    active: EmbeddingProvenance;
    mismatches: string[];
    constructor(store: EmbeddingProvenance, active: EmbeddingProvenance, mismatches: string[], storeName: string);
}
/** Refuse mismatched inserts with an error naming both sides (D0). */
export declare function assertProvenanceMatch(store: EmbeddingProvenance, active: EmbeddingProvenance, storeName?: string): void;
/**
 * Resolve SWARMVECTOR_EMBEDDER / SWARMVECTOR_ONNX.
 * Precedence: SWARMVECTOR_EMBEDDER wins when both are set; SWARMVECTOR_ONNX=0 is
 * shorthand for `hash`, =1 for `minilm`. Unrecognized values fall back to
 * 'auto' (MiniLM when loadable, loud hash fallback otherwise).
 */
export declare function resolveEmbedderSelection(env?: NodeJS.ProcessEnv): EmbedderSelection;
/**
 * Resolve SWARMVECTOR_REEMBED: what happens when opening a store whose
 * provenance mismatches the active embedder.
 *   refuse (default) — error;
 *   warn             — open read-only with a single warning;
 *   auto             — re-embed in place when source text exists, refuse otherwise.
 */
export declare function resolveReembedPolicy(env?: NodeJS.ProcessEnv): ReembedPolicy;
/**
 * Emit exactly ONE stderr warning per process the first time the hash
 * fallback serves an embed that the ONNX embedder was supposed to handle
 * (acceptance gate 2). Returns true when the warning was emitted by this call.
 */
export declare function warnHashFallbackOnce(reason?: string): boolean;
/** Whether the once-per-process fallback warning has fired. */
export declare function hashFallbackWarned(): boolean;
/** Test hook: reset the once-per-process warning latch. */
export declare function resetHashFallbackWarningForTests(): void;
declare const _default: {
    MODEL_PREFIXES: Record<string, ModelPrefixSpec>;
    BGE_QUERY_INSTRUCTION: string;
    getModelPrefixSpec: typeof getModelPrefixSpec;
    prefixText: typeof prefixText;
    embedderKindForModel: typeof embedderKindForModel;
    legacyHashProvenance: typeof legacyHashProvenance;
    describeProvenance: typeof describeProvenance;
    compareProvenance: typeof compareProvenance;
    sanitizeProvenance: typeof sanitizeProvenance;
    MAX_PROVENANCE_DIMENSION: number;
    ProvenanceMismatchError: typeof ProvenanceMismatchError;
    assertProvenanceMatch: typeof assertProvenanceMatch;
    resolveEmbedderSelection: typeof resolveEmbedderSelection;
    resolveReembedPolicy: typeof resolveReembedPolicy;
    warnHashFallbackOnce: typeof warnHashFallbackOnce;
    hashFallbackWarned: typeof hashFallbackWarned;
    resetHashFallbackWarningForTests: typeof resetHashFallbackWarningForTests;
};
export default _default;
//# sourceMappingURL=embedding-provenance.d.ts.map