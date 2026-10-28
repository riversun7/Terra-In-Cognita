> 조사 보고서 원본 (작성: Claude Code 조사 에이전트, 2026-10-27). 기존 프로젝트(AntiGravt01) 기준 내용이며, 비밀번호 등 민감 문자열은 [REDACTED]로 바꿨다. 결론은 `docs/PLAN.md`에 반영되어 있다.

# AntiGravt01 (Terra In-Cognita) — Docs / Requirements / Agent-Tooling Inventory

Read-only fact-finding, 2026-10-27. No tracked files were modified.
Legend: **[V]** = verified by command/file read in this session; **[A]** = assumption / inference.

Important caveat on dates [V]: git history starts at `c236501` (2026-06-07), a 9,019-file import commit. A
"last-modified" of **2026-06-07 means "untouched since import"** (true last edit unknown, March–May 2026
history is not in this repo). **2026-07-15** is a bulk "lint + full push" commit (`4cd3b50`) and
**2026-06-12** (`cef106b`) is the docs-consolidation commit, so those dates often reflect bulk touches, not real
content updates. Original per-system spec files (CHR-1…, ECO-1…, etc.) that were merged into
`Consolidated_*.md` still exist in history at `cef106b^` (102 doc files deleted in that commit). [V]

---

## Part A — `docs/` inventory (53 tracked files) [V]

### The "odd" path
`git ls-files` prints it as `"docs/2026-10-26_\355\205\214…\354\204\234.md"` only because of git's
`core.quotepath` octal escaping of a Korean filename. Exact name [V]:

`docs/2026-10-26_테스트서버_오프라인_서버분리_PixiMap_로딩지연_분석보고서.md` (285 lines, 2026-10-26)

It is a one-off analysis report (test-server offline / server split / PixiMap load freeze). Notable content:
NAS deployment was measured still running on host ports **3001/3002** while repo code/compose use
**4000/4001/4002** (port drift between repo and deployed NAS).

Also odd (outside docs) [V]: a tracked directory literally named `` `.agents/` `` (with backticks) containing
`explorer_m1_2_frontend/comment_scanner.js` — an agent path-quoting accident.

### Code facts used for staleness checks [V]
- Ports: client `next dev -p 4000`; server `PORT=4001 PG_PORT=5439`; test server `PORT=4002 PG_PORT=5440`
  (root `npm run dev` runs SERVER, TEST, UI, LITE); terra-lite Vite 5173 / preview 4173. Playwright baseURL 4000.
- DB: `pg` Pool (`terra-server/database.js`, 212 lines) with a better-sqlite3-compatible `get/all/run` shim that
  converts `?` → `$n` (`convertQ`). Code uses both `?` and `$n` placeholders (~900 vs ~1,125 `WHERE x = ?/$n`).
  Schema: `database_init/schema.js` (4,765 lines) + `database_init/migrations/index.js` (2,692 lines; initSchema moved
  out of database.js in "2026-07" refactor). One stray `require('better-sqlite3')` remains in
  `scripts/seed_curated_items.js`.
- `server.js` = 1,119 lines, 5 inline `app.get/post`, 13 `app.use`; routes are split into 71 files under
  `routes/{admin,asset,building,character,chat,economy,faction,map,raid,ranking,social,system,trade}/`. Not a God object
  any more, but it still hosts ~22 `gameLoopManager.register` loops + several raw `setInterval`s + 4 cron modules.
- `terra-lite/` (Vite + React 19 + TS, react-router, socket.io-client, PWA, "Toss-style" mobile companion) exists.
- `terra-data/` does **not** exist. `terra-client/src/middleware.ts` does **not** exist (now `src/proxy.ts`).
  `/terrain-map` route and `components/map/` (Leaflet) are gone; Leaflet is not a client dependency.
  `game/OsmTerrainService.js` is gone (TerrainManager/ElevationService/PathfindingService remain).
- Tests exist: server Jest (20 suites; changelog claims 102 tests), client Jest + Playwright (19 e2e specs).
  `.github/workflows/playwright.yml.disabled` (E2E CI disabled); `docker-publish.yml` active.
- Production compose: `postgres:16-alpine`, server 4001, test-server 4002→4001 (PG 5440), client 4000, watchtower 60s.
- Tables created in code ≈170–173; `DATABASE_SCHEMA.md` lists 94 (6 of which aren't found as `CREATE TABLE` in code:
  building_farm_queue, building_ranch_status, creature_byproducts, farm_crops, ground_items, user_trade_policies);
  **81 code tables are not mentioned in DATABASE_SCHEMA.md** (e.g. stock_orders/holdings, exchange_*, dungeon_*,
  world_boss_*, siege_states, war_declarations, tax_policy, user_quest_progress, chat_messages, user_friends,
  user_parties, procurement_*, workshop_queue, cooking_queue, status_effects, user_skills, user_stats …).

