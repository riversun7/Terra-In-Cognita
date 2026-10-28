> 조사 보고서 원본 (작성: Claude Code 조사 에이전트, 2026-10-27). 기존 프로젝트(AntiGravt01) 기준 내용이며, 비밀번호 등 민감 문자열은 [REDACTED]로 바꿨다. 결론은 `docs/PLAN.md`에 반영되어 있다.

# terra-client / terra-lite inventory (read-only fact-finding)

Repo: /home/user/AntiGravt01 @ HEAD e0e9c72 (shallow clone, 57 commits visible). No tracked files modified.
No `node_modules` present anywhere; `npm ci` was NOT run. Everything below is static analysis.

Legend: **[V]** Verified (read the code / ran a script against the tree). **[A]** Assumed / inferred (framework semantics, runtime behaviour, or intent).

Helper scripts and raw outputs (all in scratchpad):
- `/tmp/claude-0/-home-user-AntiGravt01/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/reach.js` (import graph) -> `reach.json`
- `/tmp/claude-0/-home-user-AntiGravt01/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/knip.config.json` + `knip.txt` (knip cross-check)
- `/tmp/claude-0/-home-user-AntiGravt01/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/anycount.js` (any / disable counts)
- `/tmp/claude-0/-home-user-AntiGravt01/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/assetref.js` -> `assetref.json`, `asset_hashes.txt`, `server_hashes.txt`
- `/tmp/claude-0/-home-user-AntiGravt01/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/liteapi.js` (terra-lite endpoint vs server route check)

---

## 1. Import reachability (terra-client)

### Method A: own script (`reach.js`)
- Comment-aware regex parser: `import … from`, `export … from`, `import()`, `require()`, `jest.mock()`; resolves `@/*` -> `src/*` (from tsconfig `paths`) and relative specifiers with `.ts/.tsx/.js/.jsx/.mjs/.json/.css` + `/index.*`.
- Production entrypoints: every `src/app/**/{page,layout,route,loading,error,not-found,template,default,global-error}.tsx|ts` (204 files) + `src/proxy.ts` + `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`.
- Test entrypoints, tracked separately: `src/**/__tests__/**`, `*.test.tsx`, `e2e/*.spec.ts`, `jest.config.ts`, `jest.setup.ts`, `playwright.config.ts`.
- No `new Worker(new URL(...))` or other non-import loading patterns exist [V], so the regex graph should be complete. Unresolved specifiers: 0 [V].

Results [V]:
| metric | value |
|---|---|
| tracked code files in src (ts/tsx) | 377 (106,721 lines) |
| prod entrypoints | 204 |
| reachable from prod entries | 362 (incl. 3 test files that are only test entries) |
| **unreachable non-test files** | **10 files / 702 lines** |
| reachable only from tests | 0 |

Unreachable files (lines, notes):
| lines | file | notes |
|---|---|---|
| 154 | src/components/buildings/CyborgCreationSection.tsx | no references at all |
| 65 | src/components/common/ErrorBoundary.tsx | superseded by Next `error.tsx` files (the `ErrorBoundary` name in error.tsx files is just the local default-export name) |
| 55 | src/components/common/GlobalHotkeys.tsx | no references |
| 43 | src/components/common/NotificationCenter.tsx | opens its own socket.io connection + react-hot-toast; never mounted |
| 126 | src/components/social/GlobalChatWidget.tsx | never mounted |
| 67 | src/components/ui/AsyncButton.tsx | was injected via `scripts/inject_async_button.js`, now unused |
| 56 | src/hooks/useSound.ts | only imported by dead GlobalChatWidget |
| 40 | src/lib/pushManager.ts | only imported by dead NotificationCenter |
| 54 | src/lib/rateLimit.ts | no references |
| 42 | src/providers/PostHogProvider.tsx | imports `posthog-js`, which is **not in package.json**; uses 2x `@ts-expect-error`. Would break the build if ever imported |

Dead clusters: 8 roots + 2 transitively dead (useSound <- GlobalChatWidget, pushManager <- NotificationCenter).

