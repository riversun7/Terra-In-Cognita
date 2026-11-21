// 랭킹 자산 값 매기기 시험(house-9, D-576·D-555 1512) — worthSource.ts createAssetPricer, worth.ts worthRows
import { describe, expect, it } from "vitest";
import { worthRows } from "./worth.ts";
import { createAssetPricer } from "./worthSource.ts";

describe("createAssetPricer", () => {
  const pricer = createAssetPricer({
    base: "credit",
    fxLot: 100n,
    // cur:a 로트(100) = 기준 통화 250, cur:b는 시장 없음(1:1)
    fxRate: (currency) => (currency === "cur:a" ? 250n : currency === "cur:b" ? 100n : undefined),
    books: [
      { asset: "item:ore", currency: "credit", lastPrice: 40n },
      { asset: "item:ore", currency: "cur:a", lastPrice: 8n },
      { asset: "item:ore", currency: "credit", lastPrice: undefined },
      { asset: "item:fish", currency: "cur:zz", lastPrice: 5n },
    ],
    startPrice: (asset) => (asset === "item:wood" ? 7n : asset === "item:fish" ? 3n : undefined),
    lotSize: (asset) => (asset === "item:ore" ? 10n : 1n),
  });

  it("기준 통화는 그대로, 나라 화폐는 지난 환전 체결가 ÷ 로트", () => {
    expect(pricer("credit", 123n)).toBe(123n);
    expect(pricer("cur:a", 1000n)).toBe(2500n);
    expect(pricer("cur:b", 77n)).toBe(77n);
  });

  it("물건 = 거래소 마지막 체결가(기준 통화) 평균 × 양 ÷ 묶음, 체결이 없으면 시작 시세, 모르면 0", () => {
    // ore: (40 + 8 × 2.5 = 20) ÷ 2 = 30 / 묶음 10 → 25개 = 75
    expect(pricer("item:ore", 25n)).toBe(75n);
    expect(pricer("item:wood", 3n)).toBe(21n);
    // fish: 거래소 화폐를 기준 통화로 바꿀 수 없으면 그 체결가는 빼고 시작 시세
    expect(pricer("item:fish", 2n)).toBe(6n);
    expect(pricer("item:nothing", 5n)).toBe(0n);
    expect(pricer("share:biz_3", 5n)).toBe(0n);
    expect(pricer("credit", 0n)).toBe(0n);
  });
});

describe("worthRows", () => {
  it("소유 주체(0) → 유닛(1), ID 차례, 둘 다 0이면 뺀다", () => {
    expect(
      worthRows({
        owners: new Map([
          [5, { power: 0n, assets: 9n }],
          [2, { power: 3n, assets: 0n }],
          [7, { power: 0n, assets: 0n }],
        ]),
        units: new Map([[40, { power: 1n, assets: 2n }]]),
      }),
    ).toEqual([
      { kind: 0, id: 2, power: 3n, assets: 0n },
      { kind: 0, id: 5, power: 0n, assets: 9n },
      { kind: 1, id: 40, power: 1n, assets: 2n },
    ]);
  });
});
