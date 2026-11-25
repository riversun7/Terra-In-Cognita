// 홈 [도시 활동] 카드 자료 도우미 시험 — 유닛 고르기, 건물 줄·거르기, 정부 건물 건설 가능 표시, 자원 세기.
import type { FacilityLandRuleResponse } from "@terra/shared/facilities";
import type { GatherKindView, GatherLoopView } from "@terra/shared/gather";
import type { MapBuildingLook } from "@terra/shared/mapLooks";
import type { WorldMyUnit } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import {
  buildingFilters,
  buildingRows,
  canClaimCity,
  canGatherKind,
  cellsTo,
  filterBuildings,
  hasGovernment,
  LOOP_DONE_SHOW_MS,
  loopOf,
  pickUnit,
  resourceRows,
  sortMyUnits,
} from "./cityCardData.ts";

const unit = (unitId: number, extra: Partial<WorldMyUnit> = {}): WorldMyUnit => ({
  unitId,
  kind: "human",
  mapKey: 100,
  cellX: 10,
  cellY: 10,
  latDeg: 0,
  lonDeg: 0,
  loaded: true,
  moving: false,
  ...extra,
});

const look = (buildingId: number, extra: Partial<MapBuildingLook> = {}): MapBuildingLook => ({
  buildingId,
  facilityId: "farm",
  level: 1,
  state: "ok",
  upgrading: false,
  factionId: null,
  mine: false,
  ...extra,
});

describe("유닛 고르기", () => {
  const units = [unit(9), unit(3, { kind: "boat" }), unit(7, { kind: "cyborg", name: "Ada" })];

  it("사이보그 본체 먼저, 그다음 유닛 ID 차례", () => {
    expect(sortMyUnits(units).map((entry) => entry.unitId)).toEqual([7, 3, 9]);
  });

  it("고른 유닛이 있으면 그것, 없으면 사이보그 본체, 본체도 없으면 첫 유닛", () => {
    expect(pickUnit(units, 9)?.unitId).toBe(9);
    expect(pickUnit(units, null)?.unitId).toBe(7);
    expect(pickUnit(units, 404)?.unitId).toBe(7);
    expect(pickUnit([unit(9), unit(3)], null)?.unitId).toBe(3);
    expect(pickUnit([], 1)).toBeNull();
  });
});

describe("건물 줄", () => {
  const looks = [
    look(5, { name: { ko: "농장", en: "Farm" }, category: "gathering" }),
    look(2, { name: { ko: "창고", en: "Storehouse" }, category: "storage", mine: true }),
    look(8, {
      facilityId: "government_hall",
      name: { ko: "정부", en: "Government" },
      category: "administration",
    }),
    look(4, {
      name: { ko: "광산", en: "Mine" },
      category: "gathering",
      mine: true,
      level: 3,
      upgrading: true,
      rect: { x: 7, y: 9, width: 3, height: 2 },
    }),
    look(1, { facilityId: null }),
    look(6, { facilityId: "odd" }),
  ];

  it("분류표 차례 → 내 것 먼저 → 이름 → ID, 시설·분류가 없으면 그 밖", () => {
    const rows = buildingRows(looks, "ko");
    expect(rows.map((row) => row.id)).toEqual([8, 4, 5, 2, 1, 6]);
    expect(rows.map((row) => row.group)).toEqual([
      "administration",
      "gathering",
      "gathering",
      "storage",
      "other",
      "other",
    ]);
    expect(rows[1]).toMatchObject({ name: "광산", level: 3, upgrading: true, mine: true });
    // 건물 칸 네모(미니맵)는 있으면 그대로, 없으면 칸을 두지 않는다
    expect(rows[1]?.rect).toEqual({ x: 7, y: 9, width: 3, height: 2 });
    expect(rows[0]).not.toHaveProperty("rect");
    expect(buildingRows(looks, "en")[1]?.name).toBe("Mine");
    expect(rows[4]?.name).toBeNull();
  });

  it("거르기 칩: 전체는 늘, 내 것·무리는 1개 이상일 때만", () => {
    const rows = buildingRows(looks, "ko");
    expect(buildingFilters(rows)).toEqual([
      { filter: "all", count: 6 },
      { filter: "mine", count: 2 },
      { filter: "administration", count: 1 },
      { filter: "gathering", count: 2 },
      { filter: "storage", count: 1 },
      { filter: "other", count: 2 },
    ]);
    expect(buildingFilters([])).toEqual([{ filter: "all", count: 0 }]);
    expect(filterBuildings(rows, "mine").map((row) => row.id)).toEqual([4, 2]);
    expect(filterBuildings(rows, "gathering").map((row) => row.id)).toEqual([4, 5]);
    expect(filterBuildings(rows, "all")).toHaveLength(6);
  });

  it("정부 건물이 보이나", () => {
    expect(hasGovernment(buildingRows(looks, "ko"))).toBe(true);
    expect(hasGovernment(buildingRows([look(1)], "ko"))).toBe(false);
  });
});