### Method B: knip 5 via `npx -y knip@5` (cross-check)
- The default run failed because knip's jest plugin loads `jest.config.ts` -> `next/jest.js` (no node_modules). I re-ran it with a scratchpad config (`--config …/knip.config.json`) that disables the jest/eslint/playwright/postcss/tailwind plugins and declares the same entries by hand. Nothing was written into the repo.
- **knip "Unused files": the same 10 files** [V]. The two methods agree.
- knip also reported (knip-only, not cross-checked line by line):
  - 46 unused exports. Notable: most of `src/lib/imageUtils.ts` (getItemImageUrl, getCreatureImageUrl, getSkillImageUrl, getBuildingImageUrl, getCharacterImageUrl, getUIAssetUrl, normalizeGrade, FALLBACK_IMAGES, GRADE_COLORS, FACTION_COLORS); 8 calc* functions in `src/lib/clientEncounterFormulas.ts`; `API_BASE_URL` / `getSocketUrl` exports in `src/lib/config.ts`; 9 exports in `admin/editor/items/_components/RollConfigPanel.tsx`; noise helpers in `WorldMap/core/BiomeGenerator.ts`; `TERRAIN_COLORS` / `getTerrainTexture` in `TerrainTextures.ts`; default export of `components/BuildingRequiredCard.tsx`.
  - 54 unused exported types/interfaces.
  - Its dependency findings are unreliable because the plugins were disabled. See section 8 for the manually verified list.

---

## 2. Routes (src/app)

**/terrain-map does not exist** [V]. `src/components/map/` (Leaflet) **does not exist** [V]. There is no `leaflet` dependency and no reference to either anywhere in `src/` [V]. The shallow git history has no trace of them either. CLAUDE.md is stale on this point, and also on `src/middleware.ts` (it is `src/proxy.ts`, the Next 16 naming), "CSS modules" (the only CSS file is `globals.css`), ports (the client runs on 4000 and the server on 4001/4002, not 3000/3001) and "no test framework" (Jest and Playwright are configured).

Counts [V]: 65 `page.tsx`, 3 `route.ts`, 65 `error.tsx`, 65 `loading.tsx`, 4 layouts, 1 not-found.
- 51 of the 65 `error.tsx` files are byte-identical, and so are 51 of the 65 `loading.tsx` files (same md5). That is ~102 boilerplate files, which Next's segment inheritance would let you collapse into a few parent-level ones [V counts; A on collapsing].
- Only the root layout, the landing page `/`, `admin/editor/layout`, `admin/manage/layout` and the 14 redirect stubs are server components. **Every real page is `'use client'`**, and all data fetching happens client-side in `useEffect` [V].

### Player routes
| route | page lines (+colocated) | purpose | flag |
|---|---|---|---|
| `/` | 84 | landing page (server component) | |
| `/login` | 288 | login + prod/test server picker with health ping | |
| `/create-character` | 470 | cyborg creation (element point allocation) | |
| `/tutorial` | 372 | 3-step intro tutorial | |
| `/dashboard` | 797 | "Command Center" 6-card hub; also has an admin shortcut grid | links to 8 **legacy** `/admin/*` redirect paths |
| `/pixi-map` | 268 | **main game map**: goes straight into SecondaryMapView (Three.js); PixiMapViewer (1st map) loaded dynamically | |
| `/character` | 422 | cyborg profile / skills / inventory (CharacterProvider) | |
| `/units` | 438 | minion management (CharacterProvider) | |
| `/party` | 1014 | party formation, starts battles | |
| `/battle/[sessionId]` | 744 (+BattleRenderer 763, CapturePanel 145) | real-time battle over the socket.io `/battle` namespace, Three.js renderer | |
| `/buildings` | 536 | building hub by category | |
| `/buildings/[id]` | 662 | building detail with ~14 panel types | |
| `/economy` | 215 | 5 tabs: warehouse / jobs / central bank / vault | |
| `/market` | 1374 | market + trading post | |
| `/faction` | 52 | faction dashboard entry (wraps components/faction) | |
| `/shop` | 86 | premium cosmetic shop (PremiumShop) | |
| `/settings` | 311 | theme / UI settings | |

