// 채집 티어 추첨(D-506, 49 N43) — 구간 찾기, 확률 분포, 가장 낮은 구간 T3 5%, 레벨 보너스, 아이템 고르기(더 낮은 티어로 내려감), 묶음 → 기본 단위
import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  GATHER_TIERS,
  GATHER_WEIGHT_TOTAL,
  TEST_GATHER_BANDS,
  gatherBandIndex,
  gatherChancesPm,
  gatherStat,
  pickGatherItem,
  rollGatherOutputs,
  rollGatherTier,
} from "./gather.ts";

const ORE_LADDER: string[][] = [
  ["item:rubble"],
  ["item:stone"],
  ["item:copper_ore"],
  ["item:iron_ore"],
  ["item:silver_ore"],
  ["item:titanium_ore"],
  ["item:gold_ore"],
  ["item:platinum_ore"],
  ["item:mithril"],
  ["item:orichalcum"],
];

describe("채집 티어 확률표(TEST_GATHER_BANDS = 팩 core gather_tiers)", () => {
  it("구간은 20 단위 12개, 첫 구간 0, 구간마다 T0~T9 가중치 합 1000", () => {
    expect(TEST_GATHER_BANDS.map((band) => band.from)).toEqual([
      0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220,
    ]);
    for (const band of TEST_GATHER_BANDS) {
      expect(band.weightsPm).toHaveLength(GATHER_TIERS);
      expect(band.weightsPm.reduce((sum, value) => sum + value, 0)).toBe(GATHER_WEIGHT_TOTAL);
    }
  });

  it("가장 낮은 구간([임시] 0~39)도 T3까지 나온다: T0 700·T1 150·T2 100·T3 50‰, T4 위는 0(사용자 답 300)", () => {
    for (const band of TEST_GATHER_BANDS.slice(0, 2))
      expect(band.weightsPm).toEqual([700, 150, 100, 50, 0, 0, 0, 0, 0, 0]);
    // 나머지는 옛 표 %를 ‰로(160~179의 22.3% → 223, 반올림 없음)
    expect(TEST_GATHER_BANDS[8]?.weightsPm).toEqual([223, 210, 200, 170, 110, 50, 23, 10, 4, 0]);
    expect(TEST_GATHER_BANDS[11]?.weightsPm).toEqual([195, 180, 170, 160, 130, 80, 40, 25, 15, 5]);
  });
});

/** 시험 표에서 스탯이 든 구간 번호 */
const at = (stat: number) => gatherBandIndex(TEST_GATHER_BANDS, stat);

/** 시드 난수로 10만 번 뽑은 티어별 수 */
function histogram(stat: number, seed: number): number[] {
  const rng = createRng(seed);
  const counts = Array.from({ length: GATHER_TIERS }, () => 0);
  for (let i = 0; i < 100_000; i++) {
    const tier = rollGatherTier(TEST_GATHER_BANDS, stat, rng);
    counts[tier] = (counts[tier] ?? 0) + 1;
  }
  return counts;
}

describe("구간 찾기", () => {
  it("from이 스탯 이하인 마지막 구간, 마지막 구간은 위 끝이 없다", () => {
    expect([at(0), at(19), at(20), at(39), at(40), at(59), at(60)]).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect([at(219), at(220), at(240), at(10_000)]).toEqual([10, 11, 11, 11]);
    expect(at(-5)).toBe(0);
    expect(gatherBandIndex([], 50)).toBe(-1);
  });
});

describe("레벨 보너스(N43)", () => {
  it("유효 스탯 = 일꾼 스탯 + 보너스 × (레벨 − 1)", () => {
    expect(gatherStat(20, 1, 10)).toBe(20);
    expect(gatherStat(20, 2, 10)).toBe(30);
    expect(gatherStat(20, 5, 10)).toBe(60);
    expect(gatherStat(20, 5, 0)).toBe(20);
    // Lv5 + 보너스 10이면 새 유닛(20)이 60~79 구간: T4가 열린다
    const band = TEST_GATHER_BANDS[gatherBandIndex(TEST_GATHER_BANDS, gatherStat(20, 5, 10))];
    expect(band?.weightsPm[4]).toBe(10);
  });
});

