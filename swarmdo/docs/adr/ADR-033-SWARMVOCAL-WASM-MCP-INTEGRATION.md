# ADR-033: Swarmocal WASM-MCP Integration from SwarmVector Upstream

**Status:** Proposed
**Date:** 2026-05-01
**Author:** Swarmdo Team
**Deciders:** Engineering
**Related:** ADR-002-WASM-CORE-PACKAGE, ADR-029-HUGGINGFACE-CHAT-UI-CLOUD-RUN, ADR-030-MCP-TOOL-GAP-ANALYSIS, ADR-032-RVF-PRIVATE-MCP-TUNNEL

---

## Context

The local copy of the Swarmocal chat UI at `swarmdo/src/swarmvocal/` is a snapshot fork of the SvelteKit-based HuggingFace `chat-ui` (v0.20.0). The canonical upstream lives at `upstream/SwarmVector/ui/swarmvocal` and has diverged with substantial new functionality, primarily an in-browser **WASM MCP server** powered by `rvagent-wasm`.

A directory-level diff between upstream and local shows:

**Net-new in upstream (absent locally):**
- `src/lib/wasm/` — WASM loader, types, IndexedDB persistence, capability tests (84 KB)
- `src/lib/components/wasm/GalleryPanel.svelte` — UI for browsing/loading WASM templates
- `src/lib/components/FoundationBackground.svelte`
- `src/lib/stores/wasmMcp.ts` — Svelte store wrapping WASM MCP server lifecycle
- `src/lib/constants/rvagentPresets.ts` — preset templates
- `src/lib/server/textGeneration/mcp/wasmTools.test.ts`
- `static/wasm/rvagent_wasm.js` + `rvagent_wasm_bg.wasm` — compiled WASM bundle (~588 KB)
- `config/branding.env.example`

**Modified upstream (incompatible drift in local):**
- Chat components: `ChatInput`, `ChatMessage`, `ChatWindow`, `ChatIntroduction`, `BlockWrapper`, `TaskGroup`, `ToolUpdate`, `FileDropzone`
- MCP UI: `MCPServerManager`, `AddServerForm`, `ServerCard`
- Servers: `lib/server/mcp/clientPool.ts`, `httpClient.ts`, `lib/server/router/toolsRoute.ts`, `lib/server/textGeneration/index.ts`, `runMcpFlow.ts`, `toolInvocation.ts`, `types.ts`, `utils/toolPrompt.ts`
- Stores/utils: `mcpServers.ts`, `settings.ts`, `Settings.ts`, `Tool.ts`, `messageUpdates.ts`, `switchTheme.ts`
- Routes: `+layout.svelte`, `models/+page.svelte`, settings layout/model pages, `conversation/[id]/+page.svelte` & `+server.ts`, `api/mcp/health/+server.ts`, `api/mcp/servers/+server.ts`, `api/v2/user/settings/+server.ts`
- Visual/branding: `app.html`, `styles/main.css`, `static/chatui/{favicon,icon,logo}.svg`, `static/chatui/manifest.json`
- Misc: `Modal.svelte`, `NavMenu.svelte`, `SwarmdoUniverse.svelte`, `Switch.svelte`, `WelcomeModal.svelte`, `Logo.svelte`, `mcpExamples.ts`, `.gitignore`, `rvf.manifest.json`

**Local-only (must preserve):**
- `mcp-bridge/index.js` — local MCP bridge implementation (absent in upstream)
- `src/routes/api/v2/debug/` — debug routes used by swarmdo
- `stub/@reflink/reflink/index.js` — reflink stub
- `.env` — populated local environment
- `package-lock.json` — local lockfile
- All swarmdo-specific docs/CLAUDE.md guidance

`package.json` is identical between local and upstream — no dependency changes required.

## Decision