const rule = (extra: Partial<FacilityLandRuleResponse>): FacilityLandRuleResponse => ({
  status: "ready",
  mapKey: 100,
  allowed: true,
  reason: null,
  cityFaction: null,
  claim: "personal",
  ...extra,
});

describe("정부 건물 건설 가능 표시", () => {
  it("지을 수 있고, 새 도시 주인이 정해지며, 정부 건물이 아직 없을 때만", () => {
    expect(canClaimCity(rule({}))).toBe(true);
    expect(canClaimCity(rule({ claim: "house", governmentExists: false }))).toBe(true);
    expect(canClaimCity(rule({ governmentExists: true }))).toBe(false);
    expect(canClaimCity(rule({ claim: null }))).toBe(false);
    expect(canClaimCity(rule({ claim: undefined }))).toBe(false);
    expect(canClaimCity(rule({ allowed: false, reason: "foreign_city" }))).toBe(false);
    expect(canClaimCity(rule({ status: "unknown_map", allowed: false }))).toBe(false);
    expect(canClaimCity(null)).toBe(false);
  });
});

const kind = (id: string): GatherKindView => ({
  id,
  name: { ko: id, en: id },
  item: `${id}_item`,
  itemName: null,
  uses: 3,
  lots: 1,
  workMs: 1000,
  regrowMs: 60_000,
  facility: null,
  facilityName: null,
});