describe("티어 뽑기 분포(시드 난수 10만 번)", () => {
  it("새 유닛(STR 10 + VIT 10 = 20): T0 70%·T1 15%·T2 10%·T3 5% (±0.4%p), T4 위는 0", () => {
    const counts = histogram(20, 1);
    const expected = [70_000, 15_000, 10_000, 5_000];
    expected.forEach((value, tier) => expect(Math.abs((counts[tier] ?? 0) - value)).toBeLessThan(400));
    expect(counts.slice(4).every((value) => value === 0)).toBe(true);
  });

  it("220 이상 구간: 표와 ±0.4%p 안, T9 0.5%가 나온다", () => {
    const counts = histogram(230, 7);
    const band = TEST_GATHER_BANDS[11];
    band?.weightsPm.forEach((pm, tier) => expect(Math.abs((counts[tier] ?? 0) - pm * 100)).toBeLessThan(400));
    expect(counts[9]).toBeGreaterThan(300);
  });

  it("같은 시드면 같은 수열(결정적)", () => {
    expect(histogram(80, 42)).toEqual(histogram(80, 42));
  });
});

describe("아이템 고르기", () => {
  it("뽑은 티어에 아이템이 없으면 더 낮은 티어, T0까지 없으면 아무것도 나오지 않는다", () => {
    const rng = createRng(1);
    const onlyIron = Array.from({ length: GATHER_TIERS }, (_, tier) => (tier === 3 ? ["item:iron_ore"] : []));
    expect(pickGatherItem(onlyIron, 9, rng)).toBe("item:iron_ore");
    expect(pickGatherItem(onlyIron, 3, rng)).toBe("item:iron_ore");
    expect(pickGatherItem(onlyIron, 2, rng)).toBeUndefined();
    expect(pickGatherItem(ORE_LADDER, 4, rng)).toBe("item:silver_ore");
  });

  it("같은 티어에 여럿이면 고르게 하나", () => {
    const rng = createRng(3);
    const ladder = [["item:hay", "item:bean", "item:barley"]];
    const seen = new Map<string, number>();
    for (let i = 0; i < 30_000; i++) {
      const id = pickGatherItem(ladder, 0, rng) ?? "";
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const id of ladder[0] ?? []) expect(Math.abs((seen.get(id) ?? 0) - 10_000)).toBeLessThan(400);
  });

  it("묶음마다 뽑아 기본 단위로 합친다(광석 묶음 1,000 = 1kg)", () => {
    const lotSize = new Map(ORE_LADDER.flat().map((asset) => [asset, 1000n]));
    lotSize.set("item:rubble", 1n);
    lotSize.set("item:stone", 1n);
    const { outputs, tiers, empty } = rollGatherOutputs(
      { ladder: ORE_LADDER, bands: TEST_GATHER_BANDS, stat: 20, lots: 1000, lotSize },
      createRng(9),
    );
    expect(empty).toBe(0);
    expect(tiers.reduce((sum, value) => sum + value, 0)).toBe(1000);
    const byAsset = new Map(outputs.map((stack) => [stack.asset, stack.qty]));
    expect(byAsset.get("item:iron_ore")).toBe(BigInt(tiers[3] ?? 0) * 1000n);
    expect(byAsset.get("item:rubble")).toBe(BigInt(tiers[0] ?? 0));
    // 사다리 차례(티어 차례)로 돌려준다
    expect(outputs.map((stack) => stack.asset)).toEqual(
      ["item:rubble", "item:stone", "item:copper_ore", "item:iron_ore"].filter((asset) => byAsset.has(asset)),
    );
  });
});

describe("나올 확률(표시용)", () => {
  it("철만 켜진 사다리: 0~39 구간에서 철 5%, 나머지 95%는 빈 묶음", () => {
    const onlyIron = Array.from({ length: GATHER_TIERS }, (_, tier) => (tier === 3 ? ["item:iron_ore"] : []));
    expect(gatherChancesPm(TEST_GATHER_BANDS, 20, onlyIron)).toEqual({
      tierPm: [0, 0, 0, 50, 0, 0, 0, 0, 0, 0],
      emptyPm: 950,
    });
    // 60~79: T3 6% + T4 1%(은이 없어 철로 내려감)
    expect(gatherChancesPm(TEST_GATHER_BANDS, 60, onlyIron).tierPm[3]).toBe(70);
  });
});