We will pull the upstream improvements into `swarmdo/src/swarmvocal/` on a dedicated feature branch (`feat/swarmvocal-wasm-mcp-integration`) using a **directory-level overlay strategy** rather than a Git merge, because the local snapshot has no shared history with the upstream repository.

The integration is staged in three commits to keep the diff reviewable:

1. **NEW files** — copy WASM core, components, stores, constants, static assets, and config example. Pure additions; cannot break existing behavior.
2. **MODIFIED files** — overwrite divergent files with upstream versions, then re-apply local-only customizations:
   - Restore `src/routes/api/v2/debug/` after upstream overlay (upstream lacks it).
   - Restore `mcp-bridge/index.js` after overlay.
   - Restore `stub/@reflink/reflink/index.js`.
   - Keep local `.env` and `package-lock.json` untouched.
3. **Verification** — `npm install`, `npm run check`, `npm run build`, then local docker compose + `swarmdo-browser` smoke test.

The `package.json` overlay is safe because it is byte-identical.

### What we are explicitly NOT doing

- No Git submodule or subtree linkage to SwarmVector — keeps the snapshot model intact.
- No changes to `swarmdo/src/chat-ui/` (the thin HF base-image wrapper) in this ADR.
- No Cloud Run deployment in this change — that is tracked separately under ADR-011 / ADR-029.
- No upstream contribution back to SwarmVector at this time.

## Consequences

**Positive:**
- Brings in-browser WASM MCP capability — chat UI gains local tool execution without a backend bridge for the supported tool set.
- Aligns local with canonical upstream, narrowing the divergence we have to maintain by hand.
- New `GalleryPanel` UX for browsing rvagent templates.
- Tests added (`wasmTools.test.ts`, `wasm-capabilities.test.ts`) raise the coverage floor.

**Negative / risks:**
- Increases bundle size by ~588 KB (the WASM artifact). Loaded lazily via `browser`-gated dynamic import, so initial paint is unaffected.
- Local-only files (`mcp-bridge/index.js`, `routes/api/v2/debug/`) must be re-applied after each upstream sync; this ADR documents that requirement so future syncs don't drop them.
- Modified server-side files (`clientPool`, `httpClient`, `toolsRoute`, `runMcpFlow`, etc.) may interact with the local mcp-bridge differently than upstream's. Smoke test before merge.
- Changes to `Settings.ts` / `Tool.ts` types could ripple into swarmdo packages that import from `src/swarmvocal`. Mitigation: run `npm run check` before merging.

**Rollback:** revert the feature branch; no data migrations, no external service changes.

## Verification

Acceptance criteria for merging the branch:

- [ ] `npm install` succeeds.
- [ ] `npm run check` passes (svelte-check, no new TS errors).
- [ ] `npm run build` produces a working bundle.
- [ ] `npm run test` — `wasmTools.test.ts` and `wasm-capabilities.test.ts` pass.
- [ ] `docker compose up -d` brings up MongoDB; `npm run dev` serves at `http://localhost:5173`.
- [ ] `swarmdo-browser` smoke test: load the home page, open the gallery panel, send a message through a non-WASM model, confirm no console errors.
- [ ] Local-only files still present after overlay: `mcp-bridge/index.js`, `routes/api/v2/debug/`, `stub/@reflink/reflink/index.js`, `.env`, `package-lock.json`.

## Deployment

Cloud Run deployment is **out of scope for this PR** but the path is staged in `swarmdo/src/swarmvocal/cloudbuild.yaml`. Two infrastructure prerequisites must be satisfied before the first deploy:

1. **MongoDB endpoint** — HF chat-ui requires a Mongo server. Cloud Run cannot run Mongo natively. Two options:
   - **MongoDB Atlas free tier** (M0): create a cluster, get the connection string, store as Secret Manager secret `swarmvocal-mongodb-url`.
   - **Cloud Run multi-container** (sidecar): deploy a `mongo:8` sidecar in the same revision; main container connects to `localhost:27017`. Requires `--container` flags on `gcloud run deploy`.
