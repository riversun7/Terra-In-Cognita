import { cellKey, parseCellKey } from "@terra/planet";
import { cellCenter } from "@terra/planet/projection";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import { S1_TEST_MAP_KEY } from "@terra/protocol";
import { START_TERRITORY_COEFFICIENTS } from "@terra/shared/territory";
import type { TerritoryPlanetView } from "@terra/shared/territoryApi";
import { describe, expect, it } from "vitest";
import {
  FACTION_COLOR_TOKENS,
  cellAt,
  cellRows,
  factionColorToken,
  fineSamples,
  labCenter,
  layoutOf,
  mapViewOf,
  project,
  visibleCells,
} from "./territoryModel.ts";

const CENTER = parseCellKey(S1_TEST_MAP_KEY);
const cell = (i: number, j: number) => cellKey(0, 9, i, j);

function viewOf(beacons: readonly number[]): TerritoryPlanetView {
  const city = territoryPoint(CENTER);
  return {
    planetId: "s2_test_planet",
    faceLevel: 9,
    milliPerRadian: territoryMetric(9).milliPerRadian,
    rules: START_TERRITORY_COEFFICIENTS,
    beacon: { enabled: true, materials: [] },
    factions: [
      { id: 1, code: "a", kind: "npc", name: null },
      { id: 2, code: "b", kind: "npc", name: null },
    ],
    cities: [
      {
        id: 10,
        factionId: 1,
        mapKey: CENTER,
        cellX: 128,
        cellY: 128,
        point: city,
        development: 0,
        grade: 1,
        radiusMilli: 100,
        rangeMilli: 10_000,
        beaconsUsed: beacons.length,
        beaconsMax: 3,
      },
    ],
    beacons: beacons.map((key, index) => ({
      id: index + 1,
      factionId: 1,
      cityId: 10,
      cellKey: key,
      point: territoryPoint(parseCellKey(key)),
      durability: 10,
      builtAtMs: 0,
    })),
    groups: [],
    cells: [
      [CENTER, 1, 10, 16],
      [-1, 1, 10, 16],
    ],
    myFactionId: null,
    computedAtMs: 0,
  };
}

describe("영토 지도 투영", () => {
  it("칸 중심을 화면에 비추고 그 자리를 누르면 같은 칸이다(보이는 칸 모두)", () => {
    const view = mapViewOf(CENTER, 4, 360);
    const cells = visibleCells(view);
    expect(cells).toHaveLength(81);
    for (const key of cells) {
      const at = project(view, cellCenter(key));
      expect(at).not.toBeNull();
      expect(cellAt(view, at?.[0] ?? 0, at?.[1] ?? 0)).toBe(key);
    }
    // 가운데 칸 = 화면 가운데, i가 커지면 오른쪽, j가 커지면 위
    expect(project(view, cellCenter(CENTER))?.map(Math.round)).toEqual([180, 180]);
    const right = project(view, cellCenter(cell(283, 328)));
    const up = project(view, cellCenter(cell(282, 329)));
    expect((right?.[0] ?? 0) > 180 && (up?.[1] ?? 999) < 180).toBe(true);
    // 반대쪽 반구는 비추지 않는다
    const [x, y, z] = cellCenter(CENTER);
    expect(project(view, [-x, -y, -z])).toBeNull();
  });

  it("서버 자료로 같은 배치를 만들고, 세밀 표본은 껍질 안을 그 세력으로 칠한다", () => {
    const data = viewOf([cell(287, 328), cell(282, 333), cell(287, 333)]);
    const layout = layoutOf(data);
    expect(layout.groups[0]?.hull).toHaveLength(4);
    const samples = fineSamples(mapViewOf(CENTER, 6, 300), layout, 2);
    // 정사각형 5×5칸 = 25칸 × 표본 16 ≈ 400(가장자리 반쪽 포함)
    expect(samples.length).toBeGreaterThan(300);
    expect(samples.length).toBeLessThan(500);
    expect(samples.every((sample) => sample.claim.faction === 1 && sample.claim.province === 10)).toBe(true);
    // 칸 표: 칸 키가 아닌 줄은 버린다
    expect([...cellRows(data).keys()]).toEqual([CENTER]);
  });

  it("세력 색은 보기 차례로 토큰 여섯을 돌려 쓴다", () => {
    const data = viewOf([]);
    expect(factionColorToken(data, 1)).toBe(FACTION_COLOR_TOKENS[0]);
    expect(factionColorToken(data, 2)).toBe(FACTION_COLOR_TOKENS[1]);
    expect(factionColorToken(data, 99)).toBe(FACTION_COLOR_TOKENS[0]);
  });
  it("지도 가운데: 고른 세력의 첫 도시 2차맵, 없으면 첫 도시, 도시가 없으면 시험 2차맵", () => {
    const view = viewOf([]);
    const far = cell(100, 40);
    const base = view.cities[0];
    if (!base) throw new Error("no city");
    const two: TerritoryPlanetView = {
      ...view,
      cities: [...view.cities, { ...base, id: 11, factionId: 2, mapKey: far }],
    };
    expect(labCenter(two, 2)).toBe(far);
    expect(labCenter(two, 1)).toBe(CENTER);
    expect(labCenter(two, 77)).toBe(CENTER);
    expect(labCenter({ ...view, cities: [] }, 1)).toBe(CENTER);
    expect(labCenter(null, null)).toBe(CENTER);
  });
});
