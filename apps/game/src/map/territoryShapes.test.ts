import { mapKeyAtLatLon } from "@terra/engine/planet";
import { decodeCellKey } from "@terra/planet";
import { describe, expect, it } from "vitest";
import {
  type TerritoryShapes,
  type TerritorySite,
  buildTerritoryShapes,
  territoryOwner,
  territorySitesOf,
} from "./territoryShapes.ts";

const DEG = Math.PI / 180;
type Vec = readonly [number, number, number];
const toVec = (latDeg: number, lonDeg: number): Vec => [
  Math.cos(latDeg * DEG) * Math.cos(lonDeg * DEG),
  Math.cos(latDeg * DEG) * Math.sin(lonDeg * DEG),
  Math.sin(latDeg * DEG),
];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const angle = (a: Vec, b: Vec): number => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

const site = (
  id: number,
  factionId: number,
  latDeg: number,
  lonDeg: number,
  radiusDeg: number,
): TerritorySite => ({
  id,
  factionId,
  latDeg,
  lonDeg,
  radius: radiusDeg * DEG,
});

/** 볼록 구면 다각형 안인지(모든 변의 같은 쪽) */
function inside(points: readonly (readonly [number, number])[], latDeg: number, lonDeg: number): boolean {
  const p = toVec(latDeg, lonDeg);
  const corners = points.map(([lat, lon]) => toVec(lat, lon));
  const sides = corners.map((corner, index) =>
    dot(cross(corner, corners[(index + 1) % corners.length] ?? corner), p),
  );
  return sides.every((side) => side >= 0) || sides.every((side) => side <= 0);
}

/** 화면이 칠하는 색(국가): 이긴 조각(뒤 것이 위) → 원 바탕(뒤 것이 위) */
function paintedAt(shapes: TerritoryShapes, latDeg: number, lonDeg: number): number | null {
  const win = shapes.wins.findLast((piece) => inside(piece.points, latDeg, lonDeg));
  if (win) return win.factionId;
  return shapes.circles.findLast((piece) => inside(piece.points, latDeg, lonDeg))?.factionId ?? null;
}

/** 사각 격자 표본마다 칠한 색과 주인 규칙을 맞춰 본다(48각형이 원보다 조금 안쪽이라 원 가장자리 1% 띠는 뺀다) */
function sample(
  shapes: TerritoryShapes,
  sites: readonly TerritorySite[],
  box: { lat: [number, number]; lon: [number, number] },
  steps = 60,
) {
  let covered = 0;
  let mismatched = 0;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lat = box.lat[0] + ((box.lat[1] - box.lat[0]) * i) / steps;
      const lon = box.lon[0] + ((box.lon[1] - box.lon[0]) * j) / steps;
      const p = toVec(lat, lon);
      const nearRim = sites.some(
        (entry) => Math.abs(angle(p, toVec(entry.latDeg, entry.lonDeg)) - entry.radius) < entry.radius * 0.01,
      );
      if (nearRim) continue;
      const owner = territoryOwner(lat, lon, sites);
      if (owner) covered += 1;
      if (paintedAt(shapes, lat, lon) !== (owner?.factionId ?? null)) mismatched += 1;
    }
  }
  return { covered, mismatched };
}

/** 테두리 점들(국가 묶음별) */
const borderPoints = (shapes: TerritoryShapes, key: string) =>
  shapes.borders.filter((border) => border.factions.join(",") === key).flatMap((border) => border.points);

describe("영토 모양: 원 하나·도시 한두 곳", () => {
  it("도시 하나면 원 하나 그대로 — 꼭짓점이 모두 반지름 위, 둘레 전체가 바깥 테두리, 이름표는 가운데", () => {
    const shapes = buildTerritoryShapes([site(1, 10, 20, 30, 1)]);
    expect(shapes.circles).toHaveLength(1);
    expect(shapes.wins).toHaveLength(0);
    const circle = shapes.circles[0];
    expect(circle?.points).toHaveLength(48);
    for (const [lat, lon] of circle?.points ?? [])
      expect(angle(toVec(lat, lon), toVec(20, 30)) / DEG).toBeCloseTo(1, 6);
    // 바깥 둘레 한 줄(처음 꼭짓점으로 돌아와 닫힌다)
    expect(shapes.borders).toHaveLength(1);
    expect(shapes.borders[0]?.factions).toEqual([10]);
    expect(shapes.borders[0]?.points).toHaveLength(49);
    expect(shapes.labels).toHaveLength(1);
    expect(shapes.labels[0]?.latDeg).toBeCloseTo(20, 2);
    expect(shapes.labels[0]?.lonDeg).toBeCloseTo(30, 2);
    // 넓이 ≈ π r²(48각형은 원의 99.7%)
    expect((shapes.labels[0]?.area ?? 0) / (Math.PI * DEG * DEG)).toBeCloseTo(0.997, 2);
  });

  it("도시가 둘뿐인 국가(떨어진 두 원)도 영토 둘, 이름표는 하나(두 도시 사이)", () => {
    const shapes = buildTerritoryShapes([site(1, 10, 0, 0, 1), site(2, 10, 0, 3, 1)]);
    expect(shapes.circles).toHaveLength(2);
    expect(shapes.borders).toHaveLength(2);
    expect(shapes.labels).toHaveLength(1);
    expect(shapes.labels[0]?.lonDeg).toBeCloseTo(1.5, 3);
  });

  it("반경·환산이 없으면 그리지 않는다. 배후지 반경이 있으면 그것, 없으면 영향권 반경", () => {
    const base = {
      number: 1,
      name: null,
      mapKey: 0,
      face: 0,
      i: 0,
      j: 0,
      cellX: 0,
      cellY: 0,
      latDeg: 0,
      lonDeg: 0,
      start: false,
      grade: 1,
      loaded: false,
      viewable: false,
      land: null,
    };
    const cities = [
      { ...base, id: 1, factionId: 1, radiusMilli: 100, catchmentMilli: 2000 },
      { ...base, id: 2, factionId: 1, radiusMilli: 100 },
      { ...base, id: 3, factionId: 1, radiusMilli: null, catchmentMilli: null },
    ];
    expect(territorySitesOf(cities, 0)).toEqual([]);
    expect(territorySitesOf(cities, 10_000).map((entry) => [entry.id, entry.radius])).toEqual([
      [1, 0.2],
      [2, 0.01],
    ]);
  });
});

