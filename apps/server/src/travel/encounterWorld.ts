// 조우 규칙을 월드에 잇기 — 기획 D-564 2차 답 1641·1643, D-570(질문 1901~1908 답), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-564)"·
// "바뀜 (D-570, 좌표 이동 3)".
// 1. 지형 빠르기(1643·1903): 이동 서비스에 2차맵 걸음 배율(coordPace.ts — 지형 서비스의 행성 값, 강·이웃 비탈 포함)을 붙인다. 2차맵마다 한 번 셈해
//    둔다(행성 값은 바뀌지 않는다).
// 2. 조우 틱(설정 칸 encounter_scan_ms마다, 값은 틱마다 다시 읽는다):
//    ① 좌표 유닛(띄우지 않은 2차맵, encounter.ts): 같은 2차맵에 선 다른 나라 편끼리.
//    ② 띄운 2차맵(1901 가, clash.ts): 다른 나라 두 유닛이 encounter_radius_cells 안(한쪽은 봇 아닌 전투 유닛).
//    두 경우 모두 두 편이 따로 AI 판단(clashDecide.ts — 전쟁·전력 비·성향, 플레이어는 AI 작전 — 아래 바뀜)을 하고
//    둘 다 회피면 그 2차맵·나라 짝은 쉬는 시간(encounter_cooldown_ms) 동안 다시 보지 않는다. 한 편이라도 걸면(전투·약탈):
//    a. 시가지(안전지대 D-146 — 영토 서비스 urbanCity) 안이면 싸우지 않는다(쉬는 시간).
//    b. 두 편 유닛의 길을 멈춘다(travel.haltOn stop "encounter" — 좌표면 그 자리의 좌표 유닛, 띄운 2차맵이면 그 자리). 길이 없는 유닛도 그 자리에 세운다.
//    c. 좌표 조우면 그 2차맵을 띄운다(전투 = 띄우는 까닭, ADR 2026-11-15 2절 3).
//    d. 만난 자리 둘레 실제 지형의 전투맵(1902, encounterArena.ts)에 공격 편·수비 편으로 보통 세계 전투를 연다(건물 공격·웨이브와 같은 길 — 몸·생명
//       수치·물약·탄). 전쟁 상대면 전쟁 전투(진 유닛은 포로), 약탈이면 보통 전투(진 유닛은 안전한 곳, 이긴 편이 짐 몫을 가져간다 — D-173).
//    e. 결과를 적용할 때까지(+ 1분) 그 2차맵을 내리지 않고, 끝 시각 뒤 멈춘 길을 AI가 다시 판단한다(1908, afterEncounter.ts).
//    한 틱에 encounter_max_per_scan개까지(나머지는 다음 틱).
// 바뀜 (encounter-4 — 질문 2021~2038 답, D-570 1904·1908·1803, D-174, D-5039·D-5040, D-144, D-573):
//    - 판단 입력 = 편의 AI 작전(encounterSides.ts — 플레이어 유닛은 저장한 작전 tactics/store.ts, NPC는 성격 → 프리셋). 오프라인 플레이어 유닛은
//      먼저 걸지 않는다(D-144). ① 교전 굴림은 편마다 서버 난수 한 번.
//    - 회피 편 빠져나가기(D-573): 더 빠르면 전투 없이 빠져나가고(쉬는 시간), 느리면 전투가 열리고 그 편 파티는 시작 틱에 퇴각 명령을 받는다.
//    - 전투 파티 퇴각 기준 = 그 편 작전 ⑦. 전투맵 건물은 부술 수 있는 전투 건물이고 받은 피해는 세계 시설로 돌아간다(2030 답, encounterArena.ts).
//    - 채집 줄 유닛은 멈출 때 줄을 끝내지 않고(gather suspend) 전투 뒤 다시 잇는다(2035 답). 돌아갈 곳 = 창고·거점(2033 답, encounterPlaces.ts).
// 부하(NAS 유닛 3,297·2차맵 55): 좌표 유닛은 2차맵 키로 묶기만, 띄운 2차맵은 봇 아닌 전투 유닛이 있는 2차맵만 칸 격자(clash.ts). 잰 값은 작업 기록.
// 바뀜 (fixes-1117c — 사용자 결정 D-588 2496 가 "같은 나라 유저의 건물이나 유닛을 공격하면(약탈 행위) 신용이 내린다", 기획 대조 2543 "같은 나라 유저끼리도 싸우고 약탈할 수
//    있어야"): 일부러 치기(strike — WebSocket unit_attack). 조우는 그대로 다른 나라끼리만 저절로 만난다(같은 나라 유닛이 저절로 싸우지 않게 — NPC도). 플레이어가
//    내 유닛으로 같은 띄운 2차맵 조우 거리(encounter_radius_cells) 안의 남의 유닛을 고르면 판단 없이 내 편이 공격 편으로 같은 조우 전투를 연다(전쟁 상대면 전쟁 전투,
//    아니면 약탈 전투 — 진 유닛 짐 몫을 이긴 편이 가져간다). 수비 편 = 그 유닛 + 같은 주인의 유닛 가운데 대상 둘레 조우 거리 안. 수비 편은 빠져나가지 않는다(D-573
//    회피 판단 없음 — 아래 gov-fix-3에서 바뀜). 시가지 안이면 싸우지 않는다. 신용 고리(creditUnitAttack)는 open 안이라 그대로 공격 편만 깎는다 [임시 2581].
// 바뀜 (gov-fix-3 — 질문 2581 (3) 사용자 답, D-570 1904 "무조건 전투가 아니라 현재 전투세팅상태나 전력차, 성향에 따라 판정"·D-573 2022 나): 일부러 치기의 수비 편도
//    조우와 같은 판단을 한다(clashDecide.ts resolveStrike — 같은 나라 수비 편도). 회피를 골랐고 공격 편보다 빠르면 전투 없이 빠져나가고(결과 코드 escaped — 프로토콜 65,
//    낮은 판 연결은 out_of_reach), 느리면 전투가 열리고 수비 편 파티는 시작 틱에 퇴각을 시도한다(조우와 같은 flee). 빠져나간 뒤 다시 치는 것을 막는 쉬는 시간은 없다 [임시 2611].
// 바뀜 (fixes-d592 — D-592 2581 (1)·(4)): NPC가 같은 나라 유닛을 드물게 도시 밖에서 친다(npcStrikes — npcStrike.ts, 일부러 치기와 같은 길 strikeOn). 같은 가문원을
//    일부러 친 사람은 가문에서 추방된다(공격은 막지 않는다 — factionIdentity/houseExpel.ts [임시 — 해석 확인 중]).
import { randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  BATTLE_BASE_MOVE_MS,
  CELL_UNITS,
  type EncounterCoefficients,
  JOB_NONE,
  START_ENCOUNTER,
  type SocietyCoefficients,
  footprintRect,
  positionAt,
} from "@terra/sim";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { creditUnitAttack } from "../credit/hooks.ts";
import { DEFENSE_STAGE } from "../facilities/cityWalls.ts";
import { OBSTACLE_DURABILITY, facilityPoints, mapLayers } from "../facilities/siegeLayout.ts";
import { houseExpelOf } from "../factionIdentity/houseExpel.ts";
import { gatherOf } from "../gather/registry.ts";
import { attachUnitTactics } from "../tactics/store.ts";
import { type WorldBattleInit, siegeFacilityTargets } from "../world/battleTargets.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import { nationOfOwner } from "../world/nationVision.ts";
import { TEST_PLANET_ID } from "../world/testMaps.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import {
  UNIT_KIND_BOT,
  UNIT_KIND_CYBORG,
  UNIT_KIND_CYBORG_UNIT,
  UNIT_KIND_HUMAN,
  isAfloat,
  isGuardianUnit,
} from "../world/unitKinds.ts";
import type { WorldPersistence } from "../world/world.ts";
import { type HaltedGather, reconsiderTrips, RECHECK_SLACK_MS } from "./afterEncounter.ts";
import { cargoCarriers, cargoGrams } from "./cargo.ts";
import { type ClashUnit, findClashes } from "./clash.ts";
import {
  type ClashResolution,
  clashPower,
  engagedUnits,
  resolveClash,
  resolveStrike,
} from "./clashDecide.ts";
import { coordPacePm, neighborMapKeys } from "./coordPace.ts";
import { groupEncounters, sidePairs } from "./encounter.ts";
import {
  type ArenaBuilding,
  type ArenaUnit,
  arenaOrigin,
  arenaSizeOf,
  encounterCenter,
  encounterMap,
} from "./encounterArena.ts";
import { nearestBase, nearestWarehouse } from "./encounterPlaces.ts";
import { type SideBody, type SideUnit, sideView, unitRetreats } from "./encounterSides.ts";
import { buildEncounterInit } from "./encounterInit.ts";
import { type NpcStrikeUnit, npcStrikeCandidates, npcStrikeChancePpm } from "./npcStrike.ts";
import type { HaltedTrip } from "./serviceTypes.ts";

