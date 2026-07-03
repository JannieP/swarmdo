# ADR-046: Dual Umbrella Packages — swarmdo + swarmdo

**Status:** Accepted
**Date:** 2026-02-07
**Updated:** 2026-02-08
**Authors:** the upstream author, Swarmdo Team

## Context

The umbrella package is published to npm as `swarmdo`. As the ecosystem grows and the product establishes its own identity, a second umbrella package `swarmdo` is introduced alongside the original.

### Current State

| Aspect | Current Value |
|--------|---------------|
| npm package | `swarmdo` |
| CLI binary | `swarmdo` |
| GitHub repo | upstream/claude-flow |
| Internal packages | @swarmdo/* |
| Weekly downloads | ~1,000+ |

### Drivers for Change

1. **Brand Cohesion**: Aligns with the upstream ecosystem (swarmdo.com, @swarmvector/*, swarmdo-swarm)
2. **Trademark Safety**: Removes potential trademark concerns with "Claude" in product name
3. **Product Identity**: Establishes independent product identity beyond Claude integration
4. **Discoverability**: "swarmdo" is unique, memorable, and searchable
5. **Future Flexibility**: Enables the platform to support multiple AI backends without name confusion
6. **Zero Disruption**: Keeping `swarmdo` ensures no existing users are broken

## Decision

Publish **two independent npm umbrella packages** — `swarmdo` (original) and `swarmdo` (new) — both backed by `@swarmdo/cli`.

### Package Architecture

```
npm registry
├── swarmdo          ← original umbrella (bundles @swarmdo/cli)
│   └── bin: swarmdo → v3/@swarmdo/cli/bin/cli.js
├── swarmdo              ← new umbrella (depends on @swarmdo/cli)
│   └── bin: swarmdo     → @swarmdo/cli/bin/cli.js
└── @swarmdo/cli     ← shared CLI implementation
```

### What Changes

| Aspect | Before | After |
|--------|--------|-------|
| npm packages | `swarmdo` only | `swarmdo` + `swarmdo` |
| CLI binaries | `swarmdo` | `swarmdo` + `swarmdo` |
| Install commands | `npx swarmdo@latest` | Both `npx swarmdo@latest` and `npx swarmdo@latest` |
| README branding | "Swarmdo" | "Swarmdo" (primary), "swarmdo" (supported) |
| Product name | Swarmdo | Swarmdo (with swarmdo alias) |

### What Stays the Same

| Aspect | Value | Reason |
|--------|-------|--------|
| GitHub repo | upstream/claude-flow | SEO, existing links, history |
| Internal packages | @swarmdo/* | Minimal disruption, existing integrations |
| Functionality | All features | No functional changes |
| License | MIT | No change |
| Author | the upstream author | No change |
| `swarmdo` npm package | Fully supported | No breaking changes for existing users |

## Consequences

### Positive

1. **Zero Disruption**: Existing `swarmdo` users unaffected
2. **Unified Brand**: New `swarmdo` package for the upstream ecosystem
3. **Trademark Safety**: Users can choose the non-"Claude" branded package
4. **Dual Discovery**: Package discoverable under both names on npm
5. **Future Proof**: Can add non-Claude integrations without name confusion

### Negative

1. **Two packages to maintain**: Must publish and tag both packages
2. **Documentation**: Must reference both package names
3. **Download split**: npm download stats split across two packages

### Neutral

1. **GitHub repo unchanged**: Existing links continue to work
2. **Internal packages unchanged**: No code changes required in @swarmdo/*

## Implementation

### Package Structure

```
/workspaces/swarmdo/
├── package.json            # name: "swarmdo" (original umbrella)
│                           # bin: swarmdo → v3/@swarmdo/cli/bin/cli.js
│                           # bundles CLI files directly
└── swarmdo/
    ├── package.json        # name: "swarmdo" (new umbrella)
    │                       # bin: swarmdo → ./bin/swarmdo.js
    │                       # depends on @swarmdo/cli
    ├── bin/
    │   └── swarmdo.js      # thin wrapper, imports @swarmdo/cli
    └── README.md           # Swarmdo-branded docs
```

### Phase 1: Preparation (This PR)

1. Create ADR-046 (this document)
2. Keep root `package.json` as `swarmdo` (original umbrella)
3. Create `swarmdo/` directory with new umbrella package
4. Update main README.md with Swarmdo branding
5. Update install scripts to reference `swarmdo`

### Phase 2: Publishing

```bash
# 1. Publish @swarmdo/cli (shared implementation)
cd v3/@swarmdo/cli
npm publish --tag alpha

# 2. Publish swarmdo umbrella (original)
cd /workspaces/swarmdo
npm publish --tag v3alpha
npm dist-tag add swarmdo@<version> latest
npm dist-tag add swarmdo@<version> alpha

# 3. Publish swarmdo umbrella (new)
cd /workspaces/swarmdo/swarmdo
npm publish --tag alpha
npm dist-tag add swarmdo@<version> latest
```

### Phase 3: Ongoing

1. Both packages maintained indefinitely
2. Version numbers kept in sync
3. README shows both install options
4. `swarmdo` promoted as primary in new documentation

## Publishing Checklist

When publishing updates, **all three packages** must be published:

| Order | Package | Command | Tags |
|-------|---------|---------|------|
| 1 | `@swarmdo/cli` | `npm publish --tag alpha` | alpha, latest |
| 2 | `swarmdo` | `npm publish --tag v3alpha` | v3alpha, alpha, latest |
| 3 | `swarmdo` | `npm publish --tag alpha` | alpha, latest |

## Alternatives Considered

### 1. Replace swarmdo with swarmdo (single package)

**Pros:** Simpler, one package to maintain
**Cons:** Breaks existing users, loses download history
**Decision:** Rejected - zero disruption preferred

### 2. Rename to swarm-flow (hyphenated)

**Pros:** Matches swarmdo-swarm pattern
**Cons:** Inconsistent with @swarmvector (no hyphen)
**Decision:** Rejected - "swarmdo" is cleaner and matches swarmvector pattern

### 3. Rename internal packages too (@swarmdo/*)

**Pros:** Complete rebrand
**Cons:** Major breaking change, complex migration, npm scope registration
**Decision:** Rejected - disruption not worth the benefit

### 4. Deprecate swarmdo

**Pros:** Forces migration to swarmdo
**Cons:** Breaks existing users, bad developer experience
**Decision:** Rejected - both packages coexist permanently

## Migration Guide

### For New Users

```bash
# Recommended
npx swarmdo@latest init --wizard

# Also works
npx swarmdo@latest init --wizard
```

### For Existing Users

No migration required. `swarmdo` continues to work. Optionally switch:

```bash
# Switch MCP server (optional)
claude mcp remove swarmdo
claude mcp add swarmdo npx swarmdo@latest mcp start
```

### For Contributors

1. Root `package.json` is the `swarmdo` umbrella
2. `swarmdo/package.json` is the `swarmdo` umbrella
3. Internal imports remain `@swarmdo/*`
4. GitHub repo remains `upstream/claude-flow`

## Metrics for Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Combined npm downloads | Maintain or grow | npm weekly stats (both packages) |
| GitHub stars | Maintain or grow | GitHub metrics |
| Issues from confusion | < 10 in 30 days | GitHub issues |
| swarmdo adoption | 50%+ new installs in 90 days | npm stats |

## References

- GitHub Issue: #1101
- npm: https://npmjs.com/package/swarmdo
- npm: https://npmjs.com/package/swarmdo
- Related: ADR-017 (SwarmVector Integration)

## Appendix: Branding Guidelines

### Product Names

| Context | Use |
|---------|-----|
| npm packages | `swarmdo` and `swarmdo` (both lowercase) |
| README title | "Swarmdo" (PascalCase) |
| CLI binaries | `swarmdo` or `swarmdo` (both lowercase) |
| In prose | "Swarmdo" (PascalCase) |

### Command Examples

```bash
# New recommended style
npx swarmdo@latest init
npx swarmdo@latest agent spawn -t coder
npx swarmdo@latest swarm init --topology hierarchical

# Legacy style (still fully supported)
npx swarmdo@latest init
npx swarmdo@latest agent spawn -t coder
```

---

**Decision Date:** 2026-02-07
**Updated:** 2026-02-08
**Review Date:** 2026-03-07 (30 days post-implementation)