2. **AI provider secrets** — already exist in `swarm-dev` Secret Manager per ADR-029: `openai-api-key`, `google-api-key`, `openrouter-api-key`.

Once both are in place:

```bash
cd swarmdo/src/swarmvocal
gcloud builds submit --config=cloudbuild.yaml --project=swarm-dev --region=us-central1
```

Validation after deploy: `npx agent-browser open <run-url>` then check console for `[WASM MCP] Server initialized successfully · 18 tools`.

The thin `swarmdo/src/chat-ui/Dockerfile` wrapper (FROM `ghcr.io/huggingface/chat-ui-db:latest`) is **unsuitable** for deploying this integration — it can only patch the upstream HF base image with a few static files; it cannot include compiled WASM source. The full swarmvocal Dockerfile build is required.

## Deployment Outcome (2026-05-01)

The Cloud Run pipeline is working end-to-end with the following validations:

| Stage | Result |
|-------|--------|
| Cloud Build (after `DOCKER_BUILDKIT=1` fix) | Succeeds: `gcr.io/swarm-dev/swarmvocal:v1` pushed |
| Cloud Run deploy (after granting `secretmanager.secretAccessor` to default SA on `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`) | Service `swarmvocal` revision `00007-4hd` serving 100% traffic |
| Embedded MongoDB (`INCLUDE_DB=true`) | Working: `mongod` starts via `entrypoint.sh`, `/api/v2/conversations`, `/api/v2/user`, `/api/v2/feature-flags`, `/api/v2/public-config`, `/api/v2/user/settings` all return 200 |
| WASM bundle | Reachable: `https://swarmvocal-875130704813.us-central1.run.app/wasm/rvagent_wasm.js` (200, `text/javascript`), `/wasm/rvagent_wasm_bg.wasm` (200, `application/wasm`, 543 KB) |
| Provider API keys via Secret Manager | Mounted at runtime as `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY` |
| `dotenv-cli` runtime overrides via `DOTENV_LOCAL` env var | Working — confirmed by `PUBLIC_ORIGIN` and `OPENAI_BASE_URL` taking effect at runtime |

### Custom Domain (2026-05-01)

- `swarmvocal.swarmdo.com` mapped via `gcloud beta run domain-mappings create`
- Cloudflare DNS: `CNAME swarmvocal → ghs.googlehosted.com.`, **proxied:false** (gray cloud) so Google can issue and renew the managed cert directly
- Cert provisioning is asynchronous; allow 15–30 min after DNS resolves before HTTPS works on the custom domain. The `*.run.app` URL is always available immediately

### Provider Configuration (2026-05-01)

The deployed instance uses **Gemini 2.5 Flash** as default via Google's OpenAI-compatible endpoint:

```
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_API_KEY=<from GOOGLE_AI_API_KEY secret>
TASK_MODEL=gemini-2.5-flash
```

Earlier attempts with `https://router.huggingface.co/v1` returned `401 "Invalid username or password"` because the available `huggingface-token` secret doesn't auth against the user-facing router endpoint, and the OpenRouter API key was incorrectly mapped against the HF base URL. Google's OpenAI-compatible endpoint accepts `GOOGLE_AI_API_KEY` directly and exposes 56 Gemini variants.

### Known Issue (RESOLVED 2026-05-01)

~~The homepage `/` returns HTTP 500 in production due to the `/api/v2/models` and `/api/v2/models/refresh` routes returning the SvelteKit "Page not found" page wrapped in a 500 status.~~

**Root cause** (found after extensive investigation): `.gitignore` line 16 was `models/*` (unanchored). With no `.gcloudignore` present, `gcloud builds submit` falls back to `.gitignore` for upload filtering — that pattern matched **every** `models/` directory in the tree, stripping `src/routes/api/v2/models/*` and `src/routes/models/*` from the source tarball **before Docker even saw it**. SvelteKit production builds inside the container therefore had no `/api/v2/models` route registered, so requests returned 404 which got wrapped as 500 by the layout chain.

