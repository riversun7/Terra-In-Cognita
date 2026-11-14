import { mapKeyAtLatLon } from "@terra/engine/planet";
import { decodeCellKey } from "@terra/planet";
import { describe, expect, it } from "vitest";
import {
  type TerritorySite,
  buildTerritoryShapes,
  corridorOf,
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
/** 시험에서 쓰는 잇기 상한(10°) */
const CORRIDOR = 10 * DEG;
const owner = (sites: readonly TerritorySite[], lat: number, lon: number, corridor = CORRIDOR) =>
  territoryOwner(lat, lon, sites, corridor);

describe("국가 영토: 도시 하나·도시 사이", () => {
  it("도시 하나면 원 하나 — 고리 점이 모두 반지름 위, 넓이 ≈ π r², 이름표는 가운데", () => {
    const shapes = buildTerritoryShapes([site(1, 10, 20, 30, 1)], CORRIDOR);
    expect(shapes.areas).toHaveLength(1);
    const loops = shapes.areas[0]?.loops ?? [];
    expect(loops).toHaveLength(1);
    for (const [lat, lon] of loops[0] ?? [])
      expect(angle(toVec(lat, lon), toVec(20, 30)) / DEG).toBeCloseTo(1, 1);
    expect(shapes.labels).toHaveLength(1);
    expect(shapes.labels[0]?.latDeg).toBeCloseTo(20, 1);
    expect(shapes.labels[0]?.lonDeg).toBeCloseTo(30, 1);
    expect((shapes.labels[0]?.area ?? 0) / (Math.PI * DEG * DEG)).toBeGreaterThan(0.93);
    expect((shapes.labels[0]?.area ?? 0) / (Math.PI * DEG * DEG)).toBeLessThan(1.03);
    expect(shapes.dividers).toHaveLength(0);
  });

  it("같은 국가 두 도시 사이 빈 땅도 영토(띠로 이어 한 덩이·고리 하나), 띠 밖은 영토 밖", () => {
    const sites = [site(1, 10, 0, 0, 1), site(2, 10, 0, 4, 1)];
    // 두 원 사이(원 밖) 가운데
    expect(owner(sites, 0, 2)?.factionId).toBe(10);
    expect(owner(sites, 0.8, 2)?.factionId).toBe(10);
    expect(owner(sites, 1.5, 2)).toBeNull();
    const shapes = buildTerritoryShapes(sites, CORRIDOR);
    expect(shapes.areas).toHaveLength(1);
    expect(shapes.areas[0]?.loops).toHaveLength(1);
    expect(shapes.labels).toHaveLength(1);
    expect(shapes.labels[0]?.lonDeg).toBeCloseTo(2, 1);
  });

  it("도시 셋이 서로 이어지면 삼각형 속(띠에서 먼 가운데)도 영토", () => {
    const sites = [site(1, 10, 0, 0, 1), site(2, 10, 0, 5, 1), site(3, 10, 4.33, 2.5, 1)];
    // 무게중심은 세 변에서 약 1.44° — 띠(반지름 1°) 밖이지만 삼각형 안
    expect(owner(sites, 1.44, 2.5)?.factionId).toBe(10);
    const shapes = buildTerritoryShapes(sites, CORRIDOR);
    expect(shapes.areas[0]?.loops).toHaveLength(1);
  });

  it("잇기 상한보다 먼 같은 국가 도시는 잇지 않는다(덩이 둘, 사이는 영토 밖)", () => {
    const sites = [site(1, 10, 0, 0, 1), site(2, 10, 0, 14, 1)];
    expect(owner(sites, 0, 7)).toBeNull();
    const shapes = buildTerritoryShapes(sites, CORRIDOR);
    expect(shapes.areas).toHaveLength(2);
    // 이름표는 국가마다 하나
    expect(shapes.labels).toHaveLength(1);
  });

  it("반경·환산이 없으면 그리지 않는다. 화면 반지름 = max(배후지(없으면 영향권) × 2, 4칸). 잇기 상한 = 12칸", () => {
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
      { ...base, id: 1, factionId: 1, radiusMilli: 100, catchmentMilli: 3000 },
      { ...base, id: 2, factionId: 1, radiusMilli: 100 },
      { ...base, id: 3, factionId: 1, radiusMilli: null, catchmentMilli: null },
    ];
    expect(territorySitesOf(cities, 0)).toEqual([]);
    // 배후지 3칸 × 2 = 6칸 = 0.6, 영향권 0.1칸 × 2 < 4칸 → 4칸 = 0.4
    expect(territorySitesOf(cities, 10_000).map((entry) => [entry.id, entry.radius])).toEqual([
      [1, 0.6],
      [2, 0.4],
    ]);
    expect(corridorOf(10_000)).toBeCloseTo(1.2, 9);
    expect(corridorOf(0)).toBe(0);
  });
});

