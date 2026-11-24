// 코드·시나리오가 ID로 쓰는 아이템 표(설계안 3.6) — 끄거나 칸·무기 칸을 바꾸면 그 쓰임이 빈 칸·대신 것으로 바뀐다.
// sim 묶음은 @terra/sim SIM_ITEM_REFS(시뮬 유닛·정원사 마법형·다시보기 시범), 전투 실험실 샘플은 LAB_SAMPLES에서 모으고, 서버 시안
// (유닛·사이보그 시안 몸·짐, 경제 시안 보유·생산)은 여기 적는다. codeRefs.test.ts가 시안 소스 파일에 적힌 아이템 ID와 이 표를 맞춰 본다.
import type { ItemCodeRef } from "@terra/shared/itemEditor";
import { SIM_ITEM_REFS } from "@terra/sim";
import { LAB_SAMPLES } from "../battleLab/samples.ts";

/** 유닛·사이보그 시안이 쓰는 아이템(apps/server/src/roster/preview.ts) */
export const ROSTER_PREVIEW_ITEMS: readonly string[] = [
  "grain",
  "household_goods",
  "iron_ingot",
  "iron_ore",
  "ration",
  "test_charm",
  "test_heart",
  "test_helmet",
  "test_ring",
  "test_staff",
  "test_sword",
  "test_vest",
  "timber",
];

/** 경제 시안이 쓰는 아이템(apps/server/src/economyView/previewWorld.ts·previewProduction.ts) */
export const ECONOMY_PREVIEW_ITEMS: readonly string[] = [
  "grain",
  "household_goods",
  "iron_ingot",
  "iron_ore",
  "ration",
  "test_sword",
  "test_vest",
  "timber",
];

/** 전투 실험실 샘플(읽기 전용 프리셋)이 쓰는 아이템 */
function labItems(): string[] {
  const ids = new Set<string>();
  for (const preset of LAB_SAMPLES) {
    const units = preset.kind === "unit" ? [preset.data] : preset.data.units;
    for (const unit of units) {
      if (unit.weapon.kind === "item") ids.add(unit.weapon.id);
      for (const entry of unit.equipment) ids.add(entry.item);
    }
  }
  return [...ids].toSorted();
}

/** 아이템 ID → 코드 참조(쓰는 곳·쓰임) */
export function itemCodeRefs(): ReadonlyMap<string, readonly ItemCodeRef[]> {
  const refs = new Map<string, ItemCodeRef[]>();
  const add = (ids: readonly string[], ref: ItemCodeRef): void => {
    for (const id of ids) refs.set(id, [...(refs.get(id) ?? []), ref]);
  };
  add(SIM_ITEM_REFS.sim_combat, { where: "packages/sim/src/simulator/combatRun.ts", use: "sim_combat" });
  add(SIM_ITEM_REFS.sim_wave, { where: "packages/sim/src/simulator/waveBattle.ts", use: "sim_wave" });
  add(SIM_ITEM_REFS.replay_demo, { where: "packages/sim/src/combat/replayDemo.ts", use: "replay_demo" });
  add(labItems(), { where: "apps/server/src/battleLab/samples.ts", use: "battle_lab" });
  add(ROSTER_PREVIEW_ITEMS, { where: "apps/server/src/roster/preview.ts", use: "roster_preview" });
  add(ECONOMY_PREVIEW_ITEMS, {
    where: "apps/server/src/economyView/previewWorld.ts",
    use: "economy_preview",
  });
  return refs;
}
