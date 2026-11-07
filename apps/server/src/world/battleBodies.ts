// 세계 전투 시작 사양의 몸 — docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)".
// 세계가 여는 전투(NPC 런타임 startBattle = 정원사 웨이브 공성)의 시작 자료에서, 세계가 몸을 아는 유닛의 사양을 사이보그 화면·유닛
// 상세와 같은 함수(roster/unitBody.ts combatSpecOf)로 다시 만든다:
// - 사이보그 본체: 늘(저장된 처음 값·K·레벨 + 입은 장비·인공장기·걸린 효과).
// - 그 밖 세계 유닛: 입은 물건(내구도 > 0)이나 걸린 효과가 있을 때만 [임시] 기본 몸(유닛 상세와 같다) + 그것. 없으면 시작 자료 그대로
//   (NPC 휴먼 수비대는 시뮬과 같은 [임시] 사양 sim specOf — 저장된 유닛 스탯이 아직 없다).
// - 자리·편·파티·이동 간격·건물 피해 배율·시선 높이·공중·지휘 정원은 시작 자료 그대로 둔다. 세계에 없는 전투 유닛(크리쳐)은 건너뛴다.
// 생명 수치(남은 HP·아머·쉴드, src/vitals/ battleStart)는 이 뒤에 붙인다(새 최대로 자르게).
import type { BattleInit, CombatUnitSpec } from "@terra/sim";
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
import type { SecondMap } from "./secondMap.ts";

export interface BattleBodies {
  /** 시작 자료의 세계 유닛 사양을 실효 몸으로 바꾼다. 바뀐 것이 없으면 같은 객체 */
  battleStart(init: BattleInit, nowMs: number): BattleInit;
  /**
   * 세계 유닛 하나의 전투 사양(바탕 = 사이보그 본체 또는 [임시] 기본 몸 + 입은 물건·걸린 효과). 세계에 없거나 전투 자료가 없으면 undefined.
   * 건물 공격 전투(facilities/attack.ts)가 시작 자료를 만들 때 쓴다. base를 주면 그 바탕을 쓴다(수호신 = 저장된 스탯 몸, temple/cityDefense.ts)
   */
  build(unitId: number, place: SpecPlace, nowMs: number, base?: BodyBase): CombatUnitSpec | undefined;
}

export function createBattleBodies(input: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly cyborgs: Pick<CyborgService, "userOfUnit" | "record">;
  readonly gearOf: (unitId: number, nowMs: number) => UnitGear;
  /** 유닛 화면 전투 자료(실효 장비·스킬·가중치 표·계수표). 없으면 시작 자료 그대로 */
  readonly catalog: (() => RosterCatalog) | undefined;
}): BattleBodies {
  const exists = (unitId: number): boolean => {
    for (const map of input.maps.values()) if (map.unitInfo(unitId)) return true;
    return false;
  };
  /** 세계가 아는 몸 바탕(사이보그 = 저장된 본체, 그 밖 = [임시] 기본 몸) */
  const baseOf = (unitId: number): BodyBase => {
    const userId = input.cyborgs.userOfUnit(unitId);
    const record = userId === undefined ? undefined : input.cyborgs.record(userId);
    return record ? { kind: "cyborg", record } : BASELINE_BASE;
  };
  return {
    build(unitId, place, nowMs, base) {
      const catalog = input.catalog?.();
      if (!catalog || !exists(unitId)) return undefined;
      return combatSpecOf(catalog, base ?? baseOf(unitId), input.gearOf(unitId, nowMs), place, nowMs);
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
            moveIntervalMs: spec.moveIntervalMs,
            buildingMulPm: spec.buildingMulPm,
            eye: spec.eye,
            air: spec.air,
            commandCap: spec.commandCap,
          },
          nowMs,
        );
        return spec.start ? { ...rebuilt, start: spec.start } : rebuilt;
      });
      return changed ? { ...init, units } : init;
    },
  };
}
