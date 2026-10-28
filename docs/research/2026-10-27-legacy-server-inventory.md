> 조사 보고서 원본 (작성: Claude Code 조사 에이전트, 2026-10-27). 기존 프로젝트(AntiGravt01) 기준 내용이며, 비밀번호 등 민감 문자열은 [REDACTED]로 바꿨다. 결론은 `docs/PLAN.md`에 반영되어 있다.

# terra-server runtime inventory (read-only fact-finding)

Repo: `/home/user/AntiGravt01` @ `e0e9c72` (shallow clone, 57 commits). No tracked file was modified.
Analysis scripts are in `/tmp/claude-0/-home-user-AntiGravt01/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/server_inv/`:
`reach_server.js` (Babel AST require/import graph over `git ls-files terra-server`), `reach_server.json` (graph, reverse graph, package usage),
`classify.js` (per-file category), `lists.md` (generated per-category file tables, appended at the end of this report).

Labels: **[V]** = Verified (by code reading, AST graph, or a local experiment). **[A]** = Assumed / inferred, not proven.

---

## 1. Real entrypoints

| Entrypoint | What it runs | Notes |
|---|---|---|
| `terra-server/package.json` `start` | `node server.js` | [V] |
| `terra-server/package.json` `dev` / `dev:test` | `cross-env PORT=4001/4002 PG_PORT=5439/5440 nodemon server.js` | [V] nodemon is listed under `dependencies` (should be dev) |
| `terra-server/package.json` `test` | `jest` -> `jest.config.js` `testMatch: tests/**/*.test.js` (20 suites) | [V] |
| `terra-server/package.json` `lint` | `eslint .` -> `eslint.config.mjs` (flat). `.eslintrc.json` is ignored by ESLint 9 | [V] |
| `terra-server/Dockerfile` | `node:18-alpine`, `npm ci --omit=dev`, `CMD ["node","server.js"]` | [V] redis@6 and swagger-jsdoc@6.3 declare `node >=20` (engine mismatch) |
| root `ecosystem.config.js` (pm2) | `terra-server-prod`: `server.js`, **`instances:"max"`, `exec_mode:"cluster"`**; `terra-server-test`: `server.js` | [V] config. [A] in cluster mode every worker would run every in-process game loop (N x ticks) and Socket.IO without sticky sessions |
| root `package.json` | `dev` (concurrently: server 4001 + test server 4002 + client + lite), `pm2:*`, `test` | [V] |
| `docker-compose.yml` / `.production.yml` | `server` + `test-server` both from `./terra-server` image -> `node server.js` | [V] no Redis service, no `REDIS_URL` anywhere |
| `docker-compose.db.yml` | postgres:15 only | [V] |
| `.github/workflows/docker-publish.yml` | builds `terra-client` and `terra-server` images (GHCR) on push to main | [V] no test/lint step in CI. `playwright.yml.disabled` is inert |
| `scripts/zero_downtime_deploy.sh` (root) | `npm run db:migrate` (no such script) + `pm2 reload terra-server` (no such app name) | [V] stale / broken |

**Dynamic loading inside server.js** [V]:
- `findRouteFiles(routes/)` recursively `require()`s **every `routes/**/*_routes.js`** and mounts it at `/api` (the only unresolvable `require(filePath)` in the codebase; modelled as synthetic edges).
- `app.use('/api', require('./routes/debug_routes')(...))` -> debug router is mounted **twice** (auto-loader + explicit).
- Building sub-routers (`building_core/production/storage/service_routes.js`) are mounted by `building_routes.js` under `/api/piximap/building` **and also** directly at `/api` by the auto-loader because of their `_routes.js` suffix (e.g. `POST /api/clear`, `/api/construct`, `/api/demolish` exist too).
- `express.static('/uploads' -> terra-server/uploads)` (dir not tracked) and `express.static('/assets' -> terra-server/public/assets)`.
- `swagger.js` -> `swagger-jsdoc` scans `./routes/**/*.js` (relative to CWD).
- `httpServer.listen` callback (startup): `CacheService.init()` -> `ServerBootstrap.bootstrap(db)` (initSchema migrations, auto-seed, item/status-effect preload, AI configs, LifeEngine batch) -> ~25 `gameLoopManager.register(...)` loops (EconomyMatchingRound, NpcProductionCycle, BuildingGatherTick, CookingTick, WorkshopTick, WorkerMovementTick, PartyMovementTick, SiegeCombatTick, UrbanCaptureTick, FieldGatherTick, FieldGatherActionTick, AutoContractTick, ConstructionLogisticsTick, MinionTaskTick, NaturalRecovery, ExhaustedTeleport, NpcAiTick, MinionOnlineGuard, MinionSatietyTick, AuctionSettlement, ReligionEngineTick, CentralBankTick, ExchangeBuyOrderReplenish), `cron/durabilityCron`, `cron/spoilageCron`, `cron/mobilizationCron`, `combat/BattleTick.start()`, plus raw `setInterval`s for stock engine, MarketPriceTickService, CityMarketProcurementAI, FactionLogisticsEngine, tax/salary `setTimeout`s.
- `cron/backupCron.js` (`initBackupCron`) is **never called** [V]; it would `exec node scripts/backup.js`.
- No file in terra-client / terra-lite / root scripts imports anything from terra-server [V].

---

## 2. Category summary (tracked files under `terra-server/`, 1,056 total)

| Category | Files | Lines | Notes |
|---|---:|---:|---|
| (a) Runtime-reachable from `server.js` | **268** | **86,652** | includes 39 live re-export shims (132 lines), 6 data/tsc-output modules under `scripts/`, 4 seed data modules that also carry dead SQLite functions |
| (b) Test-only | 20 | 3,096 | only `tests/*.test.js`; **no source file is reachable only from tests**. 79 runtime files are exercised by tests |
| (c) One-off / manual scripts | 7 | 783 | `scripts/{backup,create_admin,economy_monitor,setup_dev_db,setup_postgres_production}.js`, `db/{index,setup_trading_post}.js` |
| (d) Dead legacy code / dead files | 21 (18 JS) | 7,648 JS lines | biggest: `database_init/schema.js` 4,765 lines (SQLite). Plus ~200 dead lines inside 4 runtime seed files |
| (e) Static assets `public/` | 728 | — | **221.6 MB** (227 PNG = 196.7 MB, 450 WebP = 24.9 MB, 51 `.gitkeep`) |
| (f) Other (config/tooling/agent notes) | 12 | 9,130 (8,621 = package-lock) | Dockerfile, .dockerignore, .env.example, eslint.config.mjs, jest.config.js, package*.json, `terra-server/.claude/` (5 md) |

