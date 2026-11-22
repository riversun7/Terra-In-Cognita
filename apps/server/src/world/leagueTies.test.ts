// 연맹 조항 카드 집행 고리 시험(league-2, D-590 2501 다 — world/leagueTies.ts): 소유 주체 → 가문, 요금 깎기, 시야 나눔 묶음. 가짜 세계 저장 층만 쓴다.
import { describe, expect, it } from "vitest";
import { attachHouseTies } from "./houseTies.ts";
import {
  allyLookupOf,
  attachLeagueTies,
  houseOfOwner,
  leagueDiscountedFee,
  leagueTied,
} from "./leagueTies.ts";

/** 주체 1·2 = 가문 10·20의 가문원 사용자, 3 = 가문 없는 사용자, 4 = NPC 나라 주체(가문 아님) */
function setup(feeDiscountPm = 200) {
  const owners = new Map([
    [1, { factionId: null, userId: "u1" }],
    [2, { factionId: null, userId: "u2" }],
    [3, { factionId: null, userId: "u3" }],
    [4, { factionId: 900, userId: null }],
  ]);
  const store = { owners };
  const ties = attachHouseTies(store, { query: async () => ({ rows: [] }) });
  const houses = new Map([
    ["u1", 10],
    ["u2", 20],
  ]);
  ties.houseOfUser = (userId) => houses.get(userId);
  ties.nationOfHouse = () => undefined;
  const key = {};
  let partners = new Map<number, Set<number>>([
    [10, new Set([20])],
    [20, new Set([10])],
  ]);
  attachLeagueTies(
    store,
    {
      partnersOf: (clause, house) =>
        (clause === "fee_discount" || clause === "shared_vision" ? partners.get(house) : undefined) ??
        new Set(),
      version: () => 1,
      feeDiscountPm: () => feeDiscountPm,
    },
    [key],
  );
  return {
    store,
    key,
    clear: () => {
      partners = new Map();
    },
  };
}

describe("연맹 조항 카드 집행(leagueTies.ts)", () => {
  it("소유 주체 → 가문: 가문원 사용자만(NPC 나라 주체·무소속은 없음)", () => {
    const { store } = setup();
    expect(houseOfOwner(store, 1)).toBe(10);
    expect(houseOfOwner(store, 3)).toBeUndefined();
    expect(houseOfOwner(store, 4)).toBeUndefined();
    expect(houseOfOwner(store, 99)).toBeUndefined();
  });

  it("요금 깎기: 함께 든 가문끼리만, 몫만큼 내림. 같은 주체·주인 없음·무소속은 그대로", () => {
    const { store, key, clear } = setup(200);
    expect(leagueTied(key, "fee_discount", 1, 2)).toBe(true);
    expect(leagueDiscountedFee(key, 1, 2, 1_000n)).toBe(800n);
    expect(leagueDiscountedFee(store, 1, 2, 7n)).toBe(6n);
    expect(leagueDiscountedFee(key, 1, 1, 1_000n)).toBe(1_000n);
    expect(leagueDiscountedFee(key, 1, null, 1_000n)).toBe(1_000n);
    expect(leagueDiscountedFee(key, 1, 3, 1_000n)).toBe(1_000n);
    expect(leagueDiscountedFee({}, 1, 2, 1_000n)).toBe(1_000n);
    clear();
    expect(leagueDiscountedFee(key, 1, 2, 1_000n)).toBe(1_000n);
  });

  it("시야 나눔 묶음: 함께 든 가문의 주체만 소속, 가문이 없으면 나눔 없음", () => {
    const { store } = setup();
    const lookup = allyLookupOf({ persistence: store });
    const spec = lookup(1);
    expect(spec?.key).toBe("h:10:1");
    expect(spec?.member(2)).toBe(true);
    expect(spec?.member(3)).toBe(false);
    expect(lookup(3)).toBeUndefined();
  });
});
