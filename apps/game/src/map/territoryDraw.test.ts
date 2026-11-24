import type { PlanetProjector } from "@terra/engine/planet";
import { describe, expect, it } from "vitest";
import { MIN_BLOB_PX, placeLabels, projectTerritory, vertexStep } from "./territoryDraw.ts";
import { buildTerritoryShapes } from "./territoryShapes.ts";

const DEG = Math.PI / 180;

/** 가짜 투영기: 경도 → x, 위도 → y(1° = pxPerDeg px, (0°, 0°) = 화면 가운데). hiddenFromLon 이상 경도는 지평선 너머 */
function flatProjector(pxPerDeg: number, hiddenFromLon = Number.POSITIVE_INFINITY): PlanetProjector {
  const viewport = { width: 400, height: 800 };
  return {
    viewport,
    distanceM: 1,
    radiusM: 1,
    project: (latDeg, lonDeg) => ({
      x: viewport.width / 2 + lonDeg * pxPerDeg,
      y: viewport.height / 2 - latDeg * pxPerDeg,
      visible: lonDeg < hiddenFromLon,
    }),
  };
}

const site = (id: number, factionId: number, latDeg: number, lonDeg: number, radiusDeg: number) =>
  ({
    kind: "city",
    id,
    factionId,
    latDeg,
    lonDeg,
    radius: radiusDeg * DEG,
  }) as const;

describe("영토 프레임 그리기", () => {
  // 국가 10: 도시 둘(띠로 이음), 국가 20: 도시 하나(가운데에서 먼 곳), 국가 30: 화면 밖
  const sites = [site(1, 10, 0, 0, 1), site(2, 10, 0, 3, 1), site(3, 20, 6, -2, 0.5), site(4, 30, 0, 50, 1)];
  const shapes = buildTerritoryShapes(sites, 10 * DEG);

  it("화면 밖·지평선 너머 덩이는 건너뛰고, 국가마다 닫힌 고리 경로", () => {
    const frame = projectTerritory(flatProjector(40), shapes);
    expect(frame.areas).toBe(2);
    expect(frame.fills.get(10)).toMatch(/^M.*Z$/);
    expect(frame.fills.has(30)).toBe(false);
    expect(projectTerritory(flatProjector(40, -1), shapes).areas).toBe(1);
  });

  it("작게 보이는 국가는 이름표 자리에 둥근 표시(1단계에서도 보이게)", () => {
    expect([4, 20, 60].map(vertexStep)).toEqual([4, 2, 1]);
    // 1° = 8px: 국가 20(반지름 0.5° = 4px)은 둥근 표시, 국가 10(가운데에서 끝까지 약 2.5° = 20px)은 고리
    const small = projectTerritory(flatProjector(8), shapes);
    expect(small.blobs).toBe(1);
    expect(small.fills.get(20)).toContain(`a${MIN_BLOB_PX} ${MIN_BLOB_PX}`);
    expect(small.fills.get(10)).toMatch(/^M.*Z$/);
  });

  it("국가 이름표: 넓은 국가부터, 서로 겹치지 않게 — 크기를 모르면 넣지 않는다", () => {
    const projector = flatProjector(40);
    const sizes = new Map([
      [10, { width: 80, height: 20 }],
      [20, { width: 80, height: 20 }],
    ]);
    const placed = placeLabels(projector, shapes.labels, sizes, []);
    expect(placed.size).toBe(2);
    const [a, b] = [...placed.values()];
    expect(Math.abs((a?.y ?? 0) - (b?.y ?? 0)) >= 20 || Math.abs((a?.x ?? 0) - (b?.x ?? 0)) >= 80).toBe(true);
    expect(placeLabels(projector, shapes.labels, new Map(), []).size).toBe(0);
  });

  it("국가 이름표: 도시 표시와 겹치면 바로 위로만 비키고, 멀리 밀려나지 않는다", () => {
    const projector = flatProjector(40);
    const sizes = new Map([[20, { width: 80, height: 20 }]]);
    const spot = shapes.labels.filter((entry) => entry.factionId === 20);
    const centre = projector.project(spot[0]?.latDeg ?? 0, spot[0]?.lonDeg ?? 0);
    const free = placeLabels(projector, spot, sizes, []).get(20);
    expect(free?.slot).toBe(0);
    const moved = placeLabels(projector, spot, sizes, [{ x: centre?.x ?? 0, y: centre?.y ?? 0 }]).get(20);
    expect(moved?.slot).toBe(1);
    expect(moved?.x).toBeCloseTo(centre?.x ?? 0);
    // 이름표 아래 끝이 표시 바로 위(이름표 높이 한 개 안쪽)
    expect((centre?.y ?? 0) - (moved?.y ?? 0)).toBeLessThan(20 + 20);
  });

  it("국가 이름표: 붙잡은 자리는 비어 있는 동안 그대로, 앞 후보는 여유까지 비어야 돌아간다", () => {
    const projector = flatProjector(40);
    const sizes = new Map([[20, { width: 80, height: 20 }]]);
    const spot = shapes.labels.filter((entry) => entry.factionId === 20);
    const centre = projector.project(spot[0]?.latDeg ?? 0, spot[0]?.lonDeg ?? 0);
    const cx = centre?.x ?? 0;
    const cy = centre?.y ?? 0;
    const held = new Map([[20, 1]]);
    // 가운데(후보 0)를 겨우 비킨 표시: 처음이면 가운데를 고르지만, 위(1)를 붙잡고 있으면 그대로 둔다
    const nearby = [{ x: cx, y: cy + 10 + 14 + 4 + 6 }];
    expect(placeLabels(projector, spot, sizes, nearby).get(20)?.slot).toBe(0);
    expect(placeLabels(projector, spot, sizes, nearby, undefined, held).get(20)?.slot).toBe(1);
    // 둘레가 충분히 비면 가운데로 돌아간다
    expect(placeLabels(projector, spot, sizes, [], undefined, held).get(20)?.slot).toBe(0);
    // 붙잡은 자리가 막히면 다른 자리로
    const blocked = [
      { x: cx, y: cy },
      { x: cx, y: placeLabels(projector, spot, sizes, [{ x: cx, y: cy }]).get(20)?.y ?? 0 },
    ];
    expect(placeLabels(projector, spot, sizes, blocked, undefined, held).get(20)?.slot).toBe(2);
  });
});
