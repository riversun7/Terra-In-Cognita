// 물건 자리 규칙 시험 — 위치 코드, 가장 가까운 도시, 재료를 꺼내는 자리·차례(D-516 361), 화면 재료 합
import { describe, expect, it } from "vitest";
import { type GoodsPlaceView, materialStockAt } from "./facilities.ts";
import {
  BUILDING_LOCATION_BASE,
  type PlaceRef,
  buildingLocation,
  cargoLocation,
  cityLocation,
  cityOfCell,
  isMaterialSource,
  placeKey,
  placeOfLocation,
  sourceOrder,
} from "./goodsPlaces.ts";

const line = (item: string, qty: string) => ({ asset: `item:${item}`, item, name: null, qty });

describe("물건 자리", () => {
  it("위치 코드: 자리 없음·도시 창고·건물 창고·화물이 왕복한다", () => {
    expect(placeOfLocation(null)).toEqual({ kind: "ledger", id: null });
    expect(placeOfLocation(cityLocation(3))).toEqual({ kind: "city", id: 3 });
    expect(placeOfLocation(buildingLocation(42))).toEqual({ kind: "building", id: 42 });
    expect(placeOfLocation(cargoLocation(17))).toEqual({ kind: "cargo", id: 17 });
    expect(buildingLocation(42)).toBe(BUILDING_LOCATION_BASE + 42);
    expect(placeKey(placeOfLocation(buildingLocation(42)))).toBe("building_42");
    expect(placeKey(placeOfLocation(null))).toBe("ledger");
  });

  it("칸이 속한 도시 = 같은 2차맵의 가장 가까운 도시(같은 거리면 작은 ID), 없으면 undefined", () => {
    const cities = [
      { id: 5, mapKey: 1, x: 128, y: 128 },
      { id: 2, mapKey: 1, x: 40, y: 128 },
      { id: 9, mapKey: 2, x: 10, y: 10 },
      { id: 1, mapKey: 1, x: 216, y: 128 },
    ];
    expect(cityOfCell(cities, 1, 50, 120)?.id).toBe(2);
    expect(cityOfCell(cities, 1, 120, 130)?.id).toBe(5);
    // 44칸씩 떨어진 둘(5와 1) — 작은 ID
    expect(cityOfCell(cities, 1, 172, 128)?.id).toBe(1);
    expect(cityOfCell(cities, 3, 0, 0)).toBeUndefined();
  });

  it("재료 자리: 그 도시 창고·그 도시의 내 창고 시설·그 2차맵 화물만, 차례는 도시 → 창고 시설 → 화물", () => {
    const refs: PlaceRef[] = [
      { kind: "cargo", id: 8, cityId: null, mapKey: 1, storage: false },
      { kind: "building", id: 30, cityId: 2, mapKey: 1, storage: true },
      { kind: "city", id: 2, cityId: 2, mapKey: null, storage: false },
      { kind: "city", id: 5, cityId: 5, mapKey: null, storage: false },
      { kind: "building", id: 31, cityId: 2, mapKey: 1, storage: false },
      { kind: "building", id: 12, cityId: 2, mapKey: 1, storage: true },
      { kind: "cargo", id: 3, cityId: null, mapKey: 2, storage: false },
      { kind: "cargo", id: 4, cityId: null, mapKey: 1, storage: false },
      { kind: "ledger", id: null, cityId: null, mapKey: null, storage: false },
    ];
    const used = refs.filter((ref) => isMaterialSource(ref, 2, 1)).toSorted(sourceOrder);
    expect(used.map((ref) => `${ref.kind}:${String(ref.id)}`)).toEqual([
      "city:2",
      "building:12",
      "building:30",
      "cargo:4",
      "cargo:8",
    ]);
    // 도시가 없는 2차맵: 화물만
    expect(refs.filter((ref) => isMaterialSource(ref, null, 1)).map((ref) => ref.id)).toEqual([8, 4]);
    // 영토 비콘(1차맵, 질문 410 ①): 2차맵 없음 → 그 도시 창고 + 그 도시의 내 창고 시설만(화물 없음)
    expect(
      refs
        .filter((ref) => isMaterialSource(ref, 2, null))
        .toSorted(sourceOrder)
        .map((ref) => `${ref.kind}:${String(ref.id)}`),
    ).toEqual(["city:2", "building:12", "building:30"]);
  });

  it("화면 재료 합은 같은 자리 규칙으로 센다(시험 광석 같은 물자가 아닌 줄은 뺀다)", () => {
    const places: GoodsPlaceView[] = [
      {
        key: "city_2",
        kind: "city",
        id: 2,
        cityId: 2,
        mapKey: null,
        storage: false,
        facilityId: null,
        lines: [line("plank", "5")],
      },
      {
        key: "city_5",
        kind: "city",
        id: 5,
        cityId: 5,
        mapKey: null,
        storage: false,
        facilityId: null,
        lines: [line("plank", "50")],
      },
      {
        key: "building_12",
        kind: "building",
        id: 12,
        cityId: 2,
        mapKey: 1,
        storage: true,
        facilityId: "stockpile",
        lines: [line("plank", "7"), { asset: "s3_test_ore", item: null, name: null, qty: "9" }],
      },
      {
        key: "cargo_4",
        kind: "cargo",
        id: 4,
        cityId: null,
        mapKey: 1,
        storage: false,
        facilityId: null,
        lines: [line("brick", "2")],
      },
      {
        key: "ledger",
        kind: "ledger",
        id: null,
        cityId: null,
        mapKey: null,
        storage: false,
        facilityId: null,
        lines: [line("brick", "40")],
      },
    ];
    expect([...materialStockAt(places, 1, 2)]).toEqual([
      ["plank", 12n],
      ["brick", 2n],
    ]);
    // 영토 비콘 재료(질문 410 ①): 화물을 뺀다
    expect([...materialStockAt(places, null, 2)]).toEqual([["plank", 12n]]);
  });
});
