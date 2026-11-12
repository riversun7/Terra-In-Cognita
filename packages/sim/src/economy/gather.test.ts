// 채집 티어 추첨(D-506, 49 N43) — 구간 찾기, 확률 분포, 가장 낮은 구간 T3 5%, 레벨 보너스, 아이템 고르기(더 낮은 티어로 내려감), 묶음 → 기본 단위
// 옛 1차 생산 규칙(D-507, 49 N32·N44·P8) — 진행 속도, 티어별 필요 진행, 수확량, 해금 티어, 선택 방식, 광석 g 환산(옛 예시 값으로)
import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  GATHER_TIERS,
  GATHER_WEIGHT_TOTAL,
  TEST_GATHER_BANDS,
  accessibleTier,
  gatherBandIndex,
  gatherCatchPm,
  gatherChancesPm,
  gatherProgress,
  gatherStat,
  gatherYield,
  pickGatherItem,
  rollGatherOutputs,
  rollGatherTier,
  tierRequiredProgress,
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
  it("구간은 20 단위 14개, 첫 구간 0, 구간마다 T0~T9 가중치 합 1000", () => {
    expect(TEST_GATHER_BANDS.map((band) => band.from)).toEqual([
      0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260,
    ]);
    for (const band of TEST_GATHER_BANDS) {
      expect(band.weightsPm).toHaveLength(GATHER_TIERS);
      expect(band.weightsPm.reduce((sum, value) => sum + value, 0)).toBe(GATHER_WEIGHT_TOTAL);
    }
  });

  it("가장 낮은 구간([임시] 0~39)도 T3까지 나온다: T0 500·T1 350·T2 100·T3 50‰(기본 재료 바닥 — 석재 T1), T4 위는 0(사용자 답 300)", () => {
    for (const band of TEST_GATHER_BANDS.slice(0, 2))
      expect(band.weightsPm).toEqual([500, 350, 100, 50, 0, 0, 0, 0, 0, 0]);
    expect(TEST_GATHER_BANDS[2]?.weightsPm).toEqual([500, 350, 120, 30, 0, 0, 0, 0, 0, 0]);
    // 나머지는 옛 표 %를 ‰로(160~179의 22.3% → 223, 반올림 없음)
    expect(TEST_GATHER_BANDS[8]?.weightsPm).toEqual([223, 210, 200, 170, 110, 50, 23, 10, 4, 0]);
  });

  it("T9는 200~219에서 드물게, 220부터 늘어난다(D-534, 49 N43)", () => {
    const t9 = TEST_GATHER_BANDS.map((band) => band.weightsPm[9] ?? 0);
    // 199까지 T9 없음
    expect(t9.slice(0, 10).every((pm) => pm === 0)).toBe(true);
    // 200~219 드물게(2‰), 220부터 오른다
    expect(t9.slice(10)).toEqual([2, 15, 25, 35]);
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
    expect([at(219), at(220), at(240), at(259), at(260), at(10_000)]).toEqual([10, 11, 12, 12, 13, 13]);
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
    // 컨디션(관리 보너스, D-534)은 일꾼 스탯에 더한다. 음수여도 0 아래로 가지 않고 레벨 보너스는 그대로
    expect(gatherStat(176, 1, 10, 40)).toBe(216);
    expect(gatherStat(20, 3, 10, -40)).toBe(20);
    // Lv5 + 보너스 10이면 새 유닛(20)이 60~79 구간: T4가 열린다
    const band = TEST_GATHER_BANDS[gatherBandIndex(TEST_GATHER_BANDS, gatherStat(20, 5, 10))];
    expect(band?.weightsPm[4]).toBe(10);
  });
});

