> 조사 보고서 원본 (작성: Claude Code 조사 에이전트, 2026-10-28). 기존 프로젝트(AntiGravt01) 기준 내용이며, 비밀번호 등 민감 문자열은 [REDACTED]로 바꿨다. 결론은 `docs/PLAN.md`에 반영되어 있다.

# Independent review: Terra In-Cognita reboot plan

- **Reviewed:** 2026-10-28
- **Input:** `plan_under_review.md` (Korean, 69 lines, sections A–L)
- **Reviewer lens:** online game backend, browser 3D on mobile, DevOps for a team of one
- **Evidence legend:** **[V]** means verified, with the source given ("repo" means files I read in `/home/user/AntiGravt01` or `/home/user/terra-in-cognita` during this review). **[A]** means assumed, reasoned, computed, or recalled without fetching a source.
- **Sandbox limits:** some hosts were blocked here (s2geometry.io, nginx.org, postgresql.org, docs.azure.cn). Where I relied on a search-result excerpt of a page instead of the page itself, I say so.
- **Out of scope:** version numbers were not re-checked, as instructed.

---

## 0. Bottom line

The plan has good instincts:
- server authority
- integer money with a double-entry ledger
- event-scheduled movement ("path + departure time")
- server-side generation with immutable cached tiles
- data-driven balance
- an explicit fallback for seamless 2nd-map streaming

The problems are structural:

1. **It decides too much too early and too little where it counts.** It fixes gameplay-level numbers (1:12 Earth, 512 cells per face, 150×150 × 10 m, 200 ms ticks) while the GDD is unstable. Meanwhile it leaves the true **one-way doors** undefined: the grid/scale contract, the simulation's durability model, time authority, content/generator versioning, and the process topology.
2. **It re-imports failure modes from the old project.** Watchtower-driven deploys already caused config drift and an outage on 2026-10-26 [V repo report]. A single shared log file grew to roughly 1.1 MB including its archive [V repo]. Nothing mechanically stops the next god-file: the old code has files of 3,300–4,800 lines [V repo].
3. **It adds a new contradiction.** It starts the globe on three-globe, which works in lat/lng, while the map design is a cube-sphere quadtree. Lat/lng grids were named as one of the causes of the last failure.
4. **Milestone 1 is six subsystem-sized builds,** with no time-boxes, no device matrix and no pass/fail rules. For one developer that means six or more months before anything playable exists, which is exactly how the last attempt ended.

**Recommendation:**
- A 2–3 week **M0** that settles ops and the one-way doors.
- Then three **time-boxed spikes**, each with written kill/keep criteria:
  1. 2nd map on real phones
  2. cube-sphere LOD globe
  3. 100k-entity server with crash recovery
- Defer battle fast-forward, the market feed and most of the editor until the GDD stabilizes.

---

## 1. Top 25 findings, ranked by severity

| # | Sev | Finding | Key evidence |
|---|---|---|---|
| 1 | critical | Milestone 1 (J) is six subsystem builds with no time-box, pass/fail or device matrix | Plan J1–J6; the plan's own background names "구조 붕괴" (structural collapse) of the old project |
| 2 | critical | Grid/scale contract is inconsistent: S2 cells are not uniform, 150 is not a power of two, cube corners, planet size TBD | S2 level-9 sampled edges 14–20 km on Earth [V Azure docs, via search excerpt]; area ratio ≈2.08 [A] |
| 3 | critical | No durability or crash-recovery model for in-memory simulation; deploys and crashes lose or fork the world | Plan D "활성 데이터만 메모리" plus watchtower restarts |
| 4 | high | Multi-process roles with no transport (PG only); "stateless api" vs stateful WebSockets; scale target vs priority order | NOTIFY payload <8000 B [V PG docs excerpt]; commit-time global lock [V DBOS] |
| 5 | high | Deterministic client replay won't hold across JS engines or PWA versions, leaks hidden state and seed, and client timestamps invite backdating | Math.* is implementation-approximated; Node and Chrome differ [V esdiscuss, Codeberg bounce#8] |
| 6 | high | Deploy pipeline repeats the 2026-10-26 incident; watchtower is archived and unscoped on the shared NAS | Archived 2025-12-17 [V linuxiac]; watches all containers by default [V containrrr docs]; compose [V repo] |
| 7 | high | Secrets and exposure: default DB password and JWT fallbacks in compose, JWT shared prod/test, rotation deferred, raw ports public | [V repo compose + 2026-10-26 report] |
| 8 | high | No backup/restore; postgres:18 moved PGDATA/VOLUME, so the old mount style silently uses an anonymous volume | [V Docker Hub postgres; Docker forum] |
| 9 | high | No edge design: PWA needs HTTPS for phone tests; WS via proxy; single origin for cookies; proxy idle timeouts | Prior ERR_SSL_PROTOCOL_ERROR [V repo TASKFORCE]; nginx 60 s default [A] |
| 10 | high | World data has no versioning (generator + content); procedural detail re-derived from code moves terrain under buildings | Plan F/G; past "서버·클라 생성기 불일치" |
| 11 | high | three-globe contradicts the cube-sphere LOD design; float precision and depth need a custom renderer anyway | three-globe is lat/lng, equirectangular, slippy x/y/zoom tiles [V README] |
| 12 | high | Matching engine and ledger: in-memory book + same-transaction ledger + NAS fsync; balances written by many systems; no role owns markets | Plan E/D |
| 13 | high | Session protocol missing: version skew (PWA), clock sync, resume after iOS background, tRPC vs WS ordering | Plan C/D/E |
| 14 | high | NAS is unknown, shared with live prod, and has an old kernel; load tests there are both harmful and invalid | Node 26: glibc kernel ≥4.18, musl ≥6.12 [V BUILDING.md]; DSM 7.0 kernel 4.4.180 [V]; Docker 24.0.2 [V] |
| 15 | high | No observability or measurement harness, although J's deliverable is "measurement reports" | Plan J |
| 16 | high | Mobile GPU/memory budgets undefined; iOS kills tabs with no JS-visible OOM; context loss on background | [V WebKit 300782; three.js forum; Apple forums 737042/743454] |
| 17 | high | Admin "script console" is RCE by design; admin shares the player origin; import vectors; no RBAC/audit design | Plan G |
| 18 | high | Agent-workflow rules (single WORKLOG, NNNN ADRs, per-commit hooks, package.json→ADR) will conflict and get bypassed; release-please is blocked | Old changelog 221 KB + 902 KB archive [V repo]; GITHUB_TOKEN PR runs need approval [V GitHub docs] |
| 19 | high | Module boundaries and file size are not mechanically enforced | Old files up to 4,765 lines [V repo] |
| 20 | medium | Interest management ≠ visibility: map-hack, destination leaks via paths, slow-consumer memory, 100 MiB WS frames | ws default maxPayload 100 MiB, passed through by @fastify/websocket [V ws docs, fastify-websocket index.js] |
| 21 | medium | Movement-as-events makes encounters, interception and planet-scale pathfinding a spatiotemporal problem the plan doesn't address | Plan D/F |
| 22 | medium | Simulation-LOD and offline-formula resolution diverge from full sim (exploits); lazy settlement breaks in a shared world | Plan D |
| 23 | medium | 64-bit S2 IDs vs JS numbers: BigInt is slow and not JSON-safe; pg int8 arrives as a string; Drizzle `mode:'number'` truncates | s2js uses BigInt for 64-bit IDs [V s2js README] |
| 24 | medium | Perf criteria are unmeasurable as written: iOS Low Power Mode caps rAF at 30 fps, thermal throttling, latency measurement point unspecified | [V WebKit 215745] |
| 25 | medium | Fresh-major stack vs agents' training data; TS 7 has no compiler API; Drizzle 0.45→1.0 is planned rework | [V TS devblog/InfoQ; orm.drizzle.team upgrade-v1] |

Further medium and low findings are in §10.

---

## 2. Internal contradictions

