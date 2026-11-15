// 도시 방어(서버) — 세계 전투를 열기 전에 시작 자료를 고친다. 기획 답 452 다(비활성 휴먼은 이동은 되고 전투만 막는다)·456 가(수호신 = 새 종류
// 유닛으로 그 도시에 남아 방어전에 나서고 도시 버프 하나, 버프 종류는 수호신마다 편집기 칸·출발값 방어), docs/adr/2026-11-07-temple-religion.md
// "바뀜 (기획 답 451~459)".
// - 비활성 빼기: 세계 전투를 여는 모든 길(정원사 웨이브·건물 공격)의 시작 자료에서 비활성 유닛을 뺀다(빈 파티도 뺀다). 건물 공격은 공격 유닛을
//   고를 때 이미 막고(unit_busy) 수비를 고를 때도 빼지만, 이 단계가 모든 길의 마지막 그물이다.
// - 공격받는 도시: 웨이브 = 그 웨이브의 도시(전투 ID = 웨이브 ID), 건물 공격 = 목표 건물이 선 도시(시설) 또는 비콘의 도시. 서버 NPC 공성은 아직
//   전투 없이 점령한다(전투가 생기면 같은 길을 지난다).
// - 수호신 넣기: 그 도시의 수호신 유닛 가운데 싸울 수 있는 것(세계에 있음·수호신 종류·부상·포로·비활성 아님·이미 든 유닛 아님·공격 편 주인의
//   것이 아님)을 수비 편 새 파티로 수비 유닛 곁(없으면 넥서스 곁)의 빈 칸에 세운다. 몸 = 저장된 스탯 몸(신격화할 때의 1차 스탯·레벨·환생·속성)
//   + 입은 물건·걸린 효과(세계 전투와 같은 셈).
// - 방어 버프: 그 도시의 방어 버프 수호신(공격 편 주인의 것 빼고, 유닛이 없는 옛 기록도 든다)마다 설정 칸 d311_guardian_defense_pm ‰을 더해
//   수비 편 모든 유닛에 전투 내내 걸린 효과(방어율 버프)로 넣는다(@terra/sim guardianDefensePm — 판정은 걸린 효과 합을 그대로 읽는다).
import {
  type BattleInit,
  type BattlePartySpec,
  type CombatUnitSpec,
  type StartEffect,
  type TempleCoefficients,
  guardianDefensePm,
  isWaveBattle,
} from "@terra/sim";
import type { BodyBase, SpecPlace } from "../roster/unitBody.ts";
import type { BattleBodies } from "../world/battleBodies.ts";
import { type BattleTarget, targetsOf } from "../world/battleTargets.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_GUARDIAN } from "../world/unitKinds.ts";
import { type GuardianRow, readGuardians } from "./rows.ts";

/** 수호신 방어 버프의 걸린 효과 ID(전투 결과·다시보기에서 보인다) */
export const GUARDIAN_DEFENSE_EFFECT = "guardian_defense";
/** 전투 내내(판정은 끝 시각이 0보다 큰 효과만 넣는다 — 가장 긴 전투보다 길게) */
const WHOLE_BATTLE_MS = 0x7fff_ffff;
/** [임시] 수호신 파티 크기·한 칸 1초·사람형 건물 피해 배율(건물 공격·웨이브와 같다) */
const PARTY_SIZE = 6;
const MOVE_INTERVAL_MS = 1000;
const BUILDING_MUL_PM = 2000;
/** 빈 칸을 찾는 반지름(전투맵 칸) */
const PLACE_RADIUS = 12;
/** 팩 unit_kinds 수호신 ID */
export const GUARDIAN_UNIT_KIND = "guardian";

/** 시작 자료에서 비활성 유닛을 뺀다(유닛이 없어진 파티도 뺀다). 뺄 것이 없으면 같은 객체 */
export function withoutInactive<T extends BattleInit>(init: T, isInactive: (unitId: number) => boolean): T {
  const units = init.units.filter((unit) => !isInactive(unit.id));
  if (units.length === init.units.length) return init;
  const parties = new Set(units.map((unit) => unit.party));
  return { ...init, units, parties: init.parties.filter((party) => parties.has(party.id)) };
}

/** 수호신의 몸 바탕: 신격화할 때의 1차 스탯·레벨·환생·속성(성장 없음) */
export function guardianBase(row: GuardianRow): BodyBase {
  const at = (index: number): number => row.stats[index] ?? 0;
  return {
    kind: "stats",
    unitKind: GUARDIAN_UNIT_KIND,
    primaries: { str: at(0), dex: at(1), agi: at(2), vit: at(3), int: at(4), wis: at(5) },
    level: Math.max(1, row.level),
    rebirths: Math.max(0, row.rebirths),
    elements: row.elements,
  };
}

export interface DefendCityInput {
  /** 그 도시의 수호신 줄(유닛이 없는 옛 기록 포함 — 버프만 든다) */
  readonly guardians: readonly GuardianRow[];
  /** 수호신 유닛이 싸울 수 있나(세계에 있고 수호신 종류·부상·포로·비활성이 아님) */
  readonly canFight: (unitId: number) => boolean;
  /** 수호신 하나의 전투 사양(자리·편·파티). 만들 수 없으면 undefined(그 수호신은 빠진다) */
  readonly build: (row: GuardianRow, place: SpecPlace) => CombatUnitSpec | undefined;
  readonly c: TempleCoefficients;
}

/** 칸이 비었나(지나갈 수 있고 건물·유닛이 없다) */
function freeCells(init: BattleInit): (x: number, y: number) => boolean {
  const { size } = init.map;
  const taken = new Set<number>();
  for (const building of init.map.buildings) for (const cell of building.cells) taken.add(cell);
  for (const unit of init.units) taken.add(unit.y * size + unit.x);
  return (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    const index = y * size + x;
    if (taken.has(index) || init.map.passable[index] !== 1) return false;
    taken.add(index);
    return true;
  };
}