**Fix:** `swarmdo/src/swarmvocal/.gcloudignore` (commit `e3b74f606`). All `/api/v2/*` routes now serve correctly. Verified via `gsutil cp` of the build's source tarball that all `+server.ts` files for the models subtree are present after the fix.

## Mid-Iteration Updates (2026-05-01)

This section consolidates changes that landed after the initial PR (#1687) merged:

### Provider switch: OpenRouter / Claude Sonnet 4.6 default

Gemini 2.5 Flash via the OpenAI-compat endpoint returned `Error: 400 status code (no body)` on the **follow-up call after a tool result** (the chat-ui sends the tool message back to the model in the next turn; Gemini's compat layer rejected the structure intermittently). The result was the user-visible "Sorry, something went wrong" after a tool fired.

Switched the deployed default to **Claude Sonnet 4.6 via OpenRouter** with `OPENAI_BASE_URL=https://openrouter.ai/api/v1` and `OPENAI_API_KEY` mapped from the `OPENROUTER_API_KEY` Secret Manager secret. Models exposed: Claude Sonnet 4.6 (default), Claude Opus 4.7, Claude Haiku 4.5, Gemini 2.5 Pro, Gemini 2.5 Flash, GPT-4o.

The system prompt explicitly instructs the model to emit multiple `tool_calls` in a single response when the request implies multiple independent steps. Server logs confirmed `toolMsgCount: 4` and `toolMsgCount: 6` — multiple tools dispatched in parallel via `Promise.all` in `src/lib/server/textGeneration/mcp/toolInvocation.ts`.

### MCP Bridge service (`mcp-bridge` on Cloud Run)

Deployed in parallel with `swarmvocal` to expose 207 tools across 5 server groups (Core / Intelligence / Agents / Memory / DevTools). Pinned `--min-instances=1 --max-instances=1` so backends stay warm — Cloud Run was previously routing requests to cold instances that had not yet finished spawning `npx swarmdo mcp start` and `npx swarmvector mcp start`. Bumped the bridge's MCP `initialize` RPC timeout from 30s → 120s to handle cold-start boot times.

### Web Worker for WASM MCP (opt-in)

Added `src/lib/wasm/wasm.worker.ts` and `src/lib/wasm/workerClient.ts`. When the user opts in via `?worker=1` URL param or `localStorage.setItem("swarmdo:wasm-worker", "true")`, `callMcp` routes through a worker-owned mock WasmMcpServer instead of the in-process module. Default behavior (in-process path) is unchanged.

The worker is self-contained — it does not import `$app/environment` (which is unresolvable in worker context) and ships a minimal `read_file / write_file / list_files` MCP surface as a placeholder until the real `rvagent_wasm.js` bundle is wired in.

### Custom domains

Mapped via Cloudflare DNS (CNAME unproxied so Google manages the cert):
- `swarmdo.com` (primary)
- `swarmdo.swarmdo.com`
- `swarmvocal.swarmdo.com`

### UX additions

- **Help icon** in sidebar opens "Swarmdo Capabilities" modal (`src/lib/components/SwarmdoHelpModal.svelte`) with all 6 tool groups, quick-start, tips, and resource links.
- **8 Swarmdo-themed example prompts** on the welcome screen (`src/lib/constants/{mcpExamples,routerExamples}.ts`) replacing HF defaults.
- **`PUBLIC_APP_NAME=Swarmdo`** brands the title bar, sidebar, welcome modal, and PWA manifest.

### Bug fixes

- `mcp-bridge` returns a structured hint object instead of opaque 400 when `search` is called with an empty query (`Error: search requires a non-empty query string`).
- `cloudbuild.yaml` deploy step strips its `--set-env-vars` / `--set-secrets` flags so subsequent rebuilds preserve manually configured env (DOTENV_LOCAL with `MODELS`, `OPENAI_BASE_URL`, etc.). Initial env config is now set out-of-band via `gcloud run services update`.
- `DOCKER_BUILDKIT=1` env on the cloudbuild docker step (Dockerfile uses `COPY --link` BuildKit syntax).

## Follow-Up Work (tracked separately in [issue #1689](the upstream project (see NOTICE)))

| Priority | Item | Notes |
|----------|------|-------|
| **P1** | **Make Web Worker mode default** | Currently opt-in (`?worker=1`). Blocked on bringing the worker's mock to parity with the main-thread mock (worker has 3 tools, main has 18) and on importing the real `rvagent_wasm.js` bundle into worker context. |
| **P1** | **Persistent MongoDB** | Cloud Run filesystem is ephemeral — chat history evicts on cold starts. Options (cleanest first): MongoDB Atlas M0 free tier with `MONGODB_URL` from Secret Manager; Cloud Run multi-container with `mongo:8` sidecar + GCS volume mount; MongoDB on Compute Engine. |
| **P1** | **Google OAuth login** | `OPENID_CLIENT_ID=""` today — anonymous sessions only. Wanted for admin diagnostics, per-user memory namespaces, and usage caps. Set `OPENID_CLIENT_ID`, `OPENID_CLIENT_SECRET`, `OPENID_SCOPES`. |
| **P2** | **Parallel tool-call visualization parity with Claude Code task panel** | Server-side parallel execution works; UI renders one tool-call card per call but doesn't visually group them as a single "step" with collapsed thumbnails, lane layout, or per-tool durations. UX pass needed on `ChatMessage.svelte` and `ToolUpdate.svelte`. |
| **P2** | **Real `rvagent_wasm` wired into worker** | Static bundle (`static/wasm/rvagent_wasm.{js,wasm}`) ships at 588 KB. Currently the page bundle uses `createMockWasmModule()` because the real WASM isn't loaded into `app.html`. Need a `<script type="module">` block (or worker-level `import("/wasm/rvagent_wasm.js")`) that calls `init()` and exposes the constructors on the global before `loadWasm()` runs. |
| **P3** | **Help-modal copy fix** | Quick Start section says "default: Gemini 2.5 Flash". Update to "default: Claude Sonnet 4.6" in `src/lib/components/SwarmdoHelpModal.svelte`. |
| **P3** | **LLM router (Omni mode)** | `LLM_ROUTER_ARCH_BASE_URL` is empty so the auto-routing alias model isn't created. Re-enable when an Arch-Router is hosted somewhere reachable; restore `LLM_ROUTER_ROUTES_PATH` and the related `LLM_ROUTER_*` env vars. |

## References

- Upstream source: `the upstream project (see NOTICE)` → `ui/swarmvocal/`
- Local target: `swarmdo/src/swarmvocal/`
- Branch: `feat/swarmvocal-wasm-mcp-integration` (squash-merged to `main`)
- PR: the upstream project (see NOTICE)
- Follow-up issue: the upstream project (see NOTICE)
- Cloud Build configs: `swarmdo/src/swarmvocal/cloudbuild.yaml`, `swarmdo/src/swarmvocal/mcp-bridge/cloudbuild.yaml`
- `.gcloudignore` (CRITICAL — see resolved root cause): `swarmdo/src/swarmvocal/.gcloudignore`
- Web Worker: `swarmdo/src/swarmvocal/src/lib/wasm/{wasm.worker.ts,workerClient.ts}`
- Help modal: `swarmdo/src/swarmvocal/src/lib/components/SwarmdoHelpModal.svelte`
- Live URLs: https://swarmdo.com · https://swarmdo.swarmdo.com/ · https://swarmvocal.swarmdo.com/
- Related deployment ADR: ADR-029 (HF Chat UI on Cloud Run)
