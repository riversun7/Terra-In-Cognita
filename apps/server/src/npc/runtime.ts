// NPC 사회 런타임(서버) — docs/adr/2026-11-01-npc-brain-r5.md 7절, 기술 순서 ADR R5 행("NAS 시험 봇을 NPC 세력으로")
// 서버가 NPC 국가·도시에 세력·사회 규칙을 실제 시간으로 돌린다. 규칙과 판단은 시뮬레이터와 같은 함수다(@terra/sim attachSociety·decide):
// - 부팅: DB(세력·소유 주체·도시·휴먼·전쟁)로 시뮬 세계 모양(거울 세계)을 차린다. 세력 ID = 그 세력의 소유 주체 ID, 원장 = 서버 원장.
//   시험 봇(유닛 종류 0) 가운데 휴먼이 아닌 것은 가장 가까운 도시의 휴먼으로 들인다(주인 = 그 도시 세력).
// - 실제 시각 루프: 시뮬 루프(createSimLoop)를 TICK_MS마다 지금까지 민다. 판단 예약은 시뮬과 같고, 하루 끝(UTC 0시)에 endOfDay
//   (만족도·출생·수명·반란·독립·백지 강화·연구, 7일마다 배당·공물).
// - 처리 뒤 거울 세계의 바뀜을 쓰기 대기열·2차맵에 맞춘다(persist.ts).
// - 서버에서 아직 안 하는 것: 실시간 공성(NPC 공격은 전투 없이 점령 — 시뮬 "전투 끔"과 같은 규칙), NPC 시장·세금(배당 0),
//   휴먼 지갑(상속은 빈 지갑), 편입 제안 저장(메모리).
import { randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  CELL_UNITS,
  DAY_MS,
  DEFAULT_SCENARIO_SOCIETY,
  EVENT_DECIDE,
  type FactionDay,
  type NpcContext,
  STREAM_SOCIETY,
  STREAM_TRAITS,
  type SimCity,
  type SimEvent,
  type SimFaction,
  type SimUnit,
  type SimWorld,
  type SocietyCoefficients,
  type SocietyRun,
  attachSociety,
  createLedgerAudit,
  createMetricsRecorder,
  createSimLoop,
  decide,
  emptyNpcCounts,
  lifespanMs,
  newFaction,
  positionAt,
  rollTraits,
  scheduleDecide,
  streamRng,
  traitsFromArray,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, NPC_START_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { UNIT_KIND_BOT } from "../world/unitKinds.ts";
import { type CityPlace, type NpcPersist, createNpcPersist } from "./persist.ts";
import { loadNpcState } from "./state.ts";

/** 루프를 미는 간격(ms). 판단·하루 끝은 그 시각에만 돌고, 나머지 틱은 할 일이 없으면 바로 끝난다 */
export const TICK_MS = 5_000;
/** 예비 세력 행 수(한 처리에서 새로 생길 수 있는 세력보다 넉넉히) */
const SPARE_FACTIONS = 16;
/** 처음 들인 휴먼의 만족도(시뮬 세계 차리기와 같다) */
const ADOPT_SATISFACTION = 60_000;
/** 하루 끝 사건 종류 */
const EVENT_DAY = "npc_day";

export interface NpcRuntimeOptions {
  readonly pool: QueryPool;
  readonly writer: WorldWriter;
  readonly ledger: Ledger;
  readonly owners: Map<number, OwnerRow>;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly nextOwnerId: () => number;
  readonly nextUnitId: () => number;
  readonly now: () => number;
  readonly log: {
    info(obj: object, message: string): void;
    warn(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
  /** 팩 tuning을 얹은 세력·사회 계수표(npc 칸 포함) */
  readonly rules: () => SocietyCoefficients;
  /** 하루 길이(ms, 기본 실제 24시간). 측정용으로만 줄인다(NPC_DAY_MS) */
  readonly dayMs?: number | undefined;
  /** 타이머를 켜지 않는다(시험이 tick을 직접 부른다) */
  readonly manual?: boolean | undefined;
}

export interface NpcRuntime {
  /** 지금 시각까지 민다(타이머가 부르고, 시험이 직접 부른다). 바뀜 저장까지 기다린다. force면 처리한 예약이 없어도 저장한다 */
  tick(force?: boolean): Promise<void>;
  /** 거울 세계(시험·관리 조회용, 바꾸지 않는다) */
  readonly world: SimWorld;
  readonly society: SocietyRun;
  /** 지난 호출 뒤 구간의 지표(서버 1분 지표 한 줄에 붙인다) */
  takeMetrics(): Record<string, number>;
  stop(): void;
}

/** 다음 하루 끝(UTC 0시, 하루 길이를 줄였으면 그 배수) */
const nextDayEnd = (nowMs: number, dayMs: number): number => (Math.floor(nowMs / dayMs) + 1) * dayMs;

export async function startNpcRuntime(o: NpcRuntimeOptions): Promise<NpcRuntime> {
  const { ledger, writer, maps, log } = o;
  const c = o.rules();
  const dayMs = o.dayMs ?? DAY_MS;
  const startMs = o.now();
  const state = await loadNpcState(o.pool);
  const seed = state.society?.seed ?? randomInt(0x7fff_ffff);

  // 세력: 소유 주체 ID ↔ 세력 행 ID
  const rowOf = new Map<number, number>();
  const ownerOfRow = new Map<number, number>();
  for (const row of state.factions) {
    rowOf.set(row.ownerId, row.rowId);
    ownerOfRow.set(row.rowId, row.ownerId);
  }
  const factions = new Map<number, SimFaction>();
  /** DB에 성향이 없어 지금 굴린 세력(처음 저장에 넣는다) */
  const rolled: number[] = [];
  for (const row of state.factions) {
    const stored = traitsFromArray(row.traits);
    if (!stored) rolled.push(row.ownerId);
    const traits = stored ?? rollTraits(streamRng(seed, STREAM_TRAITS, row.ownerId, 0), c.npc);
    const faction = newFaction(row.ownerId, row.code, {
      fixed: row.fixed,
      tech: Math.max(1, row.techLevel),
      regime: row.regime,
      settledAtMs: startMs,
      overlord: row.parentRowId === null ? null : (ownerOfRow.get(row.parentRowId) ?? null),
      traits,
    });
    faction.research = {
      progress: row.researchProgress,
      blueprint: Math.max(row.techLevel, row.techBlueprint),
    };
    faction.aiStep = row.aiStep;
    faction.rebelOf = row.rebelOfRowId === null ? null : (ownerOfRow.get(row.rebelOfRowId) ?? null);
    factions.set(faction.id, faction);
  }
  for (const war of state.wars) {
    const a = factions.get(ownerOfRow.get(war.a) ?? -1);
    const b = factions.get(ownerOfRow.get(war.b) ?? -1);
    if (!a || !b) continue;
    if (war.state === "war") {
      a.wars.add(b.id);
      b.wars.add(a.id);
      a.lastFight.set(b.id, war.atMs);
      b.lastFight.set(a.id, war.atMs);
    } else {
      a.truces.set(b.id, war.atMs);
      b.truces.set(a.id, war.atMs);
    }
  }

  // 도시: NPC 세력의 도시만(띄운 2차맵에 있는 것)
  const cities = new Map<number, SimCity>();
  const places = new Map<number, CityPlace>();
  for (const row of state.cities) {
    const owner = ownerOfRow.get(row.factionRowId);
    const faction = owner === undefined ? undefined : factions.get(owner);
    if (!faction || !maps.has(row.mapKey)) continue;
    cities.set(row.id, {
      id: row.id,
      owner: faction.id,
      start: row.start,
      housing: row.housing,
      researchLevel: row.researchLevel,
      development: row.development,
      nextRebellionMs: row.nextRebellionMs,
    });
    places.set(row.id, {
      planetId: row.planetId,
      mapKey: row.mapKey,
      cellX: row.cellX,
      cellY: row.cellY,
      foundedAtMs: row.foundedAtMs,
    });
    faction.cities.add(row.id);
  }

  // 휴먼: 저장된 휴먼(유닛이 2차맵에 있는 것) + 아직 휴먼이 아닌 시험 봇
  const onMap = new Map<number, { map: SecondMap; ownerId: number; cell: { x: number; y: number } }>();
  for (const map of maps.values())
    map.forEachUnit((unit) => {
      if (unit.kind !== UNIT_KIND_BOT) return;
      const point = positionAt(unit.motion, startMs);
      onMap.set(unit.id, {
        map,
        ownerId: unit.ownerId,
        cell: { x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) },
      });
    });
  const units = new Map<number, SimUnit>();
  const human = (id: number, cityId: number, fields: Partial<SimUnit>): SimUnit => {
    const city = cities.get(cityId);
    const unit: SimUnit = {
      id,
      city: cityId,
      owner: city?.owner ?? 0,
      job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
      pos: { x: 0, y: 0 },
      tripStep: 0,
      eventId: undefined,
      satisfactionMilli: ADOPT_SATISFACTION,
      bornAtMs: startMs,
      lifespanMs: 0,
      parents: [],
      rebirths: 0,
      ...fields,
    };
    units.set(id, unit);
    factions.get(unit.owner)?.units.add(id);
    return unit;
  };
  for (const row of state.humans) {
    if (!onMap.has(row.unitId) || !cities.has(row.cityId)) continue;
    human(row.unitId, row.cityId, {
      satisfactionMilli: row.satisfactionMilli,
      bornAtMs: row.bornAtMs,
      lifespanMs: row.lifespanMs,
      rebirths: row.rebirths,
    });
  }
  let nextCity = state.maxCityId;
  const persistRef: { current?: NpcPersist } = {};
  const world: SimWorld = {
    seed,
    factions,
    cities,
    units,
    book: ledger,
    // 서버 원장은 DB가 감사한다(불변 조건 I1·I2 SQL) → 메모리 감사는 쓰지 않는다
    audit: createLedgerAudit([]),
    testJobs: false,
    // 새 세력 = 예비 세력 행을 받는다(동기로 ID를 얻고 원장 계정의 외래 키가 깨지지 않게, persist.ts)
    nextFactionId: () => {
      if (!persistRef.current) throw new Error("npc society: persistence not ready");
      return persistRef.current.takeSpare();
    },
    nextCityId: () => {
      nextCity += 1;
      return nextCity;
    },
    nextUnitId: o.nextUnitId,
  };
  const persist = createNpcPersist(
    {
      world,
      pool: o.pool,
      writer,
      owners: o.owners,
      maps,
      nextOwnerId: o.nextOwnerId,
      now: o.now,
      log,
      seed,
    },
    { rowOf, places, spares: state.spares },
  );
  persistRef.current = persist;
  // DB에서 읽은 그대로를 저장된 것으로 친다. 아래(들이기·주거·성향·처음 화폐)에서 바꾼 것만 처음 저장에 들어간다
  persist.markSaved(state.society?.day ?? -1);
  for (const id of rolled) persist.dirtyFaction(id);
  let adopted = 0;
  for (const [unitId, at] of [...onMap].toSorted((a, b) => a[0] - b[0])) {
    if (units.has(unitId)) continue;
    let best: { id: number; d: number } | undefined;
    for (const [cityId, place] of places) {
      if (place.mapKey !== at.map.mapKey) continue;
      const dx = place.cellX - at.cell.x;
      const dy = place.cellY - at.cell.y;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d || (d === best.d && cityId < best.id)) best = { id: cityId, d };
    }
    if (!best) continue;
    // 나이·수명은 시뮬 세계 차리기와 같이 흩는다(수명 안 아무 나이)
    const rng = streamRng(seed, STREAM_SOCIETY, unitId, 0);
    const life = lifespanMs(rng.nextInt(10_000), c);
    human(unitId, best.id, {
      lifespanMs: life,
      bornAtMs: startMs - Math.floor((life * rng.nextInt(10_000)) / 10_000),
    });
    adopted += 1;
  }
  // 휴먼 주인은 그 도시 주인이다(봇 유닛 주인을 맞춘다)
  for (const unit of units.values()) {
    const at = onMap.get(unit.id);
    if (at && at.ownerId !== unit.owner) at.map.setOwner(unit.id, unit.owner);
  }
  // 들인 휴먼이 주거를 넘으면 주거를 늘린다(휴먼 × 1.3 + 2, 시나리오 기본과 같은 식, 질문 203 가)
  const perCity = new Map<number, number>();
  for (const unit of units.values()) perCity.set(unit.city, (perCity.get(unit.city) ?? 0) + 1);
  for (const city of cities.values()) {
    const n = perCity.get(city.id) ?? 0;
    if (n + 2 > city.housing) city.housing = Math.floor((n * 13) / 10) + 2;
  }
  // 고정 국가는 처음에 시험 화폐를 받는다(시험 NPC 세력과 같다, 봇 유지비·짓는 값)
  for (const faction of factions.values()) {
    if (!faction.fixed) continue;
    if ([...ledger.accounts()].some((a) => a.ownerId === faction.id && a.asset === ASSET_CREDIT)) continue;
    ledger.post({
      kind: "issue",
      atMs: startMs,
      entries: [
        { account: ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -NPC_START_CREDIT },
        { account: ledger.ownerAccount(faction.id, ASSET_CREDIT), amount: NPC_START_CREDIT },
      ],
    });
  }

  await persist.refillSpares(SPARE_FACTIONS);

  const metrics = { decisions: 0, decideMs: 0, dayMs: 0, persistMs: 0, births: 0, deaths: 0, days: 0 };
  // 기록기는 "N일째"를 시작 시각 + N × 24시간으로 센다 → 이어 돈 날 수와 UTC 0시 하루 끝에 맞춘 시작 시각을 준다
  // (하루를 줄인 측정 실행에서는 줄의 시각이 실제와 다르다)
  const restoredDay = state.society?.day ?? 0;
  const recorder = createMetricsRecorder({
    startMs: nextDayEnd(startMs, dayMs) - (restoredDay + 1) * DAY_MS,
    sink: (line) => log.info({ npcMetrics: line }, "npc society metrics"),
  });
  const ctxRef: { ctx?: NpcContext } = {};
  const loop = createSimLoop<SimEvent>({
    startMs,
    handle: (event, sim) => {
      const ctx = ctxRef.ctx;
      if (!ctx) return;
      const started = performance.now();
      if (event.payload.kind === EVENT_DECIDE) {
        decide(ctx, event.payload.subject, sim.nowMs);
        metrics.decisions += 1;
        metrics.decideMs += performance.now() - started;
      } else if (event.payload.kind === EVENT_DAY) {
        endOfDay(sim.nowMs);
        metrics.days += 1;
        metrics.dayMs += performance.now() - started;
        sim.schedule(sim.nowMs + dayMs, { kind: EVENT_DAY, subject: 0 });
      }
    },
  });
  const ctx: NpcContext = {
    world,
    loop,
    recorder,
    c,
    decideEveryMs: c.npc.decideEveryMs,
    settings: DEFAULT_SCENARIO_SOCIETY,
    trips: undefined,
    counts: emptyNpcCounts(),
  };
  ctxRef.ctx = ctx;
  const society = attachSociety(
    {
      world,
      settings: DEFAULT_SCENARIO_SOCIETY,
      recorder,
      c,
      hooks: undefined,
      combat: undefined,
      scheduleFaction: (faction, nowMs) => scheduleDecide(ctx, faction, nowMs),
      scheduleUnit: () => {},
      cancel: (eventId) => loop.cancel(eventId),
      restoreDay: restoredDay,
    },
    startMs,
  );
  ctx.society = society;

  function endOfDay(nowMs: number): void {
    society.endOfDay(nowMs);
    const rows: FactionDay[] = [];
    for (const faction of world.factions.values()) {
      if (!faction.alive) continue;
      rows.push({
        id: faction.id,
        cities: faction.cities.size,
        population: faction.units.size,
        tech: faction.tech,
        treasury: ledger.balanceOf(faction.id, ASSET_CREDIT),
        ...society.dayFields(faction),
      });
    }
    recorder.day(society.currentDay(), rows);
  }

  recorder.start(
    [...world.factions.values()].map((faction) => ({
      id: faction.id,
      fixed: faction.fixed,
      tech: faction.tech,
    })),
  );
  for (const faction of world.factions.values()) if (faction.alive) scheduleDecide(ctx, faction, startMs);
  loop.schedule(nextDayEnd(startMs, dayMs), { kind: EVENT_DAY, subject: 0 });
  const first = await persist.flush(society.currentDay());
  log.info(
    {
      factions: [...factions.values()].filter((f) => f.alive).length,
      cities: cities.size,
      humans: units.size,
      adopted,
      day: society.currentDay(),
      writes: first.rows,
    },
    "npc society started",
  );

  let busy = false;
  let stopped = false;
  const tick = async (force = false): Promise<void> => {
    if (busy || stopped) return;
    busy = true;
    try {
      const before = loop.processed;
      loop.runUntil(o.now() + 1);
      if (loop.processed === before && !force) return;
      const started = performance.now();
      const result = await persist.flush(society.currentDay());
      await persist.refillSpares(SPARE_FACTIONS);
      metrics.persistMs += performance.now() - started;
      metrics.births += result.births;
      metrics.deaths += result.deaths;
    } catch (error) {
      log.error({ err: error }, "npc society tick failed");
    } finally {
      busy = false;
    }
  };
  const timer = o.manual ? undefined : setInterval(() => void tick(), TICK_MS);
  timer?.unref();

  return {
    tick,
    world,
    society,
    takeMetrics() {
      const out = {
        npcDecisions: metrics.decisions,
        npcDecideMs: Math.round(metrics.decideMs * 10) / 10,
        npcDayMs: Math.round(metrics.dayMs * 10) / 10,
        npcPersistMs: Math.round(metrics.persistMs * 10) / 10,
        npcBirths: metrics.births,
        npcDeaths: metrics.deaths,
        npcHumans: world.units.size,
        npcFactions: [...world.factions.values()].filter((f) => f.alive).length,
      };
      metrics.decisions = 0;
      metrics.decideMs = 0;
      metrics.dayMs = 0;
      metrics.persistMs = 0;
      metrics.births = 0;
      metrics.deaths = 0;
      metrics.days = 0;
      return out;
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