### Admin routes (`/admin`, client-side role guard only: `localStorage.terra_role === 'admin'` in `admin/layout.tsx`)
| route | lines | purpose | flag |
|---|---|---|---|
| `/admin` | 142 | hub: Part A (manage) vs Part B (editor) | |
| `/admin/manage` | 145 | manage dashboard | |
| `/admin/manage/users`, `/users/[id]` | 588, 727 | user list / 6-tab user profile | |
| `/admin/manage/npc-ai` | 2513 (+AssetsTab 1061) | NPC AI dashboard | very large |
| `/admin/manage/ai-mechanisms` | 1305 | AI mechanism explainer/visualizer | doc-like |
| `/admin/manage/assets-overview` | 1073 | gold / coin / city currency totals by faction | |
| `/admin/manage/economy-control` | 761 | economy triggers, tax, stock issuance | |
| `/admin/manage/macro-economy` | 31 | thin wrapper around `SupplyTracker` | thin |
| `/admin/manage/blueprints` | 698 | faction blueprint CRUD | |
| `/admin/manage/mail` | 374 | admin mail sender | |
| `/admin/manage/feedback` | 378 (+test 164) | user feedback triage | only page with a unit test |
| `/admin/manage/unit-logs` | 1389 | unit activity logs | |
| `/admin/manage/db-inspector` | 431 | raw DB table browser | debug/sensitive |
| `/admin/manage/system` | 577 | lists server functions/crons (`file: "server.js:804"`) | debug/doc-like |
| `/admin/manage/planning` | 1119 | Kanban dev-task board stored in localStorage (`terra_admin_tasks_v3`) | dev tooling, not game admin |
| `/admin/manage/ui-presets` | 1553 | compares 5 UI design concepts | **design playground**; whole file under `/* eslint-disable */` |
| `/admin/manage/factions` | 56 | "coming soon" placeholder | **placeholder** |
| `/admin/editor` | 221 | editor hub | |
| `/admin/editor/production` | 2965 | production recipe editor | largest page |
| `/admin/editor/creatures` | 1315 (+CreatureFormTab 899, LootEditorTab 897, ImageGeneratorPanel 400) | creature DB editor + AI image prompts | |
| `/admin/editor/encounters` | 1083 (+EncounterMapCanvas 571, types 187) | encounter zone editor | |
| `/admin/editor/items` | 629 (+_components 683, _types 373) | item DB console | |
| `/admin/editor/level-system` | 1094 | EXP curve tool | |
| `/admin/editor/stat-balance` | 1079 | secondary-stat formula balancing | |
| `/admin/editor/mock-battle` | 1501 | mock battle simulator v2 | **possible overlap** with combat-sim [A] |
| `/admin/editor/combat-sim` | 405 | combat formula simulator v2.2 | **possible overlap** with mock-battle [A] |
| `/admin/editor/dungeons` | 792 | dungeon/floor editor | |
| `/admin/editor/skills` | 443 | read-only skill DB viewer | |
| `/admin/editor/buildings` | 663 | building type editor | |
| `/admin/editor/asset-manager` | 1112 (+AssetPromptPanel 144) | image asset manager (IAMS) | |
| `/admin/editor/unit-viewer` | 621 (+creatureMeshBuilder 1254, unitMeshBuilder 367) | 3D unit/creature mesh editor | |
| `/admin/editor/pixi-editor` | 659 (+ObjectCheatSheetTab 792) | terrain/object cheat sheet; the **only** user of @react-three/fiber and drei | |
| `/admin/editor/world-map-editor` | 115 | PixiJS world map editor + SecondaryMap | |

**14 legacy redirect stubs** (5-line `redirect()` pages, each with its own error.tsx + loading.tsx, so 42 files) [V]:
`/admin/{buildings,combat-sim,creatures,encounters,items,skills,stat-balance}` -> `/admin/editor/*`; `/admin/{db-inspector,macro-economy,mail,npc-ai,planning,system,users}` -> `/admin/manage/*`.
- 8 of them are still linked from `/dashboard` (planning, items, stat-balance, users, npc-ai, mail, db-inspector, system) [V].
- 6 have zero inbound links (buildings, combat-sim, creatures, encounters, macro-economy, skills) [V].
- These could become `redirects()` entries in next.config [A].