JS only: 315 tracked JS/MJS files -> 268 reachable (85%), 20 tests, 2 configs, 25 not reachable (7 one-off + 18 dead).
**The owner's belief "most .js files are one-off scripts" is not supported [V]**: one-off + dead JS is 25 files / ~8.4k lines (~9% of JS lines). The bulk of the clutter in this package is the 221.6 MB of images, the 43 shim files, and the dead 4.8k-line SQLite schema.

By directory, runtime-reachable (a): routes/ 70 files 31,475 lines; game/ 79 files 19,030 (20 of them live shims); repositories/ 31 files 10,427; ai/ 19 files 7,387; combat/ 11 files 5,112; seeds/ 4 files 3,356; database_init/migrations 1 file 2,692; utils/ 38 files 2,289 (19 of them live shims); root 4 files 2,204 (server.js, simulation_api.js, database.js, swagger.js); scripts/ 6 files 2,132; cron/ 3; sockets/ 1; middlewares/ 1.

---

## 3. Top findings

1. **[V] Startup hangs without Redis -> bootstrap and every game loop never start.** `server.js:394-398` does `await cacheService.init()` before `bootstrap(db)` and before all loop registrations. `utils/CacheService.js` uses `redis@6.0.0` `createClient(...).connect()`; with the default reconnect strategy, ECONNREFUSED is retried forever and the promise never settles (local test: still pending after 10 s with 10 `error` events; `@redis/client/dist/lib/client/socket.js:363` only gives up on `SocketTimeoutError`). The `try/catch` "fallback to in-memory" is never reached. HTTP routes are mounted earlier and still work. **[A]** Production impact depends on whether a Redis is reachable at `REDIS_URL || redis://127.0.0.1:6379` inside the container; no compose file, env file or doc declares one. Redis was added in `c236501` (2026-06-07). This also means "runtime-reachable" game-loop modules may not actually execute in some environments.
2. **[V] Three broken `require()`s in runtime code (MODULE_NOT_FOUND, confirmed with `require.resolve`)**:
   - `routes/trade/market_routes.js:383,425` -> `../../game/ItemLookupService` (does not exist; auction bid paths throw inside the transaction -> 500).
   - `routes/admin/admin_world_routes.js:141` -> `./seeds/seed_rival` (resolves under routes/admin/; `POST /admin/reset-world` throws **after** `adminRepo.resetWorldUsers()` already ran). If it did resolve, `seed_rival.js` runs `seedRival()` on load with SQLite `db.prepare`.
   - `utils/geo/localMap.js:46` -> `../database` (file moved from utils/ to utils/geo/ without fixing the path; error swallowed by try/catch, `generateLocalMap` silently does nothing).
