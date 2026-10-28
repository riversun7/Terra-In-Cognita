> 조사 보고서 원본 (작성: Claude Code 조사 에이전트, 2026-10-27). 기존 프로젝트(AntiGravt01) 기준 내용이며, 비밀번호 등 민감 문자열은 [REDACTED]로 바꿨다. 결론은 `docs/PLAN.md`에 반영되어 있다.

# Tech-stack re-selection research — Terra In-Cognita (AntiGravt01)

Research date: **2026-10-27**. Scope: facts only, no final recommendation.

## 0. How this was verified (read first)

| Source type | What it was used for | Reliability |
|---|---|---|
| **npm registry** (`https://registry.npmjs.org/<pkg>`, queried 2026-10-27) | Every "latest version + publish date", dist-tags (`latest`/`next`/`rc`/`beta`), `engines`, deprecation notices | Primary, authoritative for versions/dates |
| **Node.js release data** (`https://nodejs.org/dist/index.json`, `https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`, queried 2026-10-27) | Node versions, LTS/EOL dates | Primary |
| **Docker Hub API** (`https://hub.docker.com/v2/repositories/<image>/tags`, queried 2026-10-27) | PostgreSQL / Redis / Valkey / Deno / Nakama / SpacetimeDB image versions | Primary for "what is published"; `last_updated` = image rebuild date, not upstream release date |
| **raw.githubusercontent.com** (READMEs, CHANGELOGs, LICENSE files, queried 2026-10-27) | Express 5.3 notes, pg changelog, BullMQ 6 changelog, Vitest 5 blog source, Biome changelog, Prisma/ts-rest/Auth.js/Colyseus/uWS READMEs, Nakama changelog, Fastify LTS table | Primary |
| **GitHub search API** (via GitHub MCP, 2026-10-27) | Star counts, `archived` flag, repo primary language | Primary snapshot |
| **Web search** (official blogs where indexed, plus secondary press) | Release narratives, feature lists, acquisitions | Mixed; secondary claims are labelled "(secondary)" |

Limitations: direct fetches of most vendor sites (nextjs.org, vite.dev, bun.com, prisma.io, pixijs.com, postgresql.org) and of GitHub Releases/`api.npmjs.org` (download counts) were blocked from this environment, so **npm weekly download numbers are not included** (GitHub stars are used as the adoption signal instead). Where something could not be verified it is marked **Unknown**.

### Current stack snapshot (read from this repo, 2026-10-27)
- `terra-client/package.json`: next **16.2.6**, react/react-dom **19.2.1**, pixi.js ^8.16.0, @pixi/tilemap ^5.0.2, three ^0.182.0, @react-three/fiber ^9.4.2, @react-three/drei ^10.7.7, tailwindcss ^4.2.2, socket.io-client ^4.8.3, jest ^30.3.0, @playwright/test ^1.59.1, eslint ^9.20.0, typescript ^5.
- `terra-server/package.json`: express ^5.2.1, socket.io ^4.8.3, pg ^8.20.0, redis ^6.0.0, zod ^4.3.6, bcrypt ^6, jsonwebtoken ^9, sharp ^0.34.5 (native addons: bcrypt, sharp), jest ^30.3.0, eslint ^9.20.0 — plain JS.
- Docker base images: `terra-client/Dockerfile` **node:20-alpine**, `terra-server/Dockerfile` **node:18-alpine**; DB images **postgres:15-alpine** (`docker-compose.db.yml`) and **postgres:16-alpine** (`docker-compose.production.yml`).
- Next.js API proxy already lives in `terra-client/src/proxy.ts` (the Next 16 name for middleware).

---

## 1. Runtime

### Node.js
| Line | Latest | Date | Status | EOL |
|---|---|---|---|---|
| **26** | 26.12.1 | 2026-10-21 | Current → **becomes LTS 2026-10-28** | 2029-04-30 (maintenance from 2027-10-20) |
| **24 "Krypton"** | 24.22.1 | 2026-10-20 | LTS, **entered Maintenance 2026-10-20** | 2028-04-30 |
| 22 "Jod" | 22.23.4 | 2026-10-20 | Maintenance LTS since 2025-10-21 | 2027-04-30 |
| 20 "Iron" | 20.20.2 | 2026-03-24 | **EOL** | 2026-04-30 |
| 18 "Hydrogen" | 18.20.8 | 2025-03-27 | **EOL** | 2025-04-30 |
| 27 | — | — | Alpha channel starts 2026-10-28; 27.0.0 planned April 2027 | 2030-04-30 |

- New release model (announced on nodejs.org, page last updated 2026-03-10): from Node 27 onward, **one major per year, every major becomes LTS**, no odd/even split; phases = Alpha (6 mo, Oct–Mar) → Current (6 mo) → LTS (30 mo), 36 months total. Node 26 is the last line under the old model.
- Docker official image tags `lts`/`lts-krypton` point to 24.x as of 2026-10-22 (will flip to 26 after 2026-10-28 — inference from schedule, not yet observed).
- Fact relevant to this repo: both Dockerfiles use EOL lines (18, 20).

Sources: https://nodejs.org/dist/index.json (2026-10-27); https://raw.githubusercontent.com/nodejs/Release/main/schedule.json (2026-10-27); https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule (last updated 2026-03-10); https://www.infoq.com/news/2026/06/nodejs-release-changes (2026-06, secondary); Docker Hub `library/node` tags (2026-10-22).

