// 무기 1차 적정 스탯 → 무기 사양의 2차 적정치(D-496, 질문 290 가: 착용 제한이 아니라 효율 기준) — 아이템 편집기 WP-5.
// docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-02, WP-5)", docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-02, 장비 전투 연결)".
// 전투 자료를 만들 때(packCatalog.ts combatCatalogFrom)와 가중치 표가 바뀔 때(withStatTable: 밸런스 화면 가중치 칸·행 식 덮어쓰기)
// 그 세계의 실효 가중치 표로 셈해 무기 사양의 적정치 칸(물리·속성 공격력·명중·크리·속도)에 넣는다. 판정(formula.ts 무기 틀
// min(상한, 유닛 값 ÷ 적정치))은 그대로이고 적정치만 이 값이다. 1차 적정 스탯이 없는 무기는 직접 적은 적정치 그대로다.
import { appropriateFromPrimaries } from "./appropriate.ts";
import type { CombatCatalog } from "./catalog.ts";
import type { EquipDef } from "./equipment.ts";
import type { StatRow } from "./stats.ts";
import type { WeaponSpec } from "./unitSpec.ts";

/**
 * 장비 정의의 무기 사양에 1차 적정 스탯으로 셈한 2차 적정치를 넣는다. 1차 적정 스탯이 없으면 그 사양 그대로(같은 객체).
 * 셈이 던지면(행 식 넘침 등) 지금 사양 그대로 둔다(전투 자료를 만들다 멈추지 않게)
 */
export function resolveWeaponAppropriate(
  def: Pick<EquipDef, "weapon" | "appropriate">,
  table: readonly StatRow[],
): WeaponSpec | undefined {
  const weapon = def.weapon;
  if (!weapon || !def.appropriate) return weapon;
  let derived: ReturnType<typeof appropriateFromPrimaries>;
  try {
    derived = appropriateFromPrimaries(def.appropriate, table);
  } catch {
    return weapon;
  }
  return {
    ...weapon,
    ...(weapon.physical
      ? { physical: { ...weapon.physical, attackAppropriate: derived.physicalAttack } }
      : {}),
    ...(weapon.elemental
      ? { elemental: { ...weapon.elemental, attackAppropriate: derived.elementalAttack } }
      : {}),
    hitAppropriate: derived.hit,
    critAppropriate: derived.crit,
    speedAppropriate: derived.speed,
  };
}

/**
 * 가중치 표를 바꾼 전투 자료: 1차 적정 스탯이 있는 무기의 적정치를 새 표로 다시 셈한다. 같은 표면 같은 묶음, 그런 무기가 없으면
 * 장비 목록도 그대로(같은 객체 = 같은 캐시)
 */
export function withStatTable(catalog: CombatCatalog, table: readonly StatRow[]): CombatCatalog {
  if (catalog.statTable === table) return catalog;
  let changed = false;
  const equipment = catalog.equipment.map((def) => {
    if (!def.appropriate || !def.weapon) return def;
    changed = true;
    return { ...def, weapon: resolveWeaponAppropriate(def, table) };
  });
  return { ...catalog, statTable: table, equipment: changed ? equipment : catalog.equipment };
}
