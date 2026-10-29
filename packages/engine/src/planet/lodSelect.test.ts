import { averageCellEdgeMeters, planetRadiusMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import { frustumPlanes, multiplyMatrices, perspectiveMatrix, viewRotationMatrix } from "./culling.ts";
import {
  GLOBE_FOV_RAD,
  type GlobeState,
  type Viewport,
  globeLimits,
  globePose,
  initialGlobe,
  raySphere,
  screenRay,
} from "./globeCamera.ts";
import { type Selection, type SelectionParams, selectTiles } from "./lodSelect.ts";
import { MAX_RENDER_FACE_LEVEL, planetDescriptionProblem } from "./planetTypes.ts";
import { EARTH_RADIUS_M } from "./testSupport.ts";
import { TileShapeCache, coarsestSagM, directionToFaceST, tileShape } from "./tileShape.ts";
import { type TileNode, isDataLevel, nodeSTRange, parentNode, tileKey, tileLayout } from "./tileTree.ts";
import { addScaled, normalize } from "./vec3.ts";

const R = EARTH_RADIUS_M;
const layout = tileLayout(9);
const PHONE: Viewport = { width: 390, height: 844 };
const FINEST = averageCellEdgeMeters(9, R);
const limits = globeLimits(R, FINEST, PHONE);
const shapes = new TileShapeCache(R);
const occluder = R - tileShape({ face: 0, mapLevel: 5, tx: 0, ty: 0 }, R).sagM;

function params(overrides: Partial<SelectionParams> = {}): SelectionParams {
  return {
    layout,
    innerRadiusM: R,
    outerRadiusM: R + 760 * 6,
    occluderRadiusM: occluder,
    maxScreenErrorPx: 4,
    maxTiles: 160,
    ...overrides,
  };
}

function select(
  state: GlobeState,
  drawable: (node: TileNode) => boolean,
  overrides: Partial<SelectionParams> = {},
) {
  const pose = globePose(state, R, limits);
  const frustum = frustumPlanes(
    multiplyMatrices(
      perspectiveMatrix(GLOBE_FOV_RAD, PHONE.width / PHONE.height, 1, 1e8),
      viewRotationMatrix(pose.right, pose.up, pose.back),
    ),
  );
  const nodes = new Map<number, TileNode>();
  const selection = selectTiles(
    {
      position: pose.position,
      frustum,
      pixelsPerMeterAtUnitDistance: PHONE.height / (2 * Math.tan(GLOBE_FOV_RAD / 2)),
    },
    params(overrides),
    {
      shape: (key, node) => {
        nodes.set(key, node);
        return shapes.get(key, node);
      },
      drawable: (key) => {
        const node = nodes.get(key);
        return node ? drawable(node) : false;
      },
    },
  );
  return { selection, pose };
}

/** 화면 격자의 점마다 그 아래 땅을 덮은 그리기 타일 수 — 모두 1이어야 한다(구멍·겹침 없음) */
function coverage(
  selection: Selection,
  state: GlobeState,
): { hits: number; holes: number; overlaps: number } {
  const pose = globePose(state, R, limits);
  let hits = 0;
  let holes = 0;
  let overlaps = 0;
  for (let y = 4; y < PHONE.height; y += 24) {
    for (let x = 4; x < PHONE.width; x += 24) {
      const ray = screenRay(pose, PHONE, { x, y });
      const t = raySphere(ray.origin, ray.dir, R);
      if (t === null) continue;
      hits += 1;
      const { face, s, t: tt } = directionToFaceST(normalize(addScaled(ray.origin, ray.dir, t)));
      let count = 0;
      for (const item of selection.draw) {
        if (item.node.face !== face) continue;
        const r = nodeSTRange(item.node);
        if (s >= r.s0 && s < r.s0 + r.span + 1e-12 && tt >= r.t0 && tt < r.t0 + r.span + 1e-12) count += 1;
      }
      if (count === 0) holes += 1;
      if (count > 1) overlaps += 1;
    }
  }
  return { hits, holes, overlaps };
}

const everything = (): boolean => true;
const maxLevel = (selection: Selection): number =>
  Math.max(...selection.draw.map((item) => item.node.mapLevel));
const orbit = initialGlobe(20, 30, limits.maxDistance * 0.9, limits);
const regional = initialGlobe(-12, 140, 400_000, limits);
const close = initialGlobe(45, -60, limits.minDistance, limits);

describe("타일 고르기 — 모두 받았을 때", () => {
  it.each([
    ["궤도(행성 전체)", orbit],
    ["지역(400km)", regional],
    ["가장 가까이(기울어짐)", close],
  ] as const)("%s: 상한 이하, 화면 구멍·겹침 없음", (_label, state) => {
    const { selection } = select(state, everything);
    expect(selection.draw.length).toBeLessThanOrEqual(160);
    expect(selection.selected).toBeLessThanOrEqual(160);
    expect(selection.incomplete).toBe(false);
    expect(selection.wanted).toHaveLength(0);
    const { hits, holes, overlaps } = coverage(selection, state);
    expect(hits).toBeGreaterThan(50);
    expect(holes).toBe(0);
    expect(overlaps).toBe(0);
    // 그리기 목록끼리 조상·자손이 없다
    const keys = new Set(selection.draw.map((item) => item.key));
    for (const item of selection.draw) {
      for (let p = parentNode(layout, item.node); p; p = parentNode(layout, p)) {
        expect(keys.has(tileKey(p))).toBe(false);
      }
    }
  });

  it("가까울수록 고운 단계: 궤도는 거친 단계, 가장 가까이는 화면 가운데가 맵 레벨 9", () => {
    const far = select(orbit, everything).selection;
    const near = select(close, everything).selection;
    expect(maxLevel(far)).toBeLessThanOrEqual(8);
    expect(maxLevel(near)).toBe(9);
    // 가까운 것부터 그린다
    for (let i = 1; i < near.draw.length; i++) {
      expect(near.draw[i]?.distance ?? 0).toBeGreaterThanOrEqual(near.draw[i - 1]?.distance ?? 0);
    }
  });

  it("뒤쪽 면은 고르지 않는다(지평선 거르기)", () => {
    const { selection } = select(orbit, everything);
    const faces = new Set(selection.draw.map((item) => item.node.face));
    expect(faces.size).toBeLessThan(6);
  });
});

describe("상한", () => {
  it("타일 상한을 넘게 나누지 않는다(상한 12)", () => {
    const { selection } = select(regional, everything, { maxTiles: 12 });
    expect(selection.draw.length).toBeLessThanOrEqual(12);
    expect(selection.selected).toBeLessThanOrEqual(12);
    expect(selection.budgetHit).toBe(true);
    const { holes, overlaps } = coverage(selection, regional);
    expect(holes).toBe(0);
    expect(overlaps).toBe(0);
  });

  it("문턱을 낮추면(더 곱게) 상한 160에 걸려도 160을 넘지 않는다", () => {
    // 궤도에서 반구 전체를 맵 레벨 9로 그리면 수백 개다
    const { selection } = select(orbit, everything, { maxScreenErrorPx: 0.25 });
    expect(selection.draw.length).toBeLessThanOrEqual(160);
    expect(selection.draw.length).toBeGreaterThan(100);
    expect(selection.budgetHit).toBe(true);
    const { holes, overlaps } = coverage(selection, orbit);
    expect(holes).toBe(0);
    expect(overlaps).toBe(0);
  });
});

describe("부모 먼저", () => {
  it("꼭대기만 받았으면 꼭대기를 그리고, 받을 목록은 거친 단계부터", () => {
    const { selection } = select(regional, (node) => node.mapLevel === 5);
    expect(selection.draw.length).toBeGreaterThan(0);
    for (const item of selection.draw) expect(item.node.mapLevel).toBe(5);
    expect(selection.incomplete).toBe(false);
    expect(selection.wanted.length).toBeGreaterThan(0);
    for (let i = 1; i < selection.wanted.length; i++) {
      expect(selection.wanted[i]?.node.mapLevel ?? 0).toBeGreaterThanOrEqual(
        selection.wanted[i - 1]?.node.mapLevel ?? 0,
      );
    }
    expect(selection.wanted[0]?.node.mapLevel).toBe(6);
  });

  it("자식이 일부만 왔으면 부모를 그린다(겹치지 않게), 모두 오면 자식으로 바꾼다", () => {
    const full = select(regional, everything).selection;
    // 그린 레벨 6 이상 타일 하나를 고르고 그 부모의 다른 자식 하나를 빼 본다
    const victim = full.draw.find((item) => item.node.mapLevel >= 7);
    expect(victim).toBeDefined();
    if (!victim) return;
    const parent = parentNode(layout, victim.node);
    expect(parent).not.toBeNull();
    if (!parent) return;
    const missing = tileKey(victim.node);
    const partial = select(regional, (node) => tileKey(node) !== missing).selection;
    const drawn = new Set(partial.draw.map((item) => item.key));
    expect(drawn.has(missing)).toBe(false);
    expect(drawn.has(tileKey(parent))).toBe(true);
    expect(partial.wanted.map((item) => item.key)).toContain(missing);
    const { holes, overlaps } = coverage(partial, regional);
    expect(holes).toBe(0);
    expect(overlaps).toBe(0);
  });

  it("아무것도 없으면 그릴 것이 없다(바탕 구가 보인다)", () => {
    const { selection } = select(orbit, () => false);
    expect(selection.draw).toHaveLength(0);
    expect(selection.incomplete).toBe(true);
    expect(selection.wanted[0]?.node.mapLevel).toBe(5);
  });
});

/** 다른 크기 행성(면 레벨 F)의 고르기 — 휴대폰 화면, 처음 볼 곳, 거리 distance(없으면 가장 멀리) */
function selectPlanet(faceLevel: number, drawable: (node: TileNode) => boolean, distance?: number) {
  const radius = planetRadiusMeters(faceLevel);
  const planetLayout = tileLayout(faceLevel);
  const planetLimits = globeLimits(radius, averageCellEdgeMeters(faceLevel, radius), PHONE);
  const state = initialGlobe(20, 30, distance ?? planetLimits.maxDistance, planetLimits);
  const pose = globePose(state, radius, planetLimits);
  const frustum = frustumPlanes(
    multiplyMatrices(
      perspectiveMatrix(GLOBE_FOV_RAD, PHONE.width / PHONE.height, 1, 1e9),
      viewRotationMatrix(pose.right, pose.up, pose.back),
    ),
  );
  const planetShapes = new TileShapeCache(radius);
  const nodes = new Map<number, TileNode>();
  const selection = selectTiles(
    {
      position: pose.position,
      frustum,
      pixelsPerMeterAtUnitDistance: PHONE.height / (2 * Math.tan(GLOBE_FOV_RAD / 2)),
    },
    {
      layout: planetLayout,
      innerRadiusM: radius,
      outerRadiusM: radius + 760 * 6,
      occluderRadiusM: radius - coarsestSagM(planetLayout, radius),
      maxScreenErrorPx: 4,
      maxTiles: 160,
    },
    {
      shape: (key, node) => {
        nodes.set(key, node);
        return planetShapes.get(key, node);
      },
      drawable: (key) => {
        const node = nodes.get(key);
        return node ? drawable(node) : false;
      },
    },
  );
  return { selection, layout: planetLayout };
}

const keysOf = (selection: Selection): Set<number> => new Set(selection.draw.map((item) => item.key));
/** 면 레벨 10의 첫 1차맵 단계(맵 레벨 6) 타일만 받았다 */
const firstLevelOf10 = (node: TileNode): boolean => node.mapLevel === 6;
/** 면 레벨만 바꾼 행성 설명 */
const planet = (faceLevel: number) => ({ faceLevel, radiusM: EARTH_RADIUS_M, biomeColors: [] });

describe("큰 행성(자료 없는 꼭대기 마디)", () => {
  it("면 레벨 10: 첫 단계 타일 하나가 없어도 같은 면의 다른 타일은 그린다(면 전체를 버리지 않는다)", () => {
    const full = selectPlanet(10, firstLevelOf10).selection;
    expect(full.incomplete).toBe(false);
    const victim = full.draw.find((item) => item.node.face === 0) ?? full.draw[0];
    if (!victim) throw new Error("nothing drawn");
    const sameFace = full.draw.filter((item) => item.node.face === victim.node.face);
    expect(sameFace.length).toBeGreaterThan(1);
    const missing = selectPlanet(
      10,
      (node) => firstLevelOf10(node) && tileKey(node) !== victim.key,
    ).selection;
    const drawn = keysOf(missing);
    expect(drawn.has(victim.key)).toBe(false);
    // 빠진 하나만 빼고 나머지는 그대로 그린다
    for (const item of full.draw) if (item.key !== victim.key) expect(drawn.has(item.key)).toBe(true);
    expect(missing.draw).toHaveLength(full.draw.length - 1);
    expect(missing.incomplete).toBe(true);
    expect(missing.wanted.map((item) => item.key)).toContain(victim.key);
  });

  it.each([10, 11])("면 레벨 %i: 가장 먼 거리·처음 거리에서도 타일 상한(160) 이하", (faceLevel) => {
    const radius = planetRadiusMeters(faceLevel);
    const planetLimits = globeLimits(radius, averageCellEdgeMeters(faceLevel, radius), PHONE);
    for (const distance of [planetLimits.maxDistance, planetLimits.maxDistance * 0.9]) {
      const { selection, layout: planetLayout } = selectPlanet(faceLevel, everything, distance);
      expect(selection.draw.length).toBeLessThanOrEqual(160);
      expect(selection.budgetHit).toBe(false);
      for (const item of selection.draw) expect(isDataLevel(planetLayout, item.node.mapLevel)).toBe(true);
    }
  });

  it("면 레벨 12(엔진은 받지 않는다): 가장 거친 단계만으로 상한을 넘으면 상한 도달로 알린다", () => {
    const { selection } = selectPlanet(12, everything);
    expect(selection.draw.length).toBeGreaterThan(160);
    expect(selection.budgetHit).toBe(true);
  });

  it("행성 설명 검사: 렌더러는 면 레벨 4~11만 받는다", () => {
    expect(MAX_RENDER_FACE_LEVEL).toBe(11);
    expect(planetDescriptionProblem(planet(4))).toBeNull();
    expect(planetDescriptionProblem(planet(11))).toBeNull();
    expect(planetDescriptionProblem(planet(12))).toMatch(/face level/);
    expect(planetDescriptionProblem(planet(3))).toMatch(/face level/);
    expect(planetDescriptionProblem(planet(9.5))).toMatch(/face level/);
    expect(planetDescriptionProblem({ ...planet(9), radiusM: 0 })).toMatch(/radiusM/);
    expect(planetDescriptionProblem({ ...planet(9), maxElevationM: -1 })).toMatch(/maxElevationM/);
    expect(planetDescriptionProblem({ ...planet(9), maxElevationM: 1238 })).toBeNull();
  });
});