describe("자원 세기", () => {
  const NOW = 1_000_000;

  it("종류별 수와 지금 캘 수 있는 수(많은 순, 같으면 종류 차례)", () => {
    // 걸음 4: 번호, 종류, 남은 번수, 다시 자라는 시각. 종류 표에 없는 번호(9)는 버린다
    const objects = [
      [1, 0, 3, 0],
      [2, 1, 0, NOW + 5_000],
      [3, 1, 2, 0],
      [4, 1, 0, NOW - 1],
      [5, 2, 1, 0],
      [6, 9, 1, 0],
    ].flat();
    const rows = resourceRows({ kinds: [kind("tree"), kind("ore"), kind("herb")], objects }, NOW);
    expect(rows.map((row) => [row.kindId, row.count, row.ready])).toEqual([
      ["ore", 3, 2],
      ["tree", 1, 1],
      ["herb", 1, 1],
    ]);
  });

  it("기준 자리를 알면 가장 가까운 캘 수 있는 곳이 가까운 종류 먼저, 줄마다 그 오브젝트·거리", () => {
    // 번호 = y × 256 + x. tree: (10,0)·(3,0), ore: (0,4) 떨어짐·(0,20), herb: 모두 떨어짐, 어군 70000: 길 첫 점 (6,8)
    const objects = [
      [10, 0, 3, 0],
      [3, 0, 1, 0],
      [4 * 256, 1, 0, NOW + 5_000],
      [20 * 256, 1, 2, 0],
      [5 * 256 + 5, 2, 0, NOW + 5_000],
      [70_000, 3, 1, 0],
      [70_001, 3, 1, 0],
    ].flat();
    const kinds = [kind("tree"), kind("ore"), kind("herb"), { ...kind("fish"), boat: true }];
    const schools = [{ id: 70_000, points: [6, 8, 9, 8], periodMs: 1000, phaseMs: 0 }];
    const rows = resourceRows({ kinds, objects, schools }, NOW, { x: 0, y: 0 });
    expect(
      rows.map((row) => [row.kindId, row.nearest?.objectId ?? null, row.nearest?.cells ?? null]),
    ).toEqual([
      ["tree", 3, 3],
      ["fish", 70_000, 10],
      ["ore", 20 * 256, 20],
      ["herb", null, null],
    ]);
    // 길이 없는 어군(70001)은 셈에는 들고 가까운 것 고르기에서 빠진다
    expect(rows[1]).toMatchObject({ count: 2, ready: 2, boat: true, direct: true });
    // 기준 자리를 모르면 가까운 곳이 없다(많은 순)
    expect(resourceRows({ kinds, objects, schools }, NOW).every((row) => row.nearest === null)).toBe(true);
  });

  it("캘 수 있나: 직접 캐는 종류 + 가까운 곳이 있고 + 배 규칙이 맞을 때", () => {
    const nearest = { objectId: 1, cells: 2 };
    expect(canGatherKind({ direct: true, boat: false, nearest }, false)).toBe(true);
    expect(canGatherKind({ direct: false, boat: false, nearest }, false)).toBe(false);
    expect(canGatherKind({ direct: true, boat: false, nearest: null }, false)).toBe(false);
    // 배로만 닿는 종류는 배에 탄 유닛만, 땅 종류는 배에 타지 않은 유닛만
    expect(canGatherKind({ direct: true, boat: true, nearest }, false)).toBe(false);
    expect(canGatherKind({ direct: true, boat: true, nearest }, true)).toBe(true);
    expect(canGatherKind({ direct: true, boat: false, nearest }, true)).toBe(false);
  });

  it("건물 가운데까지 거리", () => {
    expect(cellsTo({ x: 0, y: 0 }, { x: 2, y: 3, width: 2, height: 2 })).toBe(5);
    expect(cellsTo(null, { x: 2, y: 3, width: 2, height: 2 })).toBeNull();
    expect(cellsTo({ x: 0, y: 0 }, undefined)).toBeNull();
  });

  it("걸음이 틀린 응답은 빈 목록", () => {
    expect(resourceRows({ kinds: [kind("tree")], objects: [1, 0, 3] }, NOW)).toEqual([]);
    expect(resourceRows({ kinds: [], objects: [] }, NOW)).toEqual([]);
  });
});

describe("진행 줄 고르기", () => {
  const NOW = 5_000_000;
  const loop = (unitId: number, extra: Partial<GatherLoopView>): GatherLoopView => ({
    unitId,
    mapKey: 100,
    objectId: null,
    kindId: null,
    buildingId: 7,
    phase: "entering",
    carriedGrams: 0,
    capacityGrams: 0,
    deposit: null,
    gatheredLots: 0,
    depositedUnits: 0,
    efficiencyPm: 1000,
    nextAt: null,
    stop: null,
    enterResult: null,
    updatedAt: NOW,
    ...extra,
  });

  it("그 유닛의 진행 중인 줄을 먼저, 없으면 방금 끝난 줄만", () => {
    const done = loop(1, { phase: "done", enterResult: "inside", updatedAt: NOW - 1_000 });
    const active = loop(1, { phase: "entering", updatedAt: NOW - 60_000 });
    expect(loopOf([done, active, loop(2, {})], 1, NOW)).toBe(active);
    expect(loopOf([done, loop(2, {})], 1, NOW)).toBe(done);
    // 오래전에 끝난 줄은 보이지 않는다
    const old = loop(1, { phase: "done", updatedAt: NOW - LOOP_DONE_SHOW_MS });
    expect(loopOf([old], 1, NOW)).toBeNull();
    expect(loopOf([loop(2, {})], 1, NOW)).toBeNull();
    expect(loopOf([], 1, NOW)).toBeNull();
  });
});