describe("티어 뽑기 분포(시드 난수 10만 번)", () => {
  it("새 유닛(STR 10 + VIT 10 = 20): T0 50%·T1 35%·T2 10%·T3 5% (±0.4%p), T4 위는 0", () => {
    const counts = histogram(20, 1);
    const expected = [50_000, 35_000, 10_000, 5_000];
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

describe("옛 1차 생산 규칙(D-507, AntiGravt01 gather 엔진·ITM-10 값)", () => {
  it("진행 속도 = max(1, ⌊주 스탯 ÷ 20⌋): 0~39는 1, 40은 2, 60은 3(옛 예시 VIT 60 → 3틱/수확)", () => {
    expect([0, 10, 19, 20, 39, 40, 59, 60, 100, 240].map((stat) => gatherProgress(stat, 20))).toEqual([
      1, 1, 1, 1, 1, 2, 2, 3, 5, 12,
    ]);
    expect(gatherProgress(-5, 20)).toBe(1);
  });

  it("티어별 필요 진행 = max(30, 30 + 티어 × 30): T0 30, T1 60, T2 90, T3 120 … T9 300(옛 주석 표)", () => {
    expect(Array.from({ length: GATHER_TIERS }, (_, tier) => tierRequiredProgress(tier, 30, 30))).toEqual([
      30, 60, 90, 120, 150, 180, 210, 240, 270, 300,
    ]);
    expect(tierRequiredProgress(-1, 30, 30)).toBe(30);
  });

  it("해금 티어 = min(⌊(주 + 보조) ÷ 20⌋, 9): 옛 예시 VIT 60 + INT 20 = 80 → T4, 합 0~19 T0 … 180 이상 T9", () => {
    expect(accessibleTier(60, 20)).toBe(4);
    expect([
      accessibleTier(10, 9),
      accessibleTier(10, 10),
      accessibleTier(90, 89),
      accessibleTier(90, 90),
    ]).toEqual([0, 1, 8, 9]);
    expect(accessibleTier(200, 200)).toBe(9);
  });

  it("수확량 = min(상한, 기본 + ⌊보조 × 비율⌋): 광산 1 + 0.10·상한 10, 농장 1 + 0.08·상한 8, 낚시터 상한 5", () => {
    const mine = { base: 1, perStatPm: 100, cap: 10 };
    expect([0, 9, 10, 25, 90, 200].map((stat) => gatherYield(stat, mine))).toEqual([1, 1, 2, 3, 10, 10]);
    const farm = { base: 1, perStatPm: 80, cap: 8 };
    // 옛 문서 예시의 보조 INT 20 → 1 + ⌊1.6⌋ = 2
    expect([10, 12, 13, 20, 100].map((stat) => gatherYield(stat, farm))).toEqual([1, 1, 2, 2, 8]);
    expect(gatherYield(100, { base: 1, perStatPm: 100, cap: 5 })).toBe(5);
    // 상한이 없으면(설정 칸 N32 기본 비율만) 그대로 는다
    expect(gatherYield(250, { base: 0, perStatPm: 80 })).toBe(20);
  });

  it("선택 방식: 해금 티어 이하에서 켜진 아이템이 있는 가장 높은 티어를 고르고, 같은 티어 여럿이면 고르게", () => {
    const crops: string[][] = [["item:hay", "item:bean"], ["item:potato"], [], [], [], [], [], [], [], []];
    const { outputs, tiers, landed } = rollGatherOutputs(
      { ladder: crops, bands: TEST_GATHER_BANDS, stat: 0, lots: 20, lotSize: new Map(), selectTier: 4 },
      createRng(2),
    );
    // T4 해금이지만 T2~T4가 비어 T1 감자만 나온다(뽑지 않음)
    expect(outputs).toEqual([{ asset: "item:potato", qty: 20n }]);
    expect(tiers[4]).toBe(20);
    expect(landed[1]).toBe(20);
    const low = rollGatherOutputs(
      { ladder: crops, bands: TEST_GATHER_BANDS, stat: 0, lots: 2000, lotSize: new Map(), selectTier: 0 },
      createRng(4),
    );
    const byAsset = new Map(low.outputs.map((stack) => [stack.asset, Number(stack.qty)]));
    expect(Math.abs((byAsset.get("item:hay") ?? 0) - 1000)).toBeLessThan(80);
    expect((byAsset.get("item:hay") ?? 0) + (byAsset.get("item:bean") ?? 0)).toBe(2000);
  });

  it("수확량 배·광석 g 환산(49 N44): 한 번에 2개면 고른 아이템 2개, 광석 한 개 = 1,000g(묶음 1kg), 잡석은 개", () => {
    const lotSize = new Map([
      ["item:copper_ore", 1000n],
      ["item:iron_ore", 1000n],
    ]);
    const { outputs, landed, empty } = rollGatherOutputs(
      {
        ladder: ORE_LADDER,
        bands: TEST_GATHER_BANDS,
        stat: 20,
        lots: 500,
        lotSize,
        yieldPerLot: 2,
        harvestGrams: 1000n,
      },
      createRng(11),
    );
    expect(empty).toBe(0);
    const byAsset = new Map(outputs.map((stack) => [stack.asset, stack.qty]));
    expect(byAsset.get("item:rubble")).toBe(BigInt((landed[0] ?? 0) * 2));
    expect(byAsset.get("item:iron_ore")).toBe(BigInt((landed[3] ?? 0) * 2) * 1000n);
    // g 환산을 바꾸면(예: 500g) 광석만 바뀐다
    const half = rollGatherOutputs(
      {
        ladder: ORE_LADDER,
        bands: TEST_GATHER_BANDS,
        stat: 20,
        lots: 500,
        lotSize,
        yieldPerLot: 2,
        harvestGrams: 500n,
      },
      createRng(11),
    );
    const halfBy = new Map(half.outputs.map((stack) => [stack.asset, stack.qty]));
    expect(halfBy.get("item:iron_ore")).toBe((byAsset.get("item:iron_ore") ?? 0n) / 2n);
    expect(halfBy.get("item:rubble")).toBe(byAsset.get("item:rubble"));
  });
});

describe("성공 확률(낚시터, 옛 fishing_config 0.30·0.80·0.50·합 200)", () => {
  const rule = { basePm: 300, maxPm: 800, statPm: 500, fullStat: 200 };

  it("성공 ‰ = min(상한, 기본 + ⌊스탯 몫 × min(가득, 주 + 보조) ÷ 가득⌋)", () => {
    // 옛 식: min(0.80, 0.30 + 0.50 × min(1, 합 ÷ 200))
    expect([0, 20, 100, 199, 200, 400].map((stat) => gatherCatchPm(stat, rule))).toEqual([
      300, 350, 550, 797, 800, 800,
    ]);
    // 상한이 기본 + 스탯 몫보다 낮으면 상한에서 멈춘다, 음수 스탯은 0으로
    expect(gatherCatchPm(200, { ...rule, maxPm: 600 })).toBe(600);
    expect(gatherCatchPm(-50, rule)).toBe(300);
    // 0~1000‰ 밖으로 가지 않는다
    expect(gatherCatchPm(500, { basePm: 900, maxPm: 5000, statPm: 900, fullStat: 100 })).toBe(1000);
  });

  it("성공한 번만 티어를 뽑는다: 성공 350‰면 2만 번 가운데 약 35%가 물건, 나머지는 빈 번", () => {
    const fish: string[][] = [["item:loach"], ["item:carp"], ["item:salmon"], ["item:mackerel"]];
    const { outputs, empty, tiers } = rollGatherOutputs(
      { ladder: fish, bands: TEST_GATHER_BANDS, stat: 20, lots: 20_000, lotSize: new Map(), successPm: 350 },
      createRng(21),
    );
    const caught = outputs.reduce((sum, stack) => sum + Number(stack.qty), 0);
    expect(caught + empty).toBe(20_000);
    expect(Math.abs(caught - 7000)).toBeLessThan(250);
    // 뽑은 티어 수 = 성공한 번 수(실패한 번은 티어를 뽑지 않는다)
    expect(tiers.reduce((sum, count) => sum + count, 0)).toBe(caught);
  });

  it("성공 0‰면 모두 빈 번, 성공 칸이 없으면 늘 성공(난수를 더 쓰지 않아 앞 결과와 같다)", () => {
    const fish: string[][] = [["item:loach"]];
    const base = { ladder: fish, bands: TEST_GATHER_BANDS, stat: 20, lots: 50, lotSize: new Map() };
    expect(rollGatherOutputs({ ...base, successPm: 0 }, createRng(3)).empty).toBe(50);
    expect(rollGatherOutputs(base, createRng(3)).outputs).toEqual([{ asset: "item:loach", qty: 50n }]);
  });
});

/** 높은 스탯 광석 4,000번(티어 막기 시험) */
const roll = (tierCap?: { maxTier: number; keepAbovePm: number }) =>
  rollGatherOutputs(
    {
      ladder: ORE_LADDER,
      bands: TEST_GATHER_BANDS,
      stat: 220,
      lots: 4000,
      lotSize: new Map(),
      ...(tierCap ? { tierCap } : {}),
    },
    createRng(7),
  );
/** 그 티어 위로 나온 수 */
const above = (landed: readonly number[], maxTier: number) =>
  landed.slice(maxTier + 1).reduce((sum, count) => sum + count, 0);

describe("광석 티어 막기(기획 D-533 — 높은 티어 광석은 산지)", () => {
  it("산지 몫 0이면 T2 위가 모두 T2(구리)로 내려가고, 1000에 가까울수록 그대로 나온다", () => {
    const free = roll();
    expect(above(free.landed, 2)).toBeGreaterThan(1000);
    const low = roll({ maxTier: 2, keepAbovePm: 0 });
    expect(above(low.landed, 2)).toBe(0);
    // T0~T1은 막지 않는다(같은 난수로 같은 티어)
    expect(low.landed.slice(0, 2)).toEqual(free.landed.slice(0, 2));
    expect(low.landed[2]).toBe((free.landed[2] ?? 0) + above(free.landed, 2));
    const half = roll({ maxTier: 2, keepAbovePm: 500 });
    const kept = above(half.landed, 2);
    expect(kept).toBeGreaterThan(above(free.landed, 2) * 0.4);
    expect(kept).toBeLessThan(above(free.landed, 2) * 0.6);
  });

  it("선택 방식(농장)은 막지 않는다", () => {
    const out = rollGatherOutputs(
      {
        ladder: ORE_LADDER,
        bands: TEST_GATHER_BANDS,
        stat: 0,
        lots: 3,
        lotSize: new Map(),
        selectTier: 5,
        tierCap: { maxTier: 2, keepAbovePm: 0 },
      },
      createRng(1),
    );
    expect(out.landed[5]).toBe(3);
  });
});
