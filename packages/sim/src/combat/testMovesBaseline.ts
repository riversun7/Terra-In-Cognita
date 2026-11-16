// 시험 도우미: 움직임 부품이 없는 전투 묶음(달리기·이동 부품·곡선을 더하기 전과 결과가 같은지 — moves.test.ts).
// 스킬·마법·지속형이 섞인 시범 6 대 6(시험 전투 자료)과 리플레이 사건까지 지문을 뜬다. docs/adr/2026-11-15-combat-moves.md 4절
import { runBattle } from "./battle.ts";
import { type CombatCatalog, TEST_COMBAT_CATALOG } from "./catalog.ts";
import { recordBattleReplay } from "./replay.ts";
import { demoSkirmish } from "./replayDemo.ts";
import { openMap } from "./testBattle.ts";

/** FNV-1a 32비트 두 번(다른 시작값) → 16자 지문 */
function fingerprint(text: string): string {
  const fnv = (start: number): string => {
    let h = start;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x0100_0193) >>> 0;
    return h.toString(16).padStart(8, "0");
  };
  return fnv(0x811c_9dc5) + fnv(0x0bad_f00d);
}

/** 곡선 칸이 없는 스킬을 모두 끈(curves: []) 시험 계열표 — 공격 스킬 사거리 예산을 기본으로 켜기 전(D-573, SIM 60 전) 스킬 */
const SKILL_CURVES_OFF: CombatCatalog = {
  ...TEST_COMBAT_CATALOG,
  skills: TEST_COMBAT_CATALOG.skills.map((row) => (row.curves === undefined ? { ...row, curves: [] } : row)),
};

/**
 * 무기·스킬 곡선을 모두 끈 시험 계열표(curves: []). 무기 사거리 예산을 기본으로 켜기 전(질문 1814, SIM 57) 판정과 같은 간격이다
 */
const CURVES_OFF: CombatCatalog = {
  ...SKILL_CURVES_OFF,
  equipment: TEST_COMBAT_CATALOG.equipment.map((item) =>
    item.weapon ? { ...item, weapon: { ...item.weapon, curves: [] } } : item,
  ),
};

/**
 * 시범 6 대 6 끝 상태 지문(시드 셋)과 리플레이 사건 지문(시드 하나). curves "off" = 무기·스킬 곡선을 모두 끈 계열표(옛 간격),
 * "weapon" = 무기만 기본(스킬 곡선 끔 — D-573 전 판정), "default" = 팩·시험 자료 그대로(곡선 칸 없음 = 무기·공격 스킬 사거리 예산 켬)
 */
export function movesBaselineHashes(
  curves: "off" | "weapon" | "default" = "default",
): Record<string, string> {
  const catalog =
    curves === "off" ? CURVES_OFF : curves === "weapon" ? SKILL_CURVES_OFF : TEST_COMBAT_CATALOG;
  const out: Record<string, string> = {};
  for (const seed of [1, 7, 42]) {
    const { init } = demoSkirmish({ catalog, map: openMap(64), seed });
    const { finalState, result } = runBattle(init, []);
    out[`demo${seed}`] = fingerprint(JSON.stringify(result) + finalState);
  }
  const { init } = demoSkirmish({ catalog, map: openMap(64), seed: 3 });
  const { replay } = recordBattleReplay(init);
  out.replay3 = fingerprint(JSON.stringify(replay.events));
  return out;
}
