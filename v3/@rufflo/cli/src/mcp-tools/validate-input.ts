/**
 * Input Validation for MCP Tools — re-export shim (ADR-100, alpha.5).
 *
 * Authoritative source: @rufflo/cli-core/mcp-tools/validate-input.
 * Was a 256-line byte-identical copy. Loads @rufflo/security validators
 * when available, with lightweight fallback otherwise.
 */

export * from '@rufflo/cli-core/mcp-tools/validate-input';
