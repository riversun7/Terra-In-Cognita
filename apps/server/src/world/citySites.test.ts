// 도시 배후지·지방 도시 자리 시험(docs/adr/2026-11-11-city-catchment.md) — 가짜 행성 값(면 레벨 6)에서 배후지 칸, 겹친 배후지 나누기,
// 배후지 배치(간격·덮임·결정성·바둑판 아님).
import { type CellKey, cellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import { territoryDistanceMilli } from "@terra/shared/territory";
import { START_WORLD_SEED } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { SUSTAIN_CAP, catchmentViewOf, sustainOf } from "./catchmentView.ts";
import { catchmentCells, createCatchmentCache, splitCatchments } from "./citySites.ts";
import {
  type LayoutInput,
  type LayoutLand,
  type LayoutTier,
  nationCatchmentMilli,
  planWorldLayout,
  seedOfText,
} from "./worldLayout.ts";

const LEVEL = 6;
const metric = territoryMetric(LEVEL);
const GRASS: LayoutLand = {
  biomeId: "grassland",
  elevationM: 100,
  temperatureC: 15,
  precipitationMm: 400,
  water: 0,
  forest: 60,
};
/** 가짜 행성: 면 0·1은 땅, 면 0의 i ≥ 40은 언덕(고도 700m — 광석, 도시도 선다), 나머지 면은 바다 */
function land(key: CellKey): LayoutLand {
  const { face, i } = decodeCellKey(key);
  if (face >= 2) return { ...GRASS, water: 1, elevationM: -200, forest: 0 };
  if (face === 0 && i >= 40) return { ...GRASS, elevationM: 700 };
  return GRASS;
}
const distance = (a: number, b: number): number =>
  territoryDistanceMilli(territoryPoint(parseCellKey(a)), territoryPoint(parseCellKey(b)), metric);

const seed = { ...START_WORLD_SEED, layoutRegionCells: 12, layoutNationGapCells: 16 };
const base = (overrides: Partial<LayoutInput> = {}): LayoutInput => ({
  faceLevel: LEVEL,
  land,
  seed,
  worldSeed: seedOfText("s2_test_planet"),
  nations: [
    { factionId: 1, missing: 4, placed: [], home: cellKey(0, LEVEL, 30, 30) },
    { factionId: 2, missing: 3, placed: [] },
    { factionId: 3, missing: 2, placed: [] },
  ],
  obstacles: [],
  newRadiusMilli: 100,
  ...overrides,
});

describe("배후지 칸", () => {
  it("반경 0이면 가운데 하나, 반경 R이면 영토 거리 R칸 안 칸들(가운데 먼저, 겹침 없음)", () => {
    const center = cellKey(0, LEVEL, 20, 20);
    expect(catchmentCells(center, 0, LEVEL)).toEqual([center]);
    const cells = catchmentCells(center, 2, LEVEL);
    expect(cells[0]).toBe(center);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells.length).toBeGreaterThanOrEqual(9);
    expect(cells.length).toBeLessThanOrEqual(25);
    for (const key of cells) expect(distance(key, center)).toBeLessThanOrEqual(2000);
  });

  it("겹친 배후지는 가장 가까운 도시가 칸을 갖는다(같은 거리면 작은 ID) — 붙은 두 도시는 칸을 나눠 덮임 칸이 준다", () => {
    const a = { id: 1, mapKey: cellKey(0, LEVEL, 20, 20) };
    const b = { id: 2, mapKey: cellKey(0, LEVEL, 21, 20) };
    const alone = catchmentCells(a.mapKey, 2, LEVEL).length;
    const split = splitCatchments([b, a], 2, LEVEL);
    const own1 = split.own.get(1) ?? [];
    const own2 = split.own.get(2) ?? [];
    expect(split.shared).toBeGreaterThan(0);
    expect(own1.length).toBeLessThan(alone);
    expect(new Set([...own1, ...own2]).size).toBe(own1.length + own2.length);
    // 떨어진 도시(2R 이상)는 나누지 않는다
    const far = splitCatchments([a, { id: 3, mapKey: cellKey(0, LEVEL, 26, 20) }], 2, LEVEL);
    expect(far.shared).toBe(0);
    expect(far.own.get(1)).toHaveLength(alone);
  });

  it("덮임: 광석 칸이 있는 배후지가 높다(가중치 = 농장·벌목장·광산)", () => {
    const cache = createCatchmentCache(
      (key) => ({ ...land(key), forest: land(key).forest ?? 0 }),
      seed,
      2,
      LEVEL,
    );
    const needs = { crop: 1, wood: 1, ore: 1 };
    expect(cache.cover(cellKey(0, LEVEL, 20, 20), needs)).toBe(666);
    expect(cache.cover(cellKey(0, LEVEL, 50, 20), needs)).toBe(1000);
    expect(cache.cover(cellKey(0, LEVEL, 40, 20), needs)).toBeGreaterThan(666);
  });
});