3. **[V] 43 re-export shim files (143 lines)** left behind by a folder reorganisation: 23 in `game/*.js` -> `game/{creature,gather,movement,territory,world}/`, 20 in `utils/*.js` -> `utils/{item,geo,server,system,db}/` (incl. `utils/auto_seed.js` -> `utils/system/auto_seed.js`). Importers are inconsistent: e.g. `utils/server/logger.js` is imported directly by 135 files and via shim by 2; `FatigueEngine`, `GatherResolverEngine`, `PartyMovementEngine`, `BuildingSpawner`, `TerritoryEngine`, `GameLoopManager`, `ReligionEngine`, `ProceduralResourceHelper` are imported both ways. 4 shims have zero importers (`game/ElevationService.js`, `game/ItemRollEngine.js`, `game/WaterService.js`, `utils/db_utils.js`).
4. **[V] `database_init/schema.js` (4,765 lines) is dead at runtime** (no importer; SQLite DDL, header says so) **but it is the only in-repo DDL for 78 of its 86 tables** (`users`, `item_templates`, `user_items`, `character_minion`, `resource_supply_config`, ...). `database_init/migrations/index.js` only runs ALTER/CREATE for newer tables. A fresh PostgreSQL DB cannot be built from the code; `scripts/setup_dev_db.js` (copy DDL from the prod DB) is the de-facto mechanism. Deleting schema.js loses the only written record of core table shapes -> export a PG `schema.sql` first.
5. **[V] Seeds are half-live.** `seeds/{building,creature,resource_tile,skill}_seed.js` are runtime-reachable only for their data arrays (`BUILDING_SEEDS`, `CREATURE_TEMPLATES`, `RESOURCE_TILE_SEEDS`, `SKILL_SEEDS` via `utils/system/auto_seed.js`); their `seedXxx(db)` functions use SQLite `db.prepare` and are called only from dead `schema.js` (~200 dead lines). `seed_factions.js`, `seed_rival.js`, `seed_resource_supply.js` are fully dead (and the first two have broken relative requires).
6. **[V] `scripts/` is mixed**: 6 files are runtime code (`seed_items.js` data for an admin endpoint, `seed_primary_materials.js` data for auto-seed, and 4 tsc outputs of terra-client TS under `scripts/SecondaryMap/` and `scripts/WorldMap/core/` used by `game/gather/ProceduralResourceHelper.js` & others). 4 stale duplicates at `scripts/` root (`BiomeGenerator.js`, `SecondaryMapGenerator.js`, `types.js`, `WorldMap_types.js`; two are byte-identical copies, `BiomeGenerator.js` has mojibake comments) are dead. **Drift**: the runtime server copy `scripts/SecondaryMap/SecondaryMapGenerator.js` has different terrain weights from `terra-client/src/components/SecondaryMap/SecondaryMapGenerator.ts` (e.g. ICE_GROUND 52 vs 65); the stale root copy matches the client. [A] server-side procedural resource discovery can disagree with the terrain the client renders.
7. **[V] 221.6 MB of images in `terra-server/public`** are baked into the server Docker image (not in `.dockerignore`). 195 PNGs in `items/icons/` alone are 177 MB (1-2 MB each, unoptimised); the admin upload pipeline only writes WebP (or PNG for frames), so these PNGs were dropped in by hand. 96 files are byte-identical to files in `terra-client/public`. Usage is DB-driven (see section 6).
8. **[V] Duplicate route registrations within one file** (first handler wins unless it calls `next()`): `POST /market/sell` (market_routes.js:126 and :470), `GET`/`POST /admin/building-types` (admin_buildings_routes.js:13/191 and 60/212).
9. **[V] Secrets in tracked files**: default PG password `[REDACTED]` in database.js, db/index.js, server.js, scripts/*, all compose files, `.claude/settings.local.json` (with the public host `riversun7.synology.me:5439`); default `JWT_SECRET=terra-dev-secret-2026` in compose files. [A] severity depends on repo visibility.

---

## 4. Dependencies (`terra-server/package.json`)

Import scan = every `require`/`import`/`jest.mock` in tracked terra-server JS [V].

| Package | Status | Where |
|---|---|---|
| `jpeg-js`, `pngjs`, `lru-cache` | **never imported** | — (lru-cache@11 also requires node 20/22+) |
| `terra-in-cognita-root: "file:.."` | **never imported; harmful** | creates `node_modules/terra-in-cognita-root -> ../..` (symlink to the repo root; lockfile `"..": {...}` entry). [A] in Docker the build context is `./terra-server`, so `..` points at `/` |
| `nodemon` | CLI only (`dev` scripts) | belongs in devDependencies; currently shipped in the prod image |
| `dotenv` | only `scripts/backup.js` (manual) | server.js/database.js hand-parse `.env` (duplicated code) |
| `body-parser` | used (`server.js`) | redundant with `express.json()/urlencoded()` in Express 5 |
| `redis` | used (`utils/CacheService.js`, only consumer `routes/world_routes.js` factions cache) | see finding 1 |
| `mathjs` | used (`combat/SkillExecutor.js:245` `math.evaluate(dmg_formula)`) | real use (DoT formulas from DB) |
| `pathfinding` | used (`game/movement/PathfindingService.js`, `game/gather/FieldGatherEngine.js`) | real use |
| `sharp` | used (`routes/asset/asset_routes.js` lazy, `utils/system/image_bg_remover.js`) | real use |
| `multer` | used (asset upload) | |
| `pg-format` | used once (`routes/admin/admin_users_routes.js`) | |
| `axios` | used (`game/world/ElevationService.js`, `WaterService.js`) | |
| `swagger-jsdoc`, `swagger-ui-express`, `winston`, `zod`, `express`, `express-rate-limit`, `helmet`, `cors`, `bcrypt`, `jsonwebtoken`, `socket.io`, `pg` | used | |
| devDeps `@babel/core`, `@babel/generator`, `@babel/parser`, `@babel/traverse`, `@babel/types`, `unzipper` | **never imported** anywhere in the repo (outside lockfiles) | likely leftovers of one-off codemod / HGT-download scripts that were deleted |
| devDeps `jest`, `supertest`, `eslint`, `@eslint/js`, `eslint-plugin-unused-imports`, `cross-env` | used (tests/lint/scripts) | |
| `better-sqlite3` | **imported but not declared** | `scripts/seed_curated_items.js` (cannot run) |

Also: `"main": "index.js"` points at a non-existent file; `eslint.config.mjs` ignores a non-existent `routes_backup/**`.

---

## 5. Largest / most complex runtime files and duplication

Largest runtime-reachable JS (lines): `database_init/migrations/index.js` 2,692 · `repositories/AdminRepository.js` 2,223 · `routes/map/piximap_routes.js` 1,589 · `routes/faction/faction_routes.js` 1,246 · `game/gather/FieldGatherEngine.js` 1,232 · `routes/character/character_routes.js` 1,148 · `routes/game_routes.js` 1,134 · `seeds/creature_seed.js` 1,133 (data) · `server.js` 1,119 · `routes/admin/admin_creatures_routes.js` 1,089 · `seeds/building_seed.js` 1,065 (data) · `routes/admin/admin_npc_ai_routes.js` 1,042 · `routes/trade/market_routes.js` 1,039 · `repositories/BuildingRepository.js` 1,037 · `routes/character/enhancement_routes.js` 1,031 · `routes/admin/admin_routes.js` 1,027 · `seeds/skill_seed.js` 1,014 (data) · `ai/NpcStateEvaluator.js` 1,008. Route files total 31.5k lines / 682 handler registrations.

`server.js` is still a god-file: ~64% of it (lines ~384-1100) is the listen callback with ~25 inline loop bodies (several with raw SQL), and `/api/health` re-implements Docker gateway detection already in `database.js`.

Duplication [V]:
- 43 shim files (finding 3).
- `.env` parsing duplicated in `server.js:24-35` and `database.js:14-24` (and `scripts/create_admin.js`, `scripts/setup_postgres_production.js`); `dotenv` dependency unused at runtime.
- Docker gateway auto-detection duplicated in `database.js`, `db/index.js` (dead), and `server.js` `/api/health`.
- `db/index.js` (old PG pool) vs `database.js` (current).
- `trading_post_listings` DDL in `db/setup_trading_post.js` (one-off) and `database_init/migrations/index.js:2354` (live).
- 4 dead copies of tsc output at `scripts/` root vs live copies in `scripts/SecondaryMap/`, `scripts/WorldMap/core/`; and the live copies duplicate (and drift from) `terra-client` TS sources.
- `terra-server/public/assets/buildings_v2/*` (5 files; 4 byte-identical to `public/assets/images/buildings/icons/*.png`). The client references `/assets/buildings_v2/*.png`, which its proxy does **not** forward (matcher is `/assets/images/*`), and `terra-client/public/assets/buildings_v2/` exists -> [A] server copy is never requested.
- Byte-identical images in public: FARM=PASTURE, BASIC_LAB=RESEARCH_HUT, COMMAND_CENTER=VILLAGE_HALL, ADVANCED_LAB=RESEARCH_LAB=UNIVERSITY (webp icons), fish_t6_tuna=fish_t8_tuna.

---

## 6. Static assets: `terra-server/public` (728 tracked files, 221.6 MB)

How served [V]: `server.js:151` `app.use('/assets', express.static(public/assets, {maxAge:'30d', immutable:true}))`. terra-client's `src/proxy.ts` forwards `/assets/images/*` to the Express server at runtime, so the client always gets these from the server [V]. (Side effect [A]: `terra-client/public/assets/images/**` is shadowed by the proxy and never served by Next.)
How referenced [V]: no code hard-codes individual files. URLs come from (1) `terra-client/src/lib/imageUtils.ts` patterns: `items/icons/{category}/{CODE}.webp`, `creatures/{profiles|icons}/{SPECIES}.webp`, `skills/icons/{CODE}.webp`, `buildings/{icons|illustrations}/{CODE}.webp`, `frames/{type}/{value}.png`; (2) DB rows `game_assets.file_path` and `skill_definitions.icon_url`, `creature_templates.image_url`, `building_types.icon_url` written by `routes/asset/asset_routes.js` (upload -> `public/assets/images/...`, activate -> `syncTargetUrl`). [A] Because uploads write into the container FS (compose has `volumes: []`), assets only survive redeploys by being committed to git — which explains why they are tracked.

| Folder | Files | PNG | WebP | Bytes |
|---|---:|---:|---:|---:|
| `assets/images/items/icons` | 225 | 195 | 30 | 178.7 MB |
| `assets/images/buildings/icons` | 87 | 6 | 81 | 17.3 MB |
| `assets/buildings_v2` | 5 | 4 | 1 | 8.5 MB |
| `assets/images/creatures/profiles` | 126 | 2 | 124 | 8.4 MB |
| `assets/images/skills/icons` | 92 | 2 | 90 | 6.4 MB |
| `assets/images/buildings/illustrations` | 6 | 0 | 6 | 2.0 MB |
| `assets/images/creatures/icons` | 118 | 0 | 118 | 0.3 MB |
| `assets/images/frames/{element,faction,grade}` | 18 | 18 | 0 | 0.06 MB |
| `.gitkeep` placeholders (characters/*, items/*/<category>, ui/*, frames/*) | 51 | | | 0 |

[A] The 195 root-level `items/icons/*.png` (e.g. `GEM_ALEXANDRITE.png`, `fish_t6_tuna.png`) do not match the client URL pattern (`items/icons/{category}/{CODE}.webp`) and were not produced by the upload pipeline (which emits WebP); they are only live if some `game_assets.file_path` row points to them. To confirm, run on the prod DB: `SELECT file_path FROM game_assets WHERE file_path LIKE '%.png';` and compare with the `*_url` columns. Also `terra-server/assets/` (2 PNGs, 1.2 MB) is outside the static root and unreferenced -> dead.

---

## 7. Repo-root clutter (outside terra-client / terra-server / terra-lite)

| Path | Tracked files | Size | What it is | Referenced by |
|---|---:|---:|---|---|
| `.claude/` | 5,492 | 55.8 MB | `skills/` = 1,333 third-party skill packs (5,484 files; e.g. `last30days` 14.7 MB incl. jpeg/mp3 demo assets, `loki-mode` 7.3 MB with SWE-bench result JSON). Plus `agents/` (3), `agent-memory/` (4 md), **`settings.local.json`** (normally per-user/untracked; contains psql commands with the prod DB password) | Claude Code harness (that is why ~1,300 skills appear in this session). 2 untracked skill dirs (`grill-me`, `grilling`) were present at the start of this analysis and later disappeared (not removed by me) |
| `AGENTS.md` | 1 | 343 KB / 7,960 lines | auto-generated `openskills` index of the same skills | nothing in code |
| `.agents/` | 1,072 | 3.8 MB (du 7.1 M) | Antigravity multi-agent run logs: 219 session folders (`explorer_*`, `worker_*`, `auditor_*`, `reviewer_*`, `orchestrator_*`, `challenger_*` ...) of handoff/prompt `.md` (1,011 md, 25 txt, 10 js, 8 py, 6 tsx, 5 patch). Only `.agents/rules/{rule1,code1}.md` and `.agents/workflows/benchmarking.md` are config | `CLAUDE.md` cites `.agents/rules/rule1.md`; docs/changelog mention runs. Some logs contain the DB password |
| `` `.agents `` (literal backtick) | 1 | 3.4 KB | path is `` `.agents/`/explorer_m1_2_frontend/comment_scanner.js `` — a dir named `` `.agents `` containing a dir named `` ` `` (shell backtick mistake). One-off comment scanner for terra-client | nothing |
| `.antigravitycli/` | 2 | 162 B | two **dangling symlinks** to `/Users/[USER]/.gemini/config/projects/*.json` (mode 120000) | nothing |
| `scripts/` (root) | 9 | 14 KB | `cleanup_taskforce.py`, `restructure_docs.py` (hard-coded `d:\작업실\VS code\...` Windows paths), `update_docs.py`, `update_logs.py` (mojibake string replacement), `update_autotrade.py` (one-off TSX string patch), `monitor_servers.js` (checks ports 3000/3001; servers now on 4000/4001), `tools/remove_bg.sh` (rembg wrapper), `zero_downtime_deploy.sh` (broken: `db:migrate`, wrong pm2 name), `db_tools/create_creature_instances.sql` (superseded by migrations) | only docs mention `monitor_servers`, `remove_bg`, `zero_downtime_deploy`; nothing executes any of them |
| `docs/.obsidian/` | 5 | 6 KB | Obsidian vault settings incl. volatile `workspace.json` | nothing |
| the `"docs…` entry | 1 | 22 KB | Not an odd path: git's `core.quotePath` octal-escapes the Korean filename. Exact `git ls-files` output: `"docs/2026-10-26_\355\205\214\354\212\244\355\212\270\354\204\234\353\262\204_\354\230\244\355\224\204\353\235\274\354\235\270_\354\204\234\353\262\204\353\266\204\353\246\254_PixiMap_\353\241\234\353\224\251\354\247\200\354\227\260_\353\266\204\354\204\235\353\263\264\352\263\240\354\204\234.md"` = `docs/2026-10-26_테스트서버_오프라인_서버분리_PixiMap_로딩지연_분석보고서.md` (an analysis report at docs/ root) | — |
| `.vscode/settings.json` | 1 | 2 B | `{}` | nothing |
| `.github/workflows/playwright.yml.disabled` | 1 | 1.4 KB | disabled e2e workflow | inert |
| `docker-compose.db.yml` | 1 | 353 B | local postgres:15 (prod compose uses postgres:16) | manual |
| `docs/` | 53 | 4.2 MB | incl. `changelog.md` 221 KB, `TASKFORCE_ARCHIVE.md` 225 KB; `docs/Operations/Analysis/Consolidated_Analysis.md` has mojibake | CLAUDE.md |

Repository weight [V]: tracked tree 636.7 MB (terra-client 344 MB of which public 338 MB; terra-server 228 MB of which public 222 MB; .claude 56 MB); `.git` pack 487 MiB even as a 57-commit shallow clone.

---

## 8. Uncertainty / limits

- Reachability = "some `require` chain from server.js exists" [V]; it does not prove a function is called. Lazily-required modules (inside handlers or loops) are counted as runtime. Because of finding 1, loop-only modules may never execute where Redis is absent.
- Only one dynamic `require` was unresolvable (`server.js:303 require(filePath)`), modelled as "all `routes/**/*_routes.js`" [V]. `cron/backupCron.js -> scripts/backup.js` (`child_process.exec`) was modelled by hand. No `import()` / computed paths elsewhere [V].
- Whether HTTP endpoints / socket events are actually called by terra-client or terra-lite was **not** analysed (route-level dead code is out of scope); likewise which `public/` images are referenced by DB rows (needs DB access).
- Production Redis presence, repo visibility, and whether pm2 cluster mode is actually used in production are [A].
- `git log` is shallow (57 commits), so "when was X last touched" could not be answered.

---

## 9. Per-category file lists (generated by `classify.js`)

Category (e) is summarised in section 6 instead of listing 728 images.

### (a) Runtime-reachable from server.js — 268 files, 86652 lines


#### (root) — 4 files, 2204 lines

| lines | file | note |
|---:|---|---|
| 212 | `database.js` |  |
| 1119 | `server.js` |  |
| 836 | `simulation_api.js` |  |
| 37 | `swagger.js` |  |

#### ai/ — 19 files, 7387 lines

| lines | file | note |
|---:|---|---|
| 63 | `ai/AiConstants.js` |  |
| 419 | `ai/CentralBankAI.js` |  |
| 216 | `ai/CityMarketProcurementAI.js` |  |
| 223 | `ai/NpcAuctionAI.js` |  |
| 561 | `ai/NpcBrain.js` |  |
| 296 | `ai/NpcCraftAI.js` |  |
| 317 | `ai/NpcDiplomacyAI.js` |  |
| 334 | `ai/NpcExpandAI.js` |  |
| 239 | `ai/NpcFortifyAI.js` |  |
| 305 | `ai/NpcHarvestAI.js` |  |
| 211 | `ai/NpcInvestAI.js` |  |
| 313 | `ai/NpcLearningEngine.js` |  |
| 606 | `ai/NpcManager.js` |  |
| 843 | `ai/NpcMarketAI.js` |  |
| 554 | `ai/NpcPlanner.js` |  |
| 1008 | `ai/NpcStateEvaluator.js` |  |
| 188 | `ai/NpcTileUtils.js` |  |
| 468 | `ai/NpcWorkforceAI.js` |  |
| 223 | `ai/WorkerBrain.js` |  |

#### combat/ — 11 files, 5112 lines

| lines | file | note |
|---:|---|---|
| 662 | `combat/AdminBattleEngine.js` |  |
| 506 | `combat/BattleAI.js` |  |
| 713 | `combat/BattleResult.js` |  |
| 385 | `combat/BattleSession.js` |  |
| 106 | `combat/BattleTick.js` |  |
| 522 | `combat/CombatEngine.js` |  |
| 803 | `combat/SkillExecutor.js` |  |
| 309 | `combat/TacticalAI.js` |  |
| 328 | `combat/constants.js` |  |
| 698 | `combat/formulas.js` |  |
| 80 | `combat/index.js` |  |

#### cron/ — 3 files, 277 lines

| lines | file | note |
|---:|---|---|
| 80 | `cron/durabilityCron.js` |  |
| 51 | `cron/mobilizationCron.js` |  |
| 146 | `cron/spoilageCron.js` | started in server.js and also required by admin_economy_routes. |

#### database_init/ — 1 files, 2692 lines

| lines | file | note |
|---:|---|---|
| 2692 | `database_init/migrations/index.js` |  |

#### game/ — 79 files, 19030 lines

| lines | file | note |
|---:|---|---|
| 239 | `game/AutoContractEngine.js` |  |
| 2 | `game/BreedingEngine.js` | SHIM -> game/creature/BreedingEngine.js (importers: 2) |
| 2 | `game/BuildingGatherEngine.js` | SHIM -> game/gather/BuildingGatherEngine.js (importers: 1) |
| 2 | `game/CaptureEngine.js` | SHIM -> game/creature/CaptureEngine.js (importers: 2) |
| 127 | `game/ConstructionEngine.js` |  |
| 173 | `game/ContractDistributor.js` |  |
| 280 | `game/CookingEngine.js` |  |
| 2 | `game/CreatureGrowthEngine.js` | SHIM -> game/creature/CreatureGrowthEngine.js (importers: 1) |
| 268 | `game/EncounterEngine.js` |  |
| 94 | `game/FactionDiplomacyEngine.js` |  |
| 2 | `game/FatigueEngine.js` | SHIM -> game/movement/FatigueEngine.js (importers: 3) |
| 2 | `game/FieldGatherEngine.js` | SHIM -> game/gather/FieldGatherEngine.js (importers: 1) |
| 156 | `game/GameLoopManager.js` |  |
| 2 | `game/GatherResolverEngine.js` | SHIM -> game/gather/GatherResolverEngine.js (importers: 2) |
| 2 | `game/GovernanceEngine.js` | SHIM -> game/territory/GovernanceEngine.js (importers: 2) |
| 2 | `game/InheritanceEngine.js` | SHIM -> game/territory/InheritanceEngine.js (importers: 4) |
| 2 | `game/ItemUseEngine.js` | SHIM -> game/gather/ItemUseEngine.js (importers: 1) |
| 523 | `game/LevelEngine.js` |  |
| 448 | `game/LifeEngine.js` |  |
| 2 | `game/LogisticsEngine.js` | SHIM -> game/movement/LogisticsEngine.js (importers: 2) |
| 741 | `game/MinionConsumptionEngine.js` |  |
| 2 | `game/MinionGatherValidator.js` | SHIM -> game/gather/MinionGatherValidator.js (importers: 1) |
| 553 | `game/NpcProductionEngine.js` |  |
| 2 | `game/PartyMovementEngine.js` | SHIM -> game/movement/PartyMovementEngine.js (importers: 2) |
| 2 | `game/PathfindingService.js` | SHIM -> game/movement/PathfindingService.js (importers: 1) |
| 2 | `game/ProceduralResourceHelper.js` | SHIM -> game/gather/ProceduralResourceHelper.js (importers: 1) |
| 292 | `game/ProcurementEngine.js` |  |
| 8 | `game/ReligionEngine.js` | SHIM -> game/territory/ReligionEngine.js (importers: 1) |
| 456 | `game/ResourceDemandPredictor.js` |  |
| 2 | `game/SiegeEngine.js` | SHIM -> game/territory/SiegeEngine.js (importers: 1) |
| 351 | `game/StorageUtils.js` |  |
| 2 | `game/TerrainManager.js` | SHIM -> game/world/TerrainManager.js (importers: 2) |
| 419 | `game/UrbanCaptureEngine.js` |  |
| 2 | `game/VisionEngine.js` | SHIM -> game/world/VisionEngine.js (importers: 3) |
| 2 | `game/WorkerMovementEngine.js` | SHIM -> game/movement/WorkerMovementEngine.js (importers: 1) |
| 409 | `game/WorkshopEngine.js` |  |
| 121 | `game/class_detector.js` |  |
| 203 | `game/creature/BreedingEngine.js` |  |
| 166 | `game/creature/CaptureEngine.js` |  |
| 167 | `game/creature/CreatureGrowthEngine.js` |  |
| 433 | `game/economy/AuctionEngine.js` |  |
| 82 | `game/economy/CityTreasuryService.js` |  |
| 237 | `game/economy/EscrowService.js` |  |
| 186 | `game/economy/ExchangeBuyOrderReplenishService.js` |  |
| 292 | `game/economy/ExchangeEngine.js` |  |
| 303 | `game/economy/ExchangePostEngine.js` |  |
| 63 | `game/economy/FactionLogisticsEngine.js` |  |
| 221 | `game/economy/MarketPriceTickService.js` |  |
| 433 | `game/economy/MatchingEngine.js` |  |
| 138 | `game/economy/MinionDynamicCrafter.js` |  |
| 371 | `game/economy/MinionLogisticsService.js` |  |
| 223 | `game/economy/MinionWalletService.js` |  |
| 270 | `game/economy/PriceFallbackService.js` |  |
| 334 | `game/economy/TaxEngine.js` |  |
| 342 | `game/economy_engine.js` |  |
| 876 | `game/gather/BuildingGatherEngine.js` |  |
| 1232 | `game/gather/FieldGatherEngine.js` |  |
| 310 | `game/gather/GatherResolverEngine.js` |  |
| 301 | `game/gather/ItemRollEngine.js` |  |
| 109 | `game/gather/ItemUseEngine.js` |  |
| 175 | `game/gather/MinionGatherValidator.js` |  |
| 499 | `game/gather/ProceduralResourceHelper.js` |  |
| 173 | `game/movement/FatigueEngine.js` |  |
| 318 | `game/movement/LogisticsEngine.js` |  |
| 501 | `game/movement/PartyMovementEngine.js` |  |
| 342 | `game/movement/PathfindingService.js` |  |
| 352 | `game/movement/WorkerMovementEngine.js` |  |
| 458 | `game/salary_engine.js` |  |
| 651 | `game/stock_engine.js` |  |
| 416 | `game/territory/BuildingSpawner.js` |  |
| 351 | `game/territory/GovernanceEngine.js` |  |
| 327 | `game/territory/InheritanceEngine.js` |  |
| 148 | `game/territory/ReligionEngine.js` |  |
| 276 | `game/territory/SiegeEngine.js` |  |
| 429 | `game/territory/TerritoryEngine.js` |  |
| 135 | `game/world/ElevationService.js` |  |
| 136 | `game/world/TerrainManager.js` |  |
| 263 | `game/world/VisionEngine.js` |  |
| 92 | `game/world/WaterService.js` |  |

#### middlewares/ — 1 files, 26 lines

| lines | file | note |
|---:|---|---|
| 26 | `middlewares/validateDto.js` |  |

#### repositories/ — 31 files, 10427 lines

| lines | file | note |
|---:|---|---|
| 84 | `repositories/AdminBattleRepository.js` |  |
| 169 | `repositories/AdminDungeonRepository.js` |  |
| 267 | `repositories/AdminEncounterRepository.js` |  |
| 281 | `repositories/AdminLevelRepository.js` |  |
| 71 | `repositories/AdminNpcRepository.js` |  |
| 352 | `repositories/AdminOverviewRepository.js` |  |
| 2223 | `repositories/AdminRepository.js` |  |
| 284 | `repositories/AssetRepository.js` |  |
| 56 | `repositories/AuctionRepository.js` |  |
| 1037 | `repositories/BuildingRepository.js` |  |
| 486 | `repositories/CentralBankRepository.js` |  |
| 657 | `repositories/CharacterRepository.js` |  |
| 74 | `repositories/ConstructionRepository.js` |  |
| 189 | `repositories/DungeonRepository.js` |  |
| 145 | `repositories/EconomyRepository.js` |  |
| 220 | `repositories/EncounterRepository.js` |  |
| 793 | `repositories/FactionRepository.js` |  |
| 113 | `repositories/FeedbackRepository.js` |  |
| 158 | `repositories/GameRepository.js` |  |
| 30 | `repositories/PartyRepository.js` |  |
| 274 | `repositories/PremiumRepository.js` |  |
| 490 | `repositories/ProductionRepository.js` |  |
| 287 | `repositories/ReligionRepository.js` |  |
| 450 | `repositories/ResourceRepository.js` |  |
| 75 | `repositories/SkillRepository.js` |  |
| 62 | `repositories/StockExchangeRepository.js` |  |
| 154 | `repositories/TerritoryRepository.js` |  |
| 233 | `repositories/UserRepository.js` |  |
| 462 | `repositories/VaultRepository.js` |  |
| 187 | `repositories/WarSiegeRepository.js` |  |
| 64 | `repositories/WorldRepository.js` |  |

#### routes/ — 70 files, 31475 lines

| lines | file | note |
|---:|---|---|
| 235 | `routes/admin/admin_assets_routes.js` |  |
| 193 | `routes/admin/admin_battle_routes.js` |  |
| 535 | `routes/admin/admin_buildings_routes.js` |  |
| 1089 | `routes/admin/admin_creatures_routes.js` |  |
| 469 | `routes/admin/admin_dungeon_routes.js` |  |
| 117 | `routes/admin/admin_economy_routes.js` |  |
| 331 | `routes/admin/admin_encounter_routes.js` |  |
| 75 | `routes/admin/admin_feedback_routes.js` |  |
| 301 | `routes/admin/admin_gather_routes.js` |  |
| 73 | `routes/admin/admin_governance_routes.js` |  |
| 432 | `routes/admin/admin_items_routes.js` |  |
| 382 | `routes/admin/admin_level_routes.js` |  |
| 376 | `routes/admin/admin_logs_routes.js` |  |
| 1042 | `routes/admin/admin_npc_ai_routes.js` |  |
| 37 | `routes/admin/admin_npc_routes.js` |  |
| 617 | `routes/admin/admin_production_routes.js` |  |
| 1027 | `routes/admin/admin_routes.js` |  |
| 556 | `routes/admin/admin_users_routes.js` |  |
| 693 | `routes/admin/admin_world_routes.js` | BROKEN require("./seeds/seed_rival") at line 141 (POST /admin/reset-world, after resetWorldUsers()). |
| 545 | `routes/asset/asset_routes.js` |  |
| 116 | `routes/auth_routes.js` |  |
| 750 | `routes/building/building_core_routes.js` |  |
| 507 | `routes/building/building_mgmt_routes.js` |  |
| 529 | `routes/building/building_production_routes.js` |  |
| 63 | `routes/building/building_routes.js` |  |
| 621 | `routes/building/building_service_routes.js` |  |
| 461 | `routes/building/building_storage_routes.js` |  |
| 220 | `routes/building/construction_routes.js` |  |
| 341 | `routes/building/hq_routes.js` |  |
| 1148 | `routes/character/character_routes.js` |  |
| 104 | `routes/character/creatures_routes.js` |  |
| 586 | `routes/character/dungeon_routes.js` |  |
| 1031 | `routes/character/enhancement_routes.js` |  |
| 496 | `routes/character/inventory_routes.js` |  |
| 76 | `routes/character/minion_jobs_routes.js` |  |
| 437 | `routes/character/skill_routes.js` |  |
| 85 | `routes/chat/chat_routes.js` |  |
| 188 | `routes/debug_routes.js` | mounted twice (auto-loader + explicit app.use in server.js:330). |
| 838 | `routes/economy/central_bank_routes.js` |  |
| 601 | `routes/economy/economy_routes.js` |  |
| 137 | `routes/economy/logistics_routes.js` |  |
| 297 | `routes/economy/procurement_routes.js` |  |
| 609 | `routes/economy/production_routes.js` |  |
| 653 | `routes/economy/resource_routes.js` |  |
| 317 | `routes/economy/vault_routes.js` |  |
| 538 | `routes/economy/workshop_routes.js` |  |
| 209 | `routes/faction/diplomacy_routes.js` |  |
| 1246 | `routes/faction/faction_routes.js` |  |
| 666 | `routes/faction/party_routes.js` |  |
| 250 | `routes/faction/religion_routes.js` |  |
| 397 | `routes/faction/urban_war_routes.js` |  |
| 288 | `routes/faction/war_siege_routes.js` |  |
| 71 | `routes/feedback_routes.js` |  |
| 1134 | `routes/game_routes.js` |  |
| 264 | `routes/mail_routes.js` |  |
| 725 | `routes/map/minion_gather_routes.js` |  |
| 1589 | `routes/map/piximap_routes.js` |  |
| 22 | `routes/map_routes.js` |  |
| 205 | `routes/raid/raid_routes.js` |  |
| 201 | `routes/ranking/ranking_routes.js` |  |
| 233 | `routes/social/social_routes.js` |  |
| 216 | `routes/system/premium_currency_routes.js` |  |
| 182 | `routes/trade/auction_routes.js` |  |
| 75 | `routes/trade/direct_trade_routes.js` |  |
| 272 | `routes/trade/exchange_post_routes.js` |  |
| 1039 | `routes/trade/market_routes.js` | BROKEN require("../../game/ItemLookupService") at lines 383/425 (auction bid paths). |
| 324 | `routes/trade/stock_exchange_routes.js` |  |
| 564 | `routes/tutorial_routes.js` |  |
| 292 | `routes/user_routes.js` |  |
| 137 | `routes/world_routes.js` |  |

#### scripts/ — 6 files, 2132 lines

| lines | file | note |
|---:|---|---|
| 749 | `scripts/SecondaryMap/SecondaryMapGenerator.js` | tsc output of terra-client SecondaryMapGenerator.ts, hand-edited; weights now differ from client .ts. |
| 164 | `scripts/SecondaryMap/types.js` | tsc output of terra-client types.ts. |
| 601 | `scripts/WorldMap/core/BiomeGenerator.js` | tsc output of terra-client BiomeGenerator.ts (+ hash/getResourceInfo exports). |
| 109 | `scripts/WorldMap/core/types.js` | tsc output. |
| 359 | `scripts/seed_items.js` | DATA module; lazily required by POST /admin/item-templates/seed-samples. |
| 150 | `scripts/seed_primary_materials.js` | DATA module; required by utils/system/auto_seed.js (requires database.js at load). |

#### seeds/ — 4 files, 3356 lines

| lines | file | note |
|---:|---|---|
| 1065 | `seeds/building_seed.js` | runtime uses BUILDING_SEEDS data only; seedBuildingTypes(db) (db.prepare) is dead. |
| 1133 | `seeds/creature_seed.js` | runtime uses CREATURE_TEMPLATES only; seedCreatureTemplates(db) (db.prepare) is dead. |
| 144 | `seeds/resource_tile_seed.js` | runtime uses RESOURCE_TILE_SEEDS only; seedResourceTileConfig(db) (db.prepare) is dead. |
| 1014 | `seeds/skill_seed.js` | runtime uses SKILL_SEEDS only; seedSkillDefinitions(db) (db.prepare) is dead. |

#### sockets/ — 1 files, 245 lines

| lines | file | note |
|---:|---|---|
| 245 | `sockets/SocketManager.js` |  |

#### utils/ — 38 files, 2289 lines

| lines | file | note |
|---:|---|---|
| 2 | `utils/BuildingSpawner.js` | SHIM -> game/territory/BuildingSpawner.js (importers: 6) |
| 105 | `utils/CacheService.js` | redis client; connect() never settles without a Redis server (see findings). |
| 133 | `utils/CurrencyIdUtils.js` |  |
| 2 | `utils/GameLoopManager.js` | SHIM -> game/GameLoopManager.js (importers: 3) |
| 5 | `utils/ServerBootstrap.js` | SHIM -> utils/system/ServerBootstrap.js (importers: 1) |
| 2 | `utils/TerritoryEngine.js` | SHIM -> game/territory/TerritoryEngine.js (importers: 5) |
| 5 | `utils/admin_config.js` | SHIM -> utils/server/admin_config.js (importers: 9) |
| 5 | `utils/auto_seed.js` | SHIM -> utils/system/auto_seed.js (importers: 1) |
| 25 | `utils/constants.js` |  |
| 50 | `utils/db/queryBuilder.js` |  |
| 5 | `utils/equipment.js` | SHIM -> utils/item/equipment.js (importers: 3) |
| 5 | `utils/geo.js` | SHIM -> utils/geo/geo.js (importers: 3) |
| 20 | `utils/geo/geo.js` |  |
| 50 | `utils/geo/geom.js` |  |
| 66 | `utils/geo/localMap.js` | BROKEN require("../database") at line 46 (resolves utils/database) - swallowed by try/catch. |
| 5 | `utils/geom.js` | SHIM -> utils/geo/geom.js (importers: 1) |
| 5 | `utils/image_bg_remover.js` | SHIM -> utils/system/image_bg_remover.js (importers: 2) |
| 5 | `utils/inventory.js` | SHIM -> utils/item/inventory.js (importers: 14) |
| 166 | `utils/item/equipment.js` |  |
| 152 | `utils/item/inventory.js` |  |
| 226 | `utils/item/itemUpsert.js` |  |
| 119 | `utils/item/item_lookup.js` |  |
| 73 | `utils/item/status_effect_lookup.js` |  |
| 5 | `utils/itemUpsert.js` | SHIM -> utils/item/itemUpsert.js (importers: 11) |
| 5 | `utils/item_lookup.js` | SHIM -> utils/item/item_lookup.js (importers: 17) |
| 5 | `utils/localMap.js` | SHIM -> utils/geo/localMap.js (importers: 1) |
| 5 | `utils/logger.js` | SHIM -> utils/server/logger.js (importers: 2) |
| 5 | `utils/queryBuilder.js` | SHIM -> utils/db/queryBuilder.js (importers: 2) |
| 5 | `utils/route_validator.js` | SHIM -> utils/server/route_validator.js (importers: 4) |
| 4 | `utils/server/admin_config.js` |  |
| 37 | `utils/server/logger.js` |  |
| 33 | `utils/server/route_validator.js` |  |
| 196 | `utils/server/server_utils.js` |  |
| 5 | `utils/server_utils.js` | SHIM -> utils/server/server_utils.js (importers: 1) |
| 5 | `utils/status_effect_lookup.js` | SHIM -> utils/item/status_effect_lookup.js (importers: 4) |
| 223 | `utils/system/ServerBootstrap.js` |  |
| 393 | `utils/system/auto_seed.js` |  |
| 132 | `utils/system/image_bg_remover.js` |  |

### (b) Test-only — 20 files, 3096 lines

| lines | file | note |
|---:|---|---|
| 96 | `tests/battle_tick.test.js` |  |
| 167 | `tests/breeding_engine.test.js` |  |
| 122 | `tests/building_routes.test.js` |  |
| 139 | `tests/capture_engine.test.js` |  |
| 56 | `tests/combat_engine.test.js` |  |
| 266 | `tests/craft_cyborg.test.js` |  |
| 169 | `tests/economy_engine.test.js` |  |
| 166 | `tests/feedback_routes.test.js` |  |
| 92 | `tests/game_loop_manager.test.js` |  |
| 107 | `tests/inflation_monitor.test.js` |  |
| 118 | `tests/inventory_routes.test.js` |  |
| 117 | `tests/itemUpsert.test.js` |  |
| 136 | `tests/life_engine.test.js` |  |
| 313 | `tests/migration_challenger.test.js` |  |
| 210 | `tests/minion_gather_routes.test.js` |  |
| 111 | `tests/npc_production.test.js` |  |
| 259 | `tests/premium_currency_routes.test.js` |  |
| 138 | `tests/religion.test.js` |  |
| 179 | `tests/skill_stone.test.js` |  |
| 135 | `tests/tax_minion_consumption.test.js` |  |

### (c) One-off / manual scripts — 7 files, 783 lines

| lines | file | note |
|---:|---|---|
| 98 | `db/index.js` | old pg Pool (pre-database.js); only importer is db/setup_trading_post.js. |
| 35 | `db/setup_trading_post.js` | creates trading_post_listings - superseded by database_init/migrations/index.js:2354. |
| 61 | `scripts/backup.js` | pg_dump wrapper; only spawned by cron/backupCron.js which is never started. Uses dotenv. |
| 60 | `scripts/create_admin.js` | creates admin/admin on test DB 5440. |
| 85 | `scripts/economy_monitor.js` | writes docs/economy_audit_report.json; not referenced anywhere. |
| 296 | `scripts/setup_dev_db.js` | copies DDL+template data prod(riversun7.synology.me:5439) -> test DB; hardcoded password. De-facto way to create a new DB. |
| 148 | `scripts/setup_postgres_production.js` | one-off crop seeding (WHEAT/CORN/POTATO) after initSchema(). |

### (d) Dead legacy code / dead files — 21 files, 7663 lines

| lines | file | note |
|---:|---|---|
| 15 | `.eslintrc.json` | ESLint 9 flat config (eslint.config.mjs) is used; legacy .eslintrc is ignored. |
| 0 | `assets/images/creatures/portraits/MERMAID.png` | terra-server/assets is not served (static root is public/assets) and not referenced. |
| 0 | `assets/images/items/icons/standard_issue_kinetic_rifle.png` | same as above. |
| 29 | `cron/backupCron.js` | exports initBackupCron(); never called anywhere. |
| 4765 | `database_init/schema.js` | SQLite DDL (AUTOINCREMENT/DATETIME, db.exec sync). Header says "not required by server.js, legacy reference". NOTE: only in-repo DDL for 78 core tables (users, item_templates, ...). |
| 2 | `game/ElevationService.js` | shim, zero importers (target imported directly by game/world/TerrainManager.js). |
| 2 | `game/ItemRollEngine.js` | shim, zero importers. |
| 2 | `game/WaterService.js` | shim, zero importers. |
| 1 | `routes/unit_log_filters.js` | single comment line; not *_routes.js so never auto-mounted. |
| 602 | `scripts/BiomeGenerator.js` | stale tsc output (mojibake comments); runtime uses scripts/WorldMap/core/BiomeGenerator.js. |
| 732 | `scripts/SecondaryMapGenerator.js` | stale tsc output; runtime uses scripts/SecondaryMap/SecondaryMapGenerator.js. |
| 109 | `scripts/WorldMap_types.js` | byte-identical to scripts/WorldMap/core/types.js; only used by stale generators. |
| 349 | `scripts/seed_curated_items.js` | require("better-sqlite3") - package not installed/declared; cannot run. |
| 164 | `scripts/types.js` | byte-identical to scripts/SecondaryMap/types.js; only used by the stale generator. |
| 169 | `seeds/seed_factions.js` | no importer; require("./database") and require("./src/factories/UserFactory") resolve relative to seeds/ -> MODULE_NOT_FOUND; db.prepare. |
| 186 | `seeds/seed_resource_supply.js` | only caller is schema.js; db.prepare (SQLite). |
| 255 | `seeds/seed_rival.js` | no working importer (admin_world_routes requires "./seeds/seed_rival" -> MODULE_NOT_FOUND); executes seedRival() on load; broken requires like seed_factions; db.prepare. |
| 141 | `src/factories/UserFactory.js` | pg-async, but only importers are the broken seeds (seed_factions/seed_rival). |
| 98 | `types/ResourceTypes.js` | only importer is schema.js. |
| 37 | `utils/db/db_utils.js` | only reachable via the unused shim utils/db_utils.js. |
| 5 | `utils/db_utils.js` | shim with zero importers. |

### (f) Other (config, tooling, agent notes) — 12 files, 9130 lines

| lines | file | note |
|---:|---|---|
| 5 | `.claude/agent-memory/task-planner/MEMORY.md` |  |
| 26 | `.claude/agent-memory/task-planner/project_player_loop.md` |  |
| 33 | `.claude/agent-memory/task-planner/project_quest_system.md` |  |
| 37 | `.claude/agent-memory/task-planner/project_status_20260515.md` |  |
| 257 | `.claude/agents/pdca-task-planner.md` |  |
| 13 | `.dockerignore` |  |
| 16 | `.env.example` |  |
| 10 | `Dockerfile` |  |
| 48 | `eslint.config.mjs` |  |
| 6 | `jest.config.js` |  |
| 8621 | `package-lock.json` |  |
| 58 | `package.json` |  |
