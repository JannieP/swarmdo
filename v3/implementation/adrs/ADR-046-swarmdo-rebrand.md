# ADR-046: Dual Umbrella Packages — rufflo + rufflo

**Status:** Accepted
**Date:** 2026-02-07
**Updated:** 2026-02-08
**Authors:** RuvNet, Rufflo Team

## Context

The umbrella package is published to npm as `rufflo`. As the ecosystem grows and the product establishes its own identity, a second umbrella package `rufflo` is introduced alongside the original.

### Current State

| Aspect | Current Value |
|--------|---------------|
| npm package | `rufflo` |
| CLI binary | `rufflo` |
| GitHub repo | ruvnet/claude-flow |
| Internal packages | @rufflo/* |
| Weekly downloads | ~1,000+ |

### Drivers for Change

1. **Brand Cohesion**: Aligns with the ruv ecosystem (ruv.io, @ruvector/*, ruv-swarm)
2. **Trademark Safety**: Removes potential trademark concerns with "Claude" in product name
3. **Product Identity**: Establishes independent product identity beyond Claude integration
4. **Discoverability**: "rufflo" is unique, memorable, and searchable
5. **Future Flexibility**: Enables the platform to support multiple AI backends without name confusion
6. **Zero Disruption**: Keeping `rufflo` ensures no existing users are broken

## Decision

Publish **two independent npm umbrella packages** — `rufflo` (original) and `rufflo` (new) — both backed by `@rufflo/cli`.

### Package Architecture

```
npm registry
├── rufflo          ← original umbrella (bundles @rufflo/cli)
│   └── bin: rufflo → v3/@rufflo/cli/bin/cli.js
├── rufflo              ← new umbrella (depends on @rufflo/cli)
│   └── bin: rufflo     → @rufflo/cli/bin/cli.js
└── @rufflo/cli     ← shared CLI implementation
```

### What Changes

| Aspect | Before | After |
|--------|--------|-------|
| npm packages | `rufflo` only | `rufflo` + `rufflo` |
| CLI binaries | `rufflo` | `rufflo` + `rufflo` |
| Install commands | `npx rufflo@latest` | Both `npx rufflo@latest` and `npx rufflo@latest` |
| README branding | "Rufflo" | "Rufflo" (primary), "rufflo" (supported) |
| Product name | Rufflo | Rufflo (with rufflo alias) |

### What Stays the Same

| Aspect | Value | Reason |
|--------|-------|--------|
| GitHub repo | ruvnet/claude-flow | SEO, existing links, history |
| Internal packages | @rufflo/* | Minimal disruption, existing integrations |
| Functionality | All features | No functional changes |
| License | MIT | No change |
| Author | RuvNet | No change |
| `rufflo` npm package | Fully supported | No breaking changes for existing users |

## Consequences

### Positive

1. **Zero Disruption**: Existing `rufflo` users unaffected
2. **Unified Brand**: New `rufflo` package for the ruv ecosystem
3. **Trademark Safety**: Users can choose the non-"Claude" branded package
4. **Dual Discovery**: Package discoverable under both names on npm
5. **Future Proof**: Can add non-Claude integrations without name confusion

### Negative

1. **Two packages to maintain**: Must publish and tag both packages
2. **Documentation**: Must reference both package names
3. **Download split**: npm download stats split across two packages

### Neutral

1. **GitHub repo unchanged**: Existing links continue to work
2. **Internal packages unchanged**: No code changes required in @rufflo/*

## Implementation

### Package Structure

```
/workspaces/rufflo/
├── package.json            # name: "rufflo" (original umbrella)
│                           # bin: rufflo → v3/@rufflo/cli/bin/cli.js
│                           # bundles CLI files directly
└── rufflo/
    ├── package.json        # name: "rufflo" (new umbrella)
    │                       # bin: rufflo → ./bin/rufflo.js
    │                       # depends on @rufflo/cli
    ├── bin/
    │   └── rufflo.js      # thin wrapper, imports @rufflo/cli
    └── README.md           # Rufflo-branded docs
```

### Phase 1: Preparation (This PR)

1. Create ADR-046 (this document)
2. Keep root `package.json` as `rufflo` (original umbrella)
3. Create `rufflo/` directory with new umbrella package
4. Update main README.md with Rufflo branding
5. Update install scripts to reference `rufflo`

### Phase 2: Publishing

```bash
# 1. Publish @rufflo/cli (shared implementation)
cd v3/@rufflo/cli
npm publish --tag alpha

# 2. Publish rufflo umbrella (original)
cd /workspaces/rufflo
npm publish --tag v3alpha
npm dist-tag add rufflo@<version> latest
npm dist-tag add rufflo@<version> alpha

# 3. Publish rufflo umbrella (new)
cd /workspaces/rufflo/rufflo
npm publish --tag alpha
npm dist-tag add rufflo@<version> latest
```

### Phase 3: Ongoing

1. Both packages maintained indefinitely
2. Version numbers kept in sync
3. README shows both install options
4. `rufflo` promoted as primary in new documentation

## Publishing Checklist

When publishing updates, **all three packages** must be published:

| Order | Package | Command | Tags |
|-------|---------|---------|------|
| 1 | `@rufflo/cli` | `npm publish --tag alpha` | alpha, latest |
| 2 | `rufflo` | `npm publish --tag v3alpha` | v3alpha, alpha, latest |
| 3 | `rufflo` | `npm publish --tag alpha` | alpha, latest |

## Alternatives Considered

### 1. Replace rufflo with rufflo (single package)

**Pros:** Simpler, one package to maintain
**Cons:** Breaks existing users, loses download history
**Decision:** Rejected - zero disruption preferred

### 2. Rename to ruv-flow (hyphenated)

**Pros:** Matches ruv-swarm pattern
**Cons:** Inconsistent with @ruvector (no hyphen)
**Decision:** Rejected - "rufflo" is cleaner and matches ruvector pattern

### 3. Rename internal packages too (@rufflo/*)

**Pros:** Complete rebrand
**Cons:** Major breaking change, complex migration, npm scope registration
**Decision:** Rejected - disruption not worth the benefit

### 4. Deprecate rufflo

**Pros:** Forces migration to rufflo
**Cons:** Breaks existing users, bad developer experience
**Decision:** Rejected - both packages coexist permanently

## Migration Guide

### For New Users

```bash
# Recommended
npx rufflo@latest init --wizard

# Also works
npx rufflo@latest init --wizard
```

### For Existing Users

No migration required. `rufflo` continues to work. Optionally switch:

```bash
# Switch MCP server (optional)
claude mcp remove rufflo
claude mcp add rufflo npx rufflo@latest mcp start
```

### For Contributors

1. Root `package.json` is the `rufflo` umbrella
2. `rufflo/package.json` is the `rufflo` umbrella
3. Internal imports remain `@rufflo/*`
4. GitHub repo remains `ruvnet/claude-flow`

## Metrics for Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Combined npm downloads | Maintain or grow | npm weekly stats (both packages) |
| GitHub stars | Maintain or grow | GitHub metrics |
| Issues from confusion | < 10 in 30 days | GitHub issues |
| rufflo adoption | 50%+ new installs in 90 days | npm stats |

## References

- GitHub Issue: #1101
- npm: https://npmjs.com/package/rufflo
- npm: https://npmjs.com/package/rufflo
- Related: ADR-017 (RuVector Integration)

## Appendix: Branding Guidelines

### Product Names

| Context | Use |
|---------|-----|
| npm packages | `rufflo` and `rufflo` (both lowercase) |
| README title | "Rufflo" (PascalCase) |
| CLI binaries | `rufflo` or `rufflo` (both lowercase) |
| In prose | "Rufflo" (PascalCase) |

### Command Examples

```bash
# New recommended style
npx rufflo@latest init
npx rufflo@latest agent spawn -t coder
npx rufflo@latest swarm init --topology hierarchical

# Legacy style (still fully supported)
npx rufflo@latest init
npx rufflo@latest agent spawn -t coder
```

---

**Decision Date:** 2026-02-07
**Updated:** 2026-02-08
**Review Date:** 2026-03-07 (30 days post-implementation)
