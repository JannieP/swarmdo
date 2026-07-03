/**
 * Input Validation for MCP Tools — re-export shim (ADR-100, alpha.5).
 *
 * Authoritative source: @swarmdo/cli-core/mcp-tools/validate-input.
 * Was a 256-line byte-identical copy. Loads @swarmdo/security validators
 * when available, with lightweight fallback otherwise.
 */

export * from '@swarmdo/cli-core/mcp-tools/validate-input';