describe("국가 영토: 다른 국가와의 경계", () => {
  it("다른 국가 도시가 띠를 가르면: 겹친 곳은 두 도시의 가운데가 경계, 영토가 둘로 갈린다", () => {
    // 국가 20 도시(반지름 2°)가 국가 10 띠(0° ~ 6°) 가운데를 덮는다 → 겹친 곳은 가운데(1.5°·4.5°)에서 갈린다
    const sites = [site(1, 10, 0, 0, 1), site(2, 10, 0, 6, 1), site(3, 20, 0, 3, 2)];
    expect(owner(sites, 0, 1.45)?.id).toBe(1);
    expect(owner(sites, 0, 1.55)?.id).toBe(3);
    expect(owner(sites, 0, 4.45)?.id).toBe(3);
    expect(owner(sites, 0, 4.55)?.id).toBe(2);
    const shapes = buildTerritoryShapes(sites, CORRIDOR);
    const nation10 = shapes.areas.filter((area) => area.factionId === 10);
    expect(nation10).toHaveLength(1);
    expect(nation10[0]?.loops).toHaveLength(2);
    // 국가 경계 받침 선: 띠 안쪽(위도 ±0.9° 안) 점은 가운데(경도 1.5° 또는 4.5°) 위, 띠 밖은 국가 20 원 둘레
    const inBand = shapes.dividers.flat().filter(([lat]) => Math.abs(lat) < 0.9);
    expect(inBand.length).toBeGreaterThanOrEqual(2);
    for (const [, lon] of inBand)
      expect(Math.min(Math.abs(lon - 1.5), Math.abs(lon - 4.5))).toBeLessThan(0.05);
  });

  it("작은 다른 국가 도시는 띠 안에서 제 원만큼 차지한다(그 밖은 띠 국가)", () => {
    const sites = [site(1, 10, 0, 0, 1), site(2, 10, 0, 6, 1), site(3, 20, 0, 3, 1)];
    expect(owner(sites, 0, 2.2)?.id).toBe(3);
    expect(owner(sites, 0, 1.8)?.factionId).toBe(10);
    expect(owner(sites, 0, 4.2)?.factionId).toBe(10);
  });

  it("다른 국가 원이 겹치면 가운데 경계, 한 원만 덮는 땅은 그 국가(큰 원 안 작은 도시도 제 땅)", () => {
    const sites = [site(1, 10, 0, 0, 0.5), site(2, 20, 0, 1.6, 2)];
    expect(owner(sites, 0, 0.2)?.factionId).toBe(10);
    expect(owner(sites, 0, -0.45)?.factionId).toBe(10);
    expect(owner(sites, 0, 0.7)?.factionId).toBe(20);
    expect(owner(sites, 0, 3)?.factionId).toBe(20);
    const shapes = buildTerritoryShapes(sites, CORRIDOR);
    expect(shapes.areas.map((area) => area.factionId).toSorted((a, b) => a - b)).toEqual([10, 20]);
    expect(shapes.areas.find((area) => area.factionId === 10)?.loops).toHaveLength(1);
    // 큰 원 안 작은 도시 둘레는 두 국가 경계
    expect(shapes.dividers.length).toBeGreaterThan(0);
  });

  it("같은 자리 도시 둘은 작은 ID가 주인, 어느 영토도 아니면 null", () => {
    const sites = [site(5, 10, 10, 10, 1), site(4, 20, 10, 10, 1)];
    expect(owner(sites, 10, 10)?.id).toBe(4);
    expect(owner(sites, 30, 30)).toBeNull();
  });
});

