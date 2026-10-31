import { describe, expect, it } from "vitest";
import { skillSlotCount } from "../combat/equipment.ts";
import { TEST_SOCIETY_COEFFICIENTS as c } from "./coefficients.ts";
import { rebirthBlockers, rebirthCyborg, skillGradeCap } from "./cyborgRebirth.ts";

const even = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
const flatK = { str: 1000, dex: 1000, agi: 1000, vit: 1000, int: 1000, wis: 1000 };

/** 만렙·신앙도 70인 1회 환생 사이보그(인공장기 하나를 낀 채) */
const ready = {
  level: 50,
  exp: 1234,
  rebirths: 1,
  faith: 70,
  initial: even,
  kPm: flatK,
  organs: ["test_heart"],
};
const rich = { currency: 20_000n };

describe("사이보그 환생(D-440·D-441)", () => {
  it("조건: 만렙 + 신앙도 + 화폐(N34), 모자란 것을 모두 알려 준다", () => {
    expect(c.cyborg.rebirthFaith).toBe(50);
    expect(c.cyborg.rebirthCurrency).toBe(10_000);
    expect(rebirthBlockers(ready, rich, c)).toEqual([]);
    expect(rebirthBlockers({ ...ready, level: 49, faith: 49 }, { currency: 9_999n }, c)).toEqual([
      "level",
      "faith",
      "currency",
    ]);
  });

  it("진로별 종교 아이템은 있으면 더하는 추가 조건이다(데이터 고리)", () => {
    const relic = [{ asset: "item:relic", amount: 2n }];
    expect(rebirthBlockers(ready, rich, c, relic)).toEqual(["items"]);
    const held = { ...rich, item: (asset: string) => (asset === "item:relic" ? 2n : 0n) };
    expect(rebirthBlockers(ready, held, c, relic)).toEqual([]);
  });

  it("환생: 레벨 1·경험치 0(가속 없음), 신앙도·화폐를 쓰고, 인공장기는 그대로, 분포 변경·K 리롤", () => {
    const result = rebirthCyborg(
      ready,
      rich,
      {
        distribution: { str: 20, dex: 20, agi: 5, vit: 5, int: 5, wis: 5 },
        kRolls: [0, 9999, 5000, 0, 0, 0],
      },
      c,
    );
    expect(result).toEqual({
      ok: true,
      state: {
        level: 1,
        exp: 0,
        rebirths: 2,
        faith: 20,
        initial: { str: 20, dex: 20, agi: 5, vit: 5, int: 5, wis: 5 },
        kPm: { str: 800, dex: 1200, agi: 1000, vit: 800, int: 800, wis: 800 },
        organs: ["test_heart"],
      },
      spent: { faith: 50, currency: 10_000n },
    });
  });

  it("분포를 안 바꾸면 그대로, 바꾸면 합 60·칸 1~20(N9)이어야 한다", () => {
    const keep = rebirthCyborg(ready, rich, { kRolls: [0, 0, 0, 0, 0, 0] }, c);
    expect(keep.ok && keep.state.initial).toEqual(even);
    const wrongSum = { str: 20, dex: 20, agi: 10, vit: 10, int: 10, wis: 10 };
    const outOfRange = { str: 25, dex: 15, agi: 5, vit: 5, int: 5, wis: 5 };
    for (const distribution of [wrongSum, outOfRange])
      expect(rebirthCyborg(ready, rich, { distribution, kRolls: [0, 0, 0, 0, 0, 0] }, c)).toEqual({
        ok: false,
        blockers: ["distribution"],
      });
    expect(rebirthCyborg({ ...ready, level: 3 }, rich, { kRolls: [0, 0, 0, 0, 0, 0] }, c)).toEqual({
      ok: false,
      blockers: ["level"],
    });
  });

  it("환생 한 번에 스킬 최대 등급 +1(기본 3, 상한 10), 스킬 칸 +1", () => {
    const after = rebirthCyborg(ready, rich, { kRolls: [0, 0, 0, 0, 0, 0] }, c);
    if (!after.ok) throw new Error("rebirth");
    expect([skillGradeCap(ready.rebirths, c), skillGradeCap(after.state.rebirths, c)]).toEqual([4, 5]);
    expect(skillGradeCap(0, c)).toBe(3);
    expect(skillGradeCap(12, c)).toBe(10);
    expect([skillSlotCount(3, ready.rebirths, 10), skillSlotCount(3, after.state.rebirths, 10)]).toEqual([
      4, 5,
    ]);
  });

  it("K 굴림은 여섯 개, 0~9999", () => {
    expect(() => rebirthCyborg(ready, rich, { kRolls: [0, 0, 0] }, c)).toThrow(RangeError);
    expect(() => rebirthCyborg(ready, rich, { kRolls: [0, 0, 0, 0, 0, 10_000] }, c)).toThrow(RangeError);
  });
});