describe("배후지 배치(지방 도시 자리)", () => {
  const result = planWorldLayout(base());
  const byFaction = (id: number) =>
    result.spots.filter((entry) => entry.factionId === id).map((entry) => parseCellKey(entry.spot.mapKey));

  it("모든 도시가 자리를 받고, 같은 국가 도시는 배후지 지름(2R) 이상, 다른 국가 도시는 2R × 1.5 이상 떨어진다", () => {
    expect(result.short).toBe(0);
    const all = result.spots;
    for (const a of all)
      for (const b of all) {
        if (a === b) continue;
        const gap = a.factionId === b.factionId ? 4000 : 6000;
        expect(distance(a.spot.mapKey, b.spot.mapKey)).toBeGreaterThanOrEqual(gap);
      }
  });

  it("첫 도시는 수도 2차맵, 지방 도시는 찾는 반경 안", () => {
    const home = cellKey(0, LEVEL, 30, 30);
    const own = byFaction(1);
    expect(own[0]).toBe(home);
    for (const key of own) expect(distance(key, home)).toBeLessThanOrEqual(12_000);
  });

  it("배후지에 광석이 있는 쪽(언덕)을 고른다: 지방 도시 대부분이 언덕(i ≥ 38) 쪽", () => {
    const own = byFaction(1).slice(1);
    const east = own.filter((key) => decodeCellKey(key).i >= 38);
    expect(east.length).toBeGreaterThanOrEqual(Math.ceil(own.length / 2));
  });

  it("같은 입력이면 같은 결과, 수도에서 걸음이 고정 표(옛 (0,−s)·(−s,0)·(s,0)…)가 아니다", () => {
    expect(planWorldLayout(base())).toEqual(result);
    const old = planWorldLayout(base({ seed: { ...seed, catchmentRadiusCells: 0 } }));
    const oldOwn = old.spots
      .filter((entry) => entry.factionId === 1)
      .map((entry) => parseCellKey(entry.spot.mapKey));
    expect(byFaction(1)).not.toEqual(oldOwn);
    // 옛 배치: 붙은 2차맵(1칸)
    const [first, second] = oldOwn;
    if (first !== undefined && second !== undefined) expect(distance(first, second)).toBeLessThan(1600);
  });

  it("이미 선 다른 세력 도시(피할 도시)와도 다른 국가 간격을 지킨다(지방 도시 — 수도 자리는 국가 자리 고르기가 정한다)", () => {
    const obstacle = {
      factionId: 9,
      spot: { mapKey: cellKey(0, LEVEL, 34, 30), x: 128, y: 128 },
      radiusMilli: 100,
    };
    const next = planWorldLayout(base({ obstacles: [obstacle] }));
    const home = cellKey(0, LEVEL, 30, 30);
    for (const entry of next.spots.filter((spot) => spot.spot.mapKey !== home))
      expect(distance(entry.spot.mapKey, obstacle.spot.mapKey)).toBeGreaterThanOrEqual(6000);
  });
});