describe("국가 영토: 이음매 없음", () => {
  it("행성 면 경계(정육면체 면 둘에 걸친 원)도 고리 하나 — 고리 점이 두 면에 있고 반지름 위", () => {
    const shapes = buildTerritoryShapes([site(1, 10, 0, 45, 0.5)], CORRIDOR);
    const loop = shapes.areas[0]?.loops[0] ?? [];
    const faces = new Set(loop.map(([lat, lon]) => decodeCellKey(mapKeyAtLatLon(lat, lon, 9)).face));
    expect(faces.size).toBe(2);
    for (const [lat, lon] of loop) expect(angle(toVec(lat, lon), toVec(0, 45)) / DEG).toBeCloseTo(0.5, 1);
  });

  it("경도 ±180°를 넘는 같은 국가 띠·다른 국가 가운데 경계, 극 근처", () => {
    const same = [site(1, 10, 0, 178, 1), site(2, 10, 0, -178, 1)];
    expect(owner(same, 0, 180)?.factionId).toBe(10);
    const area = buildTerritoryShapes(same, CORRIDOR).areas;
    expect(area).toHaveLength(1);
    expect(area[0]?.loops).toHaveLength(1);
    // 고리 점이 모두 두 도시 가까이(경도가 감겨 튀지 않는다)
    for (const [lat, lon] of area[0]?.loops[0] ?? []) {
      const p = toVec(lat, lon);
      expect(Math.min(angle(p, toVec(0, 178)), angle(p, toVec(0, -178))) / DEG).toBeLessThan(2.2);
    }
    const rivals = [site(3, 10, 0, 179.5, 1), site(4, 20, 0, -179.5, 1)];
    expect(owner(rivals, 0, 179.9)?.id).toBe(3);
    expect(owner(rivals, 0, -179.9)?.id).toBe(4);
    const polar = [site(5, 10, 89.6, 0, 1), site(6, 20, 89.6, 180, 1)];
    expect(owner(polar, 89.9, 0)?.id).toBe(5);
    expect(owner(polar, 89.9, 180)?.id).toBe(6);
    expect(buildTerritoryShapes(polar, CORRIDOR).areas).toHaveLength(2);
  });
});

describe("국가 영토: 규모", () => {
  it("국가 16·도시 50(F9 행성 실제 크기: 반경 2칸·간격 4~5칸·잇기 12칸)이 몇 백 ms 안", () => {
    const milliPerRadian = (1000 * 512) / Math.sqrt((2 * Math.PI) / 3);
    const radius = 2000 / milliPerRadian;
    const cell = 1000 / milliPerRadian / DEG;
    const sites: TerritorySite[] = [];
    let id = 1;
    for (let nation = 0; nation < 16; nation++) {
      const lat = -30 + (nation % 4) * 6;
      const lon = -40 + Math.floor(nation / 4) * 6;
      const count = nation < 2 ? 1 + nation : 3;
      for (let index = 0; index < count; index++)
        sites.push({
          id: id++,
          factionId: nation + 1,
          latDeg: lat + (index % 2) * 4.5 * cell,
          lonDeg: lon + index * 4.5 * cell,
          radius,
        });
    }
    // 이웃 국가 도시가 맞닿는 곳 하나
    sites.push({ id: id++, factionId: 2, latDeg: -24 + 2 * cell, lonDeg: -40 + 3 * cell, radius });
    while (sites.length < 50)
      sites.push({ id: id++, factionId: 16, latDeg: 0, lonDeg: -10 + sites.length * 0.3, radius });
    const started = performance.now();
    const shapes = buildTerritoryShapes(sites, corridorOf(milliPerRadian));
    const elapsed = performance.now() - started;
    expect(sites).toHaveLength(50);
    expect(shapes.labels).toHaveLength(16);
    console.log(
      `[measure] territory build 16 nations / 50 cities ${elapsed.toFixed(1)}ms, loops ${shapes.areas.reduce((sum, area) => sum + area.loops.length, 0)}, points ${shapes.areas.reduce((sum, area) => sum + area.loops.reduce((n, loop) => n + loop.length, 0), 0)}`,
    );
    expect(elapsed).toBeLessThan(500);
  });
});