/** 전투 결과를 적용한 뒤에도 그 2차맵을 붙잡는 여유(ms) */
const HOLD_SLACK_MS = 60_000;
/** [임시] 사람형 건물 피해 배율(세계 전투와 같다) */
const BUILDING_MUL_PM = 2000;
/** 2차맵 걸음 배율 캐시 상한(넘으면 비운다 — 행성 값에서 다시 셈한다) */
const PACE_CACHE_MAX = 100_000;
/** 쉬는 시간 표 상한(넘으면 지난 것을 지운다) */
const COOLDOWN_MAX = 10_000;
/** 판단하는 유닛 종류(봇 아닌 전투 유닛 — 사이보그 본체·휴먼·사이보그 유닛) */
const DECIDER_KINDS: ReadonlySet<number> = new Set([
  UNIT_KIND_CYBORG,
  UNIT_KIND_HUMAN,
  UNIT_KIND_CYBORG_UNIT,
]);
/** 조우에 드는 종류(판단하는 유닛 + NPC 휴먼 봇은 상대로만). 지도자·시험 유닛·배는 빠진다 */
const PARTICIPANT_KINDS: ReadonlySet<number> = new Set([...DECIDER_KINDS, UNIT_KIND_BOT]);
/** 종류 + 상태: 수호신 상태인 휴먼(기획 D-311·D-589 — 그 도시 방어전에만)은 판단·조우에서 빠진다 */
type KindOf = { readonly kind: number; readonly guardian?: boolean | undefined };
const isDecider = (unit: KindOf): boolean => DECIDER_KINDS.has(unit.kind) && !isGuardianUnit(unit);
const isParticipant = (unit: KindOf): boolean => PARTICIPANT_KINDS.has(unit.kind) && !isGuardianUnit(unit);

export interface CoordinateRules {
  /** 조우 한 번 찾기(시험·타이머). 연 전투 수 */
  scan(): Promise<number>;
  /** 지난 호출 뒤 구간 지표(틱 수·ms·만남·회피·전투) */
  takeMetrics(): Record<string, number>;
  /** 일부러 치기(unit_attack — 같은 나라 유저끼리 싸움·약탈은 이 길로만) */
  strike(input: StrikeInput): Promise<StrikeCode>;
  stop(): void;
}