### Encoding corruption (mojibake / U+FFFD) [V]
| File | Damage |
|---|---|
| `docs/GDD/World/Consolidated_World.md` | **REL-1 Religion spec, lines ~142–485, 201 lines with U+FFFD.** Already corrupt in the 2026-06-07 import (`docs/World/REL-1_ReligionSystem.md` at `cef106b^`) → not recoverable from this repo. **This is a 기획서.** |
| `docs/changelog.md` | lines 870–1660, 575 lines with U+FFFD (entries ~2026-06-xx) |
| `docs/archive/changelog_old.md` | 819 U+FFFD lines |
| `docs/archive/changelog_archive_2026-04.md` | ~2,861 CJK-mojibake lines (UTF-8 read as CP949) |
| `docs/Operations/Analysis/Consolidated_Analysis.md` | ~364 mojibake lines (from ~line 376) |
| `docs/TASKFORCE_ARCHIVE.md` | ~57 mojibake lines |

### Category 1 — 기획서 / game design spec (PRESERVE)
| File | Last git date | Lines | Notes |
|---|---|---|---|
| docs/Projects/terra_in_cognita/Game_Design_Document.md | 2026-10-18 | 1706 | Master GDD **v3.2** (header 2026-04-25; §1.1 pillars edited 2026-10-18). §11 Tech stack (Next 15, Leaflet 1st map, Mongo polyglot plan) and §12 status are stale engineering content embedded in the spec. |
| docs/GDD/Consolidated_GDD.md | 2026-10-18 | 561 | **Mixed.** Top = "[진행중] Incremental GDD Specification" roadmap (Steps 1–3 확정, Step 4 in progress, 5–7 waiting) — the *current* re-specification effort. Then CREATURE_IMAGE_PROMPTS (art spec), IDEA (idea backlog), QUEST_REWARD_PHILOSOPHY (spec), SYSTEM_IMPROVEMENT_PLAN (engineering report → belongs in cat. 3). |
| docs/GDD/Character/Consolidated_Character.md | 2026-10-18 | 2623 | CHR-1, CHR-2 StatDecisions, CHR-3 SecondaryStats, CHR-4 SkillSystem, CHR-5 CyborgCreation, CHR-5 RebirthAndLoot |
| docs/GDD/Character/sim_combat.js, sim_element.js | 2026-07-15 | 157 / 136 | Balance-simulation scripts supporting the spec (keep with spec) |
| docs/GDD/Combat/Consolidated_Combat.md | 2026-07-15 | 1629 | CMB-0 BattleFlow, CMB-1 Dungeon (+Dungeon_Design), CMB-2 WarSiege |
| docs/GDD/Economy/Consolidated_Economy.md | 2026-10-18 | 3116 | ECO-0 … ECO-8, ECO-10 Securities/Futures |
| docs/GDD/Item/Consolidated_Item.md | 2026-07-15 | 2318 | ITM-1 … ITM-11 (ITM-5 is an admin-tool spec) |
| docs/GDD/Map/Consolidated_Map.md | 2026-07-15 | 1378 | **Mixed** design + tech reference: ARCHIVE_RiverbankLogic_V7, MapVisualizations, MapWrapping_GlobeMinimap, map_leaflet (paused system), pixi_map_system (SQLite DDL `INTEGER PRIMARY KEY AUTOINCREMENT`) |
| docs/GDD/NPC_AI/Consolidated_NPC_AI.md | 2026-07-15 | 1988 | **Mixed**: NPC-1 overview (design+impl ref), NPC-2 stuck analysis (one-off), NPC-3 flow, NPC-4 Client-Authoritative AutoGather |
| docs/GDD/World/Consolidated_World.md | 2026-07-15 | 1393 | F-01 Faction diplomacy, G-01 Guild siege, **REL-1 (corrupted)**, WLD-1 MapSystem (Leaflet/OSM era, references server.js line numbers that no longer exist), WLD-2 CreatureAlbum, WLD-3 Exploration & Quests |
| docs/GDD/Building/BLD-2_BuildingTree.md | 2026-10-18 | 467 | v2.0 + 5-zone update |
| docs/GDD/Building/BLD-3_Durability.md | 2026-07-15 | 37 | |
| docs/Projects/terra-lite/TERRA_LITE_PLAN.md | 2026-07-15 | 370 | Product spec/plan for the lite companion (P1–P20) |

Spec-adjacent (treat as cat. 3 or archive but keep): `docs/GDD/Building/BLD-2_Implementation.md` (2026-07-15, 543 —
implementation plan), `docs/GDD/Building/archive/BLD-0_Sidebar_System.md` (554) and `BLD-1_BuildingGated_Navigation.md`
(718) — superseded specs, `docs/GDD/Economy/economy_audit_report.json` (32 — one-off).

