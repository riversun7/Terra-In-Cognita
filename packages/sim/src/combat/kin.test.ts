// 같은 무리끼리 치지 않기 시험(kin.ts — D-593·기획 검토 2715). 대결 자리(duelInit)에 두 편을 세우고 kin을 같게 두면 서로 피해가 없다.
import { describe, expect, it } from "vitest";
import { runBattle } from "./battle.ts";
import { duelInit } from "./duels.ts";
import { TEST_STAT_TABLE, computeSecondary } from "./stats.ts";
import { type WeaponSpec, specFromStats } from "./unitSpec.ts";

const blade: WeaponSpec = {
  physical: { attack: 20 },
  appropriate: { str: 25, dex: 16, agi: 16 },
  hitPm: 900,
  critPm: 100,
  intervalMs: 1000,
  range: 1,
  arc: false,
  staminaCost: 0,
  mpCost: 0,
};
const fighter = (kin?: number) => {
  const primaries = { str: 16, dex: 16, agi: 16, vit: 16, int: 16, wis: 16 };
  const spec = specFromStats({
    id: 1,
    side: 1,
    party: 1,
    x: 0,
    y: 0,
    stats: computeSecondary(primaries, TEST_STAT_TABLE),
    weapon: blade,
    primaries,
    moveIntervalMs: 1000,
  });
  return kin === undefined ? spec : { ...spec, kin };
};

describe("같은 무리(kin)끼리 치지 않기", () => {
  it("다른 편이어도 같은 kin이면 서로 피해가 없고(시간 초과), kin이 없으면 옛 판정 그대로 싸운다", () => {
    const init = duelInit([fighter(7)], [fighter(7)], 11, 32, 30_000);
    const { result, state } = runBattle(init, []);
    expect(result.reason).toBe("timeout");
    for (const unit of state.units) expect(unit.hp).toBe(unit.maxHp);
    // kin이 다르거나 한쪽만 있으면 싸운다
    const fought = runBattle(duelInit([fighter(7)], [fighter(8)], 11, 32, 30_000), []);
    expect(fought.state.units.some((unit) => unit.hp < unit.maxHp)).toBe(true);
    const plain = runBattle(duelInit([fighter()], [fighter()], 11, 32, 30_000), []);
    expect(plain.state.units.some((unit) => unit.hp < unit.maxHp)).toBe(true);
  });

  it("같은 kin 짝만 빠지고 다른 적은 그대로 친다", () => {
    // 편 1: kin 7 하나, 편 2: kin 7 하나 + kin 없는 하나 → 편 1의 유닛은 kin 없는 적만 친다
    const { state } = runBattle(duelInit([fighter(7)], [fighter(7), fighter()], 11, 32, 30_000), []);
    const [, kinFoe, other] = state.units.toSorted((a, b) => a.id - b.id);
    expect(kinFoe?.kin).toBe(7);
    expect(kinFoe?.hp).toBe(kinFoe?.maxHp);
    expect(other?.hp).toBeLessThan(other?.maxHp ?? 0);
  });
});