/** 조우 규칙이 읽는 월드 몫(world.ts World의 일부 — 시험은 이 모양만 만든다) */
export interface CoordinateWorld {
  readonly persistence:
    | (Pick<
        WorldPersistence,
        "travel" | "spawn" | "bodies" | "startBattle" | "battles" | "owners" | "cyborgs" | "ledger"
      > & {
        readonly facilities?:
          | (Pick<WorldPersistence["facilities"], "catalog" | "rules"> & {
              readonly service?:
                | Pick<WorldPersistence["facilities"]["service"], "places" | "works">
                | undefined;
            })
          | undefined;
        readonly territory?: Pick<WorldPersistence["territory"], "urbanCity"> | undefined;
        /** 접속 상태(D-144 — 오프라인 플레이어 유닛은 먼저 걸지 않는다). 없으면 모두 오프라인으로 본다 */
        readonly settlement?:
          | Pick<WorldPersistence["settlement"], "offlineSince" | "findOwnerOfUser">
          | undefined;
        /** AI 작전 저장소가 읽고 쓰는 DB·쓰기 대기열(없으면 저장한 작전 없음 — 기본 프리셋) */
        readonly pool?: WorldPersistence["pool"] | undefined;
        readonly writer?: WorldPersistence["writer"] | undefined;
      })
    | undefined;
  readonly npc:
    | {
        readonly world: {
          readonly factions: ReadonlyMap<
            number,
            {
              readonly wars: ReadonlySet<number>;
              readonly traits?: { readonly aggression: number } | undefined;
              readonly player?: true | undefined;
            }
          >;
          /** 도시 ID → 주인 세력(거점 고르기, 질문 2033 답) */
          readonly cities?: ReadonlyMap<number, { readonly owner: number }> | undefined;
        };
        /** 도시 자리(거점 고르기) */
        readonly places?:
          | ReadonlyMap<number, { readonly mapKey: number; readonly cellX: number; readonly cellY: number }>
          | undefined;
      }
    | undefined;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly terrain: { cellValues?(mapKey: number): PlanetCellValues | undefined } | undefined;
  status(): { readonly state: string };
}

/** 싸움이 날 만남 하나 */
interface Engagement {
  readonly mapKey: number;
  readonly loaded: boolean;
  readonly nations: readonly [number, number];
  readonly sides: readonly [readonly SideUnit[], readonly SideUnit[]];
  readonly resolution: ClashResolution;
  readonly atWar: boolean;
  /** 두 편 작전 ⑦ 퇴각 기준(파티 HP %, 편 평균 — 판단 유닛이 아닌 유닛의 파티) */
  readonly retreatPct: readonly [number, number];
  /** 판단 유닛마다 퇴각 기준(유닛 개별 파티 — D-558 1547) */
  readonly unitRetreat: ReadonlyMap<number, number>;
}

/** 일부러 치기 입력(unit_attack) — 사용자·내 유닛·대상 유닛 */
export interface StrikeInput {
  readonly userId: string;
  readonly unitIds: readonly number[];
  readonly targetUnitId: number;
}

/** 일부러 치기 결과(travel_result 코드와 같은 낱말 — ok면 전투가 열렸다) */
export type StrikeCode =
  | "ok"
  | "busy"
  | "unknown_unit"
  | "forbidden"
  | "unavailable"
  | "out_of_reach"
  | "own_target"
  | "safe_zone"
  | "escaped";

/** 이동 서비스 → 일부러 치기(조우 규칙이 켜질 때 붙는다 — 게이트웨이가 찾는다, app.ts를 키우지 않으려고) */
const strikes = new WeakMap<object, (input: StrikeInput) => Promise<StrikeCode>>();
export const encounterStrikeOf = (
  travel: object,
): ((input: StrikeInput) => Promise<StrikeCode>) | undefined => strikes.get(travel);

/** 쉬는 시간 열쇠(2차맵·나라 짝) */
const pairKey = (mapKey: number, a: number, b: number): string =>
  a < b ? `${mapKey}:${a}:${b}` : `${mapKey}:${b}:${a}`;

/** 2차맵 위 유닛의 지금 배치 칸 */
function cellOf(map: SecondMap, unitId: number, at: number): ArenaUnit | undefined {
  const motion = map.unitInfo(unitId)?.motion;
  if (!motion) return undefined;
  const point = positionAt(motion, at);
  return { unitId, x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) };
}