| # | Statement A | Statement B | Why they collide | Resolution |
|---|---|---|---|---|
| C1 | D: roles api(무상태) / world sim / combat instance (교전 시 전용 프로세스) / NPC AI / background | C: "PostgreSQL 18 단일(Redis 없음)", event bus "추후 교체" | Real-time cross-process traffic (sim→gateway→clients, api→market owner) has no transport. LISTEN/NOTIFY payloads must be <8000 B [V PG docs excerpt], and NOTIFY commits serialize on a global lock [V DBOS]. WS gateways hold sockets, so "stateless api" is false for WS. | One process (modular monolith) plus worker_threads now; bus interface with stated semantics; NATS only when there is a second machine. |
| C2 | B: priority "개발·유지보수 > 운영 안정성 > 런타임 성능 > 확장성" | B: "구조 목표 동시접속 1만 + 자율 유닛 10만 이상 (지역별 서버 분할)"; J3 "유닛 10만" | Regional sharding is the most expensive kind of code to write and maintain (handoff, cross-region battles, unified market). It serves priority #4 at the cost of priority #1, and one home NAS can't validate 10k CCU anyway. | Staged targets (e.g. 200 CCU / 10k units on the NAS, then 2k / 50k on a VPS). Keep "split-ready seams" (region-keyed state, message passing) without deploying multiple processes. |
| C3 | D: "기기는 같은 코드·시드로 재생" | ECMAScript Math.* is implementation-approximated [V]; C: PWA caching keeps old code; F: "숨김 정보는 서버만" | Replay diverges across engines and versions. Old cached clients run old sim code. Replaying requires shipping the enemy's full (hidden) state and the seed. | Server-authoritative event/keyframe stream; client interpolates (§3.3). |
| C4 | F: S2 cells, "최소 타일 평균 ~1.5km", "1칸 = 150×150칸 × 10m" | S2 cells vary ~2× in area within a level [A]; 150 ≠ 2^k; L: "행성별 크기" TBD | A fixed 10 m cell is impossible on non-uniform cells. A fixed cells-per-face plus a fixed metric size forces every planet to the same radius. Seams and corners (§4.1). | Grid ADR (§4.1): 2nd-map cells defined in each S2 cell's (u,v) space, N=128 (S2 level 16), gameplay in cell steps, planet size chosen as a face level. |
| C5 | C: "지구본 지표 레이어는 three-globe로 시작" | F: cube-sphere, Google-Earth LOD, "부모 먼저" | three-globe is lat/lng with an equirectangular globe image and a slippy-map x/y/zoom tile engine [V README]. That is the same lat/lng grid named as a past failure cause. | Custom per-face quadtree renderer from week 1 (§4.2). |
| C6 | F: "환경값 자체는 불변"; "버전 붙은 불변 URL" | G stage 2: 지형 조각/기후 보정; G: 초안→공개; F: 2nd-map detail is procedural | Publishing edits, or changing generator code, changes "immutable" environment data and every derived 2nd map. | Generator and content versions; materialize 2nd maps on first player touch (§4.3). |
| C7 | A: "기획 무관 플랫폼부터" | J3 battle fast-forward and offline settlement, J5 market feed, J6 rule-driven editor; F fixes design numbers | These need GDD decisions, so they are either throwaway or premature. | Infrastructure-only stubs (placeholder combat formula) or deferral (§9). |
| C8 | C: "Three.js 엔진 모듈(React와 분리, React는 UI/HUD)" | C: "Zustand 5(실시간 상태)" | Putting per-tick entity state in a React store recouples engine and UI and causes re-render/GC storms on phones. | Entity state in engine-owned typed arrays; Zustand gets throttled UI projections only. |
| C9 | I: "package.json 변경 시 ADR 필수" (hook + CI) | I: release-please (bumps `version` in package.json); any Renovate/Dependabot bump | Release PRs and dependency bumps fail the rule by construction. | Restrict the rule to new runtime dependencies; exempt bots and version fields. |
| C10 | I: "코드 변경 시 WORKLOG 변경 필수" (per commit) | I: "에이전트 1개 = 브랜치 1개 (worktree)" | Every parallel branch edits the same file at the same place, so every merge conflicts. | One fragment file per entry, or the log lives in the PR description (§7.1). |
| C11 | B: perf numbers are "출시 조건 아닌 테스트 기준" | No regression mechanism anywhere | Criteria that never gate anything decay silently. | Server perf budgets in CI; device runs per milestone with a recorded trend. |
| C12 | C: "GitHub Actions → GHCR → NAS(watchtower 활용)" | 2026-10-26 report: watchtower updates images only, compose ports/env drifted, test server went offline [V repo] | The plan reuses the mechanism that just failed. | Explicit, versioned deploy (§6.4). |
| C13 | D: "오프라인 행동… 결과는 공식으로 지연 정산" | D: deterministic combat / fast-forward; persistent shared world | Two resolution paths with different outcome distributions invite exploits (log off to get the better formula). Lazy settlement can't be lazy when others can observe or affect the units. | One resolution model per mechanic; settle on observation by anyone (§3.7). |
| C14 | E: "주문·체결·잔고를 같은 트랜잭션" | D: sim, NPC, salaries and crafting also change balances; no market owner role in D | Multiple writers to balances against an in-memory book, so double-spend or lock contention. | Escrow at order acceptance plus a single-writer sequencer per market (§3.8). |
| C15 | F: "이웃 2차맵과 이음매 없는 스트리밍" | Cube-sphere topology: axes rotate across face edges; at 8 corners only 3 cells meet | A 3×3 flat neighborhood doesn't exist at corners, and local frames rotate across faces. | Explicit face-edge transform table plus a corner rule (§4.1). |
| C16 | K: "NAS 비밀번호 교체(정식 직전)" | J: measure on the same NAS that hosts live prod; known defaults sit in repo history | Deferral leaves known credentials live through the riskiest phase (agents with repo access, new services, port changes). | Rotate now (§6.6). |
| C17 | A: "규칙·수치는 데이터로"; G: CSV/JSON 입출력, 초안→공개 | I: git-centric agent workflow | Three sources of truth: DB drafts, git data files, imported CSV. Replays need the exact content version. | One canonical content store with immutable published versions (§4.3). |
| C18 | G: "관리자: 같은 앱 통합" | B: mobile-first; security | A heavy editor in the mobile bundle graph, and admin sessions in the player origin, widen the XSS blast radius. | Separate entry and origin for admin/editor (§8.1). |

---

## 3. Game-server fundamentals

### 3.1 Durability and crash recovery (critical)

**What's missing.** "활성 데이터만 메모리" (only active data in memory), combat instances on 200 ms ticks, a matching engine and NPC AI all hold state in RAM. Nothing says what survives these events:
- a crash or OOM kill
- a DSM update reboot
- a watchtower restart, which happens on every push to `main` with the current pattern

In a persistent single-shard world this is the first thing to design, because retrofitting it is a rewrite.

**Recommended model**
- **The DB is the source of truth for every scheduled fact.** RAM is a rebuildable cache. Tables would include:
  - `unit_moves(unit_id, path_id, depart_at, speed, path)`
  - `battles(id, seed, sim_version, content_version, started_at, participants)`
  - `battle_inputs(battle_id, tick, actor, cmd)`
  - `market_orders(seq, ...)`
  - `scheduled_events(at, kind, ref)`