describe("영토 모양: 합과 가운데 경계", () => {
  it("같은 국가 두 원이 겹치면 합 하나 — 안쪽 호는 테두리가 아니고, 칠은 주인 규칙과 같다", () => {
    const sites = [site(1, 10, 0, 0, 1), site(2, 10, 0, 1.4, 1)];
    const shapes = buildTerritoryShapes(sites);
    expect(shapes.wins).toHaveLength(0);
    expect(shapes.labels).toHaveLength(1);
    // 테두리 점은 다른 원 안쪽 깊이(반지름의 3% 넘게) 들어가지 않는다
    for (const [lat, lon] of borderPoints(shapes, "10")) {
      const p = toVec(lat, lon);
      for (const entry of sites)
        expect(angle(p, toVec(entry.latDeg, entry.lonDeg))).toBeGreaterThan(entry.radius * 0.97);
    }
    expect(sample(shapes, sites, { lat: [-1.2, 1.2], lon: [-1.2, 2.6] }).mismatched).toBe(0);
    // 합 넓이 = 두 원 − 렌즈(구면이지만 1° 원은 평면 공식으로 0.1% 안). 이름표 넓이는 원 넓이 합(겹침을 두 번 센다)
    const d = 1.4;
    const lens = 2 * Math.acos(d / 2) - (d / 2) * Math.sqrt(4 - d * d);
    expect((shapes.labels[0]?.area ?? 0) / (2 * Math.PI * DEG * DEG)).toBeCloseTo(0.997, 2);
    expect(lens).toBeGreaterThan(0);
  });

  it("다른 국가 두 원(같은 반지름)이 겹치면 경계는 두 도시의 정확히 가운데이고 테두리다", () => {
    const sites = [site(1, 10, 0, 0, 1), site(2, 20, 0, 1.2, 1)];
    const shapes = buildTerritoryShapes(sites);
    expect(shapes.wins.map((piece) => piece.cityId)).toEqual([1, 2]);
    const between = borderPoints(shapes, "10,20");
    expect(between.length).toBeGreaterThan(4);
    // 국가 경계 점은 바깥 호(두 원이 만나는 점 근처)이거나 가운데 선 위다 — 가운데 선 점은 두 도시에서 같은 거리
    const middle = between.filter(([lat, lon]) => {
      const p = toVec(lat, lon);
      return angle(p, toVec(0, 0)) < DEG * 0.98 && angle(p, toVec(0, 1.2)) < DEG * 0.98;
    });
    expect(middle.length).toBeGreaterThan(2);
    for (const [lat, lon] of middle) {
      const p = toVec(lat, lon);
      expect(angle(p, toVec(0, 0)) - angle(p, toVec(0, 1.2))).toBeCloseTo(0, 6);
    }
    expect(territoryOwner(0, 0.59, sites)?.factionId).toBe(10);
    expect(territoryOwner(0, 0.61, sites)?.factionId).toBe(20);
    // 표본이 가운데 선 위에 딱 놓이지 않게(같은 거리는 작은 ID — 칠은 경계 선을 어느 쪽에 줘도 된다) 상자를 조금 비튼다
    expect(sample(shapes, sites, { lat: [-1.2, 1.2], lon: [-1.23, 2.41] }).mismatched).toBe(0);
    expect(shapes.labels.map((label) => label.factionId).toSorted()).toEqual([10, 20]);
  });

  it("큰 다른 국가 원 안의 작은 도시도 제 원을 지킨다(가운데가 작은 원 밖이면 원 전체), 작은 원 밖은 큰 원 것", () => {
    const sites = [site(1, 10, 0, 0, 0.5), site(2, 20, 0, 1.6, 2)];
    const shapes = buildTerritoryShapes(sites);
    expect(territoryOwner(0, 0.2, sites)?.factionId).toBe(10);
    expect(territoryOwner(0, -0.45, sites)?.factionId).toBe(10);
    // (0°, 0.7°)는 작은 원 밖, 큰 원 안이고 도시 1에 더 가깝다 → 큰 원(국가 20)
    expect(territoryOwner(0, 0.7, sites)?.factionId).toBe(20);
    expect(sample(shapes, sites, { lat: [-2.1, 2.1], lon: [-0.6, 3.7] }).mismatched).toBe(0);
    // 작은 원 둘레(큰 원 안 몫)는 두 국가 경계
    expect(borderPoints(shapes, "10,20").length).toBeGreaterThan(20);
  });

  it("영토가 둘로 갈린다: 다른 국가 도시가 가운데를 가르면 한 국가 땅이 양쪽에 남는다", () => {
    const sites = [site(1, 10, 0, 0, 1), site(2, 20, 0, 1.5, 1), site(3, 10, 0, 3, 1)];
    const shapes = buildTerritoryShapes(sites);
    expect(territoryOwner(0, 0.7, sites)?.id).toBe(1);
    expect(territoryOwner(0, 1.5, sites)?.id).toBe(2);
    expect(territoryOwner(0, 2.3, sites)?.id).toBe(3);
    expect(sample(shapes, sites, { lat: [-1.2, 1.2], lon: [-1.2, 4.2] }).mismatched).toBe(0);
    // 이름표는 국가마다 하나
    expect(shapes.labels).toHaveLength(2);
  });

  it("같은 자리 도시 둘은 작은 ID가 주인, 원 밖은 주인 없음", () => {
    const sites = [site(5, 10, 10, 10, 1), site(4, 20, 10, 10, 1)];
    const shapes = buildTerritoryShapes(sites);
    expect(shapes.wins.map((piece) => piece.cityId)).toEqual([4]);
    expect(territoryOwner(10, 10, sites)?.id).toBe(4);
    expect(territoryOwner(30, 30, sites)).toBeNull();
  });
});