/** 지형 빠르기를 붙이고 조우 타이머를 켠다(세계가 준비된 뒤, DB가 있는 월드만) */
export function startCoordinateRules(
  world: CoordinateWorld,
  options: {
    readonly now: () => number;
    readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
    /** false면 타이머를 켜지 않는다(시험이 scan을 직접 부른다) */
    readonly timer?: boolean | undefined;
    /** ① 교전 굴림(0 이상 1000 미만, 기본 서버 난수 — 시험이 고정한다) */
    readonly roll?: (() => number) | undefined;
    /** 같은 나라 NPC 치기 굴림(0 이상 1,000,000 미만, 기본 서버 난수 — 시험이 고정한다, fixes-d592) */
    readonly rollPpm?: (() => number) | undefined;
  },
): CoordinateRules | undefined {
  const persistence = world.persistence;
  if (!persistence) return undefined;
  const { travel } = persistence;
  const { now, log } = options;
  const society = (): SocietyCoefficients | undefined => persistence.facilities?.rules();
  const rules = (): EncounterCoefficients => society()?.encounter ?? START_ENCOUNTER;
  const roll = options.roll ?? (() => randomInt(1000));
  const rollPpm = options.rollPpm ?? (() => randomInt(1_000_000));
  // AI 작전 저장소(질문 2021·2023 답): 세계 저장 층에 붙인다 — 게이트웨이(unit_tactics)가 같은 저장소에 쓴다
  const { pool, writer, settlement } = persistence;
  const tactics =
    pool && writer && settlement
      ? attachUnitTactics(
          { maps: world.maps, persistence: { pool, writer, settlement, travel }, now },
          log,
          persistence,
        )
      : undefined;
  // 1. 지형 빠르기(행성 값이 없으면 1000, 이웃 행성 값으로 비탈)
  const paces = new Map<number, number>();
  travel.attachPace((mapKey) => {
    const known = paces.get(mapKey);
    if (known !== undefined) return known;
    if (paces.size >= PACE_CACHE_MAX) paces.clear();
    const terrain = world.terrain;
    const cell = terrain?.cellValues?.(mapKey);
    const neighbors = cell ? neighborMapKeys(mapKey).map((key) => terrain?.cellValues?.(key)) : [];
    const pace = coordPacePm(cell, neighbors);
    paces.set(mapKey, pace);
    return pace;
  });

  // 2. 조우
  const cooldown = new Map<string, number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const counts = {
    scans: 0,
    scanMs: 0,
    contacts: 0,
    avoided: 0,
    battles: 0,
    safe: 0,
    escaped: 0,
    npcStrikes: 0,
  };
  let busy = false;
  let stopped = false;

  const cooling = (key: string, at: number): boolean => {
    const until = cooldown.get(key);
    if (until === undefined) return false;
    if (at < until) return true;
    cooldown.delete(key);
    return false;
  };
  const rest = (key: string, at: number): void => {
    if (cooldown.size >= COOLDOWN_MAX)
      for (const [old, until] of cooldown) if (until <= at) cooldown.delete(old);
    cooldown.set(key, at + Math.max(0, rules().cooldownMs));
  };
  const atWar = (a: number, b: number): boolean => world.npc?.world.factions.get(a)?.wars.has(b) === true;

  /** 소유 주체가 플레이어(사용자 주체·플레이어 가문)인가 */
  const playerOwned = (ownerId: number): boolean => {
    const owner = persistence.owners.get(ownerId);
    if (!owner) return false;
    if (owner.userId !== null) return true;
    return owner.factionId !== null && world.npc?.world.factions.get(owner.factionId)?.player === true;
  };
  /** NPC 소유 주체의 공격 성향(그 세력 → 나라, 없으면 500) */
  const aggressionOf = (ownerId: number, nation: number): number => {
    const factionId = persistence.owners.get(ownerId)?.factionId ?? nation;
    const factions = world.npc?.world.factions;
    return factions?.get(factionId)?.traits?.aggression ?? factions?.get(nation)?.traits?.aggression ?? 500;
  };
  /** 편 판단 값의 출처(작전·접속·성향) */
  const sources = {
    playerOwned,
    // 유닛 소유주의 접속(D-574 2140): 사용자 주체 = 그 사용자, 플레이어 가문 소유 주체 = 그 가문장(질문 2262)
    online: (ownerId: number): boolean => {
      const owner = persistence.owners.get(ownerId);
      let userId = owner?.userId ?? null;
      if (userId === null && owner?.factionId !== null && owner?.factionId !== undefined)
        userId = houseTiesOf(persistence)?.leaderOfHouse(owner.factionId) ?? null;
      return userId !== null && persistence.settlement?.offlineSince(userId) === null;
    },
    aggressionOf,
    tacticsOf: (unitId: number) => tactics?.get(unitId),
  };

  /** 띄운 2차맵 유닛의 전투 몸 값(하나라도 몸을 못 만들면 undefined — 유닛 수로 센다) */
  const bodiesOf = (units: readonly SideUnit[], at: number): Map<number, SideBody> | undefined => {
    const out = new Map<number, SideBody>();
    for (const unit of units) {
      const spec = persistence.bodies.build(
        unit.unitId,
        {
          id: unit.unitId,
          side: 1,
          party: 1,
          x: 0,
          y: 0,
          moveIntervalMs: BATTLE_BASE_MOVE_MS,
          buildingMulPm: BUILDING_MUL_PM,
        },
        at,
      );
      if (!spec) return undefined;
      out.set(unit.unitId, {
        power: clashPower(spec),
        hp: spec.start?.hp ?? spec.maxHp,
        maxHp: spec.maxHp,
      });
    }
    return out;
  };

  /** 두 편 판단. 싸움이 나면 만남, 아니면 쉬는 시간 */
  const judge = (
    mapKey: number,
    loaded: boolean,
    nations: readonly [number, number],
    sides: readonly [readonly SideUnit[], readonly SideUnit[]],
    at: number,
  ): Engagement | undefined => {
    const r = rules();
    const capped: [SideUnit[], SideUnit[]] = [
      sides[0].slice(0, Math.max(1, r.maxSideUnits)),
      sides[1].slice(0, Math.max(1, r.maxSideUnits)),
    ];
    const war = atWar(nations[0], nations[1]);
    const all = [...capped[0], ...capped[1]];
    const bodies = loaded ? bodiesOf(all, at) : undefined;
    const carriers = war
      ? new Set<number>()
      : cargoCarriers(
          persistence.ledger,
          all.map((unit) => unit.unitId),
        );
    const views = [
      sideView(capped[0], nations[0], sources, bodies, carriers, roll),
      sideView(capped[1], nations[1], sources, bodies, carriers, roll),
    ] as const;
    const resolution = resolveClash(views[0], views[1], war, r);
    counts.contacts += 1;
    if (!resolution || resolution.escaped) {
      // 둘 다 회피, 또는 회피 편이 더 빨라 빠져나감(D-573) — 그 2차맵·나라 짝은 쉬는 시간
      if (resolution) {
        counts.escaped += 1;
        log.info({ mapKey, nations, choices: resolution.choices }, "travel: encounter escaped");
      } else counts.avoided += 1;
      rest(pairKey(mapKey, nations[0], nations[1]), at);
      return undefined;
    }
    // 공격 편에는 건 묶음의 판단 유닛과 봇만(질문 2224 나 — 걸지 않은 유닛은 하던 길을 간다). 수비 편은 모두
    const attacker = resolution.attacker;
    const engaged = engagedUnits(views[attacker], views[attacker === 0 ? 1 : 0], war, r);
    if (engaged)
      capped[attacker] = capped[attacker].filter((unit) => !unit.decider || engaged.has(unit.unitId));
    const retreatPct = [views[0].retreatPct, views[1].retreatPct] as const;
    const unitRetreat = unitRetreats(capped, nations, sources);
    return { mapKey, loaded, nations, sides: capped, resolution, atWar: war, retreatPct, unitRetreat };
  };

  /** ① 좌표 유닛 만남 */
  const coordinateEngagements = (
    at: number,
    nationOf: (ownerId: number) => number | undefined,
  ): Engagement[] => {
    const units = travel.coordinateUnits(null).filter(isParticipant);
    if (units.length < 2) return [];
    const out: Engagement[] = [];
    for (const group of groupEncounters(units, nationOf, (mapKey) => world.maps.has(mapKey))) {
      for (const [a, b] of sidePairs(group.sides)) {
        if (cooling(pairKey(group.mapKey, a.nation, b.nation), at)) continue;
        const side = (list: typeof a.units): SideUnit[] =>
          list.map((unit) => ({
            unitId: unit.unitId,
            ownerId: unit.ownerId,
            kind: unit.kind,
            decider: isDecider(unit),
            speed: unit.speed,
          }));
        const found = judge(group.mapKey, false, [a.nation, b.nation], [side(a.units), side(b.units)], at);
        if (found) {
          out.push(found);
          break;
        }
      }
    }
    return out;
  };

  /** ② 띄운 2차맵 만남 */
  const loadedEngagements = (at: number, nationOf: (ownerId: number) => number | undefined): Engagement[] => {
    const radius = Math.max(1, rules().radiusCells);
    const out: Engagement[] = [];
    for (const map of world.maps.values()) {
      const units: ClashUnit[] = [];
      const kinds = new Map<number, number>();
      let deciders = 0;
      map.forEachUnit((view) => {
        if (!isParticipant(view) || view.aboard !== undefined) return;
        const nation = nationOf(view.ownerId);
        if (nation === undefined) return;
        const point = positionAt(view.motion, at);
        const decider = isDecider(view) && view.job.job === JOB_NONE;
        if (decider) deciders += 1;
        kinds.set(view.id, view.kind);
        units.push({
          unitId: view.id,
          ownerId: view.ownerId,
          nation,
          x: Math.floor(point.x / CELL_UNITS),
          y: Math.floor(point.y / CELL_UNITS),
          decider,
        });
      });
      if (deciders === 0) continue;
      for (const contact of findClashes(units, radius)) {
        if (cooling(pairKey(map.mapKey, contact.nations[0], contact.nations[1]), at)) continue;
        // 움직일 수 없는 유닛(빨강 부상·포로)·물 위 유닛은 뺀다
        const side = (list: readonly ClashUnit[]): SideUnit[] =>
          list.flatMap((unit) => {
            const info = map.unitInfo(unit.unitId);
            if (!info || unavailable(info.condition, at) || isAfloat(info)) return [];
            return [
              {
                unitId: unit.unitId,
                ownerId: unit.ownerId,
                kind: kinds.get(unit.unitId) ?? 0,
                decider: unit.decider,
                speed: info.speed,
              },
            ];
          });
        const sides: [SideUnit[], SideUnit[]] = [side(contact.sides[0]), side(contact.sides[1])];
        if (sides[0].length === 0 || sides[1].length === 0) continue;
        const found = judge(map.mapKey, true, contact.nations, sides, at);
        if (found) {
          out.push(found);
          break;
        }
      }
    }
    return out;
  };

  /** 돌아갈 곳(질문 2033 답): 창고·거점 후보의 출처 */
  const homes = {
    places: () => persistence.facilities?.service?.places,
    works: (buildingId: number) => persistence.facilities?.service?.works(buildingId) ?? false,
    ledger: persistence.ledger,
    catalog: () => persistence.facilities?.catalog(),
    runtime: () => society()?.facilityRuntime,
    nationOf: (ownerId: number) => nationOfOwner(world, ownerId),
    startCityOf: (ownerId: number) => {
      const userId = persistence.owners.get(ownerId)?.userId ?? null;
      return userId === null ? undefined : persistence.cyborgs.record(userId)?.startCityId;
    },
    cities: function* () {
      const npc = world.npc;
      for (const [id, city] of npc?.world.cities ?? []) {
        const place = npc?.places?.get(id);
        if (place)
          yield { id, owner: city.owner, spot: { mapKey: place.mapKey, x: place.cellX, y: place.cellY } };
      }
    },
  };
  /** 유닛의 지금 자리(띄운 2차맵 → 좌표 유닛) */
  const whereOf = (unitId: number, at: number) => {
    for (const map of world.maps.values()) {
      const cell = cellOf(map, unitId, at);
      if (cell) return { mapKey: map.mapKey, x: cell.x, y: cell.y };
    }
    const parked = travel.coordinateUnits(null).find((unit) => unit.unitId === unitId);
    return parked ? { mapKey: parked.mapKey, x: parked.cellX, y: parked.cellY } : undefined;
  };

  /** 나중에 부르기(멈추면 부르지 않는다) */
  const later = (run: () => void, delayMs: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!stopped) run();
    }, delayMs);
    timer.unref();
    timers.add(timer);
  };

  /** 멈춘 길·채집 줄을 끝 시각 뒤에 다시 판단(1908·2033·2035 답) */
  const scheduleReconsider = (
    battleId: number,
    endsAt: number,
    trips: readonly HaltedTrip[],
    gathers: readonly HaltedGather[],
    maxHp: Map<number, number>,
  ) => {
    if (trips.length === 0 && gathers.length === 0) return;
    later(
      () => {
        const catalog = persistence.facilities?.catalog();
        const gather = gatherOf(persistence);
        void reconsiderTrips(
          {
            maps: world.maps,
            travel,
            battle: (id) => persistence.battles.get(id),
            maxHp: (unitId) => maxHp.get(unitId),
            cargoGrams: (ownerId, unitId) =>
              catalog ? cargoGrams(persistence.ledger, catalog, ownerId, unitId) : 0n,
            capacityGrams: () => society()?.gatherObjects.carryGrams ?? 0,
            rules,
            where: (unitId) => whereOf(unitId, now()),
            warehouse: (ownerId, from) => nearestWarehouse(homes, ownerId, from),
            base: (ownerId, from) => nearestBase(homes, ownerId, from),
            gather: gather && {
              resume: (unitId, unload) => gather.resume(unitId, unload),
              drop: (unitId) => gather.drop(unitId),
              enter: (userId, input, then) => gather.enter(userId, input, then),
            },
            later,
            now,
            log,
          },
          battleId,
          trips,
          gathers,
        ).catch((error: unknown) => log.error({ err: error, battleId }, "travel: after encounter failed"));
      },
      Math.max(0, endsAt + RECHECK_SLACK_MS - now()),
    );
  };

  /** 조우 전투맵에 들어갈 2차맵 건물(지금 내구도 — 공성 전투맵과 같은 셈, 질문 2030 답) */
  const arenaBuildings = (map: SecondMap, at: number): ArenaBuilding[] => {
    const records = persistence.facilities?.service?.places.facilities;
    const catalog = persistence.facilities?.catalog();
    const runtime = society()?.facilityRuntime;
    const out: ArenaBuilding[] = [];
    map.forEachBuilding((building) => {
      const record = records?.get(building.id);
      const def = record && catalog ? catalog.facility(record.facilityId) : undefined;
      const durability =
        record && def && runtime ? facilityPoints(record, def.durability, at, runtime) : OBSTACLE_DURABILITY;
      out.push({
        sourceId: building.id,
        ...footprintRect(building.placement),
        durability,
        ...(def?.stage === DEFENSE_STAGE ? { wall: true } : {}),
      });
    });
    return out;
  };

  /** 전투를 연다: ok = 열림, safe = 시가지(안전지대), failed = 열지 못함(2차맵·싸울 유닛 없음) */
  const open = async (engagement: Engagement, at: number): Promise<"ok" | "safe" | "failed"> => {
    const { mapKey, resolution } = engagement;
    const key = pairKey(mapKey, engagement.nations[0], engagement.nations[1]);
    rest(key, at);
    const r = rules();
    // 시가지(안전지대) 안에서는 싸우지 않는다(D-146·D-174). 좌표 조우는 같은 2차맵의 가운데로 본다
    const loadedMap = world.maps.get(mapKey);
    const probe = loadedMap
      ? encounterCenter(
          engagement.sides.map((side) => side.flatMap((unit) => cellOf(loadedMap, unit.unitId, at) ?? [])),
        )
      : { x: 128, y: 128 };
    const urban = await persistence.territory
      ?.urbanCity(loadedMap?.planetId ?? TEST_PLANET_ID, { mapKey, ...probe })
      .catch(() => null);
    if (urban !== undefined && urban !== null) {
      counts.safe += 1;
      return "safe";
    }
    const ids = new Set(engagement.sides.flatMap((side) => side.map((unit) => unit.unitId)));
    // 채집 줄은 끝내지 않고 멈춘다(질문 2035 답 — 전투 뒤 다시 잇는다). 멈추기 전에 걸어야 벗어남으로 끝나지 않는다
    const gather = gatherOf(persistence);
    const gathers: HaltedGather[] = [];
    for (const side of engagement.sides)
      for (const unit of side) {
        const userId = persistence.owners.get(unit.ownerId)?.userId ?? null;
        if (userId !== null && gather?.suspend(unit.unitId) === true)
          gathers.push({ unitId: unit.unitId, ownerId: unit.ownerId, userId });
      }
    const trips = travel.haltOn(mapKey, ids);
    // 길이 없던 유닛(채집·서 있음)도 그 자리에 세운다(봇은 스스로 걷는다 — halt가 false)
    if (loadedMap) for (const id of ids) loadedMap.halt(id);
    // 띄우는 동안·결과를 적용할 때까지 내리지 않게
    travel.holdMap(mapKey, at + Math.max(0, r.cooldownMs));
    if (!loadedMap) {
      const opened = await persistence.spawn.open(mapKey);
      if (opened !== "ok") {
        log.info({ mapKey, opened }, "travel: encounter map could not be opened");
        for (const halted of gathers) gather?.drop(halted.unitId);
        return "failed";
      }
    }
    const map = world.maps.get(mapKey);
    if (!map) return "failed";
    // 공격 편이 편 1
    const ordered = resolution.attacker === 0 ? engagement.sides : [engagement.sides[1], engagement.sides[0]];
    const arenaSides: [ArenaUnit[], ArenaUnit[]] = [
      ordered[0].flatMap((unit) => cellOf(map, unit.unitId, at) ?? []),
      ordered[1].flatMap((unit) => cellOf(map, unit.unitId, at) ?? []),
    ];
    const terrain = (() => {
      try {
        return mapLayers(map);
      } catch {
        return null;
      }
    })();
    const mapCells = terrain?.size ?? Math.round(Math.sqrt(map.replicaInit().terrainCost.length));
    const size = arenaSizeOf(r.mapSize, mapCells);
    const origin = arenaOrigin(encounterCenter(arenaSides), size, mapCells);
    const arena = encounterMap(terrain, mapCells, arenaBuildings(map, at), origin, size);
    const retreat: readonly [number, number] =
      resolution.attacker === 0
        ? engagement.retreatPct
        : [engagement.retreatPct[1], engagement.retreatPct[0]];
    const init = buildEncounterInit({
      sides: arenaSides,
      map: arena.map,
      origin,
      retreatPct: retreat,
      unitRetreat: engagement.unitRetreat,
      ownerOf: (unitId) => map.unitInfo(unitId)?.ownerId ?? 0,
      place: (unitId, spot) =>
        persistence.bodies.build(
          unitId,
          { id: unitId, ...spot, moveIntervalMs: BATTLE_BASE_MOVE_MS, buildingMulPm: BUILDING_MUL_PM },
          now(),
        ),
      seed: randomInt(0x1_0000_0000),
    });
    if (!init) {
      log.info({ mapKey }, "travel: encounter had no fighters");
      for (const halted of gathers) gather?.drop(halted.unitId);
      return "failed";
    }
    // 전투맵 건물 피해 → 세계 시설 상태(질문 2030 답, world/battleTargets.ts)
    const records = persistence.facilities?.service?.places.facilities;
    const targets = siegeFacilityTargets(arena.sources, (id) => records?.has(id) === true, 0);
    const worldInit: WorldBattleInit = { ...init, targets };
    const battleId = await persistence.startBattle(worldInit, engagement.atWar);
    // 같은 나라 유저 유닛을 먼저 친 편은 신용이 내린다(약탈 행위 — D-588 2496 가, credit/hooks.ts)
    creditUnitAttack(
      persistence.ledger,
      ordered[0].map((unit) => unit.ownerId),
      ordered[1].map((unit) => unit.ownerId),
      at,
    );
    // 회피 편이 느려 붙잡혔다(D-573): 그 편(수비 편 = 편 2) 파티는 시작 틱에 퇴각을 시도한다(D-190 퇴각 규칙)
    if (resolution.flee)
      for (const party of init.parties)
        if (party.side === 2)
          await persistence.battles.addInput(battleId, {
            tick: 0,
            kind: "order",
            party: party.id,
            order: { kind: "retreat" },
          });
    const endsAt = (await persistence.battles.get(battleId))?.endsAtMs;
    if (endsAt !== undefined) {
      travel.holdMap(mapKey, endsAt + HOLD_SLACK_MS);
      const maxHp = new Map(init.units.map((unit) => [unit.id, unit.maxHp]));
      scheduleReconsider(battleId, endsAt, trips, gathers, maxHp);
    } else for (const halted of gathers) gather?.drop(halted.unitId);
    counts.battles += 1;
    log.info(
      {
        mapKey,
        battleId,
        loaded: engagement.loaded,
        nations: engagement.nations,
        choice: resolution.choice,
        choices: resolution.choices,
        flee: resolution.flee,
        war: engagement.atWar,
        units: init.units.length,
        origin,
        size,
      },
      "travel: encounter battle",
    );
    return "ok";
  };

  /** 고른 치는 편(mine)으로 대상을 친다(일부러 치기·NPC 같은 나라 치기): 수비 편 = 대상 + 둘레의 같은 주인 유닛, 수비 편은 조우와 같은 판단(gov-fix-3) */
  const strikeOn = async (
    map: SecondMap,
    mine: readonly SideUnit[],
    attackerOwner: number,
    targetUnitId: number,
    targetOwner: number,
    near: (cell: ArenaUnit) => boolean,
    at: number,
  ): Promise<StrikeCode> => {
    const r = rules();
    const theirs: SideUnit[] = [];
    map.forEachUnit((view) => {
      if (view.ownerId !== targetOwner || !isParticipant(view)) return;
      const info = map.unitInfo(view.id);
      const cell = cellOf(map, view.id, at);
      if (!info || !cell || unavailable(info.condition, at) || isAfloat(info)) return;
      if (view.id !== targetUnitId && !near(cell)) return;
      const decider = isDecider(view) && view.job.job === JOB_NONE;
      theirs.push({ unitId: view.id, ownerId: view.ownerId, kind: view.kind, decider, speed: info.speed });
    });
    const max = Math.max(1, r.maxSideUnits);
    const target0 = theirs.filter((unit) => unit.unitId === targetUnitId);
    const sides: [SideUnit[], SideUnit[]] = [
      mine.slice(0, max),
      [...target0, ...theirs.filter((unit) => unit.unitId !== targetUnitId)].slice(0, max),
    ];
    if (sides[1].length === 0) return "unknown_unit";
    const nations = [
      nationOfOwner(world, attackerOwner) ?? 0,
      nationOfOwner(world, targetOwner) ?? 0,
    ] as const;
    const war = nations[0] !== nations[1] && atWar(nations[0], nations[1]);
    const bodies = bodiesOf([...sides[0], ...sides[1]], at);
    // 수비 편도 조우와 같은 판단(바뀜 gov-fix-3 — 2581 (3)): 공격 편 짐(약탈 맞불 거리)·수비 편 ① 굴림
    const carriers = war
      ? new Set<number>()
      : cargoCarriers(
          persistence.ledger,
          sides[0].map((unit) => unit.unitId),
        );
    const views = [
      sideView(sides[0], nations[0], sources, bodies, carriers),
      sideView(sides[1], nations[1], sources, bodies, new Set(), roll),
    ] as const;
    const resolution = resolveStrike(views[0], views[1], war, r);
    if (resolution.escaped) {
      counts.escaped += 1;
      log.info({ mapKey: map.mapKey, nations, choices: resolution.choices }, "travel: strike escaped");
      return "escaped";
    }
    const opened = await open(
      {
        mapKey: map.mapKey,
        loaded: true,
        nations,
        sides,
        resolution,
        atWar: war,
        retreatPct: [views[0].retreatPct, views[1].retreatPct],
        unitRetreat: unitRetreats(sides, nations, sources),
      },
      at,
    );
    if (opened === "safe") return "safe_zone";
    return opened === "ok" ? "ok" : "busy";
  };

  /** 일부러 치기(unit_attack — 위 머리 주석 "바뀜 (fixes-1117c)") */
  const strike = async (input: StrikeInput): Promise<StrikeCode> => {
    if (stopped || world.status().state !== "ready") return "busy";
    const ownerId = persistence.settlement?.findOwnerOfUser(input.userId);
    if (ownerId === undefined) return "forbidden";
    const at = now();
    let map: SecondMap | undefined;
    for (const candidate of world.maps.values())
      if (candidate.unitInfo(input.targetUnitId)) {
        map = candidate;
        break;
      }
    const target = map?.unitInfo(input.targetUnitId);
    const targetCell = map ? cellOf(map, input.targetUnitId, at) : undefined;
    if (!map || !target || !targetCell || !isParticipant(target) || isAfloat(target)) return "unknown_unit";
    if (target.ownerId === ownerId) return "own_target";
    if (unavailable(target.condition, at)) return "unavailable";
    const reach = Math.max(1, rules().radiusCells);
    const near = (cell: ArenaUnit): boolean =>
      Math.max(Math.abs(cell.x - targetCell.x), Math.abs(cell.y - targetCell.y)) <= reach;
    const mine: SideUnit[] = [];
    for (const unitId of new Set(input.unitIds)) {
      const info = map.unitInfo(unitId);
      const cell = cellOf(map, unitId, at);
      if (!info || !cell) return "out_of_reach";
      if (info.ownerId !== ownerId || !isDecider(info)) return "forbidden";
      if (unavailable(info.condition, at) || isAfloat(info)) return "unavailable";
      if (!near(cell)) return "out_of_reach";
      mine.push({ unitId, ownerId, kind: info.kind, decider: true, speed: info.speed });
    }
    if (mine.length === 0) return "unknown_unit";
    const code = await strikeOn(map, mine, ownerId, input.targetUnitId, target.ownerId, near, at);
    // 같은 가문원을 친 사람은 가문에서 추방된다(공격은 막지 않는다 — 사용자 결정 D-592 2581 (4) [임시 — 해석 확인 중], factionIdentity/houseExpel.ts)
    if (code === "ok")
      await houseExpelOf(persistence)?.(input.userId, [target.ownerId], at).catch((error: unknown) =>
        log.error({ err: error }, "travel: house expel failed"),
      );
    return code;
  };

  /**
   * 같은 나라 유닛을 일부러 치는 NPC(바뀜 fixes-d592 — D-592 2581 (1) "같은국가 유닛공격은 드뭄 도시외부에서", npcStrike.ts): 띄운 2차맵마다 후보를 찾고 후보 하나에 한 번
   * 굴린다(설정 칸 × 공격 성향). 맞으면 도시(시가지) 밖일 때만 일부러 치기와 같은 길로 친다. 한 틱에 많아야 하나. 연 전투 수(0·1)
   */
  const npcStrikes = async (
    at: number,
    nationOf: (ownerId: number) => number | undefined,
  ): Promise<number> => {
    const r = rules();
    if (r.npcSameNationPpm <= 0) return 0;
    const reach = Math.max(1, r.radiusCells);
    for (const map of world.maps.values()) {
      const units: NpcStrikeUnit[] = [];
      map.forEachUnit((view) => {
        if (!isParticipant(view) || view.aboard !== undefined) return;
        const nation = nationOf(view.ownerId);
        if (nation === undefined) return;
        const info = map.unitInfo(view.id);
        if (!info || unavailable(info.condition, at) || isAfloat(info)) return;
        const point = positionAt(view.motion, at);
        units.push({
          unitId: view.id,
          ownerId: view.ownerId,
          nation,
          x: Math.floor(point.x / CELL_UNITS),
          y: Math.floor(point.y / CELL_UNITS),
          decider: isDecider(view) && view.job.job === JOB_NONE,
          npc: !playerOwned(view.ownerId),
        });
      });
      for (const found of npcStrikeCandidates(units, reach)) {
        const key = pairKey(map.mapKey, found.nation, found.nation);
        if (cooling(key, at)) continue;
        const chance = npcStrikeChancePpm(r.npcSameNationPpm, aggressionOf(found.npcOwner, found.nation));
        if (rollPpm() >= chance) continue;
        // 도시(시가지) 안에서는 치지 않는다(D-592 "도시외부에서" — open도 다시 본다)
        const urban = await persistence.territory
          ?.urbanCity(map.planetId ?? TEST_PLANET_ID, {
            mapKey: map.mapKey,
            x: found.target.x,
            y: found.target.y,
          })
          .catch(() => null);
        if (urban !== undefined && urban !== null) continue;
        const near = (cell: ArenaUnit): boolean =>
          Math.max(Math.abs(cell.x - found.target.x), Math.abs(cell.y - found.target.y)) <= reach;
        const mine: SideUnit[] = [];
        for (const unit of found.attackers) {
          const info = map.unitInfo(unit.unitId);
          const cell = cellOf(map, unit.unitId, at);
          if (!info || !cell || !near(cell)) continue;
          const { unitId, ownerId, decider } = unit;
          mine.push({ unitId, ownerId, kind: info.kind, decider, speed: info.speed });
        }
        if (mine.length === 0) continue;
        const code = await strikeOn(
          map,
          mine,
          found.npcOwner,
          found.target.unitId,
          found.targetOwner,
          near,
          at,
        );
        counts.npcStrikes += 1;
        log.info({ mapKey: map.mapKey, nation: found.nation, code }, "travel: npc same-nation strike");
        rest(key, at);
        return code === "ok" ? 1 : 0;
      }
    }
    return 0;
  };
  strikes.set(travel, strike);

  const scan = async (): Promise<number> => {
    if (busy || stopped || world.status().state !== "ready") return 0;
    busy = true;
    const started = performance.now();
    try {
      const at = now();
      // 한 틱 안 나라 찾기 캐시(가문·시민권을 주체마다 한 번)
      const nations = new Map<number, number | undefined>();
      const nationOf = (ownerId: number): number | undefined => {
        if (nations.has(ownerId)) return nations.get(ownerId);
        const nation = nationOfOwner(world, ownerId);
        nations.set(ownerId, nation);
        return nation;
      };
      const found = [...coordinateEngagements(at, nationOf), ...loadedEngagements(at, nationOf)];
      counts.scans += 1;
      counts.scanMs += performance.now() - started;
      let opened = 0;
      for (const engagement of found.slice(0, Math.max(1, rules().maxPerScan))) {
        if (stopped) break;
        try {
          if ((await open(engagement, at)) === "ok") opened += 1;
        } catch (error) {
          log.error({ err: error, mapKey: engagement.mapKey }, "travel: encounter failed");
        }
      }
      if (!stopped)
        opened += await npcStrikes(at, nationOf).catch((error: unknown) => {
          log.error({ err: error }, "travel: npc same-nation strike failed");
          return 0;
        });
      return opened;
    } finally {
      busy = false;
    }
  };

  let loop: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => {
    if (stopped || options.timer === false) return;
    loop = setTimeout(
      () => {
        void scan().finally(arm);
      },
      Math.max(1000, rules().scanMs),
    );
    loop.unref();
  };
  arm();
  return {
    scan,
    strike,
    takeMetrics() {
      const out = {
        encounterScans: counts.scans,
        encounterScanMs: Math.round(counts.scanMs * 10) / 10,
        encounterContacts: counts.contacts,
        encounterAvoided: counts.avoided,
        encounterBattles: counts.battles,
        encounterSafe: counts.safe,
        encounterEscaped: counts.escaped,
        encounterNpcStrikes: counts.npcStrikes,
      };
      counts.scans = 0;
      counts.scanMs = 0;
      counts.contacts = 0;
      counts.avoided = 0;
      counts.battles = 0;
      counts.safe = 0;
      counts.escaped = 0;
      counts.npcStrikes = 0;
      return out;
    },
    stop() {
      stopped = true;
      strikes.delete(travel);
      if (loop) clearTimeout(loop);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      travel.attachPace(undefined);
    },
  };
}
