import { describe, expect, it } from "vitest";
import { createRng } from "./rng.ts";
import {
  TERRITORY_POINT_SCALE,
  type TerritoryRules,
  type TerritoryVec,
  buildTerritory,
  checkBeaconPlacement,
  claimAt,
  convexHull,
  orient,
  polygonContains,
  territoryDistanceMilli,
} from "./territory.ts";

// 평면 시험: 점 (x, y) → (x, y, Z). Z가 커서 작은 x·y는 거의 평면이다(중심 투영 평면 = z = Z 평면)
const Z = 60_000;
const at = (x: number, y: number): TerritoryVec => [x, y, Z];
/** x 100단위 ≈ 1칸(1000분율 1000) */
const metric = { milliPerRadian: Z * 10 };
const rules: TerritoryRules = {
  influenceMilli: [100, 200, 500, 1100, 1900, 3600],
  beaconRangeMilli: [10_000, 10_000, 10_000, 13_333, 13_333, 13_333],
  beaconsPerCity: [3, 3, 4, 4, 5, 5],
};

const big = (v: TerritoryVec) => v.map((x) => BigInt(x));

describe("볼록 껍질(정수 정확)", () => {
  it("정사각형: 안쪽 점·변 위 점은 빠지고, 꼭짓점은 투영 평면의 첫 점부터 반시계", () => {
    const points = [at(0, 0), at(500, 500), at(1000, 0), at(1000, 1000), at(0, 1000), at(500, 0)];
    // 기준 방향 (0, 0, 1)의 평면 축: e1 = y, e2 = −x → 첫 점 = y가 가장 작고 x가 가장 큰 (1000, 0)
    expect(convexHull(points)).toEqual([2, 3, 4, 0]);
  });

  it("입력 차례를 바꿔도 같은 꼭짓점이 같은 차례로 나온다", () => {
    const points = [at(0, 0), at(1000, 0), at(1000, 1000), at(0, 1000), at(300, 700), at(-200, 400)];
    const hull = convexHull(points)?.map((index) => points[index]);
    const shuffled = [points[4], points[2], points[5], points[0], points[3], points[1]].flatMap((p) =>
      p ? [p] : [],
    );
    expect(convexHull(shuffled)?.map((index) => shuffled[index])).toEqual(hull);
    expect(hull).toEqual([at(1000, 0), at(1000, 1000), at(0, 1000), at(-200, 400), at(0, 0)]);
  });

  it("같은 방향은 번호가 작은 것 하나, 셋 미만·한 줄·반구 밖은 null", () => {
    // (0, 0, Z ÷ 2)는 (0, 0, Z)와 같은 방향
    const points: TerritoryVec[] = [at(0, 0), at(1000, 0), at(0, 1000), [0, 0, Z / 2]];
    expect(convexHull(points)).toEqual([1, 2, 0]);
    expect(convexHull([at(0, 0), at(10, 10)])).toBeNull();
    expect(convexHull([at(0, 0), at(100, 100), at(300, 300), at(-50, -50)])).toBeNull();
    const S = TERRITORY_POINT_SCALE;
    expect(
      convexHull([
        [S, 0, 0],
        [-S, 0, 0],
        [0, S, 0],
        [0, -S, 0],
        [0, 0, S],
        [0, 0, -S],
      ]),
    ).toBeNull();
    // 성분이 상한을 넘으면 받지 않는다
    expect(convexHull([at(0, 0), at(1, 0), [0, 1, S + 1]])).toBeNull();
  });

  it("큐브 꼭짓점 둘레(세 면에 걸친 점)도 껍질을 만든다(기준 방향 = 꼭짓점 방향)", () => {
    const S = TERRITORY_POINT_SCALE;
    const points: TerritoryVec[] = [
      [S, S - 900, S - 900],
      [S - 900, S, S - 900],
      [S - 900, S - 900, S],
      [S, S, S],
    ];
    const hull = convexHull(points);
    expect(hull).not.toBeNull();
    expect(new Set(hull)).toEqual(new Set([0, 1, 2]));
    expect(
      polygonContains(
        (hull ?? []).flatMap((i) => {
          const point = points[i];
          return point ? [point] : [];
        }),
        [S, S, S],
      ),
    ).toBe(true);
  });

  it("방향 판정은 성분 상한에서도 BigInt 셈과 같다", () => {
    const rng = createRng(20_261_103);
    const S = TERRITORY_POINT_SCALE;
    const pick = (): TerritoryVec => [rng.nextInt(2 * S + 1) - S, rng.nextInt(2 * S + 1) - S, S];
    for (let n = 0; n < 2000; n++) {
      const [a, b, c] = [pick(), pick(), pick()];
      const [A, B, C] = [big(a), big(b), big(c)];
      const cx = (A[1] ?? 0n) * (B[2] ?? 0n) - (A[2] ?? 0n) * (B[1] ?? 0n);
      const cy = (A[2] ?? 0n) * (B[0] ?? 0n) - (A[0] ?? 0n) * (B[2] ?? 0n);
      const cz = (A[0] ?? 0n) * (B[1] ?? 0n) - (A[1] ?? 0n) * (B[0] ?? 0n);
      const value = cx * (C[0] ?? 0n) + cy * (C[1] ?? 0n) + cz * (C[2] ?? 0n);
      expect(orient(a, b, c)).toBe(value > 0n ? 1 : value < 0n ? -1 : 0);
    }
    // 정확히 한 대원 위(삼중곱 0)
    expect(orient([S, 0, 0], [0, S, 0], [S, S, 0])).toBe(0);
  });

  it("안팎 판정: 가장자리 위는 안, 반대쪽 방향은 밖", () => {
    const square = [at(0, 0), at(1000, 0), at(1000, 1000), at(0, 1000)];
    expect(polygonContains(square, at(500, 500))).toBe(true);
    expect(polygonContains(square, at(1000, 500))).toBe(true);
    expect(polygonContains(square, at(1001, 500))).toBe(false);
    expect(polygonContains(square, [-500, -500, -Z])).toBe(false);
  });
});

