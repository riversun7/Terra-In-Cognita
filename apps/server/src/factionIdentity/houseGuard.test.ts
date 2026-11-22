// 같은 가문끼리 공격 막기 시험(d593 — 사용자 결정 D-593 "공격자체가 불가"): 소유 주체 둘의 가문 비교
import { describe, expect, it } from "vitest";
import { attachHouseTies } from "../world/houseTies.ts";
import { sameHouseOwners } from "./houseGuard.ts";

describe("같은 가문 소유 주체", () => {
  it("가문원 사용자끼리·가문원과 그 가문 소유 주체는 같은 가문, 다른 가문·무소속·NPC 나라 주체·같은 주체·표 없음은 아니다", () => {
    const store = {
      owners: new Map([
        [1, { userId: "a", factionId: null }],
        [2, { userId: "b", factionId: null }],
        [3, { userId: "c", factionId: null }],
        [4, { userId: null, factionId: 9 }],
        [5, { userId: null, factionId: 900 }],
        [6, { userId: "z", factionId: null }],
      ]),
    };
    expect(sameHouseOwners(store, 1, 2)).toBe(false);
    const ties = attachHouseTies(store, { query: async () => ({ rows: [] }) });
    const houses = new Map([
      ["a", 9],
      ["b", 9],
      ["c", 4],
    ]);
    ties.houseOfUser = (userId) => houses.get(userId);
    ties.nationOfHouse = (rowId) => (rowId === 9 || rowId === 4 ? rowId : undefined);
    expect(sameHouseOwners(store, 1, 2)).toBe(true);
    expect(sameHouseOwners(store, 4, 1)).toBe(true);
    expect(sameHouseOwners(store, 1, 3)).toBe(false);
    expect(sameHouseOwners(store, 1, 6)).toBe(false);
    expect(sameHouseOwners(store, 6, 6)).toBe(false);
    expect(sameHouseOwners(store, 5, 1)).toBe(false);
    expect(sameHouseOwners(undefined, 1, 2)).toBe(false);
  });
});
