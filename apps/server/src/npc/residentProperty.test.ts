// 주민세 재산 값 고리 시험 — 기획 D-579, residentProperty.ts
import type { SimHooks } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { residentPropertyOf, withResidentProperty } from "./residentProperty.ts";

const BASE: SimHooks = {
  treasuryAsset: () => "cur",
  beforeCityTransfer: () => {},
  factionBorn: () => {},
  factionDied: () => {},
};

describe("주민세 재산 값(D-579)", () => {
  it("그 도시에 선 그 주인 시설의 사업장 금고(그 화폐) 합, 도시 시설 목록은 도시마다 한 번만 읽는다", () => {
    const reads: number[] = [];
    const vaults = new Map([
      ["10|7|cur", 300n],
      ["11|7|cur", 50n],
      ["11|7|other", 999n],
      ["12|8|cur", 40n],
    ]);
    const value = residentPropertyOf({
      business: {
        vaultBalance: (building, owner, asset) => vaults.get(`${building}|${owner}|${asset}`) ?? 0n,
      },
      facilitiesIn: (cityId) => {
        reads.push(cityId);
        return cityId === 1
          ? [
              { buildingId: 10, facility: "shop", level: 1, ownerId: 7 },
              { buildingId: 11, facility: "inn", level: 2, ownerId: 7 },
              { buildingId: 12, facility: "farm", level: 1, ownerId: 8 },
              { buildingId: 13, facility: "farm", level: 1, ownerId: null },
            ]
          : [];
      },
    });
    expect(value(7, 1, "cur")).toBe(350n);
    expect(value(8, 1, "cur")).toBe(40n);
    expect(value(7, 2, "cur")).toBe(0n);
    expect(reads).toEqual([1, 2]);
  });

  it("사업장 장부가 없으면 고리를 얹지 않는다(걷지 않는다)", () => {
    expect(Object.hasOwn(withResidentProperty(BASE, undefined), "residentProperty")).toBe(false);
    expect(Object.hasOwn(withResidentProperty(BASE, { facilitiesIn: () => [] }), "residentProperty")).toBe(
      false,
    );
    const hooked = withResidentProperty(BASE, {
      business: { vaultBalance: () => 5n },
      facilitiesIn: () => [{ buildingId: 1, facility: "shop", level: 1, ownerId: 3 }],
    });
    expect(hooked.residentProperty?.(0)?.(3, 1, "cur")).toBe(5n);
  });
});