### Bun
- Latest **1.4.4** (2026-10-22, npm `bun`; Docker `oven/bun:1.4.4` 2026-10-22). 1.4.0 published 2026-08-20; 1.3.0 2025-10-10.
- 2025-2026 changes:
  - **Anthropic acquired Bun** (announced 2025-12-02/03); stays MIT, same team (https://anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone, 2025-12-03; https://feeds.simonwillison.net/2025/Dec/2/anthropic-acquires-bun/).
  - **Bun 1.4 = full rewrite from Zig to Rust** (Bun blog https://bun.com/blog/bun-v1.4, 2026-08-20, via search; GitHub repo primary language now "Rust"). Self-reported: 5x lower idle CPU, up to 35% less memory, 50% faster Linux startup; new APIs `Bun.Image`, `Bun.WebView`, `Bun.markdown`, `Bun.cron()`.
  - Node compatibility (self-reported, Bun blog): passing Node test files went from 1,450 (v1.2.0) to **3,743 (v1.4.0)** against Node v26.3.0's `test/parallel`; http/fs/cluster/timers/zlib/vm/stream ≈97%, events/sqlite 100%, but `inspector` 22/110 and `test_runner` 28/81. No single overall pass-rate published.
  - Upgrade caveats reported (Appwrite, 2026-08-21, secondary): stricter TLS verification, YAML 1.2, no auto `.env` loading when invoked as `node`. A 3-month release gap before 1.4 with slipped dates was reported (ecosistemastartup.com, secondary).
- Adoption: GitHub ~96.4k stars; State of JS 2025: Bun used by 21% vs Node 90%, Deno 11% (https://www.infoq.com/news/2026/03/state-of-js-survey-2025, 2026-03).
- Production-stability note (fact only): the Rust codebase shipped 2026-08-20, i.e. ~2 months of field time at research date; compatibility of native addons used here (`bcrypt`, `sharp`) under Bun 1.4 — **Unknown** (not verified).

### Deno 2
- Latest **2.9.8** (Docker `denoland/deno:2.9.8`, 2026-10-21; the npm `deno` wrapper lags at 2.9.6, 2026-08-27). 2.9.0 released 2026-06-25.
- 2.9 (https://deno.com/blog/v2.9): experimental `deno desktop`; `deno install` reads npm/pnpm/yarn/bun lockfiles; Node.js 26 compatibility; npm versions published <24h ago skipped by default; `Deno.serve` compression now opt-in (breaking). Minor cadence ~every 6–10 weeks (2.4 2025-07 → 2.9 2026-06).
- Adoption: ~108.8k stars; State of JS 2025 usage 11%.

---

## 2. Frontend shell

### Next.js
- Latest **16.4.3** (2026-10-23). Minors: 16.0.0 2025-10-22 (npm; blog 2025-10-21), 16.1.0 2025-12-18, 16.2.0 2026-03-18, **16.3.0 2026-08-03**, **16.4.0 2026-10-06**. Canary 16.5.0-canary.28. 15.x still patched (15.5.28, 2026-10-14). Engines: node >=20.9.
- Support policy (https://nextjs.org/support-policy): latest major = **Active LTS**, previous = **Maintenance LTS for 2 years** from its release → 15.x maintenance window ends ~2026-10-21 (secondary analysis https://www.digitalapplied.com/blog/nextjs-15-end-of-support-october-21-upgrade-options, 2026-10-20). A regular security-release program started mid-2026 (security release 2026-07-20: 16.2.11 / 15.5.21, 4 HIGH + 5 MEDIUM; secondary https://vpncentral.com/next-js-starts-regular-security-release-program-with-9-fixes-due-july-20/).
- 2025-2026 changes: Turbopack is the default bundler for dev+build in 16 (`--webpack` opt-out) (https://heise.de/-10794114); `middleware.ts` deprecated → `proxy.ts`, Node runtime default, codemod `middleware-to-proxy` (https://nextjs.org/docs/app/guides/upgrading/codemods); 16.3 posts "AI Improvements" and "Instant Navigations" (blog index, 2026-06/08).
- Canvas-SPA suitability (facts): `output: 'export'` produces static per-route HTML/JS servable by any static server; features needing a server are not available in static export (proxy/middleware, rewrites/redirects/headers, route handlers using Request, ISR, server actions, default image optimizer) (https://nextjs.org/docs/app/guides/static-exports). This project relies on `proxy.ts` at runtime to forward `/api/*` to Express, which requires running `next start` (Node server), not static export. PixiJS/Three rendering runs in client components only; RSC/SSR do not apply to canvas content.
- Adoption: ~143.3k stars (largest React meta-framework).

### Vite (+ Rolldown)
- Latest **8.3.5** (2026-10-21). **8.0.0 2026-03-12**, 8.1 2026-06-23, 8.2 2026-07-30, 8.3 2026-09-10. Engines node ^20.19 || >=22.12. 7.x/6.x still get patches.
- Vite 8: **Rolldown is the single bundler** (replaces esbuild-in-dev + Rollup-in-build); team claims 10–30x faster builds vs Rollup; built-in tsconfig paths, Wasm SSR, browser console forwarding, devtools (https://theregister.com/2026/03/16/vite_8_rolldown; https://heise.de/-11210695, 2026-03).
- **Rolldown 1.0.0 stable on 2026-05-07** (npm); now 1.2.15 (2026-10-21). `rolldown-vite` package deprecated ("migrate to Vite 8").
- Ownership: **Cloudflare acquired VoidZero** (Vite/Vitest/Rolldown/Oxc/Vite+), announced 2026-06-05; projects stay MIT; $1M ecosystem fund (https://www.intelligentcio.com/me/2026/06/05/cloudflare-acquires-voidzero/; https://www.techzine.eu/news/devops/141866/cloudflare-acquires-vite-developer-voidzero/). Vite reported >130M weekly downloads at that time.
- **Vite+ 1.0.0** (npm 2026-09-28), MIT, bundles Vite 8 + Vitest 5 + Rolldown + Oxlint + Oxfmt + task caching (https://infoq.com/news/2026/08/vite-plus-beta; https://heise.de/-11212433).
- Adoption: ~83.6k stars; State of JS 2025: Vite within ~2 pts of overtaking webpack in usage with far higher satisfaction (InfoQ 2026-03).

### React Router v7/v8
- Latest **8.5.0** (2026-10-19). **v8.0.0 2026-06-17**; v7 last 7.18.4 (2026-09-15, security-only line).
- v8: ESM-only; requires Node ≥22.22, React ≥19.2.7, Vite ≥7; v7 future flags became defaults (middleware on); `react-router-dom` package removed; **v6 and Remix v2 support ended**; yearly major cadence, v9 targeted ~2027 aligned with Node 22 EOL (https://remix.run/blog/react-router-v8; https://reactrouter.com/8.0.0/changelog; https://infoq.com/news/2026/08/react-route-v8).
- ~56.6k stars.

### TanStack Router / Start
- `@tanstack/react-router` **1.170.46** (2026-10-22); `@tanstack/react-start` **1.169.4** (2026-10-22) (Start shares the 1.x version line with Router; first 1.x Start publish 2025-02-25).
- **TanStack Start declared "1.0 stable"** — blog https://tanstack.com/blog/tanstack-start-1-0; date **2026-10-13** per Appwrite (https://appwrite.io/blog/post/tanstack-start-stable-appwrite-sites, secondary). RC was 2025-09-23. Security fix for a reflected XSS published around the same date (TanStack blog).
- Features: type-safe file routing, per-route SSR / data-only / client-only rendering, `createServerFn` server functions; Vite-based.
- ~15.3k stars (TanStack/router repo); 805 open issues.

### React itself
- react **19.3.1** (2026-10-14); 19.3.0 2026-09-09 (`<ViewTransition>` and Fragment refs stable, per secondary https://www.issoh.co.jp/tech/details/18249/). Backports to 19.0–19.2 published 2026-10-14 (19.2.9).

---

## 3. Rendering

### PixiJS
- Latest **8.22.0** (2026-10-01). Roughly monthly minors in 2026: 8.15 (01-05), 8.16 (02-03), 8.17 (03-09), 8.18 (04-14), 8.19 (06-04), 8.20 (08-20), 8.21 (09-17), 8.22 (10-01).
- Notable: 8.19 HTML-in-Canvas textures via `pixi.js/html-source` (https://pixijs.com/blog/june-2026); 8.20 WebGPU work — WGSL overrides, depth-stencil formats, render bundles, `RenderOptions.flipY`, `StructsAndGroups.isUniform` → `accessMode` (breaking for low-level users) (https://gamedev.net/news/5221-pixijs-v8200-released/, secondary). Full-time team funded via "PixiJS Universe" (https://pixijs.com/blog/pixi-universe).
- v9: **Unknown** (no announcement found).
- Ecosystem: `@pixi/react` 8.0.5 (2025-12-01); `pixi-viewport` 6.0.3 (2024-11-27, no 2025-26 release).
- ~48.6k stars.

### Three.js
- Latest **r186 = 0.186.1** (2026-09-24; r186.0 2026-09-08). Cadence in 2026: r183 (02-18), r184 (04-16), r185 (06-25), r186 (09-08). Repo is 4 releases ahead of this project's 0.182.
- r186: native `GaussianSplat` (examples/jsm) that runs **only on WebGPURenderer**; `Object3D.dispose()` / `intersectsFrustum()` (https://radiancefields.com/three.js-ships-its-native-gaussian-splat-renderer-and-splat-raycasting-in-r186, secondary; https://cgworld.jp/flashnews/01-202610-Threejs-r186.html).
- WebGPURenderer: imported from `three/webgpu`, falls back to WebGL2 when WebGPU unavailable (https://threejs.org/manual/en/webgpurenderer). Default `three` export is still WebGLRenderer-based; formal "stable" status of WebGPURenderer — **Unknown** (secondary blogs disagree).
- ~117k stars.

### React Three Fiber
- Latest **9.8.2** (2026-10-14); v9.0.0 2025-02-19 (React 19 line).
- **v10 alpha** (alpha.0 2026-01-14 → alpha.6 2026-10-17): **WebGPURenderer becomes the default**; GLSL/WebGL users import `@react-three/fiber/legacy`; `@react-three/fiber/webgpu` entry deprecated; new hooks for compute buffers/storage textures/render pipeline (https://newreleases.io/project/npm/@react-three/fiber/release/10.0.0-alpha.6). Stable v10 date: **Unknown**.
- drei **10.7.9** (2026-09-25); drei 11.0.0-alpha.7 (2026-09-05).
- ~33.3k stars; 25 open issues.

### Babylon.js
- Latest **9.32.1** (2026-10-27; frequent patch cadence). **9.0 released 2026-03-26** (Microsoft Windows Developer blog https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0): clustered lighting (WebGPU + WebGL2), Gaussian splatting incl. shadows, Node Particle Editor, Frame Graph, audio engine refinements, geospatial features.
- TypeScript-native full engine (physics, GUI, inspector). ~26.2k stars; 30 open issues.

### Phaser 4
- **Phaser 4 is stable**: 4.0.0 "Caladan" **2026-04-10**, 4.1.0 "Salusa" 2026-04-30, 4.2.0 2026-06-19, latest **4.2.1** (2026-07-09) (https://phaser.io/download/stable; npm). New "Phaser Beam" WebGL renderer. Phaser 3 last 3.90.0 (2025-05-23).
- ~40.6k stars.

### WebGPU browser support (status 2026)
- Chrome/Edge: shipped desktop (Windows/macOS/ChromeOS) since Chrome 113 (2023); Android since Chrome 121 (Android 12+, Qualcomm/ARM GPUs); Chromium Linux Intel Gen12+ added Jan 2026; Android GLES 3.1 "compatibility mode" Feb 2026 (Khronos SIGGRAPH 2026 deck, secondary https://www.khronos.org/developers/linkto/webgl-and-webgpu-sigg26).
- Safari: shipped in **Safari 26 (Sept 2025)** on macOS/iOS/iPadOS/visionOS (https://web.dev/blog/webgpu-supported-major-browsers).
- Firefox: **Windows since Firefox 141 (2025-07-22)**; macOS ARM64 (Tahoe) since Firefox 145; **Linux "expected 2026", Android behind flag** per gpuweb implementation-status wiki (edited 2026-05-28) (https://github.com/gpuweb/gpuweb/wiki/Implementation-Status).
- Spec: W3C Candidate Recommendation Draft (Wikipedia, as of 2026-09).
- Implication (fact): a WebGL2 fallback path is still required for Firefox-Linux/Android and older devices.

---

## 4. Backend HTTP

| Framework | Latest stable | Date | Next major | Notes |
|---|---|---|---|---|
| **Express** | **5.3.0** | 2026-10-09 | — | 5.0 2024-09-10; 5.1 2025-03-31; 5.2 2025-12-01. 4.x still patched (4.22.3, 2026-09-14), support "ongoing" |
| **Fastify** | **5.12.7** | 2026-10-13 | 6.0.0-alpha.0…alpha.5 (2026-08-11 → 2026-10-13) | `main` branch = v6; v6 targets Node 24/26 |
| **Hono** | **4.13.14** | 2026-10-25 | **5.0.0-rc.0 (2026-10-08), rc.1 (2026-10-10)**, engines node ≥22.12 | v5 changes: **Unknown** (release notes not retrievable) |
| **NestJS** | **12.3.2** | 2026-10-27 | — | **12.0.0 2026-08-27**; 11.x still patched (11.2.8, 2026-10-23) |
| **Elysia** | **1.4.30** | 2026-08-26 | **2.0.0-rc.0 (2026-10-19)**, betas since 2026-07-30, engines node ≥22.18 | 1.4.30 fixed 5 GHSA advisories |

- Express 5.3.0 (History.md): fixes `qs` CVEs, **body-parser invalid `limit` fail-open DoS (CVE-2026-12590)**, `proxy-addr` CVE; QUERY method conditional revalidation; content-type 2.0 parser (~1.5x faster); Content-Length/Transfer-Encoding conflict fix (https://raw.githubusercontent.com/expressjs/express/master/History.md). Support policy: v4 and v5 both "ongoing" (https://expressjs.com/en/support).
- Fastify: LTS table — 5.0.0 (2024-09-17) supports Node 20/22/24/26; 6.0.0 "TBD", Node 24/26 (https://raw.githubusercontent.com/fastify/fastify/main/docs/Reference/LTS.md). README benchmark (synthetic hello-world, old versions): Express 4.17.3 14,200 req/s vs Fastify 4.0.0 77,193 req/s.
- NestJS 12: core packages ESM (CJS apps still work via `require(esm)`), Node 20.19+/22.12+, Standard-Schema `schema` option on `@Body/@Query/@Param`, ESM projects default to Vitest + oxlint, Rspack for monorepo builds (https://infoq.com/news/2026/04/nestjs-12-roadmap-esm; https://infoq.com/news/2026/10/nestjs-12-observability).
- Hono: Web-standards framework (Node via `@hono/node-server` 2.1.5, 2026-10-13); high satisfaction in State of JS 2025 (secondary).
- Elysia: Bun-first; Node via `@elysiajs/node` adapter.
- Stars (2026-10-27): NestJS 76.9k · Express 69.6k · Fastify 37.3k · Hono 32.7k · Elysia 19.3k.

---

## 5. Realtime / game server

| Option | Latest | Date | Status / notes |
|---|---|---|---|
| **Socket.IO** | **4.8.4** | 2026-09-25 | 4.8.0 2024-09-21 → only patches since (4.8.2/4.8.3 2025-12, 4.8.4 2026-09). No v5 announced (**Unknown**). Engine.IO 6.6.7 fixed 2026 CVEs (CVE-2026-59725 polling DoS, WebTransport `__proto__` DoS). Adapters: `@socket.io/postgres-adapter` 0.5.0 (2025-11-05), `@socket.io/redis-adapter` 8.3.0 (2024-03-13). ~63.2k stars |
| **Colyseus** | **0.18.10** (@colyseus/core 0.18.23) | 2026-10-22 | 0.16 2025-02-17, 0.17 2026-01-09, **0.18.0 2026-05-22**: client-side prediction + lag compensation, request/response messages, Schema 5 (~2.4x faster encoder), new `@colyseus/database`, `@colyseus/admin`; described as **last release before 1.0** (https://colyseus.io/blog/colyseus-018-is-here/; https://docs.colyseus.io/migrating/0.18). MIT; sustained by Colyseus Cloud + sponsors (README). Client SDK renamed to `@colyseus/sdk` 0.18.8 (old `colyseus.js` stops at 0.16.22). Built-in Redis presence/driver. ~7.5k stars, 16 open issues |
| **uWebSockets.js** | v20.x (README install example `#v20.70.0`; a tracker lists v20.79.0) | **Unknown** | Not on npm (install from GitHub tag). Docs index says v20.67.0 supports Node 22/24/26 only (secondary). README: claims 13x Fastify / 20x Socket.IO throughput; licence text "Intellectual property, all rights reserved… where explicit notice is given, Apache-2.0". ~9.2k stars |
| **ws** | **8.22.0** | 2026-09-26 | Mature; backport patches to 5.x/6.x/7.x on 2026-07-17; 8 open issues; ~22.8k stars |
| **Nakama** (Go server) | **3.41.0** | 2026-09-18 | Releases every ~1–2 months (3.36 2026-01-13 … 3.41 2026-09-18). 3.41: provider-agnostic auth APIs/hooks, Go 1.27.1. Apache-2.0. Separate Go binary + PostgreSQL/CockroachDB; server modules in Go/Lua/TS. JS client `@heroiclabs/nakama-js` last published **2.8.0 (2024-06-21)**. ~13.6k stars |

Sources: socket.io CHANGELOG https://raw.githubusercontent.com/socketio/socket.io/main/packages/socket.io/CHANGELOG.md; https://osv.dev/vulnerability/CVE-2026-59725; Colyseus README https://raw.githubusercontent.com/colyseus/colyseus/master/README.md; uWS README https://raw.githubusercontent.com/uNetworking/uWebSockets.js/master/README.md; Nakama CHANGELOG https://raw.githubusercontent.com/heroiclabs/nakama/master/CHANGELOG.md; Docker Hub `heroiclabs/nakama` (all 2026-10-27).

---

## 6. Type-safe API layer

| Item | Latest | Date | Status |
|---|---|---|---|
| **tRPC** | **11.19.0** (canary 11.21.1) | 2026-09-16 | v11.0.0 2025-03-21; active 11.x minors; v12: **Unknown**. ~40.7k stars |
| **oRPC** | **1.16.1** | 2026-10-22 | v1.0 2025-04-15; **2.0.0-beta.47 (2026-10-27)**, betas since 2026-06-21; repo now `middleapi/orpc`; RPC + OpenAPI contract-first |
| **Hono RPC** | ships inside `hono` 4.13.14 (`hc` client) | 2026-10-25 | Requires Hono as server + TS types shared with client |
| **ts-rest** | 3.52.1 (last stable) | 2025-03-04 | **Unmaintained**: README "ts-rest is no longer maintained… no planned releases, including V4, bug fixes, security updates"; GitHub repo **archived** |
| **Zod** | **4.6.7** | 2026-10-12 | 4.0.0 2025-07-09 (Zod Mini, built-in JSON Schema); minors 4.4 (2026-04-29), 4.5 (2026-08-28), 4.6 (2026-09-09). ~44.2k stars. Implements Standard Schema (accepted by NestJS 12 etc.) |

Alternatives (npm, 2026-10-27): Valibot 1.5.0 (2026-09-09), ArkType 2.2.9 (2026-10-20), Effect 4.0.6 (2026-10-22; Effect 4 GA in 2026).
Fact relevant here: the server is plain JS; tRPC/oRPC/Hono-RPC type inference requires TypeScript on the server and a shared type import on the client. Zod 4 is already a server dependency.

Sources: npm registry; https://raw.githubusercontent.com/ts-rest/ts-rest/main/README.md (2026-10-27).

---

## 7. PostgreSQL access + PostgreSQL itself

| Item | Latest stable | Date | Pre-release | Status |
|---|---|---|---|---|
| **Drizzle ORM** | **0.45.4** | 2026-10-08 | **1.0.0-rc.5 (2026-10-21)**; rc.1 2026-04-30; beta.1 2025-11-03 | **1.0 not GA.** RC notes: JIT mapper, reworked codecs (−25–30% latency claim), Effect v4 support, breaking casing API (https://orm.drizzle.team/docs/upgrade-v1; newreleases rc.1). drizzle-kit 0.31.11 / 1.0.0-rc.5. ~36.2k stars, 2,054 open issues |
| **Prisma** | **@prisma/client 7.10.1** | 2026-10-15 | **Prisma 8 RC (8.0.0-rc.27, 2026-10-23)** | **Prisma 7.0.0 (2025-11-19) dropped the Rust query engine by default** ("query compiler"/Rust-free client; driver adapters such as `@prisma/adapter-pg` required) (https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/no-rust-engine). **Prisma 8 = TypeScript rewrite**, RC; README: "8.0.0 final expected in the next four to eight weeks", Prisma 7 maintained 18 months after 8.0 final; Node ^22.18 \|\| ^24.11 \|\| ≥26; known gaps (`$extends`, JSON filters, atomic increment, most nested writes, isolation levels) per release-status docs. Note: npm dist-tag `latest` of the **`prisma` CLI already points to 8.0.0-rc.27** (`prev` = 7.10.1). Prisma 6 security patches until 2026-11-19 (docs, secondary) |
| **Kysely** | **0.29.7** | 2026-10-17 | 0.30.0-beta.2 (2026-09-14) | Pre-1.0 query builder; 0.29.0 2026-05-08; 0.28 line still patched. Release-note details **Unknown**. ~14.3k stars. (Better Auth uses Kysely internally.) |
| **node-postgres (`pg`)** | **8.23.1** | 2026-09-30 | — | 2026 minors: 8.20 Pool `onConnect`; 8.21 Node 26 support, `getTransactionStatus()`; 8.22 `sslnegotiation=direct` (PG17+); **8.23 query pipelining**. ~13.2k stars |
| **postgres.js** | **3.4.9** | 2026-04-05 | — | Slower cadence (no release since April 2026); 352 open issues; ~8.7k stars |

**PostgreSQL server**
- **18** GA **2025-09-25** (async I/O subsystem — up to 3x in some read scenarios, `uuidv7()`, easier upgrades) (https://postgresql.org/about/news/postgresql-18-released-3142/). Latest minor **18.6** — 2026-08-13 release (with 17.11, 16.15, 15.19, 14.24; 28 security fixes) (postgresql.org home/news, via search; Docker `postgres:18.6`).
- **19**: Beta 1 2026-06-04 … Beta 4 2026-09-24 (https://www.postgresql.org/about/news/postgresql-19-beta-4-3386/); **19 RC1** published (Docker tag `19rc1` exists; date 2026-10-15 per secondary https://www.buildmvpfast.com/blog/postgresql-19-release-upgrade-checklist-2026); GA "planned 2026-11-19" (secondary, **not confirmed**).
- **PostgreSQL 14 EOL 2026-11-12.** This repo runs 15 (EOL Nov 2027) and 16 (EOL Nov 2028) images.

Sources: npm registry; https://raw.githubusercontent.com/brianc/node-postgres/master/CHANGELOG.md; https://raw.githubusercontent.com/prisma/prisma/main/README.md; https://www.prisma.io/docs/orm/release-status (via search); Docker Hub `library/postgres` (all 2026-10-27).

---

## 8. Cache / queue

### Redis licensing and Valkey
- **Redis 8.0+ is tri-licensed RSALv2 / SSPLv1 / AGPLv3** (user's choice); 7.4–7.8 were RSALv2/SSPLv1 only; ≤7.2 BSD-3 (Redis README licence section, https://raw.githubusercontent.com/redis/redis/unstable/README.md). AGPL added May 2025 (https://alternativeto.net/news/2025/5/redis-goes-open-source-again-with-the-launch-of-redis-8-under-the-agplv3-license). Intel SVS vector optimizations are only available under RSALv2.
- Redis latest line **8.10** (8.10.0 GA July 2026, endoflife.ai lists 2026-07-29; Docker `redis:8.10.3`): compact hashes + `HIMPORT`, TLS cert-based server auth, LMOVEM/BLMOVEM, BACKUP command (https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/release-notes/redisce/redisos-8.10-release-notes/).
- **Valkey** (Linux Foundation, BSD-3, forked from Redis 7.2.4): **9.1 GA 2026-05-19** — DB-level ACLs, Lua engine as module, JSON logs, I/O threading redesign (+up to 17% throughput, vendor-reported), −10% per-key memory, `CLUSTERSCAN` (https://www.linuxfoundation.org/press/valkey-enhances-efficiency-security-and-modular-performance-with-9.1-release-and-new-ecosystem-integrations). Latest image **valkey 9.1.3** (Docker, 2026-10-27). 9.0.0 2025-10-21. ~27.5k stars.
- Node clients (npm): `redis` (node-redis) **6.3.0** (2026-09-30; v6.0.0 2026-05-28; 6.4.0-beta); `ioredis` **6.0.0** (2026-07-31); `iovalkey` 0.4.0 (2026-07-27); `@valkey/valkey-glide` 2.5.3 (2026-09-24).

### BullMQ
- Latest **6.5.0** (2026-10-26). **6.0.0 (2026-07-30): pluggable `IQueueBackend` with Redis *and PostgreSQL* backends**; `ioredis` now optional peer dependency; legacy repeatable jobs removed (use Job Schedulers); `Worker#resume()` async; debounce removed (use deduplication). 6.4.0 (2026-10-21) "reliable realtime messaging"; valkey-glide fixes in 6.3.x (https://raw.githubusercontent.com/taskforcesh/bullmq/master/docs/gitbook/changelog.md). ~9.5k stars; multi-language (Python/Elixir/PHP/Rust).

### Postgres-based job queues
- **pg-boss 12.38.0** (2026-10-13); 12.0.0 2025-11-09 — new `pgboss_v12` schema, `expire_seconds`, caller-managed pool, Node ≥22.12 (secondary via Supabase PR https://github.com/supabase/storage/pull/1198); 12.26.0 (2026-07-10) adds `detectSchemaDrift()`. Very frequent minors; 13 open issues; ~4.1k stars.
- **Graphile Worker 0.18.0** (2026-09-08); 0.17.0 2026-06-12 — first new minors since 0.16 (2023-12). Requires PG 12+ (docs). Release-note contents for 0.17/0.18: **Unknown**. ~2.4k stars.

---

## 9. Monorepo / tooling

| Tool | Latest | Date | Notes |
|---|---|---|---|
| **pnpm** | **12.15.0** (`latest` tag; 12.16.0 published 2026-10-26) | 2026-10-21 | 10.0 2025-01-07, **11.0 2026-04-28**, **12.0 2026-08-26**. 12 reported as Rust rewrite keeping pnpm 11 CLI/lockfile (secondary: https://xenospectrum.com/en/pnpm-12-rust-rewrite-stable-release/, https://nesbitt.io/2026/08/29/this-week-in-package-management.html); npm package ships native `@pnpm/exe.*` binaries; repo README (main) says "Experimental Rust port (pacquet)". pnpm 11 requires Node ≥22 (secondary). 10.x still patched. ~36.9k stars |
| **npm CLI** | **12.2.1** | 2026-10-15 | npm 12.0.0 2026-07-08; 11.x still patched. Workspaces built in since npm 7 (this repo doesn't use them; uses `file:..`) |
| **Turborepo** | **2.11.10** | 2026-10-20 | 2.x since 2024-06; 2.11 adds experimental Cargo/uv/go.work workspace support (secondary https://www.issoh.co.jp/tech/details/17773/). ~31.3k stars |
| **Nx** | **24.0.2** | 2026-10-26 | 22.0 2025-10-22, 23.0 2026-06-16, **24.0 2026-10-21** (semiannual majors). ~29.4k stars |
| **Biome** | **2.6.3** | 2026-10-24 | 2.0 2025-06-17 (type-aware rules without tsc, GritQL plugins). **2.6.0 2026-10-21**: YAML + SCSS support, Tailwind class sorting, 59 nursery rules promoted, recursive config `extends` (CHANGELOG). ~26k stars |
| **ESLint** | **10.13.0** | 2026-10-16 | **10.0.0 2026-02-06: eslintrc removed (flat config only)**; Node ^20.19 \|\| ^22.13 \|\| ≥24. **ESLint 9.x EOL 2026-08-06** (eslint.org banner, https://eslint.org/blog/2026/02/eslint-v10.0.0-released/). This repo is on eslint ^9.20 |
| **Prettier** | **3.9.10** | 2026-10-10 | 4.0.0-alpha.13 (2025-11-18) still alpha |
| **oxlint** | **1.90.0** | 2026-10-27 | 1.0 2025-06-10; JS plugins (ESLint-compatible API) alpha 2026-03-11 (https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha); type-aware linting alpha 2025-12-08 → "stable" announcement (oxc blog index, ~2026-07, secondary). **oxfmt 0.75.0** (2026-10-27) still pre-1.0. oxc repo ~23.3k stars |
| **TypeScript** | **7.0.2** | 2026-07-08 | **TS 7.0 = Go native compiler, shipped in the regular `typescript` package** (npm 7.0.2 depends on platform binaries `@typescript/typescript-<os>-<arch>`; `tsc` only, no `tsserver` bin). RC 7.0.1-rc 2026-06-18; **7.1.0-beta 2026-10-20**. TS **6.0** (2026-03-23) was the last JS-based release. 8–12x faster full builds (https://www.infoworld.com/article/4196378/go-based-typescript-7-0-arrives.html; https://visualstudiomagazine.com/articles/2026/06/22/typescript-7-0-rc-moves-microsofts-go-rewrite-into-the-mainline-compiler.aspx). `microsoft/typescript-go` repo archived; `microsoft/TypeScript` primary language now Go |
| **Vitest** | **5.0.5** | 2026-10-15 | 4.0 2025-10-22; **5.0.0 2026-09-03** (perf release: −8% to −53% wall-clock in Vitest's own benchmarks; shared Vite server for inline projects; stable `fsModuleCache`); Node ^22.12 \|\| ^24 \|\| ≥26 (https://raw.githubusercontent.com/vitest-dev/vitest/main/docs/blog/vitest-5.md). ~17.3k stars |
| **Jest** | **30.5.2** | 2026-09-18 | 30.0 2025-06-10; minors 30.3 (2026-03-10), 30.4 (2026-05-07), 30.5 (2026-08-28) — actively maintained. ~45.5k stars |
| **Playwright** | **1.64.1** | 2026-10-14 | monthly-ish minors; 1.65 alpha |

---

## 10. Auth

| Item | Latest | Date | Status |
|---|---|---|---|
| **Better Auth** | **1.7.14** | 2026-10-26 | 1.0 2024-11-23; 1.4 2025-11-22; 1.5 2026-03-01; 1.6 2026-04-06; **1.7.0 2026-08-18** (OAuth 2.1 authorization-server features, DPoP, single sign-out, SCIM groups, MCP authorization; several breaking changes — https://better-auth.com/blog/1-7). **Took over Auth.js maintenance 2025-09-22** (https://www.better-auth.com/blog/authjs-joins-better-auth). Better Auth joining **Vercel** — blog dated 2026-07-07 (https://better-auth.com/blog/better-auth-joins-vercel; details secondary). Depends on Kysely; supports PostgreSQL. ~30.5k stars, 899 open issues |
| **Lucia** | 3.2.2 (final) | 2024-10-20 | **npm package deprecated** ("This package has been deprecated. Please see https://lucia-auth.com/lucia-v3/migrate"). Repo continues as documentation/learning material (repo still updated; framing as "learning resource" not re-verified this session) |
| **Auth.js / NextAuth** | next-auth **4.24.15** stable; **v5 still beta (5.0.0-beta.32)**; @auth/core 0.41.3 | 2026-07-20 | README: "Auth.js is now part of Better Auth. We recommend new projects to start with Better Auth unless… stateless session management without a database." Security patches continue. ~28.4k stars |

(Current project: custom bcrypt + jsonwebtoken.)

---

## 11. Trending alternatives for browser multiplayer strategy games

| Option | Latest | Date | Model | Licence / hosting fact |
|---|---|---|---|---|
| **Colyseus** | 0.18.10 | 2026-10-22 | Node room-based authoritative state sync (Schema delta), matchmaking | MIT, self-host or Colyseus Cloud |
| **Nakama** | 3.41.0 | 2026-09-18 | Go game backend: accounts, storage, leaderboards, realtime matches, TS/Lua/Go modules | Apache-2.0, self-host (Docker) + Heroic Cloud |
| **SpacetimeDB** | 2.13.0 (npm `spacetimedb`; Docker v2.13.0) | 2026-10-21 | DB + app server in one; game logic as WASM modules inside DB; clients subscribe to queries. 2.0.0 2026-02-20. Built for BitCraft Online | **BSL 1.1** (LICENSE.txt), self-host via Docker or Maincloud. A 2026-08-20 critical review reports a global mutex and 50 ms WAL flush (https://zeli.app/es/story/49378933, secondary) |
| **Rivet / RivetKit** | rivetkit 2.3.30 (3.0.0-preview.2) | 2026-10-20 | Stateful "actors" with per-actor SQLite state, WebSockets, durable queues | Apache-2.0, self-host Docker or Rivet Cloud (https://rivet.dev/docs/actors/quickstart/backend/) |
| **PartyKit / partyserver** | partyserver 0.5.10 | 2026-08-03 | Rooms on Cloudflare Durable Objects | Cloudflare-hosted (not self-hostable on a NAS as-is) |
| **Convex** | 1.48.0 | 2026-10-22 | Reactive backend/database with TS functions | Self-host/licence details **Unknown** (not verified) |
| **geckos.io** | @geckos.io/server 3.1.0 | 2026-03-27 | WebRTC DataChannel (UDP-like) client/server | — |
| ECS libs | bitECS 0.4.0 (2025-12-06); Koota 0.6.6 (2026-04-09, pmndrs) | — | Data-oriented sim state, usable server + client | MIT |
| Other renderers | PlayCanvas 2.23.3 (2026-10-15) + @playcanvas/react 0.11.7; Excalibur 0.32.0 (2025-12-23) | — | — | — |
| Physics | @dimforge/rapier3d-compat 0.21.0 | 2026-09-25 | WASM physics (deterministic option) | Apache-2.0 |

---

## 12. Comparative notes per layer (facts only)

**Runtime.** Node 26 becomes LTS 2026-10-28 (EOL 2029-04); Node 24 already in Maintenance (EOL 2028-04). This repo's container images (node:18, node:20) are past EOL; moving to 24/26 is a base-image change (pg ≥8.21 declares Node 26 support). Bun 1.4 is a 2-month-old Rust rewrite with self-reported, module-dependent Node compatibility and is now owned by Anthropic; Deno 2.9 can import npm lockfiles. Native addons in the server (`bcrypt`, `sharp`) are the main compatibility unknown for Bun/Deno. Adoption: Node 90% / Bun 21% / Deno 11% (State of JS 2025).

**Frontend shell.** Next 16.4 is actively developed with an explicit LTS policy; its server features (RSC/SSR/proxy) are orthogonal to canvas rendering, and static export removes `proxy.ts`, which this project currently uses for `/api/*` forwarding. Vite 8 (Rolldown 1.0) + React Router 8 or TanStack Router/Start 1.0 is a client-first alternative; migration cost = replacing `src/app/` file routing, `next/*` imports, `proxy.ts` (→ dev proxy + production reverse proxy or Express static hosting), and Next-specific Docker build. Ownership changes: Vite stack now under Cloudflare (MIT retained); Next under Vercel.

**Rendering.** PixiJS 8 (monthly minors, no v9 announced) and R3F 9 are current; three is 4 releases behind (0.182 → 0.186). R3F 10 (alpha) flips the default to WebGPURenderer, which matters because Firefox Linux/Android still lack WebGPU — a WebGL2 path stays necessary. Phaser 4 (stable April 2026) and Babylon 9 (March 2026) are full engines rather than renderers; switching to either implies rewriting rendering/scene code, not a version bump. Stars: three 117k, Pixi 48.6k, Phaser 40.6k, R3F 33.3k, Babylon 26.2k.

**Backend HTTP.** Express 5.3 is receiving security-driven releases (body-parser fail-open DoS fix) — staying on Express 5 means bumping 5.2 → 5.3. Fastify 5 is stable with v6 in alpha; Hono 4 stable with v5 in RC (engines Node ≥22.12); Elysia 2 in RC and Bun-first; NestJS 12 is ESM + DI-heavy. Published throughput numbers are vendor/synthetic (Fastify README table uses 2022 versions). Migration cost from Express: route/middleware rewrite of a monolithic `server.js` (CLAUDE.md flags it as a "God Object"); Fastify/Hono both have Express-compat or Node adapters but not drop-in.

**Realtime.** Socket.IO 4.8 has had only patch releases since Sept 2024 (maintenance-style cadence, CVE fixes in 2026), and is ~63k stars; Colyseus 0.18 is the most active JS game-server framework (pre-1.0, "last before 1.0", adds prediction/lag compensation); `ws` is minimal and stable; uWS.js is fastest by its own claims but is GitHub-only with an unusual licence notice; Nakama is a separate Go service with its own PostgreSQL schema, and its JS client has not been published since 2024-06.

**Type-safe API.** tRPC 11 (stable, active), oRPC 1.x (v2 beta), Hono RPC (tied to Hono). ts-rest is archived/unmaintained. All require TypeScript on the server to deliver end-to-end types; the server is plain JS today. Zod 4.6 is current and already used.

**DB access.** `pg` 8.23 is actively maintained (pipelining added) — the current raw-SQL approach has no deprecation pressure. Drizzle 1.0 and Prisma 8 are both still RC on 2026-10-27; Prisma 7 (stable) is Rust-free with driver adapters; Kysely is pre-1.0 but widely embedded (Better Auth). postgres.js has slowed (last release 2026-04). PostgreSQL 18.6 is the newest GA minor; 19 is at RC1; this repo's 15/16 images are supported until 2027/2028.

**Cache/queue.** Redis 8.x is AGPLv3-optionally open source again; Valkey 9.1 is BSD and protocol-compatible. BullMQ 6 (2026-07-30) can now run on PostgreSQL as well as Redis/Valkey; pg-boss 12 and Graphile Worker 0.18 are Postgres-only. With PostgreSQL already present, a Postgres-backed queue avoids adding a service; Redis/Valkey remains optional.

**Tooling.** ESLint 9 (in use) reached EOL 2026-08-06 → ESLint 10 (flat config only) or Biome 2.6 / oxlint 1.x. TypeScript 7 (Go) is GA in the main `typescript` package; TS 6.0 was the last JS-based compiler. Vitest 5 (Sept 2026) and Jest 30.5 are both maintained; Jest is what the repo uses. pnpm 12 / npm 12 are current; Turborepo 2.11 and Nx 24 are active.

**Auth.** Lucia's npm package is deprecated; Auth.js is in maintenance under the Better Auth team with v5 still beta; Better Auth 1.7 is the actively developed TS option (now associated with Vercel). The repo's custom bcrypt+JWT approach has no library-deprecation exposure.

---

## 13. Summary table

| Item | Latest version | Date | Status | Source |
|---|---|---|---|---|
| Node.js 26 | 26.12.1 | 2026-10-21 | LTS from 2026-10-28; EOL 2029-04-30 | nodejs.org/dist/index.json; nodejs/Release schedule.json |
| Node.js 24 | 24.22.1 | 2026-10-20 | Maintenance LTS; EOL 2028-04-30 | same |
| Node.js 20 / 18 | 20.20.2 / 18.20.8 | 2026-03-24 / 2025-03-27 | **EOL** (2026-04-30 / 2025-04-30) | same |
| Bun | 1.4.4 | 2026-10-22 | Active; 1.4 Rust rewrite (2026-08-20); Anthropic-owned | npm; bun.com/blog/bun-v1.4 |
| Deno | 2.9.8 | 2026-10-21 | Active; 2.9.0 2026-06-25 | Docker denoland/deno; deno.com/blog/v2.9 |
| Next.js | 16.4.3 | 2026-10-23 | Active LTS (16.x) | npm; nextjs.org/support-policy |
| Vite | 8.3.5 | 2026-10-21 | Active; Rolldown-only since 8.0 (2026-03-12) | npm; theregister.com 2026-03-16 |
| Rolldown | 1.2.15 | 2026-10-21 | Stable (1.0.0 2026-05-07) | npm |
| React Router | 8.5.0 | 2026-10-19 | v8 since 2026-06-17; v6 EOL | npm; remix.run/blog/react-router-v8 |
| TanStack Router / Start | 1.170.46 / 1.169.4 | 2026-10-22 | Start "1.0 stable" (2026-10-13, secondary) | npm; tanstack.com/blog/tanstack-start-1-0 |
| React | 19.3.1 | 2026-10-14 | Active | npm |
| PixiJS | 8.22.0 | 2026-10-01 | Active, monthly minors; v9 Unknown | npm |
| Three.js | 0.186.1 (r186) | 2026-09-24 | Active (~8–10 wk cadence) | npm |
| React Three Fiber | 9.8.2 (v10 alpha.6) | 2026-10-14 (alpha 2026-10-17) | Active; v10 WebGPU-default in alpha | npm |
| Babylon.js | 9.32.1 | 2026-10-27 | Active; 9.0 2026-03-26 | npm; blogs.windows.com |
| Phaser | 4.2.1 | 2026-07-09 | Phaser 4 stable since 2026-04-10 | npm; phaser.io |
| WebGPU | — | 2026 | Chrome/Edge/Safari 26 shipped; Firefox Win+macOS ARM only, Linux/Android pending | web.dev; gpuweb wiki (2026-05-28) |
| Express | 5.3.0 | 2026-10-09 | Active (security fixes); v4 still supported | npm; express History.md |
| Fastify | 5.12.7 (6.0.0-alpha.5) | 2026-10-13 | Active; v6 alpha | npm; fastify LTS.md |
| Hono | 4.13.14 (5.0.0-rc.1) | 2026-10-25 (rc 2026-10-10) | Active; v5 RC | npm |
| NestJS | 12.3.2 | 2026-10-27 | Active; 12.0 2026-08-27 (ESM) | npm; infoq 2026-10 |
| Elysia | 1.4.30 (2.0.0-rc.0) | 2026-08-26 (rc 2026-10-19) | Active; v2 RC | npm; elysia CHANGELOG |
| Socket.IO | 4.8.4 | 2026-09-25 | Patch-only since 4.8.0 (2024-09) | npm; socket.io CHANGELOG |
| Colyseus | 0.18.10 | 2026-10-22 | Active, pre-1.0 (0.18 = last before 1.0) | npm; colyseus.io blog |
| uWebSockets.js | v20.x (≥v20.70.0) | Unknown | Active (GitHub-only, not on npm) | uWS README |
| ws | 8.22.0 | 2026-09-26 | Mature/stable | npm |
| Nakama | 3.41.0 | 2026-09-18 | Active (Go); JS client stale since 2024-06 | Nakama CHANGELOG; Docker Hub |
| tRPC | 11.19.0 | 2026-09-16 | Active; v12 Unknown | npm |
| oRPC | 1.16.1 (2.0.0-beta.47) | 2026-10-22 | Active; v2 beta | npm |
| ts-rest | 3.52.1 | 2025-03-04 | **Unmaintained / archived** | ts-rest README; GitHub |
| Zod | 4.6.7 | 2026-10-12 | Active (v4 since 2025-07-09) | npm |
| Drizzle ORM | 0.45.4 (1.0.0-rc.5) | 2026-10-08 (rc 2026-10-21) | 1.0 not GA | npm |
| Prisma | 7.10.1 (8.0.0-rc.27) | 2026-10-15 (rc 2026-10-23) | 7 Rust-free; 8 = TS rewrite, RC | npm; prisma README |
| Kysely | 0.29.7 | 2026-10-17 | Active, pre-1.0 | npm |
| node-postgres | 8.23.1 | 2026-09-30 | Active (pipelining in 8.23) | npm; pg CHANGELOG |
| postgres.js | 3.4.9 | 2026-04-05 | Slower cadence | npm |
| PostgreSQL | 18.6 (19 RC1) | 2026-08-13 (RC1 ~2026-10-15) | 18 current; 19 GA pending; 14 EOL 2026-11-12 | postgresql.org; Docker Hub |
| Redis | 8.10.3 | 2026 (8.10 GA July 2026) | RSALv2/SSPLv1/**AGPLv3** | redis README; redis.io notes |
| Valkey | 9.1.3 | 9.1 GA 2026-05-19 | BSD-3, LF | linuxfoundation.org; Docker Hub |
| BullMQ | 6.5.0 | 2026-10-26 | Active; v6 adds PostgreSQL backend | npm; bullmq changelog |
| pg-boss | 12.38.0 | 2026-10-13 | Active | npm |
| Graphile Worker | 0.18.0 | 2026-09-08 | Active again (0.17 2026-06-12) | npm |
| pnpm | 12.15.0 | 2026-10-21 | Active; 12.0 2026-08-26 | npm |
| npm CLI | 12.2.1 | 2026-10-15 | Active; 12.0 2026-07-08 | npm |
| Turborepo | 2.11.10 | 2026-10-20 | Active | npm |
| Nx | 24.0.2 | 2026-10-26 | Active; 24.0 2026-10-21 | npm |
| Biome | 2.6.3 | 2026-10-24 | Active; 2.6.0 2026-10-21 | npm; Biome CHANGELOG |
| ESLint | 10.13.0 | 2026-10-16 | Active; **v9 EOL 2026-08-06** | npm; eslint.org |
| oxlint / oxfmt | 1.90.0 / 0.75.0 | 2026-10-27 | Active; oxfmt pre-1.0 | npm; oxc.rs |
| TypeScript | 7.0.2 (7.1.0-beta) | 2026-07-08 (beta 2026-10-20) | TS 7 = Go native, GA | npm; infoworld.com |
| Vitest | 5.0.5 | 2026-10-15 | Active; 5.0 2026-09-03 | npm; vitest blog source |
| Jest | 30.5.2 | 2026-09-18 | Active | npm |
| Better Auth | 1.7.14 | 2026-10-26 | Active; maintains Auth.js | npm; better-auth.com |
| Lucia | 3.2.2 | 2024-10-20 | **Deprecated** (npm) | npm deprecation notice |
| Auth.js (next-auth) | 4.24.15 (v5 beta.32) | 2026-07-20 | Maintenance under Better Auth | npm; next-auth README |
| SpacetimeDB | 2.13.0 | 2026-10-21 | Active; BSL 1.1 | npm; LICENSE.txt |
| RivetKit | 2.3.30 | 2026-10-20 | Active; Apache-2.0 | npm; rivet LICENSE |

---

## 14. Source index (all accessed 2026-10-27 unless noted)

Primary / official
- npm registry: https://registry.npmjs.org/ (per-package metadata, `time`, `dist-tags`, `engines`, `deprecated`)
- Node.js: https://nodejs.org/dist/index.json · https://raw.githubusercontent.com/nodejs/Release/main/schedule.json · https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule (updated 2026-03-10)
- Docker Hub tags API: https://hub.docker.com/v2/repositories/{library/postgres, library/redis, valkey/valkey, library/node, oven/bun, denoland/deno, heroiclabs/nakama, clockworklabs/spacetime}/tags
- Express History: https://raw.githubusercontent.com/expressjs/express/master/History.md (5.3.0)
- Express support: https://expressjs.com/en/support
- Fastify LTS: https://raw.githubusercontent.com/fastify/fastify/main/docs/Reference/LTS.md
- Socket.IO changelog: https://raw.githubusercontent.com/socketio/socket.io/main/packages/socket.io/CHANGELOG.md
- node-postgres changelog: https://raw.githubusercontent.com/brianc/node-postgres/master/CHANGELOG.md
- BullMQ changelog: https://raw.githubusercontent.com/taskforcesh/bullmq/master/docs/gitbook/changelog.md (6.0.0 2026-07-30; 6.5.0 2026-10-26)
- Prisma README (Prisma 8 RC): https://raw.githubusercontent.com/prisma/prisma/main/README.md
- Prisma no-Rust-engine docs: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/no-rust-engine ; release status: https://www.prisma.io/docs/orm/release-status
- Drizzle v1 upgrade: https://orm.drizzle.team/docs/upgrade-v1
- ts-rest README: https://raw.githubusercontent.com/ts-rest/ts-rest/main/README.md
- Auth.js README: https://raw.githubusercontent.com/nextauthjs/next-auth/main/README.md ; https://www.better-auth.com/blog/authjs-joins-better-auth (2025-09-22) ; https://better-auth.com/blog/1-7 (2026-08-17) ; https://better-auth.com/blog/better-auth-joins-vercel (2026-07-07)
- Colyseus README: https://raw.githubusercontent.com/colyseus/colyseus/master/README.md ; https://colyseus.io/blog/colyseus-018-is-here/ ; https://docs.colyseus.io/migrating/0.18
- uWebSockets.js README: https://raw.githubusercontent.com/uNetworking/uWebSockets.js/master/README.md
- Nakama CHANGELOG: https://raw.githubusercontent.com/heroiclabs/nakama/master/CHANGELOG.md ; LICENSE (Apache-2.0)
- Redis README (licences): https://raw.githubusercontent.com/redis/redis/unstable/README.md ; Redis 8.10 notes: https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/release-notes/redisce/redisos-8.10-release-notes/
- Valkey 9.1: https://www.linuxfoundation.org/press/valkey-enhances-efficiency-security-and-modular-performance-with-9.1-release-and-new-ecosystem-integrations (2026-05-19)
- PostgreSQL: https://postgresql.org/about/news/postgresql-18-released-3142/ (2025-09-25) ; https://www.postgresql.org/about/news/postgresql-19-beta-4-3386/ (2026-09-24)
- Vitest 5 blog source: https://raw.githubusercontent.com/vitest-dev/vitest/main/docs/blog/vitest-5.md (2026-09-03)
- Biome CHANGELOG: https://raw.githubusercontent.com/biomejs/biome/main/packages/@biomejs/biome/CHANGELOG.md
- ESLint v10: https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
- Oxc: https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha ; https://oxc.rs/blog/2025-12-08-type-aware-alpha ; https://oxc.rs/blog/
- Next.js: https://nextjs.org/support-policy ; https://nextjs.org/docs/app/guides/static-exports ; https://nextjs.org/docs/app/guides/upgrading/codemods
- React Router v8: https://remix.run/blog/react-router-v8 (2026-06-17) ; https://reactrouter.com/8.0.0/changelog
- TanStack Start: https://tanstack.com/blog/tanstack-start-1-0 ; https://tanstack.com/blog/announcing-tanstack-start-v1
- Babylon.js 9: https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0
- Phaser: https://phaser.io/download/stable
- PixiJS: https://pixijs.com/blog/june-2026 ; https://pixijs.com/blog/pixi-universe
- Three.js WebGPURenderer manual: https://threejs.org/manual/en/webgpurenderer
- WebGPU: https://web.dev/blog/webgpu-supported-major-browsers ; https://github.com/gpuweb/gpuweb/wiki/Implementation-Status (edited 2026-05-28)
- Deno 2.9: https://deno.com/blog/v2.9 ; Bun 1.4: https://bun.com/blog/bun-v1.4 (2026-08-20)
- Anthropic/Bun: https://anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone (2025-12-03)
- SpacetimeDB LICENSE: https://raw.githubusercontent.com/clockworklabs/SpacetimeDB/master/LICENSE.txt ; Rivet LICENSE: https://raw.githubusercontent.com/rivet-dev/rivet/main/LICENSE ; Rivet quickstart: https://rivet.dev/docs/actors/quickstart/backend/
- GitHub star counts / archived flags: GitHub repository search API snapshot, 2026-10-27

Secondary (press / aggregators)
- InfoQ: Node release changes https://infoq.com/news/2026/06/nodejs-release-changes ; State of JS 2025 https://www.infoq.com/news/2026/03/state-of-js-survey-2025 ; React Router v8 https://infoq.com/news/2026/08/react-route-v8 ; NestJS 12 https://infoq.com/news/2026/04/nestjs-12-roadmap-esm , https://infoq.com/news/2026/10/nestjs-12-observability ; Vite+ https://infoq.com/news/2026/08/vite-plus-beta ; TS7 https://infoq.com/news/2026/08/typescript-7-released/
- TypeScript 7: https://www.infoworld.com/article/4196378/go-based-typescript-7-0-arrives.html ; https://visualstudiomagazine.com/articles/2026/06/22/typescript-7-0-rc-moves-microsofts-go-rewrite-into-the-mainline-compiler.aspx
- Vite 8: https://theregister.com/2026/03/16/vite_8_rolldown ; https://heise.de/-11210695
- Cloudflare/VoidZero: https://www.intelligentcio.com/me/2026/06/05/cloudflare-acquires-voidzero/ ; https://www.techzine.eu/news/devops/141866/cloudflare-acquires-vite-developer-voidzero/
- Next.js 16 Turbopack: https://heise.de/-10794114 ; Next 15 end of support: https://www.digitalapplied.com/blog/nextjs-15-end-of-support-october-21-upgrade-options (2026-10-20) ; security program: https://vpncentral.com/next-js-starts-regular-security-release-program-with-9-fixes-due-july-20/
- Bun 1.4 coverage: https://appwrite.io/blog/post/announcing-bun-1-4-runtime ; https://ecosistemastartup.com/bun-1-4-3-meses-sin-release-y-la-reescritura-en-rust-que-preocupa/
- pnpm 12: https://xenospectrum.com/en/pnpm-12-rust-rewrite-stable-release/ ; https://nesbitt.io/2026/08/29/this-week-in-package-management.html
- Turborepo 2.11: https://www.issoh.co.jp/tech/details/17773/ ; https://releases.sh/collections/js-toolchain/digest/2026-09-14
- three r186: https://radiancefields.com/three.js-ships-its-native-gaussian-splat-renderer-and-splat-raycasting-in-r186 ; https://cgworld.jp/flashnews/01-202610-Threejs-r186.html
- R3F v10 alpha: https://newreleases.io/project/npm/@react-three/fiber/release/10.0.0-alpha.6
- PixiJS 8.20: https://gamedev.net/news/5221-pixijs-v8200-released/
- React 19.3: https://www.issoh.co.jp/tech/details/18249/
- PostgreSQL 19 RC1: https://www.buildmvpfast.com/blog/postgresql-19-release-upgrade-checklist-2026
- Redis AGPL: https://alternativeto.net/news/2025/5/redis-goes-open-source-again-with-the-launch-of-redis-8-under-the-agplv3-license
- pg-boss 12 details: https://github.com/supabase/storage/pull/1198
- Socket.IO/Engine.IO CVE: https://osv.dev/vulnerability/CVE-2026-59725
- SpacetimeDB review: https://zeli.app/es/story/49378933 (2026-08-20)
- WebGPU Khronos: https://www.khronos.org/developers/linkto/webgl-and-webgpu-sigg26
