// 세계 전투 시작 사양의 몸 — docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)".
// 세계가 여는 전투(NPC 런타임 startBattle = 정원사 웨이브 공성)의 시작 자료에서, 세계가 몸을 아는 유닛의 사양을 사이보그 화면·유닛
// 상세와 같은 함수(roster/unitBody.ts combatSpecOf)로 다시 만든다:
// - 사이보그 본체: 늘(저장된 처음 값·K·레벨 + 입은 장비·인공장기·걸린 효과).
// - 그 밖 세계 유닛: 입은 물건(내구도 > 0)이나 걸린 효과가 있을 때만 [임시] 기본 몸(유닛 상세와 같다) + 그것. 없으면 시작 자료 그대로
//   (NPC 휴먼 수비대는 시뮬과 같은 [임시] 사양 sim specOf — 저장된 유닛 스탯이 아직 없다).
// - 자리·편·파티·이동 간격·건물 피해 배율·시선 높이·공중은 시작 자료 그대로 둔다. 세계에 없는 전투 유닛(크리쳐)은 건너뛴다.
// - 지휘 정원은 다시 만든 몸의 계급(D-558 — commandRankOf, 사이보그 본체의 전투 랭킹 등급·작위)과 환생으로 다시 센다.
// 생명 수치(남은 HP·아머·쉴드, src/vitals/ battleStart)는 이 뒤에 붙인다(새 최대로 자르게).
import { BATTLE_BASE_MOVE_MS, type BattleInit, type CombatUnitSpec, type CommandRank } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import {
  BASELINE_BASE,
  type BodyBase,
  type SpecPlace,
  type UnitGear,
  combatSpecOf,
  hasGear,
} from "../roster/unitBody.ts";
import { clashPower } from "../travel/clashDecide.ts";
import type { SecondMap } from "./secondMap.ts";

export interface BattleBodies {
  /** 시작 자료의 세계 유닛 사양을 실효 몸으로 바꾼다. 바뀐 것이 없으면 같은 객체 */
  battleStart(init: BattleInit, nowMs: number): BattleInit;
  /**
   * 세계 유닛 하나의 전투 사양(바탕 = 사이보그 본체 또는 [임시] 기본 몸 + 입은 물건·걸린 효과). 세계에 없거나 전투 자료가 없으면 undefined.
   * 건물 공격 전투(facilities/attack.ts)가 시작 자료를 만들 때 쓴다. base를 주면 그 바탕을 쓴다(수호신 = 저장된 스탯 몸, temple/cityDefense.ts)
   */
  build(unitId: number, place: SpecPlace, nowMs: number, base?: BodyBase): CombatUnitSpec | undefined;
  /**
   * 랭킹 전투력(house-9, D-576·D-7022 "버프 없는 기본 수치"): 걸린 효과·부상 불이익을 뺀 몸(바탕 + 입은 장비)의 조우 전력 식(clashPower, 최대 생명
   * 수치). 띄운 2차맵에 없어도 센다. 유닛 화면 전투 자료가 없으면 0. 기본 몸에 입은 것이 없는 유닛은 한 값을 다시 쓴다(NPC 휴먼 수천)
   */
  basePower(unitId: number, nowMs: number): number;
}

/** 세계가 아는 몸 바탕(사이보그 = 저장된 본체, 그 밖 = [임시] 기본 몸). 걷기 속도(walkSpeed.ts)도 같은 바탕을 쓴다 */
export function worldBodyBase(
  cyborgs: Pick<CyborgService, "userOfUnit" | "record">,
  unitId: number,
): BodyBase {
  const userId = cyborgs.userOfUnit(unitId);
  const record = userId === undefined ? undefined : cyborgs.record(userId);
  return record ? { kind: "cyborg", record } : BASELINE_BASE;
}

export function createBattleBodies(input: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly cyborgs: Pick<CyborgService, "userOfUnit" | "record">;
  readonly gearOf: (unitId: number, nowMs: number) => UnitGear;
  /** 유닛 화면 전투 자료(실효 장비·스킬·가중치 표·계수표). 없으면 시작 자료 그대로 */
  readonly catalog: (() => RosterCatalog) | undefined;
  /** 지휘 계급(D-558, commandRanks.ts). 없으면 계급 없음(아래 끝 정원) */
  readonly commandRankOf?: ((unitId: number) => CommandRank | undefined) | undefined;
}): BattleBodies {
  const exists = (unitId: number): boolean => {
    for (const map of input.maps.values()) if (map.unitInfo(unitId)) return true;
    return false;
  };
  const baseOf = (unitId: number): BodyBase => worldBodyBase(input.cyborgs, unitId);
  /** 기본 몸·입은 것 없음의 전투력(팩 자료가 바뀌면 다시 센다) */
  let bare: { readonly catalog: RosterCatalog; readonly power: number } | undefined;
  const POWER_PLACE: SpecPlace = {
    id: 0,
    side: 1,
    party: 1,
    x: 0,
    y: 0,
    moveIntervalMs: BATTLE_BASE_MOVE_MS,
    buildingMulPm: 1000,
  };
  return {
    basePower(unitId, nowMs) {
      const catalog = input.catalog?.();
      if (!catalog) return 0;
      const base = baseOf(unitId);
      // 시간제 효과·부상 불이익은 뺀다(D-7022) — 입은 장비·인공장기만
      const gear: UnitGear = { equipped: input.gearOf(unitId, nowMs).equipped, effects: [] };
      if (base.kind === "baseline" && !hasGear(gear)) {
        if (bare?.catalog !== catalog)
          bare = { catalog, power: clashPower(combatSpecOf(catalog, base, gear, POWER_PLACE, nowMs)) };
        return bare.power;
      }
      return clashPower(combatSpecOf(catalog, base, gear, { ...POWER_PLACE, id: unitId }, nowMs));
    },
    build(unitId, place, nowMs, base) {
      const catalog = input.catalog?.();
      if (!catalog || !exists(unitId)) return undefined;
      const rank = place.commandRank ?? input.commandRankOf?.(unitId);
      const at = rank ? { ...place, commandRank: rank } : place;
      return combatSpecOf(catalog, base ?? baseOf(unitId), input.gearOf(unitId, nowMs), at, nowMs);
    },
    battleStart(init, nowMs) {
      const catalog = input.catalog?.();
      if (!catalog) return init;
      let changed = false;
      const units = init.units.map((spec) => {
        if (!exists(spec.id)) return spec;
        const base = baseOf(spec.id);
        const gear = input.gearOf(spec.id, nowMs);
        if (base.kind === "baseline" && !hasGear(gear)) return spec;
        const rank = input.commandRankOf?.(spec.id);
        changed = true;
        const rebuilt = combatSpecOf(
          catalog,
          base,
          gear,
          {
            id: spec.id,
            side: spec.side,
            party: spec.party,
            x: spec.x,
            y: spec.y,
            // 기본 간격(1초)을 넘긴다 — 걸음은 다시 만든 몸의 실효 AGI로 다시 센다(사용자 1265, D-553. 옛 사양 값을 넘기면 두 번 줄어든다)
            moveIntervalMs: BATTLE_BASE_MOVE_MS,
            buildingMulPm: spec.buildingMulPm,
            eye: spec.eye,
            air: spec.air,
            // 지휘관 정원은 다시 만든 몸의 계급·환생으로 센다(설정 칸 C7, D-558)
            ...(rank ? { commandRank: rank } : {}),
          },
          nowMs,
        );
        return spec.start ? { ...rebuilt, start: spec.start } : rebuilt;
      });
      return changed ? { ...init, units } : init;
    },
  };
}
