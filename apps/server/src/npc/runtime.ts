// NPC 사회 런타임(서버) — docs/adr/2026-11-01-npc-brain-r5.md 7절, 기술 순서 ADR R5 행("NAS 시험 봇을 NPC 세력으로")
// 서버가 NPC 국가·도시에 세력·사회 규칙을 실제 시간으로 돌린다. 규칙과 판단은 시뮬레이터와 같은 함수다(@terra/sim attachSociety·decide):
// - 부팅: DB(세력·소유 주체·도시·휴먼·전쟁)로 시뮬 세계 모양(거울 세계)을 차린다. 세력 ID = 그 세력의 소유 주체 ID, 원장 = 서버 원장.
//   시험 봇(유닛 종류 0) 가운데 휴먼이 아닌 것은 가장 가까운 도시의 휴먼으로 들인다(주인 = 그 도시 세력).
// - 실제 시각 루프: 시뮬 루프(createSimLoop)를 TICK_MS마다 지금까지 민다. 판단 예약은 시뮬과 같고(판단마다 구인 규칙식이 행정 건물
//   구인 카드를 산다, D-469 출생 없음), 하루 끝(UTC 0시)에 endOfDay(만족도·수명·상속·반란·독립·백지 강화·연구, 7일마다 배당·공물).
// - 처리 뒤 거울 세계의 바뀜을 쓰기 대기열·2차맵에 맞춘다(persist.ts).
// - 정원사(docs/adr/2026-11-01-gardener-r5b.md 5절, gardener.ts): 하루 끝에 칸 오염·도시 웨이브 굴림·유목 부대, 웨이브 도착은
//   서버 전투 서비스의 공성 전투로 싸운다(결과가 오면 다음 틱에 피해·폐허·쉬는 시간). 정원사 2: 정원 세력 관계도·세력 오염·
//   보호 레이드(판단의 치기 → onAttack)·막아 낸 웨이브 보상(waveRewards.ts).
// - 도시 경제(docs/adr/2026-11-07-play-flow.md WP4, economy.ts): 시뮬과 같은 경제 실행(생산·생필품 유지비·NPC 거래·거래세)을 같은 루프에서
//   돌리고 세력·사회에 경제 고리(생필품 충족·거래세 배당·세율·도시 주인 바뀜의 창고·거래소)를 준다. 거래소는 market/books.ts(저장·복원).
// - 폐허 2(ruinsRuntime.ts): 정부 건물 상태·행정 레벨 = 그 도시 안 행정 건물 레벨(489 다, 틱마다 맞춤)·수호신만 있는 도시의 웨이브 전투
//   (472 가)·폐허가 된 도시 창고 물건을 주인 나라의 가장 가까운 도시 창고로(535).
// - 서버에서 아직 안 하는 것: 실시간 공성(NPC 공격은 전투 없이 점령 — 시뮬 "전투 끔"과 같은 규칙), 환전·세력 화폐(시험 화폐 하나),
//   휴먼 지갑(상속은 빈 지갑), 편입 제안 저장(메모리), NPC 생산 시설의 오염(정원사 칸 오염에 넣지 않음), NPC의 행정 건물 올리기(NPC는 짓지
//   않는다 — 씨앗 행정 건물 Lv1 그대로).
import { randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  type BattleInit,
  CELL_UNITS,
  type CombatCatalog,
  type CombatCoefficients,
  DAY_MS,
  DEFAULT_SCENARIO_SOCIETY,
  EVENT_DECIDE,
  type FactionDay,
  type GardenerCoefficients,
  HOMELESS,
  type NpcContext,
  SATISFACTION_MAX_MILLI,
  STREAM_SOCIETY,
  STREAM_TRAITS,
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
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
  recruitElementsFromSlots,
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
import { type NpcEconomyInput, type ServerEconomy, startServerEconomy } from "./economy.ts";
import { type ServerGardener, attachServerGardener } from "./gardener.ts";
import { type WaveRewardItems, grantWaveReward } from "./waveRewards.ts";
import { type CityPlace, type NpcPersist, createNpcPersist } from "./persist.ts";
import { territoryOf } from "./townSites.ts";
import { type NpcRuinsInput, ruinedGoodsHomeOf, syncAdminLevels } from "./ruinsRuntime.ts";
import { ruinsOf } from "./ruinsState.ts";
import type { NpcHumanRow } from "./state.ts";
import { loadNpcState } from "./state.ts";

/** 루프를 미는 간격(ms). 판단·하루 끝은 그 시각에만 돌고, 나머지 틱은 할 일이 없으면 바로 끝난다 */
export const TICK_MS = 5_000;
/** 예비 세력 행 수(한 처리에서 새로 생길 수 있는 세력보다 넉넉히) */
const SPARE_FACTIONS = 16;
/** 처음 들인 휴먼의 만족도(시뮬 세계 차리기와 같다) */
const ADOPT_SATISFACTION = 60_000;
/** 하루 끝 사건 종류 */
const EVENT_DAY = "npc_day";
/** 걸어 둔 거래소 주문의 만료를 거두는 간격(ms) */
const EXPIRE_EVERY_MS = 60_000;

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
  /** 정원사 웨이브 켬(GARDENER_WAVES). false면 도시 웨이브 확률 0(오염은 그대로 쌓임). 없으면 켬 */
  readonly gardenerWaves?: boolean | undefined;
  /** 타이머를 켜지 않는다(시험이 tick을 직접 부른다) */
  readonly manual?: boolean | undefined;
  /** 시험 세계 행성(칸 오염의 행성) */
  readonly planetId: string;
  /** 정원사 웨이브 전투를 넣을 전투 서비스(없으면 그 자리에서 빨리감기) */
  readonly startBattle?: ((init: BattleInit) => Promise<number>) | undefined;
  /** 전투 서비스가 전투를 끝냈을 때 알려 달라고 등록한다(공격 편이 이겼나) */
  readonly onBattleEnded?: ((listener: (battleId: number, attackerWon: boolean) => void) => void) | undefined;
  /** 전투 자료(팩 + 덮어쓰기 실효 값)·전투 계수(설정 칸 실효 값), 부를 때마다 읽는다. 없으면 시험 자료 */
  readonly combatCatalog?: (() => CombatCatalog) | undefined;
  readonly combatRules?: (() => CombatCoefficients) | undefined;
  /** 도시 주인이 바뀐 것을 저장할 때(영토 비콘이 도시를 따라간다, D-512 335) */
  readonly onCityOwner?: ((cityId: number, factionRowId: number) => void) | undefined;
  /** 막아 낸 도시 웨이브 보상 아이템(D-499: 팩 유전자·크리쳐 재료, waveRewards.ts). 없으면 명성만 */
  readonly waveRewardItems?: (() => WaveRewardItems) | undefined;
  /** 도시마다 수호신 만족도 버프(하루 끝에 그 도시 휴먼 만족도 + 밀리점, 기획 답 470 가 — 신전 서비스). 없으면 버프 없음 */
  readonly guardianSatisfaction?: (() => ReadonlyMap<number, number>) | undefined;
  /** 도시 경제 입력(경제 목록·도시 시설, docs/adr/2026-11-07-play-flow.md WP4). 없으면 경제 없이 돈다(시험) */
  readonly economy?: NpcEconomyInput | undefined;
  /**
   * 폐허 2 고리(npc/ruinsRuntime.ts): 정부 건물 상태(480·487 다)·도시 행정 건물 레벨(489 다)·수호신(472 가)·유저 나라(535 폐허 창고 물건의
   * 갈 곳). 없으면 정부 건물이 있는 폐허도 다 지은 것으로 치고, 행정 레벨은 그대로, 수호신만 있는 도시는 전투 없이 진다(시험)
   */
  readonly ruins?: NpcRuinsInput | undefined;
}