### API routes, shadowed by proxy.ts
- `src/proxy.ts` matcher: `['/api/:path*', '/assets/images/:path*']`. It handles every `/api/*` except `/api/server-health` and returns its own response [V].
- So `app/api/[...path]/route.ts` (139 lines, catch-all proxy) and `app/api/login/route.ts` (68 lines) **are never reached**. They duplicate proxy.ts logic [V code; A on Next middleware-before-routes ordering, which is documented Next behaviour].
- Only `app/api/server-health/route.ts` is live.
- **Port drift** [V]:
  - `api/[...path]/route.ts`, `api/login/route.ts`, and `lib/config.ts` (`getApiBaseUrl` SSR default, `getSocketUrl` for localhost) default to **3001/3002**.
  - `proxy.ts`, `next.config.ts` rewrites, `server-health`, docker-compose, ecosystem and `terra-server` npm scripts use **4001/4002**.
  - Consequence [A]: on localhost, `SOCKET_URL` points at 127.0.0.1:3001, while `npm run dev` starts the server on 4001, so local socket connections (piximap and battle namespaces) probably fail unless something else listens on 3001.

---

## 3. public/assets

Totals [V]:
- `terra-client/public` has 875 tracked files (~324 MB on disk).
- `public/assets` has 865 files, **335,499,374 bytes (320 MiB)**: 537 webp + 328 png.
- Other public files: `earth_v3_final.png`, `earth_v5_hyper.png`, `earth_v8_flat_tactical.png` (~2.1 MB total), the Next template svgs (`file`, `globe`, `next`, `vercel`, `window`), `grid.svg` and `.well-known/appspecific/com.chrome.devtools.json`. **All have 0 references in src** [V].

| dir | files | MiB | how it is referenced | status |
|---|---|---|---|---|
| creatures/ (top level) | 553 | 93.0 | **no path reference anywhere** (client, server, lite, docs). Species codes match server data for 124 of 553 stems, but no code builds a `/assets/creatures/...` URL | **unreferenced** [V static; A that no DB row stores such URLs] |
| creatures/profiles/ | 52 | 51.4 | no reference; the server writes its own copies to `terra-server/public/assets/images/creatures/profiles` | **unreferenced** [V/A as above] |
| buildings_v2/ | 85 | 57.2 | dynamic `` `/assets/buildings_v2/${code}.png` `` in SecondaryMapRenderer, BuildMenuPopup, ConstructionTreePanel, BuildingOverlay | **used** (83 of 85 match a building code; `CAMPFIRE.png`, `SHELTER.png` match no code string) |
| buildings_v2_ai/ | 45 | 23.3 | no path reference | **unreferenced** |
| buildings/ | 18 | 16.0 | no path reference (legacy v1 set) | **unreferenced** |
| images/items | 107 | 76.4 | `/assets/images/**` is **intercepted by proxy.ts and forwarded to Express**, so Next never serves these files | **shadowed**: 95 of 107 are byte-identical to files in `terra-server/public/assets/images` (92 at the same relative path) |
| images/buildings, images/skills, images/creatures | 2, 2, 1 | 2.8 | same proxy shadowing | shadowed (4 of 5 identical to server copies) |

- Literal filename search for each of the 865 basenames in `terra-client/src`, `terra-server` (excluding its public dir) and `terra-lite/src`: **0 hits** [V]. All real usage is through template strings.
- Conservative upshot [A]: about 668 files (~184 MiB: creatures + profiles + buildings_v2_ai + buildings) look dead, and ~112 files (~80 MiB under images/) are unreachable while the proxy matcher stays as it is. Only `buildings_v2` (~57 MiB) is demonstrably used.