### Category 2 — Living engineering docs (should track code) — staleness
| File | Last git date | Lines | Staleness verdict [V unless noted] |
|---|---|---|---|
| docs/ARCHITECTURE.md | 2026-07-15 (self-declared "마지막 업데이트 2026-05-05") | 507 | **Stale.** Says PG (good) and has 4001/4002 in §9 (good), but: tree includes nonexistent `terra-data/`; **no terra-lite** in system overview; "Next.js 14+" (actual 16.2.6) and "Leaflet (OSM 게임맵)"; API table uses flat `routes/*.js` paths (actual subfolders) and omits raid/ranking/social/chat/trade/tutorial/feedback/premium_currency/war_siege/urban_war/party/workshop/procurement; §7.8 lists 5 nonexistent engines (ProductionAIEngine, WorkerGatherEngine, FarmEngine, RanchEngine, FishingEngine) and §3/§7.5 `NpcTradeAI.js` (gone) with `NpcManager.js` listed twice; §8 docs map points to pre-consolidation paths (PRD_HUB.md, Character/CHR-1…, Map/…) all gone; §9 cites `ecosystem.local.js` (actual `ecosystem.config.js`); §7 says PostgreSQL 18 (compose: 16-alpine); Windows `file:///d:/…` link; says "NPC 9축" while NPC-1 spec says 11축; no mention of Redis CacheService, Socket.IO namespaces, cron/, GameLoopManager loop inventory, PM2 cluster/scheduler guard. |
| docs/DATABASE_SCHEMA.md | 2026-10-18 | 875 | **Partially current.** Correctly PG-based, schema source `database_init/schema.js` (doesn't mention `migrations/index.js`). Covers ~89/≈170 tables; 81 code tables undocumented (list above). ERD titled "SQLite/PostgreSQL 공통". Claims to be SSoT, which is false. |
| docs/changelog.md | 2026-10-26 | 1664 | **Current at top** (2026-10-26). Lines 870–1660 corrupted. Mixed formats (`## [ts]` blocks vs `- [date]` bullets); many entries are automated cron "Iteration N" noise. Mandated by rule1. |
| docs/TASKFORCE.md | 2026-10-26 | 132 | **Unreliable.** Every system row = 100% ✅; terra-lite P1–P20 all ✅. Contradicted by PROJECT_CHECKLIST (20–25% real) and GDD §14 (player loop ~15% as of 04-25). `scripts/update_docs.py` literally string-replaces "⏳ 대기"→"✅ 완료". Mandated by rule1 ("must tick ✅ after every task"). |
| docs/TASKFORCE_ARCHIVE.md | 2026-07-15 | 1743 | Archive of agent cron iteration logs ("Cron Iteration N … 100% 무결성"); mojibake. → cat. 4 |
| docs/PROJECT_CHECKLIST.md | 2026-06-07 (unchanged since import; created 2026-05-04) | 97 | The only *candid* readiness doc (Phase1 70%, Phase2 50%, Phase3 25%, Phase4 5%, Phase5 0%, Phase6 0%; overall 20–25%). Stale in date, but substance probably still closer to truth than TASKFORCE [A]. |
| docs/PROJECT_PROBLEMS.md | 2026-07-15 | 153 | **Bot log, not a problem tracker.** 110 "Iteration N … 연속 무결점" entries; says "Next.js 14 / React 18" (actual 16/19). Zero signal. |
| docs/BETA_RELEASE_NOTES.md | 2026-06-07 | 91 | Agent-written "Phase 7 CBT" release notes (cyborg fusion OP-06, religion REL-1 …). Historical → cat. 3/4 |
| docs/Engineering/Infrastructure/DB_MIGRATION_POSTGRESQL.md | 2026-07-15 | 1050 | Completed SQLite→PG migration guide (dated 2026-04-05; Mac/NAS paths). Historical → archive. |
| docs/Engineering/Testing/E2E_TESTING_GUIDE.md | 2026-07-15 | 119 | Beginner Playwright guide; says servers on 3000/3001 (actual 4000/4001). Minor staleness. |
| docs/Engineering/Testing/TEST_INFRA.md | 2026-07-15 | 363 | Test plan (tiers, features ↔ ORIGINAL_REQUEST R1–R3); `localhost:3000`. Stale. |
| docs/Operations/Admin/ADMIN-1_UnitActivityLog.md | 2026-07-15 (self "2026-04-11") | 365 | References `game/FishingEngine.js`, `game/ProductionAIEngine.js` (gone), migrations in `database.js` (moved), `routes/admin_routes.js` (now `routes/admin/`). Stale. |
| docs/Operations/Admin/IAMS_ARCHITECTURE.md | 2026-07-15 | 264 | Image-asset subsystem design; no broken code paths found. Reasonably current [V for paths only]. |
| docs/Operations/LiveOps/Consolidated_LiveOps.md | 2026-07-15 | 180 | Aspirational ops plans (expand/contract migrations, analytics, zero-downtime deploy, NPC expansion). Not tracking code. |
| docs/Projects/terra-lite/CHANGELOG.md | 2026-07-15 | 31 | Stops at P8 (2026-06-12) while TASKFORCE claims P1–P20 done. Stale. |

### Category 3 — One-off reports / analyses / benchmarks
| File | Last git date | Lines |
|---|---|---|
| docs/2026-10-26_테스트서버_오프라인_서버분리_PixiMap_로딩지연_분석보고서.md | 2026-10-26 | 285 |
| docs/Engineering/Benchmarking/Analysis/Consolidated_Analysis.md (CreatureAlbum_Benchmark, CrossAnalysis ×4, GameBenchmark, StatSystem_Analysis) | 2026-07-15 | 3522 |
| docs/Engineering/Benchmarking/Games/Games_A_to_H.md / Games_I_to_P.md / Games_Q_to_Z.md (≈33 game benchmarks; also mirrored to Notion per workflow) | 2026-07-15 | 9666 / 4160 / 3501 |
| docs/Operations/Analysis/Consolidated_Analysis.md (Analysis_01–05 audits, Phase7 CBT checklist, Phase 8 CBT ops, Phase 9 OBT endgame, Phase 11 production release) | 2026-07-15 | 1442 |
| docs/Operations/Analysis/current_tree.txt (file-tree dump, references `.claude/agents/pdca-task-planner.md` that no longer exists) | 2026-07-15 | 1574 |
| docs/GDD/Economy/economy_audit_report.json | 2026-07-15 | 32 |
| docs/BETA_RELEASE_NOTES.md (see above) | 2026-06-07 | 91 |
| SYSTEM_IMPROVEMENT_PLAN section inside Consolidated_GDD.md; NPC-2 stuck analysis inside Consolidated_NPC_AI.md | — | — |

Benchmarks are design *inputs* (EVE, Albion, Victoria 3, Anno, etc.) — recommend keeping next to 기획서 as reference, not as living docs [A].

### Category 4 — Archive / tool config
| File | Last git date | Lines |
|---|---|---|
| docs/archive/NAS_DEPLOYMENT.md | 2026-07-15 | 141 |
| docs/archive/ORIGINAL_REQUEST.md (log of Antigravity "teamwork_preview" prompts, 2026-05-27…) | 2026-07-15 | 667 |
| docs/archive/PRD_HUB.md (old PRD hub, 2026-03-22, links Notion) | 2026-06-07 | 238 |
| docs/archive/PROJECT.md (agent scope doc; Next 14, Leaflet) | 2026-07-15 | 53 |
| docs/archive/TEST_READY.md | 2026-07-15 | 74 |
| docs/archive/TF-002_FeatureList.md (PRD feature list v2.0, 2026-03-21) | 2026-06-07 | 535 |
| docs/archive/changelog_archive_2026-04.md (corrupt) | 2026-06-07 | 4656 |
| docs/archive/changelog_old.md (corrupt) | 2026-07-15 | 1452 |
| docs/GDD/Building/archive/BLD-0, BLD-1 (superseded specs — still 기획서) | 2026-07-15 | 554 / 718 |
| docs/.obsidian/{app,appearance,core-plugins,graph,workspace}.json — Obsidian vault config; docs contain ~296 `[[wikilinks]]` across 23 files (e.g. `[[STR]]`, `[[크리쳐]]`), which also break GitHub anchor TOCs | 2026-06-07 | 0/0/32/21/183 |
| docs/TASKFORCE_ARCHIVE.md (see above) | 2026-07-15 | 1743 |

### Cross-references required by instruction files [V]
- **`.agents/rules/rule1.md`** (trigger: always_on, Antigravity rules): §0 auto-execute all terminal commands without
  asking (only rm/drop confirm once); §1 read `/docs/ARCHITECTURE.md` before any work; §2 append `/docs/changelog.md`
  at top after every meaningful change; §3 Korean-only comments; §4 reuse DB/logic; §5 PDCA and **must update
  `/docs/TASKFORCE.md` (✅ + date + "최근 완료 작업") after every task**; §6 docs modify-first, never recreate
  changelog/ARCHITECTURE.
- **`.agents/rules/code1.md`** (always_on): silently scan `AGENTS.md`, run `npx openskills read <skill>`, apply skill,
  "YOLO mode" — never ask for approval; report "1,322개의 스킬 … 세팅 완료".
- **`.agents/workflows/benchmarking.md`**: write `docs/Benchmarking/Games/{GameName}.md` **and** a Notion page under a
  fixed page ID. Path no longer exists (consolidated into `docs/Engineering/Benchmarking/Games/Games_*.md`).
- **Root `CLAUDE.md`** (2026-06-07, 182 lines): restates rule1 (ARCHITECTURE read, changelog, Korean comments,
  modify-first, PDCA, reuse). Stale facts: ports 3000/3001 (actual 4000/4001/4002 + lite 5173/4173); `terra-data/`
  (absent); `src/middleware.ts` (now `proxy.ts`); `/terrain-map` "paused" (actually removed) and `components/map/`
  (absent) and `OsmTerrainService.js` (absent); "server.js God Object" (no longer); `initSchema()` in `database.js`
  (moved to `database_init/migrations/index.js`); `routes/building_routes.js` etc. flat paths (now subfolders);
  "테스트 프레임워크 없음" (false — Jest + Playwright); "$1,$2 placeholders" (code mostly uses `?` via shim);
  no mention of terra-lite. DB = PG is correct.
- **CLAUDE.md "Design docs" table — all paths are wrong [V]:** `docs/Character/`, `docs/Combat/`, `docs/Economy/`,
  `docs/Item/`, `docs/World/`, `docs/terra_in_cognita/Game_Design_Document.md` → all MISSING. Actual:
  `docs/GDD/Character/Consolidated_Character.md`, `docs/GDD/Combat/Consolidated_Combat.md`,
  `docs/GDD/Economy/Consolidated_Economy.md` (ECO-0…8 + ECO-10), `docs/GDD/Item/Consolidated_Item.md`,
  `docs/GDD/World/Consolidated_World.md`, `docs/Projects/terra_in_cognita/Game_Design_Document.md` (v3.2, not v3.0).
  (`docs/PRD_HUB.md` and `docs/map/` referenced by ARCHITECTURE are also missing.)
- **`AGENTS.md`** (2026-06-07, 7,960 lines / 343 KB): openskills `<skills_system>` table of 1,322 skills (no project
  content).
- **`.claude/agents/*`** reference `docs/changelog.md`, `docs/ARCHITECTURE.md`, `terra-server/database.js initSchema()`.
- `README.md` (2026-06-17): ports 3000/3001, "SQLite (better-sqlite3)", Leaflet — stale.

---

## Part B — Requirements that drive a tech-stack choice (from design docs)

### B1. Target platforms
- GDD §1: "웹 기반 멀티플레이 경제·전투·탐험 시뮬레이션", platform **Web (browser), PC 우선** [V: Game_Design_Document.md L27–36].
- CMB-0 §3차맵 카메라: **"모바일 대응 필수"** — pinch/drag, portrait mode, swipe, "자동전투 + 빠른 시뮬이 모바일 기본 모드" [V: Consolidated_Combat.md L523–560].
- terra-lite: **mobile-first PWA "Toss-style" companion** — core gameplay without rendering, cards/buttons, same API + JWT [V: TERRA_LITE_PLAN.md L1–60].
- PROJECT_CHECKLIST Phase 6 mentions "앱스토어 스크린샷" for launch marketing → implies an app-store presence (native wrapper) is contemplated but never specified [V text / A intent].
- No native client, Steam, or console target is specified anywhere [V by grep].

### B2. 2D vs 3D presentation
- **World map (1차맵):** GDD §8.1 says **Leaflet.js** real-Earth map (1 tile = 14px @ z18) [V L1418–1423] — *stale*. Current code/ARCHITECTURE: **PixiJS 2D tilemap, procedural** (Perlin FBM continents, X-axis wrap, globe-projected minimap; presets 128² … 1024×512) [V types.ts, Consolidated_Map MapWrapping].
- **Local map (2차맵):** GDD: "PixiJS (아이소메트릭 3D), 1타일=64px" [V]; WLD-1: isometric 30×30 @ 0.001° (~3.3 km²) [V]; pixi doc: 90×90 [V]; code: **Three.js 3D, 150×150** tiles per world tile (`MAP_SIZE = 150`) [V].
- **Combat (3차맵):** separate battle map with Tactical (RTS top-down/quarter), 3rd-person follow, cinematic cameras → 3D implied [V CMB-0]. Art direction: "semi-realistic 2.5D/3D high-end, UE5-like lighting, avoid cartoonish" [V Consolidated_GDD CREATURE_IMAGE_PROMPTS] vs new 2026-10-18 tone pillar "bright Japanese pastel Cozy Hub ↔ Dark Frontier" [V Consolidated_GDD Step 1].
- 1st-map tile→meter scale is explicitly **undecided** ("TILE_TO_METER … 맵 설정 확정 후") [V Consolidated_Map L1374].

### B3. Real-time model
- **Design pillar 1 (2026-10-18):** "비동기 자율 생태계 + 짧은 밀도의 액티브 플레이" — units keep working (farm, gather, workshop, logistics) while the player is offline; online time is for settlement/trading/setup and short raids/expeditions [V Consolidated_GDD Step 1; GDD §1.1].
- **World simulates continuously without players** — yes [V]: design (NPC loop 60 s tick, NPC-1; MarketPriceTickService 10-min tick, ECO-3; religion 1 h tick, BETA notes; economy indicators "game day = 24 real hours", ECO-6) and code (server.js registers ~22 loops: WorkerMovement 1.5 s, FieldGatherAction 10 s, ConstructionLogistics 10 s, MinionTask 15 s, UrbanCapture 30 s, BuildingGather/Cooking/Workshop/PartyMovement/SiegeCombat/FieldGather/AutoContract 60 s, NaturalRecovery 3 min, EconomyMatching/Auction/MinionOnlineGuard 5 min, MinionSatiety 10 min, NpcProduction 15 min, CentralBank/ExchangeReplenish 30 min, Religion/ExhaustedTeleport 1 h).
- **Combat:** three different models in the docs —
  1. GDD §5.0 "이중 모드": player feels **real-time action (keyboard/mouse, requestAnimationFrame)**, server/AI uses event-queue turn sim (1 turn ≈ 2 s, <1 ms/battle) sharing formulas [V L1148–1199];
  2. CMB-0: **RTS auto-battle with command intervention** on a 200 ms tick (5 ticks/s, 1×–3×), plus "빠른 시뮬" = server computes whole battle at once and client replays (1×–10×) [V Consolidated_Combat L280–300, L460–475];
  3. G-01 sieges: hundreds–thousands of units, RTS squad orders, dedicated Worker-Threads tick engine at 1 s normal / 2–5 s under load ("time dilation") [V Consolidated_World L70–135].
- **Client-authoritative simulation:** NPC-4 moves online minions/gathering into the client rAF loop with server fallback when offline (MinionOnlineGuard) — a deliberate load-shedding choice with cheat implications [V Consolidated_NPC_AI L797+; server.js L806–824].
- Game clock: "실시간 1시간 = 게임 24시간" (Map/GameTimeService) vs "게임 내 1일(실시간 24시간)" for economy indicators (ECO-6) — conflicting [V].

### B4. Multiplayer shape
- Persistent shared world with player economy, chat (global/faction/whisper), parties (max 5 units), guilds/houses, faction diplomacy, wars and sieges, world bosses, cross-player trading (exchange with call auction, auctions, 1:1 trade, black market in lite P20) [V GDD, CMB-2, G-01, Phase 9 OBT, TERRA_LITE_PLAN].
- NPC factions: 7 absolute city-states + 3 free (wanderer/warlord) factions, GM-created [V GDD §9.1; CMB-2 §2.1].
- **Players per world/server, shards, server merges, seasons: not specified anywhere** [V by grep]. Only hints: "랭킹: 서버별 최고 도달 층수" (implies multiple servers) [V CMB-1 L732]; stress test target "동접 1,000명 이상" [V PROJECT_CHECKLIST L83]. GDD §11 plans PostgreSQL + MongoDB "polyglot" [V].
- Who creates factions conflicts (see B8).

### B5. World scale
- Vision: "끝없이 넓은 지구", "현실 지구 지형 기반 맵 (OSM + HGT 고도)" listed as **core differentiator** [V GDD §1, §2.1, §8.2 (19 terrain types from OSM tags + elevation bands)].
- Implementation reality: procedural Pixi world (default 256×256, up to 1024×512), 150×150 local map per tile, OSM pipeline removed/paused [V code + CLAUDE.md].
- Creature catalog: 72 families, 350+ species, 5 mutation axes [V GDD §10]; settlements ~50/200/500 population tiers [V GDD L461]; dungeons procedural, infinite floors [V CMB-1].

### B6. Economy complexity (very high) [V Consolidated_Economy.md]
- 4-axis money (ECO-1 v3.1): ① per-faction city/national fiat currencies (`FAC_XXXX`) issued by each faction's central bank, ② equity/shares, ③ Terra Coin (cash), ④ finite gold/silver (mined, "digital gold standard").
- Central bank + forex bank + 3-tier vaults; call-auction matching engine (HTS), auctions, barter, dynamic NPC procurement prices; logistics with 5 transport tiers, spoilage, insurance, escorts; city GDP/CPI/tax (property, transaction, tariffs; Laffer curve); city stocks (1 share = 1 vote, dividends, 51% hostile takeover), bonds, planned futures with margin calls (ECO-10, "after economy stabilises"); ECO-8 stock/FX valuation formulas; NPC AI participates in all of it (CentralBankAI, NpcMarketAI, NpcAuctionAI, NpcInvestAI…). Unit-level private property & wallets for humans (2026-10-18 update).

### B7. Monetization, accounts, launch
- Premium currency **Terra Coin** modelled on EVE PLEX: cash → Terra Coin → cash items; no direct Terra Coin↔game-money exchange; no combat-power items (anti-P2W); RMT monitoring [V ECO-1 axis 3, L318–345]. BM hooks: energy drinks, sauna/rest passes, durability restore, skill-stone destruction protection, gene grafting [V Consolidated_GDD, BLD-2, Item, Character].
- Accounts: 1 cyborg per account mandatory [V CHR-1]; JWT auth shared by both clients; no OAuth/social-login/identity-verification spec [V by grep].
- Launch: PROJECT_CHECKLIST — PG payment integration, ToS/privacy, CS admin, anti-cheat/macro, packet tamper protection all **unchecked**; "premium shop schema" checked [V]. Operations/Analysis contains Phase 7 CBT checklist (all ✅), Phase 8 CBT feedback system, Phase 9 OBT (world boss + premium currency), Phase 11 1.0 release packaging [V]. No dated launch target, no CCU target beyond the 1,000-CCU stress-test item [V].

### B8. Contradictions / instability in the spec [V each]
1. **Active re-specification:** Consolidated_GDD (2026-10-18) restarts the design top-down ("추측 및 임의 완성 금지"); Steps 4–7 (commerce, production, governance, military) are in progress/waiting, while older ECO/CMB/CHR docs mark the same areas "✅ 확정".
2. **Map tech & scale:** GDD Leaflet real-Earth 1st map vs code PixiJS procedural; 2nd map 30×30 (WLD-1) vs 90×90 (pixi doc) vs 150×150 (code); 2nd map "PixiJS isometric" (GDD) vs Three.js 3D (code).
3. **Combat model:** real-time action w/ keyboard (GDD §5.0) vs RTS auto-battle + commands, auto-sim default (CMB-0).
4. **Tier system:** ECO-2 "고정 티어(T1~T5)는 존재하지 않음 … NPC 고정가 없음" vs ITM-10 T0–T9 resource tiers and GDD §14 "T0~T9 티어 표준화 완료"; also NPC price fallback / dynamic procurement prices exist.
5. **Progression:** WLD-3 "EXP/레벨업 지양, 탐험·마일스톤 성장" vs EXP/level-up throughout CHR/CMB/GDD (and LevelEngine, exp_table in code).
6. **Premium currencies:** ECO-1 single cash axis (Terra Coin; "기존 4종(금화/프리미엄/토큰/자원) 폐기") vs ITM-1 Terra Coin + Luna Coin + Stella Coin.
7. **Item taxonomy:** GDD §6.1 "7카테고리 (91종)" vs GDD §12.1/CLAUDE.md/ARCHITECTURE "14대분류" vs ITM-2 three-level RESOURCE/… taxonomy.
8. **Faction creation:** CMB-2 "플레이어는 세력을 생성하지 않음 (NPC 세력은 GM 생성)" vs IDEA "처음 세력을 형성시 유저 독재 세력", G-01 player guild/houses, GDD timeline "국가 형성" by players.
9. **Time scale:** 1 real hour = 24 game hours (Map) vs game day = 24 real hours (ECO-6).
10. **Tone/art:** semi-realistic dark-ish 3D creatures vs 2026-10-18 pastel Japanese cozy hub pillar.
11. **NPC brain:** 9-axis/10-strategy (ARCHITECTURE) vs 11-axis (NPC-1).
12. **Status claims:** TASKFORCE 100% everywhere vs PROJECT_CHECKLIST 20–25% vs GDD §14 "player loop ~15%" (2026-04-25).
13. GDD internal versioning: header v3.2 (2026-04-25), §1.1 edited 2026-10-18, CLAUDE.md calls it v3.0; GDD cross-refs point at pre-consolidation paths (`docs/Character/StatDecisions.md`, `docs/MAP_SYSTEM.md`, `docs/CreatureAlbum.md`).

---

## Part C — Agent tooling clutter [V unless noted]

| Path | What it is | Size | Project-specific? |
|---|---|---|---|
| `.agents/` (219 dirs, 1,072 tracked files, 7.1 MB) | Run artifacts from **Google Antigravity's "teamwork_preview" multi-agent mode** (archetypes: teamwork_preview_orchestrator/explorer/worker/reviewer/auditor/challenger, victory_auditor, forensic_auditor, reviewer_critic, sentinel …). Each folder has `original_prompt.md`, `BRIEFING.md`, `progress.md`, `handoff.md` (~210 each) + misc scratch (10 .js, 8 .py, 6 .tsx, 5 .patch, 3 .ps1, 14 .txt). Timestamps 2026-05-27 → 2026-06-02; Windows paths `D:\작업실\VS code\AntiGravt01`. Nothing in code references them. | 7.1 MB | Project-generated, but **disposable logs** (the auditor_*/challenger_*/explorer_*/orchestrator_health_scan_* folders). |
| `.agents/rules/rule1.md`, `code1.md` | Antigravity always-on rules (see Part A). rule1 = real project conventions; code1 = openskills/YOLO auto-run. | 53 / 16 lines | rule1 project-specific (keep, update); code1 generic/harmful [A]. |
| `.agents/workflows/benchmarking.md` | Antigravity workflow for writing benchmark docs + Notion pages. | 5 KB | Project-specific, stale path. |
| `` `.agents/` `` (backtick dir) | Accidental path; 1 file. | — | Junk. |
| `.antigravitycli/` | Two tracked **dangling symlinks** → `/Users/[USER]/.gemini/config/projects/<uuid>.json` (owner's Mac, Gemini/Antigravity CLI project config). | 2 links | Machine-local; should not be tracked. |
| `.claude/agents/` | 3 Claude Code subagents: `db-schema-guardian.md` (304 lines), `task-planner.md` (235), `project-architect.md` (162). | ~50 KB | **Project-specific (written for this game)** but stale: db-schema-guardian enforces *SQLite/better-sqlite3 sync-only* rules ("비동기 쿼리 패턴 사용 금지") — the opposite of current PG async code; task-planner calls the stack "Next.js + Express + SQLite"; project-architect is generic with a Windows memory path. |
| `.claude/agent-memory/task-planner/` | 4 files (MEMORY.md + 3 notes dated 2026-05-14/15). MEMORY.md indexes 5 notes; 2 (`project_npc_ai_bugs.md`, `project_theme_system.md`) are missing. | small | Project-specific, stale. |
| `.claude/settings.local.json` (tracked) | Accumulated permission allowlist from Windows/Mac sessions; **contains plaintext DB credentials for the public NAS host** (psql URLs/PGPASSWORD). docker-compose.yml also has default PG password / JWT secret fallbacks. | 4 KB | Should be untracked; credentials should be rotated [A]. |
| `AGENTS.md` | openskills-generated `<skills_system>` index: **1,322 skills**, 7,960 lines, 343 KB, 2026-06-07. Lists `build` (no folder); 10 folders not listed (claude-code-expert, claude-in-chrome-troubleshooting, claude-settings-audit, diary, molykit, notebooklm, project-skill-audit, skill-creator, slack-gif-creator, using-git-worktrees) + the 2 new grill skills. No project content. | 343 KB | Third-party index. |
| `.claude/skills/` | **1,333 folders** (1,331 excluding `grill-me`, `grilling`), ~5,484 files, 75 MB (loki-mode alone 11 MB / 1,100 files). Every one of the 1,331 has `.openskills.json` with `source: sickn33/antigravity-awesome-skills` (https://github.com/sickn33/antigravity-awesome-skills), **all installedAt 2026-03-30**. Subpaths: `plugins/antigravity-awesome-skills/skills` (1,251), `plugins/antigravity-awesome-skills-claude/skills` (62), `plugins/antigravity-bundle-indie-game-dev/skills` (3: 2d-games, 3d-games, game-design), top-level `skills/` (~15). Grep for Terra/AntiGravt/사이보그/미니언/terra-server across all skill .md files: **0 hits**. Only git change since import: deletion of `windows-privilege-escalation` (2026-10-18). Some contain nested `CLAUDE.md`/`AGENTS.md` (dbos-*, loki-mode, react-best-practices, postgres-best-practices); 642 .py/.sh scripts. Domains include Azure/Odoo/n8n SDKs, Brazilian legal/auction skills, health analyzers, SEO, pentest/red-team. All auto-surface in every Claude Code session's skill list (visible in this session). | 75 MB | **0 project-specific skills; 100 % bulk third-party pack.** |
| `.claude/skills/grill-me`, `grilling` | Installed on purpose 2026-10-27 (Matt Pocock); excluded from counts per instructions. | — | — |
| Related scripts | `scripts/update_docs.py`, `update_logs.py`, `cleanup_taskforce.py`, `restructure_docs.py` (hard-coded `d:\작업실\…`), `.agents/scratch/*.ps1/.py` — automation that rewrote TASKFORCE/changelog. | — | Project-specific doc-churn tooling. |

### Summary judgement [A]
- Keep: `docs/GDD/**`, `docs/Projects/terra_in_cognita/Game_Design_Document.md`, `docs/Projects/terra-lite/TERRA_LITE_PLAN.md`, BLD archive specs, benchmarks (as design reference), `.agents/rules/rule1.md` intent (rewritten), the three `.claude/agents` (rewritten for PG/current layout) if subagents are still wanted.
- Rewrite from code (living): ARCHITECTURE.md, DATABASE_SCHEMA.md (or generate from schema.js), CLAUDE.md, README.md, a real task list replacing TASKFORCE/PROJECT_PROBLEMS, a single readiness checklist.
- Archive/delete candidates: `.agents/*` run folders, `.antigravitycli/`, backtick dir, AGENTS.md, `.claude/skills/*` (1,331 third-party), `.claude/settings.local.json` (untrack), corrupted changelog archives, TASKFORCE_ARCHIVE, PROJECT_PROBLEMS, current_tree.txt.
- Recover if possible from the owner's Notion/original machine: REL-1 Religion spec (corrupted since import).