export interface NpcRuntime {
  /** 지금 시각까지 민다(타이머가 부르고, 시험이 직접 부른다). 바뀜 저장까지 기다린다. force면 처리한 예약이 없어도 저장한다 */
  tick(force?: boolean): Promise<void>;
  /** 거울 세계(시험·관리 조회용, 바꾸지 않는다) */
  readonly world: SimWorld;
  /** 도시·폐허 자리(2차맵 칸). 유저 구인이 고용한 휴먼을 그 둘레에 세우고, 개발 시험 폐허(ruins/service.ts)가 자리를 더한다 */
  readonly places: Map<number, CityPlace>;
  readonly society: SocietyRun;
  /** 정원사(오염·웨이브·유목 부대) */
  readonly gardener: ServerGardener;
  /** 도시 경제·거래소(경제 입력이 있을 때만) */
  readonly economy: ServerEconomy | undefined;
  /** 폐허·복원 사업 바뀜을 바로 쓰기 대기열에 넣는다(유저 폐허 명령 뒤 같은 동기 처리, ruinsPersist.ts) */
  flushRuins(): void;
  /** 지난 호출 뒤 구간의 지표(서버 1분 지표 한 줄에 붙인다) */
  takeMetrics(): Record<string, number>;
  stop(): void;
}
/**
 * 웨이브를 끄면 도시 웨이브 확률 상한(chanceMaxPm)과 보호 레이드 세기 배율(raidStrengthPm, D-500)을 0으로 둔다: 굴림은 돌지만 늘
 * 실패하고 레이드는 생기지 않으며, 오염 층·관계도는 그대로 돈다.
 * 사용자 결정(2026-11-01 "합치되 웨이브 끔", D-513 운영자 온/오프 스위치 49 N53 `n53_gardener_waves`), GARDENER_WAVES
 */