describe("영토 모양: 이음매 없음", () => {
  it("행성 면 경계(정육면체 면 둘에 걸친 원)도 한 원 — 꼭짓점이 두 면에 있고 모두 반지름 위", () => {
    // 적도 경도 45°는 +x 면과 +y 면의 경계
    const shapes = buildTerritoryShapes([site(1, 10, 0, 45, 0.5)]);
    const points = shapes.circles[0]?.points ?? [];
    const faces = new Set(points.map(([lat, lon]) => decodeCellKey(mapKeyAtLatLon(lat, lon, 9)).face));
    expect(faces.size).toBe(2);
    for (const [lat, lon] of points) expect(angle(toVec(lat, lon), toVec(0, 45)) / DEG).toBeCloseTo(0.5, 6);
  });

  it("경도 ±180°와 극을 넘어도 같은 규칙(가운데 경계·주인·칠)", () => {
    const sites = [site(1, 10, 0, 179.5, 1), site(2, 20, 0, -179.5, 1)];
    const shapes = buildTerritoryShapes(sites);
    expect(shapes.wins).toHaveLength(2);
    expect(territoryOwner(0, 179.9, sites)?.id).toBe(1);
    expect(territoryOwner(0, -179.9, sites)?.id).toBe(2);
    expect(sample(shapes, sites, { lat: [-1, 1], lon: [178.6, 179.99] }, 30).mismatched).toBe(0);
    expect(sample(shapes, sites, { lat: [-1, 1], lon: [-179.99, -178.6] }, 30).mismatched).toBe(0);
    const polar = [site(3, 10, 89.6, 0, 1), site(4, 20, 89.6, 180, 1)];
    expect(territoryOwner(89.9, 0, polar)?.id).toBe(3);
    expect(territoryOwner(89.9, 180, polar)?.id).toBe(4);
    expect(buildTerritoryShapes(polar).wins).toHaveLength(2);
  });
});

describe("영토 모양: 규모", () => {
  it("국가 16·도시 50이 몇 ms 안", () => {
    const sites: TerritorySite[] = [];
    let id = 1;
    for (let nation = 0; nation < 16; nation++) {
      const lat = -30 + (nation % 4) * 20;
      const lon = -40 + Math.floor(nation / 4) * 25;
      for (let index = 0; index < 3; index++)
        sites.push(site(id++, nation + 1, lat + (index % 2) * 0.05, lon + index * 0.05, 0.03));
    }
    // 다른 국가 원이 겹치는 곳도 둘
    sites.push(site(id++, 2, -30, -39.9, 0.03), site(id++, 3, -10, -39.95, 0.03));
    const started = performance.now();
    const shapes = buildTerritoryShapes(sites);
    const elapsed = performance.now() - started;
    expect(sites).toHaveLength(50);
    expect(shapes.labels).toHaveLength(16);
    expect(shapes.wins.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});
