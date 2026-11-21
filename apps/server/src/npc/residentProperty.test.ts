// 주민세 재산 값 고리 시험 — 기획 D-579·D-581(사업장 몫 + 집 몫), 질문 2371 나(건물 값 = 지은 값 × 감가), residentProperty.ts
import type { SimHooks } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  type ResidentBuilding,
  type ResidentPropertySource,
  depreciationPm,
  residentValuer,
  withResidentProperty,
} from "./residentProperty.ts";

const BASE: SimHooks = {
  treasuryAsset: () => "cur",
  beforeCityTransfer: () => {},
  factionBorn: () => {},
  factionDied: () => {},
};
const DAY = 86_400_000;
/** 레벨 1 = 나무 4, 레벨 2부터 = 판자 2(× L²) — 시세 나무 10·판자 30 */
const BUILD = {
  mulPm: 1000,
  levels: [
    { from: 1, materials: [{ item: "wood", qty: 4 }] },
    { from: 2, materials: [{ item: "plank", qty: 2 }] },
  ],
};

function source(buildings: ResidentBuilding[], extra: Partial<ResidentPropertySource> = {}) {
  const reads: number[] = [];
  const src: ResidentPropertySource = {
    buildingsIn: (cityId) => {
      reads.push(cityId);
      return cityId === 1 ? buildings : [];
    },
    buildOf: (facility) => (facility === "none" ? undefined : BUILD),
    priceOf: (_city, asset, _currency, qty) => qty * (asset === "item:wood" ? 10n : 30n),
    rules: () => ({
      residentBuildingValuePm: 1000,
      residentBuildingDepreciationPm: 100,
      residentBuildingFloorPm: 300,
    }),
    ...extra,
  };
  return { src, reads };
}

const shop = (
  id: number,
  owner: number | null,
  level = 1,
  builtAtMs = 0,
  living = false,
): ResidentBuilding => ({
  buildingId: id,
  facility: "shop",
  level,
  ownerId: owner,
  builtAtMs,
  living,
});

describe("주민세 재산 값(D-579·D-581)", () => {
  it("감가 = max(바닥, 1000 − 날 수 × 하루 감가)", () => {
    expect(depreciationPm(0, 100, 300)).toBe(1000n);
    expect(depreciationPm(2 * DAY + 5, 100, 300)).toBe(800n);
    expect(depreciationPm(30 * DAY, 100, 300)).toBe(300n);
    expect(depreciationPm(30 * DAY, 0, 300)).toBe(1000n);
  });

  it("사업장 몫 = 그 주인의 주거 아닌 건물 지은 값(레벨 1~L 재료 × 시세) × 감가, 도시 목록은 한 번만 읽는다", () => {
    const { src, reads } = source([
      shop(10, 7, 1),
      // 레벨 2: 나무 4×1 = 40 + 판자 2×4 = 8 → 240, 합 280, 이틀 지나 감가 800‰ → 224
      shop(11, 7, 2, 0),
      shop(12, 8, 1),
      shop(13, 7, 1, 0, true),
      { ...shop(14, 7, 1), facility: "none" },
    ]);
    const value = residentValuer(src, 2 * DAY);
    // 10: 40 × 800‰ = 32, 11: 280 × 800‰ = 224
    expect(value.business(7, 1, "cur")).toBe(256n);
    expect(value.business(8, 1, "cur")).toBe(32n);
    expect(value.business(7, 2, "cur")).toBe(0n);
    expect(reads).toEqual([1, 2]);
  });

  it("집 몫 = 사는 숙소 값 ÷ 그 숙소에 사는 사람 수, 숙소 없는 집은 0", () => {
    const { src } = source([shop(20, 9, 1, 0, true)], {
      residentsIn: () => [
        { unit: 1, owner: 5, lodging: 20 },
        { unit: 2, owner: 6, lodging: 20 },
        { unit: 3, owner: 6, lodging: null },
      ],
    });
    expect(residentValuer(src, 0).homes(1, "cur")).toEqual([
      { unit: 1, owner: 5, housing: 20n },
      { unit: 2, owner: 6, housing: 20n },
      { unit: 3, owner: 6, housing: 0n },
    ]);
  });

  it("출처가 없으면 고리를 얹지 않는다, 사는 유닛 출처가 있을 때만 집 몫 고리", () => {
    expect(Object.hasOwn(withResidentProperty(BASE, undefined), "residentProperty")).toBe(false);
    const { src } = source([shop(10, 3)]);
    const hooked = withResidentProperty(BASE, src);
    expect(hooked.residentProperty?.(0)?.(3, 1, "cur")).toBe(40n);
    expect(Object.hasOwn(hooked, "residentHomes")).toBe(false);
    const homed = withResidentProperty(BASE, { ...src, residentsIn: () => [] });
    expect(homed.residentHomes?.(0)?.(1, "cur")).toEqual([]);
  });
});