export function gardenerRulesOf(rules: GardenerCoefficients, wavesOn: boolean): GardenerCoefficients {
  return wavesOn ? rules : { ...rules, chanceMaxPm: 0, raidStrengthPm: 0 };
}

/**
 * 운영자 스위치(n53_gardener_waves = 1)가 켜져 있으면 환경변수(기본 false)가 꺼져 있어도 웨이브를 켠다.
 * 환경변수를 주지 않은 시험(undefined)은 스위치가 기본값(0)이어도 기존 시험처럼 켜 둔다.
 */
export function gardenerWavesEnabled(envFlag: boolean | undefined, switchValue: number | undefined): boolean {
  if (switchValue === 1) return true;
  if (envFlag === undefined) return true;
  return envFlag;
}
/** 다음 하루 끝(UTC 0시, 하루 길이를 줄였으면 그 배수) */
const nextDayEnd = (nowMs: number, dayMs: number): number => (Math.floor(nowMs / dayMs) + 1) * dayMs;
const NO_ITEMS: WaveRewardItems = { genes: [], materials: [] };

/** 구인 카드로 온 휴먼의 레벨·스탯·속성(저장 값). 처음부터 있던 휴먼은 null */
const recruitOf = (row: NpcHumanRow): SimUnit["recruit"] =>
  row.stats && row.stats.length === 6
    ? { level: row.level, stats: row.stats, elements: recruitElementsFromSlots(row.elements ?? []) }
    : null;