Duplicates (same SHA-1) [V]:
- 10 groups / 16 redundant copies / 8.5 MiB wasted. Examples:
  - 7 food buildings share one image: BAKERY = BREWERY = BUTCHER = KITCHEN = RESTAURANT = SEAFOOD_BAR = TAVERN.
  - ADVANCED_LAB = RESEARCH_LAB = UNIVERSITY.
  - BASIC_LAB = RESEARCH_HUT; COMMAND_CENTER = VILLAGE_HALL; FARM = PASTURE.
  - `creatures/GOBLIN.webp` = `images/creatures/GOBLIN.webp`.
  - 4 fish icon pairs (e.g. `fish_t6_tuna` = `fish_t8_tuna`).
- Format duplicates in creatures/: 79 png, 78 of which have a same-stem `.webp` (WOLF.png + WOLF.webp + WOLF_1.webp …).
- `creatures/VOID_TENTACLE_test.png` is a **0-byte** test file.
- Test fixtures refer to `/assets/hero.png`, `/assets/iron_suit.png`, `/assets/holo_blue.png`, which don't exist. This is harmless because they are mock data in `PremiumShop.test.tsx`.

---

## 4. Odd tracked files

- **`terra-client/tsconfig.json/`**: **not a directory** [V]. It is a normal 734-byte file (`100644 blob cfd2fc4…`), and no tracked path exists under `terra-client/tsconfig.json/`. Nothing to fix. It has `incremental: true` and excludes a non-existent `_archived` dir.
- **`terra-client/scripts/` (21 files, tracked)** [V]: one-shot codemods.
  - `fix_economy_*` (x4), `fix_production_types{,_v2,_v3,_v4}`, `fix_gap05{,_v2}`, `fix_head_*`, `fix_military_*`, `fix_z_index` (hard-codes `D:/작업실/VS code/AntiGravt01/terra-client/src`), `inject_async_button`, `revert_unknown_to_any`, `suppress_any_inline`, `suppress_eslint_any`, `suppress_v2`, `suppress_v3`, `analyze_eslint`.
  - Not referenced by any package.json script and excluded from ESLint (`globalIgnores 'scripts/**'`). Only `docs/changelog.md` mentions them.
  - The `suppress_*` scripts injected the `// eslint-disable-line @typescript-eslint/no-explicit-any` comments described in section 5.
- **tsbuildinfo**: `terra-lite/tsconfig.tsbuildinfo` and `terra-lite/tsconfig.node.tsbuildinfo` are tracked build artifacts [V]. The node one records `"errors":true`. terra-client's .gitignore covers `*.tsbuildinfo`; terra-lite's doesn't.
- **terra-lite `vite.config.js` + `vite.config.ts`** [V both exist, and they differ]:
  - `.js` has the `@` alias and `manualChunks`.
  - `.ts` has `secure:false`, no alias, and a stale "NAS 운영 서버(riversok7…)" comment.
  - Vite's default lookup order picks `vite.config.js` first [A, documented Vite behaviour], so the `.ts` file is dead. Yet `tsconfig.node.json` type-checks only the dead `.ts` file.
  - Nothing in `terra-lite/src` uses the `@/` alias anyway [V].
- **e2e (terra-client/e2e)** [V]:
  - 18 specs + `helpers.ts`, 1,654 lines, ~97 `test()` calls. Visited routes all exist (`/pixi-map` x10, `/login` x9, `/character` x8 …), and spot-checked selectors match the current UI (login placeholders, "INITIALIZE CYBORG").
  - They need the full stack (server :4001 + Postgres + client :4000) and the credentials `admin` / `1234`.
  - CI is disabled: `.github/workflows/playwright.yml.disabled`.
  - In `playwright.config.ts`, the CI webServer command `npm start --prefix terra-server` starts on the default PORT 3001 but waits for `localhost:4001`, so it would time out in CI [V statically; A runtime].
  - Not executed here.
- **Jest**: 3 test files (`src/__tests__/Home.test.tsx`, `src/__tests__/PremiumShop.test.tsx`, `src/app/admin/manage/feedback/__tests__/page.test.tsx`). Not executed (no node_modules).
- Other odd root items (outside this scope, noted only): a directory literally named `` `.agents `` (with a backtick) containing `` `/explorer_m1_2_frontend/comment_scanner.js ``; `.antigravitycli/*.json`; `AGENTS.md` is 342 KB.

