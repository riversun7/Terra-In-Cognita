// 주거 건물 층 셈 시험(D-591 1) — 정원 = 층 × 칸, 최고 층, 재료·시간 배율(층마다 늘어남·올림), 열림 판정, 끝난 작업 적용
import { describe, expect, it } from "vitest";
import {
  addModule,
  floorMaterials,
  floorMax,
  floorMs,
  floorOpen,
  floorsOf,
  residenceCapacity,
} from "./floors.ts";
import type { FacilityRecord } from "./state.ts";

const record = (fields: Partial<FacilityRecord>): FacilityRecord => ({
  buildingId: 1,
  facilityId: "lodging",
  level: 1,
  conditionPpm: 1_000_000,
  conditionAtMs: 0,
  builtAtMs: 0,
  builtBy: null,
  cityId: 5,
  ...fields,
});

const LIVING = { stage: "living" };

describe("주거 건물 층(D-591 1)", () => {
  it("층 수: 없거나 틀리면 1, 정원 = 층 × 칸(기본 4), 최고 층 기본 5", () => {
    expect(floorsOf(record({}))).toBe(1);
    expect(floorsOf(record({ floors: 3 }))).toBe(3);
    expect(floorsOf(record({ floors: 0 }))).toBe(1);
    expect(floorsOf(record({ floors: Number.NaN }))).toBe(1);
    expect(residenceCapacity(3, {})).toBe(12);
    expect(residenceCapacity(2, { residenceCapacityPerFloor: 6 })).toBe(12);
    expect(floorMax({})).toBe(5);
    expect(floorMax({ residenceFloorMax: 0 })).toBe(1);
  });

  it("재료·시간: 지금 레벨 짓기 값 × 지금 층 × 배율 ÷ 1000(재료는 줄마다 올림, 0 줄은 뺀다)", () => {
    const base = [
      { item: "pine_log", qty: 5 },
      { item: "stone", qty: 3000 },
    ];
    expect(floorMaterials(base, 1, {})).toEqual(base);
    expect(floorMaterials(base, 3, {})).toEqual([
      { item: "pine_log", qty: 15 },
      { item: "stone", qty: 9000 },
    ]);
    expect(floorMaterials(base, 1, { residenceFloorCostPm: 150 })).toEqual([
      { item: "pine_log", qty: 1 },
      { item: "stone", qty: 450 },
    ]);
    expect(floorMaterials(base, 2, { residenceFloorCostPm: 0 })).toEqual([]);
    expect(floorMs(60_000, 2, {})).toBe(120_000);
    expect(floorMs(60_000, 2, { residenceFloorTimePm: 500 })).toBe(60_000);
  });

  it("열림: 주거 건물·다 지음·최고 층 아래만", () => {
    expect(floorOpen(record({}), LIVING, {})).toBeNull();
    expect(floorOpen(record({}), { stage: "production" }, {})).toBe("not_facility");
    expect(floorOpen(record({}), undefined, {})).toBe("not_facility");
    expect(floorOpen(record({ level: 0 }), LIVING, {})).toBe("under_construction");
    expect(floorOpen(record({ floors: 5 }), LIVING, {})).toBe("floor_full");
    expect(floorOpen(record({ floors: 5 }), LIVING, { residenceFloorMax: 6 })).toBeNull();
  });

  it("끝난 작업: 층 + 1, 면적 모듈 + 1", () => {
    const row = record({});
    addModule(row, "floor");
    addModule(row, "floor");
    addModule(row, "plot");
    expect(row.floors).toBe(3);
    expect(row.plots).toBe(1);
  });
});