describe("영토 배치·소속(D-485·D-486)", () => {
  it("거리는 각 × 칸/라디안이고 결정적이다", () => {
    expect(Math.round(territoryDistanceMilli(at(0, 0), at(100, 0), metric))).toBe(1000);
    expect(territoryDistanceMilli(at(0, 0), at(700, 0), metric)).toBe(
      territoryDistanceMilli(at(700, 0), at(0, 0), metric),
    );
  });

  it("도시 + 비콘 셋이면 껍질, 그 안은 그 세력이고 지방은 가까운 도시", () => {
    const layout = buildTerritory(
      [
        { id: 1, faction: 10, point: at(0, 0), grade: 1 },
        { id: 2, faction: 10, point: at(600, 0), grade: 1 },
      ],
      [
        { id: 101, faction: 10, point: at(0, 800), anchorCity: 1 },
        { id: 102, faction: 10, point: at(600, 800), anchorCity: 2 },
      ],
      rules,
      metric,
    );
    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0]?.hull?.map((v) => `${v.kind}${v.id}`)).toEqual([
      "city2",
      "beacon102",
      "beacon101",
      "city1",
    ]);
    expect(claimAt(layout, at(100, 400))).toEqual({ faction: 10, province: 1, source: "hull" });
    expect(claimAt(layout, at(500, 400))).toEqual({ faction: 10, province: 2, source: "hull" });
    expect(claimAt(layout, at(700, 400))).toBeNull();
    // 마을 영향권(0.1칸 = 10단위) 안은 도시 규칙
    expect(claimAt(layout, at(5, 0))).toEqual({ faction: 10, province: 1, source: "city" });
  });

  it("비콘 거리 밖의 같은 세력 도시는 다른 묶음(멀리 떨어진 도시를 잇는 띠가 생기지 않는다)", () => {
    const layout = buildTerritory(
      [
        { id: 1, faction: 10, point: at(0, 0), grade: 1 },
        { id: 2, faction: 10, point: at(5000, 0), grade: 1 },
      ],
      [
        { id: 101, faction: 10, point: at(0, 800), anchorCity: 1 },
        { id: 102, faction: 10, point: at(800, 0), anchorCity: 1 },
      ],
      rules,
      metric,
    );
    expect(layout.groups.map((group) => group.members.length)).toEqual([3, 1]);
    expect(layout.groups[1]?.hull).toBeNull();
    expect(claimAt(layout, at(2500, 10))).toBeNull();
    expect(claimAt(layout, at(100, 100))?.faction).toBe(10);
  });

  it("비콘 영역끼리 겹치면 가까운 꼭짓점(중간 지점)으로 나눈다", () => {
    const layout = buildTerritory(
      [
        { id: 1, faction: 10, point: at(0, 0), grade: 1 },
        { id: 2, faction: 20, point: at(1000, 0), grade: 1 },
      ],
      [
        { id: 101, faction: 10, point: at(700, 500), anchorCity: 1 },
        { id: 102, faction: 10, point: at(700, -500), anchorCity: 1 },
        { id: 201, faction: 20, point: at(300, 500), anchorCity: 2 },
        { id: 202, faction: 20, point: at(300, -500), anchorCity: 2 },
      ],
      rules,
      metric,
    );
    // 겹친 띠 x 300~700: 가장 가까운 꼭짓점(도시도 꼭짓점이다)의 세력
    expect(claimAt(layout, at(520, 200))).toEqual({ faction: 10, province: 1, source: "hull" });
    expect(claimAt(layout, at(480, 200))).toEqual({ faction: 20, province: 2, source: "hull" });
    expect(claimAt(layout, at(350, 0))?.faction).toBe(10);
    expect(claimAt(layout, at(650, 0))?.faction).toBe(20);
    // 두 비콘에서 꼭 같은 거리면 작은 세력 ID
    expect(claimAt(layout, at(500, 200))?.faction).toBe(10);
    // 겹치지 않는 곳은 그대로
    expect(claimAt(layout, at(150, 0))?.faction).toBe(10);
    expect(claimAt(layout, at(850, 0))?.faction).toBe(20);
  });

  it("다른 세력 도시 영향권은 비콘 껍질보다 앞서고, 도시끼리는 영향력 가중으로 나눈다", () => {
    const layout = buildTerritory(
      [
        { id: 1, faction: 10, point: at(0, 0), grade: 1 },
        // 대도시(1.9칸 = 190단위)가 세력 10 껍질 안에 있다
        { id: 2, faction: 20, point: at(400, 400), grade: 5 },
        // 거대도시(3.6칸) 둘레에 붙은 마을
        { id: 3, faction: 30, point: at(3000, 0), grade: 6 },
        { id: 4, faction: 40, point: at(3300, 0), grade: 1 },
      ],
      [
        { id: 101, faction: 10, point: at(1000, 0), anchorCity: 1 },
        { id: 102, faction: 10, point: at(1000, 1000), anchorCity: 1 },
        { id: 103, faction: 10, point: at(0, 1000), anchorCity: 1 },
      ],
      rules,
      metric,
    );
    expect(claimAt(layout, at(450, 450))).toEqual({ faction: 20, province: 2, source: "city" });
    expect(claimAt(layout, at(700, 700))?.faction).toBe(10);
    // 마을(반경 10)에 아주 가까우면 마을, 조금 떨어지면 거대도시(거리 ÷ 반경이 작은 쪽)
    expect(claimAt(layout, at(3298, 0))?.faction).toBe(40);
    expect(claimAt(layout, at(3292, 0))?.faction).toBe(40);
    expect(claimAt(layout, at(3291, 0))?.faction).toBe(30);
  });

  it("비콘 놓기 검사: 거리·개수·다른 세력 도시", () => {
    const cities = [
      { id: 1, faction: 10, point: at(0, 0), grade: 1 },
      { id: 2, faction: 20, point: at(3000, 0), grade: 4 },
    ];
    const beacons = [
      { id: 101, faction: 10, point: at(500, 0), anchorCity: 1 },
      { id: 102, faction: 10, point: at(0, 500), anchorCity: 1 },
    ];
    let layout = buildTerritory(cities, beacons, rules, metric);
    expect(checkBeaconPlacement(layout, rules, 10, at(-500, 0))).toEqual({ ok: true, anchorCity: 1 });
    expect(checkBeaconPlacement(layout, rules, 10, at(2000, 0))).toEqual({
      ok: false,
      problem: "out_of_range",
    });
    expect(checkBeaconPlacement(layout, rules, 10, at(3010, 0))).toEqual({
      ok: false,
      problem: "foreign_city",
    });
    layout = buildTerritory(
      cities,
      [...beacons, { id: 103, faction: 10, point: at(-500, 0), anchorCity: 1 }],
      rules,
      metric,
    );
    expect(checkBeaconPlacement(layout, rules, 10, at(0, -500))).toEqual({
      ok: false,
      problem: "beacon_limit",
    });
  });

  it("입력 차례와 상관없이 같은 배치", () => {
    const cities = [
      { id: 2, faction: 20, point: at(1000, 0), grade: 2 },
      { id: 1, faction: 10, point: at(0, 0), grade: 1 },
    ];
    const beacons = [
      { id: 201, faction: 20, point: at(1000, 700), anchorCity: 2 },
      { id: 101, faction: 10, point: at(0, 700), anchorCity: 1 },
      { id: 102, faction: 10, point: at(500, 300), anchorCity: 1 },
      { id: 202, faction: 20, point: at(1500, 300), anchorCity: 2 },
    ];
    const a = buildTerritory(cities, beacons, rules, metric);
    const b = buildTerritory(cities.toReversed(), beacons.toReversed(), rules, metric);
    expect(b).toEqual(a);
  });
});