---

## 5. Type-safety escape hatches (terra-client; comments and strings stripped before counting `any`)

Scope: 402 files (src + e2e + root ts/mjs) [V].
| metric | count |
|---|---|
| `any` tokens in code | **412** (in 102 files) |
| `: any` | 285 |
| `as any` | 68 |
| `any[]` | 65 |
| generic `<any>` / `, any>` | 24 |
| `eslint-disable*` comments | **294** (in 103 files): 203 `-line`, 24 `-next-line`, 67 block/file |
| ...of which `@typescript-eslint/no-explicit-any` | **274** |
| ...`react-hooks/exhaustive-deps` | 17 |
| ...blanket `/* eslint-disable */` | 1 (`admin/manage/ui-presets/page.tsx`) |
| `@ts-ignore` | 0 |
| `@ts-nocheck` | 0 |
| `@ts-expect-error` | 2 (both in dead `PostHogProvider.tsx`) |

Key point [V]: `eslint.config.mjs` already sets `"@typescript-eslint/no-explicit-any": "off"` and `reportUnusedDisableDirectives: "off"`. So **all 274 no-explicit-any directives are redundant noise**. The config also turns off about a dozen react-hooks/compiler rules (refs, set-state-in-effect, purity, immutability, preserve-manual-memoization, static-components, set-state-in-render), plus `no-unused-vars`, `no-img-element` and `jsx-a11y/alt-text`.

Top `any` files: `admin/manage/npc-ai/page.tsx` (42), `party/page.tsx` (23), `admin/editor/stat-balance/page.tsx` (17), `components/faction/FactionFinance.tsx` (13), `admin/manage/users/[id]/page.tsx` (12).

Other size signals: 23 files over 1,000 lines. The largest are `SecondaryMap/SecondaryMapView.tsx` (4,426), `SecondaryMap/SecondaryMapRenderer.ts` (3,323), `admin/editor/production/page.tsx` (2,965), `admin/manage/npc-ai/page.tsx` (2,513) and `character/MinionDetailModal.tsx` (1,887).

---

## 6. State management and data fetching (as actually used) [V unless marked]

- **Contexts (3)**:
  - `ThemeContext` (global, root layout).
  - `ToastContext` (global; custom toast state + WebAudio SFX; rendered by `components/ui/ToastSystem.tsx`; 14 `useToast()` consumers).
  - `CharacterContext` (**not global**: wrapped locally in `/character` and `/units` only).
- There is no Redux, Zustand, SWR or React Query.
- **Local component state dominates**: ~1,638 `useState` mentions, 309 `useEffect(`, 42 `setInterval(` polling sites in 27 files.
- **useRef imperative style** concentrates in the map/canvas code (111 `useRef(` calls total): SecondaryMapView (25), WorldMapCanvas (21), PixiMapViewer (14), MiniMap (13), EncounterMapCanvas (9). Renderers are plain classes (`SecondaryMapRenderer.ts` = Three.js + gsap, `BattleRenderer.ts` = Three.js, `WorldMap/core/*` = PixiJS + @pixi/tilemap) driven through refs.
- **Fetching is mostly raw `fetch()`**: 582 call sites in 117 files, and 461 `getApiBaseUrl()` calls to build URLs. Wrapper usage is small:
  - `apiFetch` (lib/api.ts): 34 calls in 7 files.
  - `characterApi`: 22 uses.
  - A page-local `api` object in `admin/editor/dungeons`.
- **Auth header injection is triplicated**:
  1. Inline: `localStorage.getItem('terra_token')` read 114 times, plus a legacy `'token'` key 28 times; ~125 `Authorization` mentions.
  2. `components/FetchInterceptor.tsx` monkey-patches `window.fetch` globally to add `Bearer`.
  3. `app/admin/layout.tsx` monkey-patches `window.fetch` **again** for `/api/admin/*`.

  The target server (prod/test) is chosen through the localStorage/cookie `TERRA_SERVER_URL` and the `x-target-server` header, which proxy.ts reads.
