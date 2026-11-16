// 납품 명성(기획 D-326 "납품", 질문 2102 → 2182): 그 나라 세력의 사기 주문에 판 체결 → 그 나라 명성
import { DEFAULT_RENOWN_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type DeliveryFill, attachDeliveryRenown, deliveryOf } from "./deliveryRenown.ts";

/** 소유 주체: 100 = 나라 9의 세력(정부), 101 = 나라 없는 주체, 301 = 사용자 a, 302 = 사용자 b, 303 = 사이보그 없는 사용자 c */
const owners = new Map([
  [100, { userId: null, factionId: 9 }],
  [101, { userId: null, factionId: null }],
  [301, { userId: "a", factionId: 5 }],
  [302, { userId: "b", factionId: null }],
  [303, { userId: "c", factionId: null }],
]);

const trade = (side: "buy" | "sell", maker: number, taker: number, qty: bigint) => ({
  side,
  makerOwner: maker,
  takerOwner: taker,
  qty,
});

describe("deliveryOf — 판 쪽 사용자, 산 쪽 세력이면 납품", () => {
  it("사용자가 세력 사기 주문에 팔거나(팔기 들어옴) 세력이 사용자 팔기 주문을 사면(사기 들어옴) 납품", () => {
    expect(deliveryOf(owners, trade("sell", 100, 301, 3n), 4n)).toEqual({
      userId: "a",
      nation: 9,
      value: 12n,
    });
    expect(deliveryOf(owners, trade("buy", 301, 100, 3n), 4n)).toEqual({
      userId: "a",
      nation: 9,
      value: 12n,
    });
  });

  it("세력이 판 것·유저끼리·나라 없는 주체·시작 시세 없음은 납품이 아니다", () => {
    expect(deliveryOf(owners, trade("sell", 301, 100, 3n), 4n)).toBeUndefined();
    expect(deliveryOf(owners, trade("sell", 302, 301, 3n), 4n)).toBeUndefined();
    expect(deliveryOf(owners, trade("sell", 101, 301, 3n), 4n)).toBeUndefined();
    expect(deliveryOf(owners, trade("sell", 100, 301, 3n), undefined)).toBeUndefined();
  });
});

/** 거래소 모음 흉내: 붙인 듣는 쪽에 체결을 보낸다 */
function fakeSource(startPrice: bigint) {
  const listeners = new Set<(notice: DeliveryFill) => void>();
  const fill = (maker: number, taker: number, side: "buy" | "sell", qty: bigint, at = 7): void => {
    const notice: DeliveryFill = {
      book: { asset: "item:wheat" },
      trade: { side, makerOwner: maker, takerOwner: taker, qty, at },
    };
    for (const listener of listeners) listener(notice);
  };
  return {
    fill,
    source: {
      registry: {
        onFill(listener: (notice: DeliveryFill) => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      economy: { catalog: { startPrice: new Map([["item:wheat", startPrice]]) } },
    },
  };
}

function fakeCyborgs(known: readonly string[]) {
  const added: [string, number, number, number][] = [];
  return {
    added,
    addRenown(userId: string, factionId: number, amount: number, atMs: number) {
      if (!known.includes(userId)) return undefined;
      added.push([userId, factionId, amount, atMs]);
      return amount;
    },
  };
}

describe("납품 명성 붙이기", () => {
  it("납품 가치(묶음 수 × 시작 시세) 100마다 명성 1, 나머지는 다음 납품에 더한다", () => {
    const { fill, source } = fakeSource(4n);
    const cyborgs = fakeCyborgs(["a"]);
    const stop = attachDeliveryRenown(source, {
      owners,
      cyborgs,
      rules: () => ({ renown: DEFAULT_RENOWN_COEFFICIENTS }),
    });
    fill(100, 301, "sell", 30n); // 가치 120 → 1, 나머지 20
    fill(100, 301, "sell", 20n); // 20 + 80 = 100 → 1
    fill(100, 301, "sell", 10n); // 40 → 0
    fill(301, 100, "sell", 50n); // 세력이 판 것 → 없음
    expect(cyborgs.added).toEqual([
      ["a", 9, 1, 7],
      ["a", 9, 1, 7],
    ]);
    stop?.();
    fill(100, 301, "sell", 100n);
    expect(cyborgs.added).toHaveLength(2);
  });

  it("설정 칸 0이면 납품 명성 없음, 사이보그 없는 사용자는 건너뛴다, 경제가 없으면 붙이지 않는다", () => {
    const { fill, source } = fakeSource(1000n);
    const cyborgs = fakeCyborgs(["a"]);
    let value = 0;
    attachDeliveryRenown(source, {
      owners,
      cyborgs,
      rules: () => ({ renown: { deliveryValue: value } }),
    });
    fill(100, 301, "sell", 5n);
    expect(cyborgs.added).toEqual([]);
    value = 100;
    fill(100, 303, "sell", 5n); // 사용자 c는 사이보그 없음
    fill(100, 301, "sell", 5n); // 5000 → 50
    expect(cyborgs.added).toEqual([["a", 9, 50, 7]]);
    expect(
      attachDeliveryRenown(undefined, {
        owners,
        cyborgs,
        rules: () => ({ renown: DEFAULT_RENOWN_COEFFICIENTS }),
      }),
    ).toBeUndefined();
  });
});