- The event-scheduled movement design already helps, because a unit's position is a function of a stored row.
- **Battles recover by re-simulation** from seed + inputs to "now". This only works if the server-side sim is bit-identical across the restart. That argues for integer/fixed-point combat math even on the server: a Node upgrade (new V8) may change `Math.sin` output [V Codeberg bounce#8, which shows Node vs Chrome V8 differences]. It also means pinning `sim_version` per battle and either draining battles before deploys or keeping the old sim version loadable.
- **Snapshots + command log** for in-memory aggregates such as AI blackboards, the order book and interest sets: a snapshot every 30–60 s plus a sequence-numbered command log. On boot, load the snapshot and replay the log tail.
- **Graceful drain on SIGTERM:**
  1. Stop accepting commands (return retry-after).
  2. Flush, snapshot, persist battle tick.
  3. Close sockets with WS close code 1012 ("service restart") so clients reconnect with backoff.
- **Chaos test in CI:** run a scripted scenario, `kill -9` the server mid-run, restart, and assert invariants: ledger balances to zero, no duplicated items, unit positions continuous, no orphaned battles.
- **Timer storage:** don't use pg-boss for per-unit arrival timers (100k rows polled). Keep an in-memory timer wheel or heap rebuilt from `scheduled_events` at boot [A].

### 3.2 Process topology, message bus, Node runtime (high)

- **The plan names five roles but no transport.** With PG only, the candidate is LISTEN/NOTIFY, which has two limits:
  - payload <8000 B by default [V PG docs, via search excerpt]
  - transactions that NOTIFY take a global exclusive lock at commit, serializing each other; DBOS reports ~2.9k naive writes/s before batching [V DBOS blog, vendor-reported]

  That rules it out for 200 ms combat fan-out and market feeds at scale.
- **"Combat instance (dedicated process at engagement)"** is ambiguous. If it literally means one OS process per battle, each Node process costs tens of MB RSS and around 100 ms startup [A]. With 100k autonomous units fighting while their owners are offline, that is untenable on an assumed 8 GB NAS [A; the old docs size PG for "RAM 8GB NAS", V repo DB_MIGRATION_POSTGRESQL.md].
- **WS gateways are stateful:** sockets, subscriptions, rate-limit counters. "api(무상태)" is only true for HTTP.
- **Node realities:**
  - A single event loop, and V8 major GCs on a heap of a few hundred MB can pause 50–200 ms [A]. That collides with 200 ms combat ticks and a 50 ms p95 order target if they share a heap.
  - Use `worker_threads` for combat batches, the matching engine and generation (separate heaps and GC).
  - Use typed arrays (SoA/ECS) for 100k units to keep the GC heap small.
  - Measure `monitorEventLoopDelay` and GC events from day 1.
- **Recommendation:**
  - Ship one game process (modules: gateway, api, sim, market, npc) plus a worker pool, and one background-jobs container (generation, aggregation) that talks only through the DB.
  - Put an in-process bus behind an interface, and write down per-topic semantics: at-most-once for ephemeral position deltas, at-least-once + idempotent for domain events.
  - For domain events, use a **transactional outbox**: an outbox row written in the same transaction as the state change, then relayed.
  - Keep region-keyed state with no cross-region object references so a later split is mechanical.

### 3.3 Combat determinism and intervention (high)

- **Divergence.** ECMA-262 leaves `sin/cos/tan/exp/log/pow/atan2` precision implementation-defined ("implementation-approximated"; fdlibm is only recommended) [V esdiscuss]. Real projects see different hashes even between Node and Chrome [V Codeberg bounce#8], and JSC (all iOS browsers) differs again [A]. Over hundreds of ticks with thresholds (hit/miss, death, retarget), tiny differences flip outcomes. Players then watch a replay that disagrees with the server's result.
- **Version skew.** The PWA keeps old sim code until the service worker updates (§3.9).
- **Information leak.** To replay, the client needs the full initial state of every combatant (including hidden enemy stats, loadouts and positions) and the seed. With the seed, a client can precompute every future RNG draw. With the code, it can search intervention options offline: a "battle solver" bot.
- **Backdating.** "유저 개입 명령은 시각과 함께 입력" (interventions carry a time): if the client chooses the time, players backdate interventions after seeing an outcome.
- **Recommendation (default):**
  - The server runs the battle and streams compact per-tick events or keyframes (damage, deaths, positions every N ticks) to observers; the client interpolates and plays effects.
  - Inputs are intents. The server assigns the application tick (≥ current tick + 1) and echoes it.
  - Bandwidth for a 200 ms auto-battle is small.
- **If lockstep replay is truly needed** (e.g. bandwidth for very large battles):
  - integer or fixed-point state (Q16.16 via `Math.imul`, `|0`)
  - your own trig and sqrt-free distance comparisons, or table-based trig
  - no `Math.random` or `Date` inside the sim
  - iterate by sorted entity id
  - `sim_version` and `content_version` gates
  - state hash every N ticks with keyframe resync on mismatch
  - RNG outcomes revealed per tick rather than the seed up front

### 3.4 Time authority and clock sync (high, folded into finding 13)

- **Clock sync.** Path + departure-time interpolation requires each client to know server time to within a frame or two. You need:
  - NTP-style offset estimation over WS (take the best few of N ping samples by RTT)
  - re-sync on `visibilitychange` and resume, since mobile timers stall in the background
  - all persisted times in server epoch ms (UTC)
- **Server clock.** Use `process.hrtime`/monotonic time for tick scheduling and wall clock only for persisted timestamps; NTP steps on the NAS shouldn't teleport units [A].
- **Rule: never accept a client timestamp as the effective time of any action** (movement start, intervention, order).

### 3.5 Movement events, encounters, planet-scale pathfinding (medium)

- **Encounters become a scheduling problem.** "크리쳐: 이동 중 조우" (creature encounters while moving), unit interception, vision reveals and area triggers can't be checked by polling positions when positions are computed lazily.
  - Precompute per-cell entry times along each path when it is set.
  - Roll encounters with a seeded RNG keyed by `(unitId, cellId, entryTick, content_version)` so results are reproducible and auditable.
  - Push resulting events into the time-ordered queue.
  - Invalidate and recompute on path change. Interception between two moving units needs a spatial-temporal index (per-cell occupancy intervals) [A].
- **Scale.** One planet has 1.57M primary cells (6×512²) × 22,500 detail cells, about 35 billion detail cells [A computed]. Detail maps are generated lazily.
  - Coarse A* on the primary grid for every unit.
  - Fine paths only inside materialized 2nd maps, and only for simulation-detail levels 1–2 (near or observed).
  - Portal graphs (HPA*) per materialized 2nd map.
  - Client "경로 제안" (path proposals) are validated, not recomputed: continuity, passability, server-computed durations.
- **Cube-sphere specifics.** Neighbor lookup across face edges needs an orientation transform. Paths must handle the 8 corner cells (§4.1). Put this in one tested module (exhaustive neighbor tests).

### 3.6 Interest management (medium; security aspects in §8.4)

- **Area of interest ≠ visibility.** Sending all units within a radius gives map-hacks to anyone reading the WS stream. Filter by the player's vision on the server.
- **Paths leak intent.** Sending an enemy unit's full path reveals its destination. Send only the visible portion plus a short horizon.
- **Cost model.** Subscriptions keyed by cell at one or two levels (primary cell and 2nd-map chunk) make fan-out a hash lookup. Event-scheduled movement makes updates sparse, because only path changes are sent. Budget in bytes/s per client on mobile networks.
- **Backpressure.**
  - Cap per-socket `bufferedAmount`.
  - Coalesce or drop superseded deltas for slow consumers.
  - Set `maxPayload` to ~64 KB. ws defaults to 100 MiB [V ws docs], and `@fastify/websocket` passes options straight through [V fastify-websocket index.js].

### 3.7 Simulation LOD and offline settlement (medium)

- **Consistency across levels.** Four detail levels (near / observed / unobserved / offline) plus "formula" settlement create several ways to compute the same thing. If expected outcomes differ, players will discover which one is favorable (log off before a fight, avoid observing, and so on).
  - Pick a single resolution function per mechanic, with matching expected values across levels. Either the formula is truth and the detailed sim is presentation, or the reverse.
  - Add a statistical test comparing levels.
- **Lazy settlement in a shared world.** It is only safe for state nobody else can observe or affect. In a single-shard world, an offline player's mining units deplete shared nodes and can be attacked, so settlement must happen **on observation by anyone** (or on a schedule), not just on the owner's next login.
- **Transitions.** Define what materializes when a unit moves from "unobserved" to "observed": position along the path, HP, cargo. Make it a pure function of stored rows.

### 3.8 Market, ledger, balances (high)

- **Escrow at acceptance.** In one transaction, validate the order, move funds or items into an escrow ledger account, and insert the order with a per-market sequence. The engine then never checks live balances, and other systems (salaries, crafting, loot, NPCs) can write balances without racing the book.
- **Single-writer sequencer per market** (in a worker). It matches in memory, persists each batch of fills as ledger entries in one transaction (**group commit**, ~2–5 ms windows, to amortize fsync on NAS disks), then publishes from an outbox after commit. Never publish before commit.
- **Recovery and idempotency.** Rebuild the book at boot from open orders ordered by seq. Use client-supplied idempotency keys on place and cancel.
- **Measure commit latency on the NAS** (`pg_test_fsync`) before promising "주문 응답 50ms p95". Use `synchronous_commit = off` per transaction for non-financial writes such as telemetry, chat and positions, to keep the fsync budget for the ledger [A].
- **Missing role.** D has no "market" role. Name the owner.

### 3.9 Session protocol: versions, reconnect, ordering (high)

- **Handshake** on WS connect carries `{protocolVersion, buildId, simVersion, contentVersion}`. The server answers OK, or `update_required(minVersion)`. The client then triggers a service-worker update and reload (vite-plugin-pwa "prompt" flow with forced reload for incompatible protocol) [A].
- **Server supports N-1** protocol for one deploy cycle, with expand/contract for messages just as for DB columns.
- **One game version.** Per-app SemVer tags (I) are fine for changelogs, but compatibility should key on the protocol version, not on two independent app versions.
- **Resume.** iOS suspends sockets when the app is backgrounded, and networks switch between Wi-Fi and LTE.
  - Every subscription stream carries sequence numbers.
  - The server keeps a short ring buffer (30–60 s) for resume; beyond that, it sends a snapshot.
  - The plan only specifies this for market data (E).
- **Ordering.** Game commands over HTTP (tRPC) and state over WS race each other. Send game commands over WS with ids and acks, and keep tRPC for CRUD, account and admin.

### 3.10 IDs and 64-bit integers (medium)

- **The problem.** S2 cell IDs are 64-bit, and s2js uses BigInt for full 64-bit cell IDs [V s2js README].
  - BigInt arithmetic is far slower than number arithmetic in hot loops (meshing, pathfinding, aggregation over 1.57M cells) [A].
  - `JSON.stringify` throws on BigInt [A].
  - node-postgres returns int8 as a string [A].
  - Drizzle `bigint({mode:'number'})` silently loses precision above 2^53 [A].
  - The same applies to money totals.
- **Fix:**
  - Internal keys packed into < 2^53 bits: face (3) + level (5) + i (16) + j (16) = 40 bits [A computed]. 2nd-map cells are `(primaryKey, x, y)` with x, y < 128.
  - Use s2js only at the edges (lat/lng conversion, geometry utilities).
  - Store packed keys as int8 (safe in `mode:'number'`).
  - Store money in int8 with `mode:'bigint'` or a guarded number type.
  - Add a lint rule that forbids `mode:'number'` on money columns.

---

## 4. Map and planet pipeline

### 4.1 Proposed grid/scale ADR (critical, settle before any persistent data)

**Facts and arithmetic**
- Planet: Earth/12 gives R ≈ 530.9 km and area ≈ 3.54M km². With 6 × 512² = 1,572,864 cells, the average cell is 2.25 km², about a 1.50 km edge. The plan's arithmetic is right **on average** [A computed].
- S2 (quadratic projection) cells are not uniform. The max/min area ratio within a level is ≈2.08 and the edge ratio ≈1.8 [A, recalled from S2's s2coords.h projection table; s2geometry.io was blocked here]. Azure's S2 table lists sampled level-9 edges of 14–20 km on Earth [V, via search excerpt of the Azure Data Explorer `geo_point_to_s2cell` docs]. On a 1:12 planet that is roughly **1.17–1.67 km per primary cell edge**.
- So a "150 × 150 × 10 m" 2nd map is really 150 × 150 cells of about **7.8–11.1 m**, and they are sheared (aspect up to ~1.44) [A].
- **150 is not a power of two.** 2nd-map cells can't be S2 descendants, LOD and mip aggregation don't align, and you get two addressing schemes.
- **Planet size.** L leaves "행성별 크기" (per-planet size) to the design session, but fixing 512 cells per face **and** 150 × 10 m per cell pins every planet at ~531 km. Any other radius breaks the 2nd-map contract unless the meters per cell or the number of levels varies.
- **Face edges and corners.** Local (u,v) axes rotate across face edges, and the quadratic projection's cell size has a kink there. At the 8 cube corners only 3 primary cells meet, so the flat 3×3 neighborhood used for seamless streaming doesn't exist. With S2's fixed orientation the corners sit at ±35.26° latitude, ±45°/±135° longitude. On Earth two of them fall on land, near 35.3°N 45°E (northern Iraq) and 35.3°N 135°E (Hyōgo, Japan) [A computed]. s2js can't rotate the cube.

**Decision to record**
1. **2nd-map cells live in the parent cell's (u,v) space:** exactly N×N per primary cell, with N = **128** (= S2 level 9+7 = level 16; nominal 11.7 m, actual ≈9–13 m). If finer is needed, N = 256 (level 17, ~5.9 m nominal) at 4× the cell count. Neighbors share edge subdivisions, so seams match by construction.
2. **Gameplay distances, speeds and ranges are in cell steps,** with a nominal meter label. Geometric distortion (≈±30%) is accepted and rendered, not simulated. This finally resolves the "타일-미터 스케일 미확정" (undetermined tile-to-meter scale) root cause.
3. **Planet size is chosen as a face level** (e.g. level 8 / 9 / 10 gives R ≈ 265 / 531 / 1,062 km for the same cell size), not in km.
4. **Corner rule:** generated planets place impassable or ocean terrain at the 8 corners. For Earth, accept a non-seamless corner (individual entry) at those two land points, or use your own cube-sphere (e.g. tangent/equi-angular mapping, area ratio ~1.41 [A]) with a rotation that puts all corners at sea. The latter is an argument for "S2-like" addressing over literal s2js.
5. **A face-edge orientation transform table,** exhaustively unit-tested.

### 4.2 Renderer (high)

- **Drop three-globe for the main globe.** It works in latitude/longitude, takes an equirectangular globe image, and its tile engine takes slippy-map `x, y, l` URLs [V three-globe README]. Standard slippy tiles are Web Mercator, which can't reach the poles beyond ~85° [A]. None of that maps onto per-face quadtree LOD with parent-first loading and a fixed tile count per screen. Using it as the "start" means building overlay layers on lat/lng and then rewriting them. It may also lag three r186 in peer ranges [A].
- **Build a minimal per-face quadtree tile renderer in `packages/engine`:**
  - parent-first loading
  - screen-space-error selection with a cap on tiles per screen
  - skirts or edge stitching to hide LOD cracks
  - cross-face neighbor lookups via the §4.1 transform table
- **Float precision.** float32 at r = 531 km has a spacing of 2^-4 = 0.0625 m [A computed: 2^19 ≤ 531,000 < 2^20]. Planet-centered vertex positions jitter at close zoom.
  - Use camera-relative (RTC) rendering: per-tile origin computed in float64 on the CPU, offsets in float32.
  - Render 2nd maps in a local ENU frame.
- **Depth range.** Orbit-to-ground in one scene needs a logarithmic depth buffer (it writes `gl_FragDepth`, which defeats early-Z on tile-based mobile GPUs [A]) or reversed-Z (needs clip-control support [A]). Simplest: separate scenes per scale (globe ↔ 2nd map) with a transition, which the plan's two-map design already allows.
- **Decide the shader-authoring path now.** Either GLSL with `WebGLRenderer`, or TSL with `WebGPURenderer` and its WebGL2 fallback. Terrain and instancing shaders are the bulk of render work, and "WebGPU after measurement" means rewriting GLSL later otherwise [A].

### 4.3 Generator and content versioning (high)

- **Procedural detail is re-derived.** 2nd-map detail is regenerated from seed + generator code, and the cache is treated as disposable. Any change silently moves rivers, forests and coastlines under existing player buildings:
  - an agent refactor
  - a FastNoiseLite tweak
  - a dependency bump
  - changing `Math.cos(lat)` to a different formula
  - running the generator on a different JS engine

  The previous project failed on generator mismatch ("서버·클라 생성기 불일치").
- **Required:**
  - `generator_version` and `content_version` on every planet and 2nd map.
  - Golden-hash tests: fixed seeds, outputs hashed per `generator_version`, enforced in CI so agents can't change world output without bumping the version.
  - **Materialize** (persist) a 2nd map the first time anything player-relevant touches it; afterwards it is data, not code output.
  - Old generator versions remain loadable, or every un-materialized map is migrated deliberately.
- **Editor publishing.** "환경값 불변" (environment immutable) must read "immutable per published version". Stage-2 sculpting creates a new version with an explicit migration for owned regions (the plan's operator approval is the right hook).
- **Rules-as-data needs a content pipeline.**
  - One canonical store (DB) with immutable published versions, exported to git as JSON for diff and review.
  - Runtime pins a `content_version`; battles and settlements record which version they used.
  - CSV/JSON imports land in drafts only.
  - Prefer numbers as data and rules as typed code registered by id. Data-only rule DSLs become an untyped inner platform that agents handle poorly [A].

### 4.4 Caching and tile versions (medium)

- **Base vs overlay.** Separate an immutable **base** (generated environment tiles, versioned URLs, cache forever) from a small mutable **overlay** (land-cover changes from logging and construction, ownership). Overlays arrive as seq-numbered deltas over WS, or as small per-parent version vectors.
- **Don't re-bake base tiles** and all five ancestor levels on every tree felled. With "상위 단계는 하위 4칸 집계" (each upper level aggregates its 4 children), one action touches 5+ cached objects.
- **Binary formats** (typed arrays + Brotli) for tile and map payloads from day 1, not JSON [A].
- **CDN.** Home-upstream bandwidth is the ceiling. Fronting immutable tile URLs with a CDN (Cloudflare caches them for free) offloads the NAS [A].

### 4.5 Editor (medium)

- **Preview vs bake.** A "지구본 실시간 미리보기" (real-time globe preview) on sliders can't run plate tectonics + erosion + drainage + climate at 512 per face per drag. Erosion and drainage are resolution-dependent, so a low-res preview will not look like the high-res bake.
  - Preview with the same package at reduced resolution, clearly labeled "approximate".
  - Do the authoritative bake server-side, with an A/B diff view (the plan already wants A/B comparison).
- **Separate app.** Keep the editor a separate desktop-only entry or app (`apps/editor`) sharing packages. Brush/lasso planet editing isn't a mobile feature, and separation keeps admin code and dependencies out of the player bundle graph and origin (§8.1).

---

## 5. Mobile web 3D realities

### 5.1 Memory and GPU budgets (high)

- **iOS kills silently.** iOS kills WebGL-heavy pages under memory pressure and reloads them in a loop until "A problem repeatedly occurred". No OOM error reaches JS and no `webglcontextlost` fires first [V WebKit bug 300782]. You can't react at runtime, so you must budget.
- **Write budgets per device tier:**
  - texture MB, geometry MB
  - draw calls, instance counts
  - JS heap, worker heaps
  - a target of ≤ ~400–500 MB total on 3–4 GB iPhones [A]
- **Textures:** KTX2 + Basis Universal (transcoded to ASTC/ETC2/BC). Uncompressed RGBA8 costs 4 B/texel plus mips [A].
- **Resolution:** cap devicePixelRatio at ~1.5–2. iPhones report 3, which means 9× the pixels of DPR 1 [A].
- **One long-lived renderer and canvas** for the app's lifetime; switch scenes (globe / 2nd map / star system / previews) instead of recreating renderers per route. Safari memory grows when three.js scenes are repeatedly destroyed and rebuilt [V Apple Developer Forums 743454, via search]. React StrictMode double-mount creates extra contexts in dev [A].
- **Track `renderer.info.memory`** in the perf HUD.

### 5.2 Context loss and backgrounding (high, with 5.1)

- **Context loss is real.** WebGL contexts are lost when Safari or the PWA is backgrounded (iOS 17 regression; reports continue into 2025) [V three.js forum; Apple forums 737042].
- **Handle it:**
  - `preventDefault()` on `webglcontextlost`.
  - On restore, rebuild render targets, textures and geometry from CPU-side copies. Don't free `texture.image` or the source typed arrays after upload just to save memory, or restore fails.
  - Fall back to a reload with state resume.
- **Sockets** are suspended in the background too (§3.9).

### 5.3 Units and vegetation (high, with 5.1)

- **Units.** "유닛 1,000 표시" (1,000 units displayed) with `SkinnedMesh` means 1,000 draws plus bone uploads, which won't hold 30 fps on mid-tier phones [A]. Use `InstancedMesh` with vertex-animation textures (VAT), one draw per unit type, and billboards or impostors at distance.
- **Vegetation.** At one object per detail cell, a 3×3 neighborhood is ~150–200k instances. Use chunked culling, distance LOD and impostors. Load only rings within view distance, not the whole 4.5 km (or 3.8 km at N=128) 3×3 patch [A].

### 5.4 Performance criteria and the test protocol (medium)

- **30 fps is a ceiling.** iOS Low Power Mode caps `requestAnimationFrame` at 30 fps by design [V WebKit bug 215745]. "30fps 보장" (30 fps guaranteed) is therefore the ceiling on many users' phones, and any frame over 33.3 ms is a miss. Thermal throttling appears after minutes of sustained load [A].
- **Protocol:**
  - 3–4 reference devices: a 3–4 GB iPhone (SE 3 / 12-class), a mid-range Mali Android (Galaxy A5x-class), one high-end device, optionally a tablet [A].
  - Scripted scenes: fixed seed, fixed camera path, fixed unit counts.
  - 20-minute sustained runs, including one in Low Power Mode.
  - Report frame-time p50/p95/p99, memory, and battery %/hour.
- **Latency targets need a measurement point.** "주문 응답 50 ms p95" and "시세 반영 200 ms p95" end-to-end on LTE are dominated by RTT and proxy hops. Define a server-internal target (accept→ack ≤ 50 ms p95) and track client-observed latency separately [A].
- **Entry-time targets need conditions.** "2차맵 진입 1초" and "월드맵 3초" need warm vs cold cache, network profile and device tier.

### 5.5 Shader compilation and the 1-second entry (medium)

- **First-use shader compilation** (GLSL → ANGLE → Metal on iOS) can cost hundreds of ms per material [A]. Warm up with `renderer.compileAsync` during the loading screen and keep material variants few.
- **The 1-second entry** realistically requires pre-generated or cached 2nd maps, a binary payload, worker meshing and pre-warmed shaders. Generating on demand on the NAS will miss it.

### 5.6 iOS PWA specifics (low–medium)

- **Storage.** Cache Storage can be evicted under storage pressure. Call `navigator.storage.persist()` where supported and treat caches as re-downloadable [A].
- **Push.** Web Push on iOS only works for Home-Screen-installed web apps (iOS 16.4+) [A]. This matters for the "하루 1회 접속 유도" (once-a-day return) loop.
- **Service-worker navigation fallback** for SPA routes must exclude `/api` and `/ws` [A].

---

## 6. Operations for a team of one

### 6.1 NAS facts to collect in week 1 (high)

The model is unknown. What the repo tells us:
- CI builds amd64-only images, so the NAS is x86_64 [A, inferred from `.github/workflows/docker-publish.yml`, V repo].
- The old docs size Postgres for "RAM 8GB" [V repo doc; actual RAM A].
- Container Manager ships Docker Engine **24.0.2** [V Synology release notes]. Compose features such as `healthcheck.start_interval` need Engine 25+ [A].
- DSM 7.0 runs Linux **4.4.180** [V nascompares]. DSM 7.2 models are on 4.4.302 or 5.10.55 [A].
- Node 26.x supports Linux x64 glibc **kernel ≥ 4.18** as Tier 1 ("older may work"). **musl/Alpine needs kernel ≥ 6.12**, Tier 2 [V nodejs/node v26.x BUILDING.md]. Node's main branch already lists ≥ 5.14 [V].

**Action:** record the following, and decide image bases from the results (Debian-slim/bookworm, not Alpine):
- `uname -r`
- CPU model
- `free -m`
- disk type (HDD/SSD/SSD-cache)
- `docker version` and `docker compose version`
- `pg_test_fsync`
- upstream bandwidth
- whether a UPS is present

### 6.2 Co-hosting with live prod; where to load test (high)

- **The plan reuses the test slot on the NAS that serves the old live production.**
  - A 100k-unit load test there will degrade the live service and give invalid numbers (noisy neighbor).
  - The old prod already runs NPC/AI loops in two servers [V repo report Q2 #4].
- **Fix:**
  - Set `mem_limit`, `cpus` and `pids_limit` on every new container.
  - Run load generators (bots) off-box.
  - Schedule load tests when prod is quiet, or rent a cheap VPS for load tests and keep the NAS for "real environment" checks.
  - Set log rotation (`logging: json-file, max-size, max-file`) so container logs can't fill the volume [A].

### 6.3 Edge: TLS, WSS, single origin (high)

- **HTTPS is a precondition for J.** Service workers (the PWA) require HTTPS, so phone tests in J need TLS on the NAS from day 1 [A, standard secure-context rule].
- **History:**
  - The old project hit `ERR_SSL_PROTOCOL_ERROR` and mixed content on raw socket ports and had to proxy sockets through Next.js [V repo TASKFORCE.md 2026-10-18].
  - The new stack has no Next.js server.
  - DSM's nginx normally holds 80/443 [A]; the old NAS doc notes a reverse proxy is required when Web Station uses them [V repo NAS_DEPLOYMENT.md].
  - Plain-HTTP ports 3001/3002 answer on the NAS's public DDNS hostname today [V repo 2026-10-26 report, "공개 health 엔드포인트 실측"].
- **Fix: one HTTPS origin.**
  - Option 1: **Cloudflare Tunnel** (cloudflared container, no inbound ports, WS supported, can cache immutable tiles, hides the home IP) [A].
  - Option 2: DSM reverse proxy (create the "WebSocket" custom header, extend timeouts) [V community guides] in front of a Caddy/Fastify container.
  - Route `/` (SPA), `/api`, `/ws`.
  - WS heartbeats every ~25 s. nginx-style proxies default to a 60 s read timeout [A; nginx.org was blocked here].
  - Fastify `trustProxy`, Secure/HttpOnly/SameSite=Lax cookies.
  - Close every other forwarded port.

### 6.4 Deploy, rollback, migrations (high)

- **Watchtower:**
  - containrrr/watchtower was **archived on 2025-12-17** [V linuxiac].
  - It watches **all** containers unless `--label-enable` is used [V containrrr.dev docs].
  - The existing instance runs `--interval 60 --cleanup` with no label filter [V repo `docker-compose.production.yml`]. It will also update the new stack's containers, including Postgres if its tag floats.
  - It swaps images but not compose config: the exact cause of the 2026-10-26 test-server outage [V repo report].
  - With `latest` tags there is no rollback, no migration ordering, and every push to `main` restarts the persistent world mid-play.
- **Fix:**
  - CI builds immutable tags (git sha + release semver), with GitHub Actions pinned by commit SHA.
  - The NAS holds a git-versioned compose plus `.env` with pinned tags.
  - `deploy.sh <tag>`: pull → run migrations once (single migrator container with an advisory lock) → `up -d` → health check → auto-rollback to the previous tag on failure.
  - Trigger it manually or via a signed webhook. Announce restarts in-game. Drain per §3.1.
  - Remove watchtower, or scope it with labels and use a maintained fork only for non-game containers.
- **Migrations:**
  - Expand/contract only (add, backfill, switch, remove in a later release).
  - Never run migrations at app start from multiple role containers.
  - Under Drizzle 0.45 the `_journal.json` conflicts across parallel agent branches. Drizzle 1.0 RC changed the migration layout specifically to avoid journal git conflicts [V orm.drizzle.team upgrade-v1].

### 6.5 Backups and restore (high)

- **Nothing in the plan.** The old docs show only a manual `pg_dump` one-liner, and "데이터베이스 실시간 백업 및 자동 복구 스크립트" (real-time DB backup and auto-recovery script) is still an unchecked item in the old `PROJECT_CHECKLIST.md` [V repo]. RAID on one NAS is not a backup.
- **Fix:**
  - pgBackRest or WAL-G (or at least nightly `pg_dump -Fc` + WAL archiving) to a NAS share, then Hyper Backup to off-site storage (C2/B2/S3).
  - Stated RPO/RTO (e.g. 15 min / 1 h).
  - A monthly scripted restore drill into a scratch DB that runs ledger invariants.
  - Also back up `.env`/secrets (password manager) and any non-reproducible generated artifacts.
- **PG18 trap.** postgres:18 images moved `PGDATA` to `/var/lib/postgresql/18/docker` and `VOLUME` to `/var/lib/postgresql` [V Docker Hub]. Keeping the old `/var/lib/postgresql/data` mount makes the container ignore it and create a new anonymous volume [V Docker forum]. Data then lives somewhere you don't back up, and vanishes on `down -v` or recreate.

### 6.6 Secrets (high)

- **Current state:**
  - The old compose files carry a hardcoded default DB password and JWT-secret fallback.
  - The JWT secret is shared by prod and test, so a prod token is valid on test [V repo compose; 2026-10-26 report Q2 #2].
  - The prototype repo's history has a default JWT secret [V repo git history].
  - Postgres is published on `5439:5432` on all interfaces; whether the router forwards it is unknown [V compose; exposure A].
  - Cloud AI agents have read these repos.
- **The plan defers rotation to "정식 직전" (just before launch).**
- **Fix:**
  - Rotate now.
  - Generate per-environment secrets into an untracked `.env` (or Docker secrets).
  - Enable GitHub secret scanning and push protection.
  - Fail CI on default-value fallbacks (`${VAR:-literal}` for secrets).
  - Never give agent sessions production secrets.
  - Run an external port scan now. **Treat this as critical if 5439/5440 answer from the internet.**

### 6.7 Observability (high)

- **Server:**
  - pino JSON logs with rotation
  - `/metrics` (tick duration histogram, event-loop delay, GC pauses, WS connections, buffered bytes, command queue depth, DB pool wait, matching latency, outbox lag)
  - a tiny dashboard
  - an external uptime check with phone alerts (Healthchecks.io/UptimeRobot + Telegram) [A]
- **Client:**
  - a perf HUD (fps, frame-time p95, draw calls, `renderer.info.memory`, context-loss count, DPR, GPU string where exposed)
  - a batched telemetry beacon
  - error capture (`onerror`, `unhandledrejection`) to a Sentry-compatible endpoint [A]
- **Benchmarks:** scripted benchmark scenes (§5.4). These are what turn J's "measurement reports" into numbers.

### 6.8 CI/CD costs and supply chain (low–medium)

- **Cost.** Private-repo Actions minutes are capped by plan [A], and AI agents open many PRs. Use path filters, caching, and `concurrency: cancel-in-progress`.
- **Registry.** GHCR container storage and bandwidth are currently free, with a promise of a month's notice before any change [V GitHub docs].
- **Pinning.** Pin actions by SHA. Consider pnpm's release-age delay for new package versions (recent npm worm incidents) [A].
- **docker.sock.** Watchtower with `docker.sock` is root on the NAS (another reason to remove it).

---

## 7. Multi-agent workflow

### 7.1 Logs and ADRs (high)

- **Single WORKLOG.md.** Appended by every branch, it conflicts on every parallel merge. It also grows without bound: the old `docs/changelog.md` is 221 KB, plus a 902 KB archive [V repo], far beyond what an agent should read.
  - Use **one fragment file per entry** (e.g. `docs/worklog/2026/10/20261028-1432-<branch>.md`), or make the PR description the log (PR template + CI check), with a generated monthly digest.
  - Tell agents to read only recent fragments.
- **NNNN ADR numbers chosen on parallel branches collide.**
  - Draft ADRs as `docs/adr/drafts/<slug>.md` and have a bot assign the number on merge, or use the PR number as the ADR id.
  - Keep filenames ASCII; put the Korean title inside the file. Hangul filenames hit NFC/NFD normalization differences between macOS and Linux tooling [A].

### 7.2 Hooks vs CI; release-please; merges (high)

- **Per-commit "WORKLOG required" hooks** punish WIP, fixup and rebase commits, so agents learn `--no-verify` or write junk entries. Cloud agent sandboxes may not run lefthook at all [A].
  - pre-commit: format and lint on staged files only (< 2 s).
  - Everything else runs in CI on the PR diff.
- **"package.json change ⇒ ADR"** breaks on release-please (which bumps `version` fields) and on Renovate. Limit it to *new runtime dependencies* not on an allowlist, and exempt bots and version-only diffs.
- **GITHUB_TOKEN-created PRs.** Workflow runs on PRs that release-please creates with `GITHUB_TOKEN` are held for manual approval, and other event types create no runs at all [V GitHub docs, "trigger a workflow"]. Required checks then stall. Use a GitHub App token.
- **Squash-merge with a linted Conventional PR title,** so branch commit messages don't need commitlint.
- **Branch protection.** PRs opened under your own account can't be self-approved [A]. Require status checks, not reviews.

### 7.3 Boundaries and file size (high)

- **The old codebase:** `SecondaryMapView.tsx` 4,426 lines, `SecondaryMapRenderer.ts` 3,323, `schema.js` 4,765 [V repo]. "시스템별 모듈 경계" (per-system module boundaries) is a principle, but nothing enforces it.
- **Enforcement in CI:**
  - dependency-cruiser (or equivalent) rules: `engine` must not import React; `shared` has no Node APIs; server modules talk via exported interfaces only.
  - package `exports` maps hide internals.
  - max-lines per file (warn at 400, fail at 600 unless allowlisted by ADR) and a complexity cap.
  - "protected paths" (protocol, ledger, generator, sim) that require an ADR link in the PR.

### 7.4 Fresh-major stack vs agent knowledge (medium)

- **Many fresh majors at once** (TS 7, Vite 8, Zod 4, tRPC 11, Drizzle 1.0, Vitest 5, Node 26, PG18). Agents write code for the APIs in their training data, so expect deprecated or incompatible code and churn. That conflicts with priority #1.
  - Pin exact versions.
  - Add short "API cheat sheets" for each fresh major to AGENTS.md.
  - Prefer boring versions where the newest offers no concrete benefit.
- **TypeScript 7.0 ships without a programmatic API** (planned for 7.1). Tools that import `typescript` need TS 6 via `@typescript/typescript6` aliasing [V TS devblog; InfoQ]. Set up the alias on day 1.
- **Drizzle 1.0 RC** removes RQBv1 (`db._query`), changes the migration layout and moves drizzle-zod to `drizzle-orm/zod` [V orm.drizzle.team]. "0.45→1.0" therefore means a planned rewrite of relations and migrations.
  - Start on 1.0 RC pinned, or avoid RQB and drizzle-zod on 0.45.
  - Better Auth 1.7.14 accepts both (`drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2`) [V scratchpad `ba/pkg/package/package.json`], so auth doesn't block starting on 1.0.
- **Lockfile.** Only one agent at a time changes dependencies; on conflict, regenerate `pnpm-lock.yaml` rather than hand-merge it [A].

### 7.5 Tests agents can't bypass (medium)

- **Golden hashes:** generator outputs per `generator_version`, combat replays per `sim_version`, and a protocol schema snapshot (a breaking diff requires a protocol bump).
- **Chaos test** (§3.1).
- **Ledger invariants** after every test run.
- These encode the spec when the GDD can't.

### 7.6 Repository reset (low)

- **Archive the prototype instead.** Wiping `riversun7/Terra-In-Cognita`'s history destroys the Azgaar FMG port and reference code that the plan itself lists as a reference [V repo: `.tmp/fantasy-map-generator` and FMG port commits]. GitHub also keeps unreachable objects reachable by SHA or PR refs for a while [A].
- **Do instead:** rename it `*-prototype` (archived) and create a fresh repo.

---

## 8. Security

### 8.1 Admin, script console, origin (high)

- **The script console.** A "스크립트 콘솔(대량 작업)" (script console for bulk jobs) inside the player app is remote code execution by design. Node's `vm` module is not a security boundary [A]. Any XSS in the same origin (chat, player names, imported content shown in the editor) or a stolen admin session becomes arbitrary bulk edits or code execution.
- **Replace it with a catalog of typed bulk operations:**
  - Zod-validated parameters
  - dry-run producing a diff
  - apply as an audited job
  - truly ad-hoc scripts run only as a CLI against a staging copy
- **Admin and editor on a separate origin** (subdomain), with:
  - their own session cookie and short TTL
  - step-up auth (passkey/WebAuthn) for destructive operations
  - strict CSP on both origins
- **Lazy-loaded admin chunks are still publicly downloadable.** Keep secrets and hidden data out of them.

### 8.2 Import/export (medium)

- strict Zod schemas that reject unknown keys
- size and row limits with streaming parse
- drop `__proto__`/`constructor` keys (prototype pollution) [A]
- escape leading `= + - @ \t \r` on CSV export (formula injection when you open exports in Excel) [A]
- imports apply to drafts only, with a diff preview and row-level errors

### 8.3 RBAC, audit, auth (medium)

- **Roles:** player / tester / designer (drafts) / operator (publish, approve) / admin (users, economy). Even when one person holds all of them, daily work should run as designer.
- **Audit:** append-only `admin_audit(actor, role, action, target, before, after, reason, ip, at)`; the app DB role has INSERT only.
- **Authz tests:** deny-by-default tests for every admin route.
- **Sessions:** WS sessions authenticate at upgrade with periodic revalidation, so a ban or revocation closes open sockets.
- **CSRF:** Origin checks on cookie-authenticated tRPC mutations [A].

### 8.4 Remaining cheat vectors (high/medium)

- **Time and RNG** (finding 5):
  - client-supplied timestamps let players backdate actions
  - the seed plus full state lets them predict battles and leaks hidden information
  - fix: the server owns time and RNG
- **Interest management** (finding 20):
  - radius-based streams are map-hacks
  - full paths leak destinations
  - fix: visibility filtering and path horizons
- **Botting:**
  - "NPC uses the same command API as users" is good for fairness, but it also means the API is fully scriptable by players
  - fix: per-account rate limits, basic bot heuristics, idempotency keys on every mutating command
- **Accounts and economy:**
  - multi-accounting for daily-login loops and market manipulation
  - wash trading between alts
  - fix: basic detection, and ledger analytics before any public test

### 8.5 Transport DoS (medium)

- `maxPayload` ~64 KB (default 100 MiB [V])
- per-IP and per-account connection caps
- per-message rate limits
- bounded send buffers
- cheap runtime validation on hot messages (full Zod parse on every movement packet is costly at rate [A])

---

## 9. Re-plan for milestone 1

| Phase | Time-box | Scope | Exit criteria | Fallback |
|---|---|---|---|---|
| **M0 Platform and ops** | 2–3 wks | Monorepo skeleton; CI (lint, typecheck, test, boundaries, size); immutable images; NAS `deploy.sh` with rollback; single HTTPS origin + WSS; secrets rotated; backups + one restore drill; perf HUD + telemetry; WS handshake (version, clock sync, resume) with a trivial world; NAS facts sheet; **ADRs for the one-way doors**: grid/scale/IDs (§4.1), durability (§3.1), time authority (§3.4), process topology (§3.2), content/generator versioning (§4.3) | Deploy and rollback demonstrated; restore drill passes; phone loads the PWA over HTTPS and stays connected across background/resume | — |
| **Spike A: 2nd map on phones** (J1) | 2–3 wks | Synthetic heightfield/biomes (no full generator); N=128 maps with ring streaming; 1,000 instanced/VAT units following server paths; building placement | Tier-2 device: frame-time p95 ≤ 33 ms over a 20-min run; memory within budget; warm entry ≤ 1 s, cold ≤ 3 s (4G profile) | Individual entry (already defined); lower density; fewer neighbor rings |
| **Spike B: cube-sphere LOD globe** (J2) | 2–3 wks | Custom per-face quadtree; one generated planet from a minimal generator (noise + Priority-Flood + simple climate); 2 overlay layers. Earth/ETOPO comes after B passes (it is a data import) | Cold world view ≤ 3 s; tile cap respected; no cracks; tier-2 p95 ≤ 33 ms | Fewer levels; pre-baked textures |
| **Spike C: server at 100k** (J3 minus combat rules) | 2 wks | Modular monolith; 100k event-scheduled units; interest management with 1–2k bots off-box; placeholder combat formula for fast-forward; kill -9 recovery | Event-loop delay p99 < 50 ms; GC p99 < 50 ms; recovery < 60 s with invariants intact [A thresholds] | Fewer units per process; earlier worker split |
| **M2 vertical slice** (J4) | 2 wks | Logging → land-cover overlay delta → 1st-map overlay update via the base/overlay split | Change visible on another client within N s; no base re-bake | — |
| **Deferred** | — | J5 market feed load (the engine itself is ~1–2 weeks once the economy spec settles); J6 editor beyond sliders + seed + preview (condition selection and statistics wait for resource/creature rules) | — | — |

**Rules for every spike:**
- a written hypothesis, numbers, and a kill/keep ADR
- a design-parameter freeze for M0–M1; GDD changes after the freeze go to the backlog
- stop at the time-box even if "almost there"

---

## 10. Smaller notes and nits

- **Node 26 "LTS".** In the nodejs.org index snapshot (dated 2026-10-21) in this scratchpad, `v26.12.1` is still `lts:false` [V scratchpad `node_index.json`]. Active-LTS promotion is due around late October, so this is fine by first deploy. Pin an exact minor in Dockerfiles.
- **Lightweight Charts** requires attribution to TradingView (keep the attribution logo or a credit) [A].
- **d3-geo-voronoi** is fine for plates (hundreds to thousands of sites). For territories on a fixed grid, prefer multi-source BFS/Dijkstra on cells: cheaper and grid-consistent [A].
- **ETOPO 2022** is NOAA public-domain data. Keep a credit, and keep a THIRD_PARTY_NOTICES file for MIT/Apache code that agents port (Apache-2.0 NOTICE rules) [A].
- **Legal.** Korean law requires a game rating (GRAC) or a test exemption before public service, plus a privacy policy (PIPA) for accounts. Check before any open beta [A].
- **Time zone.** Store UTC; render KST in UI and logs as needed.
- **ETOPO detail.** "Earth at 1:12 with 1.5 km cells" corresponds to ~18 km real resolution, so many islands and straits vanish. That is fine, but state it so nobody "fixes" it [A computed].
- **Starting scale.** A "우리은하+태양계 먼저" (Milky Way + Solar System first) start invites a real-galaxy-scale data model. Cap it to a tiny hand-authored subset until the GDD sets scale (L).

---

## 11. Sources (verified items)

**Web:**
- Watchtower archived 2025-12-17: https://linuxiac.com/docker-update-tool-watchtower-reaches-end-of-maintenance/
- Watchtower watches all containers by default: https://containrrr.dev/watchtower/container-selection/
- three-globe README (lat/lng, equirectangular, `globeTileEngineUrl` x/y/l): https://github.com/vasturiano/three-globe (raw README fetched)
- S2 level-9 sampled edge lengths (search excerpt): Azure Data Explorer `geo_point_to_s2cell()` docs, https://docs.azure.cn/en-us/data-explorer/kusto/query/geo-point-to-s2cell-function
- PostgreSQL NOTIFY payload < 8000 bytes (search excerpt of the official docs): https://www.postgresql.org/docs/current/sql-notify.html
- NOTIFY commit-time global lock (vendor benchmark): https://dbos.dev/blog/postgres-listen-notify-scalability
- postgres:18 PGDATA/VOLUME change: https://hub.docker.com/_/postgres
- Old mount path creates a new volume: https://forums.docker.com/t/docker-postgres-keep-ignoring-bind-directive-creating-new-volume-instead/152357
- Math.* accuracy is implementation-defined: https://esdiscuss.org/topic/es6-accuracy-of-special-functions
- Node vs Chrome divergence in a sim: https://codeberg.org/perplexdotgg/bounce/issues/8
- iOS Low Power Mode rAF 30 fps (intentional): https://bugs.webkit.org/show_bug.cgi?id=215745
- iOS kills heavy WebGL pages with no OOM signal: https://bugs.webkit.org/show_bug.cgi?id=300782
- Context lost when backgrounding (iOS 17+): https://discourse.threejs.org/t/context-lost-when-backgrounding-safari-on-ios-17-developer-beta-8/55772 and https://developer.apple.com/forums/thread/737042
- Safari memory growth on scene rebuild: https://developer.apple.com/forums/thread/743454
- TypeScript 7.0 has no API; `@typescript/typescript6`: https://devblogs.microsoft.com/typescript/ and https://infoq.com/news/2026/08/typescript-7-released/
- Drizzle v1 changes (RQBv1 removed, migration layout, validators): https://orm.drizzle.team/docs/upgrade-v1 and https://orm.drizzle.team/docs/relations-v1-v2
- Node 26.x platform support: https://github.com/nodejs/node/blob/v26.x/BUILDING.md (fetched); main: https://github.com/nodejs/node/blob/main/BUILDING.md
- DSM 7.0 kernel 4.4.180: https://nascompares.com/answer/which-kernel-linux-version-does-the-synology-dsm-run/
- Container Manager Docker 24.0.2: https://www.synology.com/en-uk/releaseNote/ContainerManager
- GHCR currently free: https://docs.github.com/en/billing/concepts/product-billing/github-packages
- GITHUB_TOKEN-triggered events and PR approval hold: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- ws `maxPayload` default 100 MiB: https://github.com/websockets/ws/blob/HEAD/doc/ws.md
- @fastify/websocket passes `ws` options through: https://github.com/fastify/fastify-websocket (index.js fetched)
- s2js BigInt 64-bit cell IDs: https://github.com/missinglink/s2js (README fetched)
- DSM reverse proxy WebSocket header (community): https://github.com/orobardet/dsm-reverse-proxy-websocket and https://vaultwarden.discourse.group/t/solved-websocket-setup-on-synology/116

**Repo files read:**
- `/home/user/AntiGravt01/docker-compose.production.yml` and `docker-compose.yml`
- `/home/user/AntiGravt01/.github/workflows/docker-publish.yml`
- `/home/user/AntiGravt01/docs/2026-10-26_테스트서버_오프라인_서버분리_PixiMap_로딩지연_분석보고서.md`
- `/home/user/AntiGravt01/docs/TASKFORCE.md`
- `/home/user/AntiGravt01/docs/archive/NAS_DEPLOYMENT.md`
- `/home/user/AntiGravt01/docs/Engineering/Infrastructure/DB_MIGRATION_POSTGRESQL.md`
- file sizes of `docs/changelog.md` and the archive, plus the largest source files
- `/home/user/terra-in-cognita` git history (18 commits, FMG port)

**Scratchpad:**
- `node_index.json`
- `ba/pkg/package/package.json` (better-auth 1.7.14 peer ranges)
- `webcheck/` (fetched BUILDING.md and fastify-websocket files)