- **Sockets (socket.io-client)**, each opened ad hoc with no shared provider:
  - `/piximap` namespace: `SecondaryMap/hooks/useMapSocket.ts`, `SecondaryMapView.tsx` (imports `io`) and `WorldMap/viewer/PixiMapViewer.tsx`.
  - `/battle` namespace: `app/battle/[sessionId]/page.tsx`.
  - Dead `NotificationCenter.tsx`.

  The URL comes from `lib/config.ts SOCKET_URL`. That is a module-level constant evaluated at import time, and it has the 3001 port drift (section 2). The production path relies on the next.config `rewrites` for `/socket.io`.
- **Two parallel toast systems mounted in the root layout**: the custom `ToastProvider` + `<ToastSystem/>` and react-hot-toast `<Toaster/>` (43 prod-reachable files import react-hot-toast, plus 2 tests).

---

## 7. terra-lite (Vite + React 19 + react-router 7)

- **What it is** [V]: a mobile-first "Toss-style" companion SPA/PWA under base `/lite/`.
  - 20 routes: login, home, character, map, explore, market, battle, buildings, inventory, faction, more, quests, mail, social, chat, craft, ranking, raid, trade, settings.
  - 37 source files, ~6.4k lines including CSS. There is a service worker, `public/sw.js`, registered in prod.
  - Own fetch wrapper (`lib/api.ts`: apiGet/Post/Put/Delete with token + `x-target-server`), localStorage auth (`lib/auth.ts`), a small cache (`lib/cache.ts`) and a socket singleton (`lib/socket.ts`). `lib/config.ts` is a copy of terra-client's `SERVER_PRESETS` logic.
- **Ports / endpoints** [V]:
  - Dev server on :5173, proxying `/api` and `/socket.io` to `127.0.0.1:4001`. That comes from `vite.config.js`; the README wrongly says 4002.
  - Prod runs as `vite preview` on :4173 via pm2 (`ecosystem.config.js`). It is **not** in either docker-compose file and not in the Docker publish workflow.
  - It calls 58 distinct `/api/*` paths. Static matching against 709 route definitions in terra-server found **~10 with no server route**:
    - `/market/orders`
    - `/buildings/user/:id`
    - `/piximap/:mapId/tile/:x/:y`
    - `/production/building/:id/status`
    - `/construction/start`
    - `/building-mgmt/buildings/:id/repair`
    - `/diplomacy/:factionId`
    - `/game/battle/start` (the server has `/api/battle/start`, which is what terra-client uses)
    - `/game/battle/:id/state`
    - (raid/current and ranking/achievements do exist; my matcher first flagged them only because of template-string truncation)

    [V static; A that no dynamic route covers them]
  - Socket: it listens for 7 notification events (`battle:complete`, `construction:complete`, `market:filled`, `mail:received`, `gather:complete`, `production:complete`, `research:complete`). **None of these event names appear anywhere in terra-server** [V static], so lite notifications are dead [A]. The battle events (`join-battle`, `battle-state-full/delta`) do exist.
  - Mock pages: ChatPage (hard-coded messages, no API), TradePage (`mockAuctions`), and MorePage/SettingsPage (no API, which is fine). CraftPage calls craft APIs with hard-coded ids (e.g. `craftApi.socket(1, 1)`).
- **Overlap with terra-client** [V/A]:
  - character, units (minion rest/feed/charge), inventory/equip, market, buildings, faction, mail, battle and settings duplicate terra-client features in a lighter UI, through the same server endpoints where those endpoints exist.
  - Lite-only surfaces: quests, ranking, raid, social/friends, trade/chat. terra-client has 0 references to `/api/ranking`, `/api/raid` or `/api/social`.
  - No code is shared: config, api and toast are all re-implemented.