export async function startNpcRuntime(o: NpcRuntimeOptions): Promise<NpcRuntime> {
  const { ledger, writer, maps, log } = o;
  const c = o.rules();
  const dayMs = o.dayMs ?? DAY_MS;
  const startMs = o.now();
  const state = await loadNpcState(o.pool, o.planetId);
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
  const drawOf = (ownerId: number, cityId: number): SimCity["recruitDraw"] => {
    const row = state.draws.find((draw) => draw.ownerId === ownerId && draw.cityId === cityId);
    return row ? { window: row.window, taken: row.taken, hirer: ownerId } : null;
  };
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
      adminLevel: row.adminLevel,
      // 도시 주인(NPC 세력)이 지금 창에 산 구인 카드 칸(recruit_draws, 고용 주체 = 세력 소유 주체)
      recruitDraw: drawOf(faction.id, row.id),
    });
    places.set(row.id, {
      planetId: row.planetId,
      mapKey: row.mapKey,
      cellX: row.cellX,
      cellY: row.cellY,
      foundedAtMs: row.foundedAtMs,
      name: row.name ?? undefined,
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
      recruit: null,
      rebirths: 0,
      ...fields,
    };
    units.set(id, unit);
    factions.get(unit.owner)?.units.add(id);
    return unit;
  };
  for (const row of state.humans) {
    const at = onMap.get(row.unitId);
    if (!at) continue;
    // 노숙 휴먼(떠도는 세력, D-464 217): 도시가 없다. 주인 = 유닛 주인(살아 있는 세력일 때만)
    if (row.cityId === null) {
      if (!factions.has(at.ownerId)) continue;
      human(row.unitId, HOMELESS, {
        owner: at.ownerId,
        satisfactionMilli: row.satisfactionMilli,
        bornAtMs: row.bornAtMs,
        lifespanMs: row.lifespanMs,
        rebirths: row.rebirths,
        recruit: recruitOf(row),
      });
      continue;
    }
    if (!cities.has(row.cityId)) continue;
    human(row.unitId, row.cityId, {
      satisfactionMilli: row.satisfactionMilli,
      bornAtMs: row.bornAtMs,
      lifespanMs: row.lifespanMs,
      rebirths: row.rebirths,
      recruit: recruitOf(row),
    });
  }
  let nextCity = state.maxCityId;
  const persistRef: { current?: NpcPersist } = {};
  const gardenerRef: { current?: ServerGardener } = {};
  const world: SimWorld = {
    seed,
    factions,
    cities,
    units,
    // 폐허(도시 ID, docs/adr/2026-11-07-ruins-restoration.md): 자리도 places에 채운다(칸 오염·복원한 도시 자리)
    ruins: ruinsOf(state.ruins, places, (mapKey) => maps.has(mapKey)),
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
      planetId: o.planetId,
      gardener: () => gardenerRef.current,
      onCityOwner: o.onCityOwner,
      territory: () => territoryOf(o.rules().territory),
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
  const metrics = {
    decisions: 0,
    decideMs: 0,
    dayMs: 0,
    persistMs: 0,
    recruited: 0,
    deaths: 0,
    days: 0,
    gardenerMs: 0,
    waveResults: 0,
  };
  // 기록기는 "N일째"를 시작 시각 + N × 24시간으로 센다 → 이어 돈 날 수와 UTC 0시 하루 끝에 맞춘 시작 시각을 준다
  // (하루를 줄인 측정 실행에서는 줄의 시각이 실제와 다르다)
  const restoredDay = state.society?.day ?? 0;
  const recorder = createMetricsRecorder({
    startMs: nextDayEnd(startMs, dayMs) - (restoredDay + 1) * DAY_MS,
    sink: (line) => log.info({ npcMetrics: line }, "npc society metrics"),
  });
  const ctxRef: { ctx?: NpcContext } = {};
  const econRef: { current?: ServerEconomy | undefined } = {};
  const loop = createSimLoop<SimEvent>({
    startMs,
    handle: (event, sim) => {
      const ctx = ctxRef.ctx;
      if (!ctx) return;
      if (econRef.current?.handle(event, sim.nowMs)) return;
      const started = performance.now();
      if (gardenerRef.current?.run.handle(event.payload.kind, event.payload.subject, sim.nowMs)) {
        metrics.gardenerMs += performance.now() - started;
        return;
      }
      if (event.payload.kind === EVENT_DECIDE) {
        if (o.rules().switches.npcAiEnabled === 0) {
          const faction = world.factions.get(event.payload.subject);
          if (faction?.alive) scheduleDecide(ctx, faction, sim.nowMs);
        } else {
          decide(ctx, event.payload.subject, sim.nowMs);
          metrics.decisions += 1;
          metrics.decideMs += performance.now() - started;
        }
      } else if (event.payload.kind === EVENT_DAY) {
        endOfDay(sim.nowMs);
        metrics.days += 1;
        metrics.dayMs += performance.now() - started;
        sim.schedule(sim.nowMs + dayMs, { kind: EVENT_DAY, subject: 0 });
      }
    },
  });
  // 도시 경제(사회 규칙보다 먼저: 사회·판단이 경제 고리를 받는다)
  const econ = o.economy
    ? await startServerEconomy({
        world,
        writer,
        pool: o.pool,
        owners: o.owners,
        loop,
        rules: o.rules,
        input: o.economy,
        startMs,
        now: o.now,
        log,
        goodsHome: ruinedGoodsHomeOf(world, persist.places, o.ruins?.nationOf),
      })
    : undefined;
  econRef.current = econ;
  const ctx: NpcContext = {
    world,
    loop,
    recorder,
    c,
    decideEveryMs: c.npc.decideEveryMs,
    settings: DEFAULT_SCENARIO_SOCIETY,
    trips: undefined,
    counts: emptyNpcCounts(),
    hooks: econ?.hooks,
  };
  ctxRef.ctx = ctx;
  const society = attachSociety(
    {
      world,
      settings: DEFAULT_SCENARIO_SOCIETY,
      recorder,
      c,
      hooks: econ?.hooks,
      combat: undefined,
      scheduleFaction: (faction, nowMs) => scheduleDecide(ctx, faction, nowMs),
      scheduleUnit: () => {},
      cancel: (eventId) => loop.cancel(eventId),
      restoreDay: restoredDay,
      // 마을 자리 검사(docs/adr/2026-11-07-world-layout.md): 다른 세력 영향권 밖 자리가 있을 때만 세우고, 그 자리를 다음 도시 ID에 잡아 둔다
      // (같은 동기 처리에서 found가 곧 nextCityId로 그 도시를 만든다 → 저장할 때 그 자리를 쓴다)
      canFound: (parent, fromCityId) => {
        const site = persist.townSiteFrom(fromCityId, parent.id);
        if (!site) return false;
        places.set(nextCity + 1, site);
        return true;
      },
    },
    startMs,
  );
  ctx.society = society;
  if (o.ruins?.government) society.ruins.attachGovernment(o.ruins.government);
  // 행정 레벨 = 그 도시 안 행정 건물 레벨(489 다): 처음과 틱마다 맞춘다
  syncAdminLevels(world, o.ruins?.governmentLevels?.());
  // 정원사: 칸 = 도시의 2차맵 키(F9), 이웃 = 행성 이웃 8칸. 계수는 설정 칸 실효 값을 부를 때마다 읽는다
  const gardener = attachServerGardener({
    world,
    state,
    seed,
    startMs,
    loop,
    recorder,
    society,
    rules: () => {
      const current = o.rules();
      return gardenerRulesOf(
        current.gardener,
        gardenerWavesEnabled(o.gardenerWaves, current.switches.gardenerWaves),
      );
    },
    combatRules: o.combatRules ?? (() => TEST_COMBAT_COEFFICIENTS),
    catalog: o.combatCatalog ?? (() => TEST_COMBAT_CATALOG),
    cellOf: (cityId) => persist.places.get(cityId)?.mapKey,
    ownerOfRow: (rowId) => ownerOfRow.get(rowId),
    treasuryOf: (ownerId) => ledger.balanceOf(ownerId, ASSET_CREDIT),
    timeScale: dayMs / DAY_MS,
    startBattle: o.startBattle,
    hasGuardians: o.ruins?.hasGuardians,
    grantReward: o.waveRewardItems
      ? (ownerId, reward, atMs) =>
          grantWaveReward(ledger, ownerId, reward, o.waveRewardItems?.() ?? NO_ITEMS, atMs)
      : undefined,
    log,
  });
  gardenerRef.current = gardener;
  // 보호 레이드(D-500): NPC 판단이 필수 NPC 세력의 도시를 치려 하면 공격자에게
  ctx.onAttack = (attacker, target, cityId, nowMs) => {
    gardener.run.protect(attacker, target, cityId, nowMs);
  };
  o.onBattleEnded?.((battleId, attackerWon) => {
    gardener.battleEnded(battleId, attackerWon);
  });

  function endOfDay(nowMs: number): void {
    econ?.beforeDay(nowMs);
    society.endOfDay(nowMs);
    // 수호신 만족도 버프(470 가): 사회 규칙의 하루 끝 다음에 그 도시 휴먼마다 더한다(상한에서 자름 [임시]). 바뀜은 휴먼 저장이 줄 비교로 쓴다
    const lift = o.guardianSatisfaction?.();
    if (lift && lift.size > 0)
      for (const unit of world.units.values()) {
        const add = lift.get(unit.city) ?? 0;
        if (add > 0) unit.satisfactionMilli = Math.min(SATISFACTION_MAX_MILLI, unit.satisfactionMilli + add);
      }
    const started = performance.now();
    gardener.run.endOfDay(nowMs, society.currentDay());
    metrics.gardenerMs += performance.now() - started;
    const rows: FactionDay[] = [];
    for (const faction of world.factions.values()) {
      if (!faction.alive) continue;
      rows.push({
        id: faction.id,
        cities: faction.cities.size,
        population: faction.units.size,
        tech: faction.tech,
        // 국고 = 그 나라 화폐(시뮬 run.ts와 같은 칸, 도시 경제가 없으면 시험 화폐)
        treasury: ledger.balanceOf(faction.id, econ?.hooks.treasuryAsset(faction) ?? ASSET_CREDIT),
        ...society.dayFields(faction),
      });
    }
    recorder.day(society.currentDay(), rows);
    econ?.afterDay(nowMs, society.currentDay());
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
  let expiredAt = startMs;
  const tick = async (force = false): Promise<void> => {
    if (busy || stopped) return;
    busy = true;
    try {
      const before = loop.processed;
      // 끝난 웨이브 전투(전투 서비스가 알려 줌)의 결과를 먼저 넣는다
      const results = gardener.applyPending(o.now());
      metrics.waveResults += results;
      const lifted = syncAdminLevels(world, o.ruins?.governmentLevels?.());
      loop.runUntil(o.now() + 1);
      // 걸어 둔 거래소 주문의 만료(쓰기 대기열로 바로 간다)
      if (econ && o.now() - expiredAt >= EXPIRE_EVERY_MS) {
        expiredAt = o.now();
        econ.expire(expiredAt);
      }
      if (loop.processed === before && results === 0 && lifted === 0 && !force) return;
      const started = performance.now();
      const result = await persist.flush(society.currentDay());
      await persist.refillSpares(SPARE_FACTIONS);
      metrics.persistMs += performance.now() - started;
      metrics.recruited += result.recruited;
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
    places: persist.places,
    society,
    gardener,
    economy: econ,
    flushRuins: () => void persist.flushRuins(),
    takeMetrics() {
      const out = {
        npcDecisions: metrics.decisions,
        npcDecideMs: Math.round(metrics.decideMs * 10) / 10,
        npcDayMs: Math.round(metrics.dayMs * 10) / 10,
        npcPersistMs: Math.round(metrics.persistMs * 10) / 10,
        npcRecruited: metrics.recruited,
        npcDeaths: metrics.deaths,
        npcHumans: world.units.size,
        npcFactions: [...world.factions.values()].filter((f) => f.alive).length,
        gardenerMs: Math.round(metrics.gardenerMs * 10) / 10,
        gardenerWaves: gardener.run.waves.size,
        gardenerWaveResults: metrics.waveResults,
        pollutionCells: gardener.run.layer().size,
        ...econ?.takeMetrics(),
      };
      metrics.decisions = 0;
      metrics.decideMs = 0;
      metrics.dayMs = 0;
      metrics.persistMs = 0;
      metrics.recruited = 0;
      metrics.deaths = 0;
      metrics.days = 0;
      metrics.gardenerMs = 0;
      metrics.waveResults = 0;
      return out;
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
