# ADR-025: Auto-Update System for @swarmdo Packages

## Status
**Implemented** - 2026-01-13

### Implementation Details

| Component | File | Lines |
|-----------|------|-------|
| Rate Limiter | `src/update/rate-limiter.ts` | ~100 |
| Checker | `src/update/checker.ts` | ~180 |
| Validator | `src/update/validator.ts` | ~150 |
| Executor | `src/update/executor.ts` | ~200 |
| CLI Commands | `src/commands/update.ts` | ~340 |
| Startup Integration | `src/index.ts` | ~20 |

**Published:** @swarmdo/cli@3.0.0-alpha.83

## Context

The Swarmdo V3 ecosystem consists of multiple packages:
- `@swarmdo/cli` - Main CLI tool
- `@swarmdo/embeddings` - Vector embeddings
- `@swarmdo/security` - Security utilities
- `@swarmdo/integration` - agentic-flow integration
- `@swarmdo/testing` - Test utilities

When one package is updated, dependent packages may need updates for compatibility. Currently, users must manually check for updates, leading to:
- Version mismatches causing runtime errors
- Missing security patches
- Delayed access to performance improvements
- Inconsistent behavior across installations

## Decision

Implement an **auto-update system** that:

1. **Checks for updates on startup** (with rate limiting)
2. **Validates package compatibility** before updating
3. **Auto-updates minor/patch versions** (configurable)
4. **Notifies users** of major version updates
5. **Maintains update history** for rollback capability

### Update Check Frequency

| Trigger | Behavior |
|---------|----------|
| First run of day | Full update check |
| Subsequent runs same day | Skip check (use cache) |
| `--force-update` flag | Force immediate check |
| `--no-update` flag | Skip all update checks |
| CI/CD environment | Skip by default |

### Package Priority

| Priority | Packages | Auto-Update |
|----------|----------|-------------|
| Critical | `@swarmdo/security` | Always (patches) |
| High | `@swarmdo/cli` | Minor + Patch |
| Normal | `@swarmdo/embeddings`, `@swarmdo/integration` | Patch only |
| Low | `@swarmdo/testing` | Notify only |

## Implementation

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Startup                          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              UpdateChecker Service                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ RateLimiter │  │ NPM Registry│  │ Version Compare │ │
│  │ (24h cache) │  │    Client   │  │    (semver)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              PackageValidator                            │
│  - Dependency compatibility check                        │
│  - Peer dependency verification                          │
│  - Breaking change detection                             │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              UpdateExecutor                              │
│  - npm install with specific versions                    │
│  - Rollback on failure                                   │
│  - Update history logging                                │
└─────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. UpdateChecker (`src/update/checker.ts`)

```typescript
interface UpdateCheckResult {
  package: string;
  currentVersion: string;
  latestVersion: string;
  updateType: 'major' | 'minor' | 'patch' | 'none';
  shouldAutoUpdate: boolean;
  changelog?: string;
}

interface UpdateConfig {
  enabled: boolean;
  checkIntervalHours: number;  // Default: 24
  autoUpdatePatch: boolean;    // Default: true
  autoUpdateMinor: boolean;    // Default: false
  autoUpdateMajor: boolean;    // Default: false
  excludePackages: string[];   // Packages to skip
  priorityPackages: string[];  // Check these first
}
```

#### 2. RateLimiter (`src/update/rate-limiter.ts`)

```typescript
interface RateLimitState {
  lastCheck: string;           // ISO timestamp
  checksToday: number;
  packageVersions: Record<string, string>;
}

// Stored in: ~/.swarmdo/update-state.json
```

#### 3. PackageValidator (`src/update/validator.ts`)

```typescript
interface ValidationResult {
  valid: boolean;
  incompatibilities: string[];
  warnings: string[];
  requiredPeerUpdates: string[];
}
```

### Update Flow

```
1. CLI Start
   │
   ├─► Check rate limit cache (~/.swarmdo/update-state.json)
   │   └─► If checked within 24h AND no --force-update → Skip
   │
   ├─► Query npm registry for @swarmdo/* packages
   │   └─► Compare versions using semver
   │
   ├─► For each package with available update:
   │   ├─► Check update priority (critical/high/normal/low)
   │   ├─► Validate compatibility with other packages
   │   └─► Determine if auto-update applies
   │
   ├─► Execute auto-updates (if any)
   │   ├─► npm install @swarmdo/package@version
   │   ├─► Verify installation success
   │   └─► Log to update history
   │
   └─► Display notification for non-auto updates
       └─► "Run `npx swarmdo update` to update X packages"
```

### CLI Commands

```bash
# Check for updates (manual)
npx swarmdo update check

# Update all packages
npx swarmdo update all

# Update specific package
npx swarmdo update @swarmdo/embeddings

# View update history
npx swarmdo update history

# Rollback last update
npx swarmdo update rollback

# Configure auto-update
npx swarmdo config set update.autoUpdateMinor true
npx swarmdo config set update.checkIntervalHours 12
```

### Environment Variables

```bash
# Disable auto-update entirely
SWARMDO_AUTO_UPDATE=false

# Force update check
SWARMDO_FORCE_UPDATE=true

# CI/CD mode (no interactive prompts, no auto-update)
CI=true
```

### Configuration File

```json
// swarmdo.config.json
{
  "update": {
    "enabled": true,
    "checkIntervalHours": 24,
    "autoUpdate": {
      "patch": true,
      "minor": false,
      "major": false
    },
    "priority": {
      "@swarmdo/security": "critical",
      "@swarmdo/cli": "high",
      "@swarmdo/embeddings": "normal",
      "@swarmdo/integration": "normal",
      "@swarmdo/testing": "low"
    },
    "exclude": []
  }
}
```

## Security Considerations

1. **Registry verification**: Only fetch from official npm registry
2. **Checksum validation**: Verify package integrity before install
3. **Rollback capability**: Maintain previous versions for quick rollback
4. **Audit logging**: Log all update operations for traceability
5. **Signature verification**: Verify npm package signatures when available

## Consequences

### Positive
- Users always have latest security patches
- Reduced version mismatch issues
- Improved ecosystem consistency
- Automatic performance improvements
- Reduced support burden

### Negative
- Slightly slower startup (mitigated by rate limiting)
- Requires network access (gracefully degrades offline)
- Potential for breaking changes (mitigated by validation)

### Neutral
- Additional storage for update state (~1KB)
- New CLI commands to learn

## Alternatives Considered

1. **No auto-update**: Rejected - too many version mismatch issues
2. **Update on every run**: Rejected - too slow, network overhead
3. **Weekly update check**: Rejected - security patches delayed too long
4. **npm-check-updates integration**: Rejected - external dependency

## Implementation Plan

| Phase | Task | Priority |
|-------|------|----------|
| 1 | UpdateChecker service | High |
| 2 | RateLimiter with file cache | High |
| 3 | PackageValidator | High |
| 4 | UpdateExecutor with rollback | Medium |
| 5 | CLI commands | Medium |
| 6 | Configuration integration | Medium |
| 7 | Telemetry/logging | Low |

## References

- [npm registry API](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md)
- [semver specification](https://semver.org/)
- [ADR-013: Core Security Module](./ADR-013-core-security-module.md)