- Template leftovers: `src/assets/{hero.png,typescript.svg,vite.svg}` are unreferenced; `public/icons.svg` and `public/favicon.svg` are not referenced by index.html [V].
- `tsconfig.json` sets `"strict": false`, and ESLint turns off `no-explicit-any`, `no-unused-vars`, `rules-of-hooks` and `exhaustive-deps`.

---

## 8. Dependencies never imported (or questionable)

### terra-client (method: my import graph + manual config reading; knip dep output not trusted because plugins were disabled)
| package | status |
|---|---|
| `dompurify` | **unused**: never imported; `isomorphic-dompurify` is used instead (1 file: `battle/[sessionId]/page.tsx`, a `'use client'` page where plain dompurify would do) [V] |
| `@types/dompurify` | **unused**; dompurify 3 ships its own types, so this is a deprecated stub [V unused / A stub]. Sits in `dependencies` |
| `terra-in-cognita-root` (`file:..`) | **unused**: the root package linked as a dependency, never imported [V]. Same in terra-lite |
| `baseline-browser-mapping` (dev) | not imported; probably added to silence a browserslist/baseline warning [A] |
| `posthog-js` | **missing**: imported by dead `PostHogProvider.tsx` but not declared [V] |
| `lightningcss-darwin-arm64` (optional) | platform binary pinned by hand; normally transitive [A] |
| `@react-three/fiber`, `@react-three/drei` | used, but only by 1 admin file (`admin/editor/pixi-editor/ObjectCheatSheetTab.tsx`); the game itself uses raw three [V] |
| `gsap` + `framer-motion` | **both used**: gsap in 6 files (SecondaryMapRenderer, ReligionPanel, TerritoryPanel, ConstructionOverlay, FactionHierarchyTree, pixi-editor), framer-motion in 97 live files [V] |
| `react-hot-toast` + custom `ToastContext` | **both used** and both mounted in the root layout (section 6) [V] |
| `isomorphic-dompurify` + `dompurify` | only isomorphic is imported [V] |
| `@tailwindcss/postcss`, `tailwindcss` | used (`postcss.config.mjs`, `@import "tailwindcss"` in globals.css); knip false positives [V] |
| eslint, eslint-config-next, eslint-plugin-unused-imports | used by eslint.config.mjs [V] |
| jest, jest-environment-jsdom, ts-node, @testing-library/dom | used by the jest config: ts-node is needed to load `jest.config.ts`, and @testing-library/dom is a peer of @testing-library/react [V/A] |
| `@types/three`, `@types/dompurify` | type packages placed in `dependencies` rather than devDependencies [V] |

Every other runtime dependency is imported by reachable code [V]: next, react, react-dom (2 files), pixi.js (7), @pixi/tilemap (1), three (6), lucide-react (263), socket.io-client (6 live, 1 type-only), framer-motion, gsap, react-hot-toast, isomorphic-dompurify.

### terra-lite
- All runtime dependencies are imported [V]: react, react-dom, react-router-dom (8 files), framer-motion (23), socket.io-client (2), lucide-react (2).
- `terra-in-cognita-root` is **unused** [V].
- `@types/react` and `@types/react-dom` sit in `dependencies` [V].
- Dev dependencies are all used by eslint.config.js, the vite config and tsc [V].
- Version skew with terra-client [V]:
  - lucide-react ^1.18 vs ^0.559
  - eslint ^10 vs ^9
  - typescript ~6.0 vs ^5
  - framer-motion ^12.40 vs ^12.23

---

## Uncertainty / not done
- No install, no build, no lint, no tests run. Runtime claims are marked [A]: proxy shadowing order, the Vite config precedence, the socket port failure, CI timeout and dead lite notifications.
- Asset "unreferenced" verdicts are code-only. DB rows (e.g. `image_url` columns) could hold `/assets/creatures/...` URLs, and the DB wasn't inspected. The server-side code that writes image URLs only produces `/assets/images/...` paths [V].
- The lite endpoint check is regex-based against `router|app|r.(get|post|…)('…')` patterns. Routes registered some other way would be missed.
- The git history is shallow (57 commits), so "did X ever exist" questions (terrain-map, Leaflet, tsconfig.json/) can only be answered for HEAD.