/** 기준 칸 둘레의 빈 칸 하나(가까운 고리부터, 같은 고리는 위 → 아래·왼 → 오른). 없으면 undefined */
function nearestFree(
  free: (x: number, y: number) => boolean,
  cx: number,
  cy: number,
): { x: number; y: number } | undefined {
  for (let r = 0; r <= PLACE_RADIUS; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
  return undefined;
}

/**
 * 수비 편에 그 도시의 수호신을 넣고 방어 버프를 건다. 수비 편이 없으면 그대로. 공격 편 주인(편 faction = 소유 주체 ID, [임시] 서버 해석)의
 * 수호신은 싸우지도 버프를 주지도 않는다
 */
export function defendCity<T extends BattleInit>(init: T, input: DefendCityInput): T {
  const defender = init.sides.find((side) => side.defender);
  if (!defender) return init;
  const attackers = new Set(init.sides.filter((side) => !side.defender).map((side) => side.faction));
  const own = input.guardians.filter((row) => !attackers.has(row.ownerId));
  if (own.length === 0) return init;
  const present = new Set(init.units.map((unit) => unit.id));
  const fighters = own.filter((row) => !present.has(row.unitId) && input.canFight(row.unitId));
  const guard = init.units.find((unit) => unit.side === defender.id);
  const nexus = init.map.buildings.find((building) => building.nexus)?.cells[0];
  const size = init.map.size;
  const anchor = guard
    ? { x: guard.x, y: guard.y }
    : nexus === undefined
      ? { x: size >> 1, y: size >> 1 }
      : { x: nexus % size, y: Math.floor(nexus / size) };
  const free = freeCells(init);
  const firstParty = init.parties.reduce((max, party) => Math.max(max, party.id), 0) + 1;
  const added: CombatUnitSpec[] = [];
  for (const row of fighters) {
    const cell = nearestFree(free, anchor.x, anchor.y);
    if (!cell) break;
    const spec = input.build(row, {
      id: row.unitId,
      side: defender.id,
      party: firstParty + Math.floor(added.length / PARTY_SIZE),
      x: cell.x,
      y: cell.y,
      // 기본 간격 — 수호신 걸음은 제 몸의 실효 AGI로 센다(사용자 1265, D-553. 수비 휴먼의 줄어든 간격을 넘기지 않는다)
      moveIntervalMs: MOVE_INTERVAL_MS,
      buildingMulPm: guard?.buildingMulPm ?? BUILDING_MUL_PM,
    });
    if (spec) added.push(spec);
  }
  const parties: BattlePartySpec[] = [...new Set(added.map((unit) => unit.party))].map((id) => ({
    id,
    side: defender.id,
    retreatHpPct: 0,
  }));
  const value = guardianDefensePm(
    own.map((row) => row.buff),
    input.c,
  );
  const buff: StartEffect = {
    id: GUARDIAN_DEFENSE_EFFECT,
    kind: "buff",
    stat: "defense_rate",
    valueMode: "permille",
    value,
    untilMs: WHOLE_BATTLE_MS,
  };
  const units = [...init.units, ...added].map((unit) =>
    value > 0 && unit.side === defender.id
      ? { ...unit, startEffects: [...(unit.startEffects ?? []), buff] }
      : unit,
  );
  if (added.length === 0 && value <= 0) return init;
  return { ...init, parties: [...init.parties, ...parties], units };
}

export interface CityDefenseDeps {
  readonly pool: QueryPool;
  readonly writer: WorldWriter;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly bodies: Pick<BattleBodies, "build">;
  /** 비활성 유닛인가(신전 서비스 메모리 표) */
  readonly isInactive: (unitId: number) => boolean;
  /** 웨이브 전투의 도시(전투 시작 자료 ID = 웨이브 ID). 모르면 undefined */
  readonly waveCity: (waveId: number) => number | undefined;
  /** 세계 건물 목표가 선 도시(시설 = 건물 도시, 비콘 = 비콘 도시). 모르면 null */
  readonly targetCity: (target: BattleTarget) => number | null;
  readonly rules: () => TempleCoefficients;
}

export interface CityDefense {
  /** 세계 전투 시작 자료: 비활성 빼기 → (공격받는 도시가 있으면) 수호신·방어 버프 */
  prepare<T extends BattleInit>(init: T, nowMs: number): Promise<T>;
}

export function createCityDefense(deps: CityDefenseDeps): CityDefense {
  const infoOf = (unitId: number) => {
    for (const map of deps.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info;
    }
    return undefined;
  };
  const cityOf = (init: BattleInit): number | null => {
    if (isWaveBattle(init)) return deps.waveCity(init.id) ?? null;
    for (const target of targetsOf(init)) {
      const city = deps.targetCity(target);
      if (city !== null) return city;
    }
    return null;
  };
  return {
    async prepare(init, nowMs) {
      const filtered = withoutInactive(init, deps.isInactive);
      const city = cityOf(init);
      if (city === null) return filtered;
      await deps.writer.durable();
      const guardians = await readGuardians(deps.pool, { cityId: city });
      if (guardians.length === 0) return filtered;
      return defendCity(filtered, {
        guardians,
        c: deps.rules(),
        canFight: (unitId) => {
          const info = infoOf(unitId);
          return (
            info !== undefined &&
            info.kind === UNIT_KIND_GUARDIAN &&
            !unavailable(info.condition, nowMs) &&
            !deps.isInactive(unitId)
          );
        },
        build: (row, place) => deps.bodies.build(row.unitId, place, nowMs, guardianBase(row)),
      });
    },
  };
}
