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
});