describe("세계 배치 화면 배후지 덮개(catchmentViewOf)", () => {
  it("수도 둘레 (2 × (찾는 반경 + 4) + 1)² 격자, 도시마다 지금·목표 반경·덮임·겹친 칸, 겹친 쌍(거리 < 두 반경 합)", () => {
    const center = cellKey(0, LEVEL, 30, 30);
    const view = catchmentViewOf({
      faceLevel: LEVEL,
      land,
      seed,
      code: "a",
      center,
      world: [
        { code: "a", mapKey: center, radiusMilli: 1500, targetMilli: 2500, population: 30 },
        { code: "b", mapKey: cellKey(0, LEVEL, 32, 30), targetMilli: 2000, population: 40 },
        { code: "b", mapKey: cellKey(0, LEVEL, 30, 36), radiusMilli: 1000, targetMilli: 2000 },
      ],
      plan: [
        { code: "a", mapKey: center, targetMilli: 2500 },
        { code: "a", mapKey: cellKey(0, LEVEL, 47, 30), targetMilli: 2000 },
      ],
      needsOf: () => ({ crop: 1, wood: 1, ore: 1 }),
      provinceMilli: 2000,
    });
    expect(view.span).toBe(16);
    expect(view.cells).toHaveLength(33 * 33);
    const [a, b, c] = view.world;
    expect(a).toMatchObject({
      di: 0,
      dj: 0,
      code: "a",
      own: true,
      radiusMilli: 1500,
      targetMilli: 2500,
      population: 30,
    });
    expect(b).toMatchObject({ di: 2, dj: 0, code: "b", own: false, radiusMilli: 2000, targetMilli: 2000 });
    // a(1.5칸)와 b(2칸)는 2칸 떨어져 겹치고, c(1칸)는 6칸 떨어져 혼자다
    expect(a?.shared).toBeGreaterThan(0);
    expect(b?.shared).toBeGreaterThan(0);
    expect(c?.shared).toBe(0);
    expect(c?.population).toBeNull();
    expect(view.overlapWorld).toBe(1);
    expect(view.contestedWorld).toBe(a?.shared);
    // 격자 밖(17칸) 계획 도시는 덮개에 없지만 겹침 셈에는 든다(행성 전체)
    expect(view.plan).toHaveLength(1);
    expect(view.overlapPlan).toBe(0);
    expect(view.contestedPlan).toBe(0);
    expect(view.sameGapCells).toBe(4);
    expect(view.foreignGapCells).toBe(6);
    expect(view.sustain?.tierCities).toBe(2);
    expect(view.sustain?.worldCities).toBe(1);
  });

  it("버틸 수 있는 도시 수(질문 1025 나): 땅이 좁으면 적고, 다른 국가 계획 도시를 피하고, 배후지 규칙을 끄면 없다", () => {
    const input = {
      faceLevel: LEVEL,
      land,
      seed,
      code: "a",
      world: [],
      needsOf: () => ({ crop: 1, wood: 1 }),
      provinceMilli: 2000,
      capitalMilli: 2500,
    };
    // 면 0 가운데(넓은 땅): 찾는 반경 12칸 안에 여러 도시
    const wide = sustainOf({ ...input, center: cellKey(0, LEVEL, 30, 30), plan: [] });
    if (!wide) throw new Error("no sustain");
    expect(wide.cities).toBeGreaterThan(3);
    expect(wide.cities).toBeLessThan(SUSTAIN_CAP);
    expect(wide.landCells).toBeGreaterThan(300);
    // 바다(면 2 이상)에 붙은 가장자리 땅은 더 적다
    const coast = sustainOf({ ...input, center: cellKey(0, LEVEL, 63, 63), plan: [] });
    expect(coast?.cities).toBeLessThan(wide.cities);
    // 다른 국가 계획 도시가 가까이 있으면 그 자리·간격만큼 준다
    const crowded = sustainOf({
      ...input,
      center: cellKey(0, LEVEL, 30, 30),
      plan: [
        { code: "b", mapKey: cellKey(0, LEVEL, 36, 30), targetMilli: 2500 },
        { code: "b", mapKey: cellKey(0, LEVEL, 24, 30), targetMilli: 2500 },
      ],
    });
    expect(crowded?.cities).toBeLessThan(wide.cities);
    expect(crowded?.tierCities).toBe(0);
    expect(
      sustainOf({
        ...input,
        seed: { ...seed, catchmentRadiusCells: 0 },
        center: cellKey(0, LEVEL, 30, 30),
        plan: [],
      }),
    ).toBeNull();
  });
});

describe("도시 크기에 따른 배후지 배치(바뀜 2026-11-12)", () => {
  const big: LayoutTier = { rank: 0, cityStepCells: 1, homeGapPm: 1000, housing: 60, tech: 3 };
  const small: LayoutTier = { rank: 3, cityStepCells: 1, homeGapPm: 1000, housing: 32, tech: 1 };
  const input = base({
    nations: [
      { factionId: 1, missing: 4, placed: [], home: cellKey(0, LEVEL, 20, 20), tier: big },
      { factionId: 2, missing: 3, placed: [], home: cellKey(1, LEVEL, 20, 20), tier: small },
    ],
  });
  const result = planWorldLayout(input);
  const own = (id: number) =>
    result.spots.filter((entry) => entry.factionId === id).map((entry) => entry.spot.mapKey);

  it("큰 나라·수도는 반경이 넓고, 같은 국가 두 도시 사이는 (두 반경 합) 이상", () => {
    const bigR = nationCatchmentMilli(seed, big);
    const smallR = nationCatchmentMilli(seed, small);
    expect(bigR.capital).toBeGreaterThan(bigR.province);
    expect(bigR.province).toBeGreaterThan(smallR.province);
    expect(result.short).toBe(0);
    for (const [id, radius] of [
      [1, bigR],
      [2, smallR],
    ] as const) {
      const cities = own(id);
      cities.forEach((a, i) =>
        cities.forEach((b, j) => {
          if (j <= i) return;
          const gap = (i === 0 ? radius.capital : radius.province) + radius.province;
          expect(distance(a, b)).toBeGreaterThanOrEqual(gap);
        }),
      );
    }
  });

  it("작은 나라의 가장 가까운 도시 간격이 큰 나라 간격 바닥보다 짧을 수 있다(고른 바둑판이 아니다)", () => {
    const bigR = nationCatchmentMilli(seed, big);
    const smallCities = own(2);
    const nearest = Math.min(
      ...smallCities.flatMap((a, i) => smallCities.slice(i + 1).map((b) => distance(a, b))),
    );
    expect(nearest).toBeLessThan(2 * bigR.province);
  });
});
