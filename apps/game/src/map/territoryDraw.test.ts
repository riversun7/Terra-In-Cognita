import type { PlanetProjector } from "@terra/engine/planet";
import { describe, expect, it } from "vitest";
import { placeLabels, projectTerritory, vertexStep } from "./territoryDraw.ts";
import { buildTerritoryShapes } from "./territoryShapes.ts";

const DEG = Math.PI / 180;

/** 가짜 투영기: 경도 → x, 위도 → y(1° = pxPerDeg px, 가운데 (0°, 0°) = 화면 가운데). hidden이면 그 경도 이상은 지평선 너머 */
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

const site = (id: number, factionId: number, latDeg: number, lonDeg: number, radiusDeg: number) => ({
  id,
  factionId,
  latDeg,
  lonDeg,
  radius: radiusDeg * DEG,
});

describe("영토 프레임 그리기", () => {
  const sites = [site(1, 10, 0, 0, 1), site(2, 20, 0, 1.5, 1), site(3, 30, 0, 50, 1)];
  const shapes = buildTerritoryShapes(sites);
  const centers = new Map(sites.map((entry) => [entry.id, [entry.latDeg, entry.lonDeg] as const]));

  it("화면 밖·지평선 너머 도시는 건너뛰고, 국가마다 바탕·이긴 조각·테두리 경로", () => {
    const frame = projectTerritory(flatProjector(40), shapes, centers);
    // 도시 3(경도 50° = 2000px)은 화면 밖
    expect(frame.cities).toBe(2);
    expect(frame.base.get(10)).toMatch(/^M.*Z$/);
    expect(frame.wins.get(20)).toMatch(/^M.*Z$/);
    expect(frame.edges.get(10)).toMatch(/^M/);
    expect(frame.base.has(30)).toBe(false);
    const hidden = projectTerritory(flatProjector(40, 1), shapes, centers);
    expect(hidden.cities).toBe(1);
  });

  it("화면에서 작은 원은 꼭짓점을 솎고, 1px 미만이면 그리지 않는다", () => {
    expect([2, 6, 12, 40].map(vertexStep)).toEqual([8, 4, 2, 1]);
    const tiny = projectTerritory(flatProjector(3), shapes, centers);
    // 반지름 3px → 6꼭짓점
    expect(tiny.base.get(10)?.match(/L/g)).toHaveLength(5);
    // 테두리는 3px 이상만
    expect(tiny.edges.size).toBeGreaterThan(0);
    expect(projectTerritory(flatProjector(0.5), shapes, centers).cities).toBe(0);
  });

  it("국가 이름표: 넓은 국가부터, 서로 겹치지 않게 — 자리가 없으면 감춘다", () => {
    const projector = flatProjector(40);
    const sizes = new Map([
      [10, { width: 80, height: 20 }],
      [20, { width: 80, height: 20 }],
    ]);
    const placed = placeLabels(projector, shapes.labels, sizes, []);
    expect(placed.size).toBe(2);
    const [a, b] = [...placed.values()];
    expect(Math.abs((a?.y ?? 0) - (b?.y ?? 0)) >= 20 || Math.abs((a?.x ?? 0) - (b?.x ?? 0)) >= 80).toBe(true);
    // 크기를 모르는(아직 재지 않은) 이름표는 넣지 않는다
    expect(placeLabels(projector, shapes.labels, new Map(), []).size).toBe(0);
  });
});
