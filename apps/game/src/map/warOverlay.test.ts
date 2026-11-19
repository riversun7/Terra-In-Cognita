import type { PlanetProjector } from "@terra/engine/planet";
import type { WorldMapCity, WorldMapFaction, WorldMapRelation } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import {
  buildDiplomacyArcs,
  factionFallbackAnchors,
  factionScaleOf,
  projectDiplomacyArcs,
  selectCityLabelIds,
  warSetsOf,
} from "./warOverlay.ts";

function flatProjector(): PlanetProjector {
  const viewport = { width: 800, height: 600 };
  return {
    viewport,
    distanceM: 1,
    radiusM: 1,
    project: (latDeg, lonDeg) => ({
      x: viewport.width / 2 + lonDeg * 40,
      y: viewport.height / 2 - latDeg * 40,
      visible: true,
    }),
  };
}

function city(overrides: Partial<WorldMapCity> & { id: number; factionId: number }): WorldMapCity {
  return {
    number: 1,
    name: null,
    mapKey: 1000,
    face: 0,
    i: 0,
    j: 0,
    cellX: 128,
    cellY: 128,
    latDeg: 0,
    lonDeg: 0,
    start: false,
    capital: false,
    grade: 1,
    radiusMilli: 3000,
    loaded: true,
    viewable: true,
    land: null,
    ...overrides,
  };
}

const FACTIONS: WorldMapFaction[] = [
  { id: 1, code: "n1", kind: "npc", name: { ko: "북국", en: "North" }, parentId: null },
  { id: 2, code: "n2", kind: "npc", name: { ko: "남국", en: "South" }, parentId: null },
  { id: 3, code: "n3", kind: "npc", name: { ko: "동국", en: "East" }, parentId: 1 },
];

describe("1차맵 전쟁 전선·외교 호·도시 이름 우선순위", () => {
  it("전쟁 중인 국가 쌍은 가장 가까운 두 도시를 전선으로 잇고 중앙 교전 배지 자리를 구한다", () => {
    const cities = [
      city({ id: 1, factionId: 1, latDeg: 0, lonDeg: -5, capital: true }),
      city({ id: 2, factionId: 1, latDeg: 0, lonDeg: -1 }),
      city({ id: 3, factionId: 2, latDeg: 0, lonDeg: 1 }),
      city({ id: 4, factionId: 2, latDeg: 0, lonDeg: 6, capital: true }),
      city({ id: 5, factionId: 3, latDeg: 3, lonDeg: 2, capital: true }),
    ];
    const relations: WorldMapRelation[] = [{ factionA: 1, factionB: 2, state: "war", atMs: 1000 }];
    const sets = warSetsOf(relations);
    expect(sets.pairs.has("1:2")).toBe(true);
    expect(sets.warringFactions.has(1)).toBe(true);
    expect(sets.warringFactions.has(3)).toBe(false);

    const arcs = buildDiplomacyArcs(cities, FACTIONS, relations);
    const warArc = arcs.find((entry) => entry.kind === "war");
    expect(warArc).toBeDefined();
    // 가장 가까운 도시(경도 -1, +1)를 연결한다
    expect(warArc?.from).toEqual([0, -1]);
    expect(warArc?.to).toEqual([0, 1]);
    expect(arcs.some((entry) => entry.kind === "vassal")).toBe(true);

    const frame = projectDiplomacyArcs(flatProjector(), arcs, 1, false);
    expect(frame.focusedWarPath).toMatch(/^M.*Q/);
    expect(frame.vassalPath).toMatch(/^M.*Q/);
    expect(frame.clashes).toHaveLength(1);
    expect(frame.clashes[0]?.x).toBeCloseTo(400, 0);
  });

  it("수도·선택 도시는 가까운 일반 도시와 겹쳐도 이름을 우선 표시한다", () => {
    const capital = city({ id: 10, factionId: 1, capital: true, grade: 2 });
    const town = city({ id: 11, factionId: 1, capital: false, grade: 1 });
    const farTown = city({ id: 12, factionId: 2, capital: false, grade: 1 });
    const shown = [
      { city: town, point: { x: 200, y: 200, visible: true }, count: 1 },
      { city: capital, point: { x: 220, y: 205, visible: true }, count: 1 },
      { city: farTown, point: { x: 500, y: 300, visible: true }, count: 1 },
    ];
    const visible = selectCityLabelIds(shown, null, new Map());
    expect(visible.has(capital.id)).toBe(true);
    expect(visible.has(town.id)).toBe(false);
    expect(visible.has(farTown.id)).toBe(true);
  });

  it("국가 대체 기준점은 수도 우선이고, 규모 등급은 도시 수를 따른다", () => {
    const cities = [
      city({ id: 1, factionId: 1, latDeg: 1, lonDeg: 1 }),
      city({ id: 2, factionId: 1, latDeg: 2, lonDeg: 2, capital: true }),
    ];
    expect(factionFallbackAnchors(cities).get(1)?.[0]).toEqual([2, 2]);
    expect([factionScaleOf(1), factionScaleOf(3), factionScaleOf(6)]).toEqual(["minor", "medium", "major"]);
  });
});
