import { describe, expect, it } from "vitest";
import {
  type TerritoryRules,
  type TerritoryVec,
  buildTerritory,
  checkBeaconPlacement,
  claimAt,
  foundingClaimConflict,
  foundingConflict,
  nearestFactionCity,
  territoryDistanceMilli,
  urbanCityAt,
} from "./territory.ts";
import type { TerritoryMapValues } from "./territoryMap.ts";

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

/** 시험용 영토 값: 원 = 바탕 그대로(아래 끝 1칸), 잇기 6칸, 비콘 둘레 1칸 */
const values: TerritoryMapValues = { corridorCells: 6, radiusScalePm: 1000, minCells: 1, beaconCells: 1 };
/** 새 도시 세우기 검사의 "같은 편"(세력 10) */
const mine = (faction: number) => faction === 10;

describe("영토 배치·소속(D-568 — 1차맵 지도대로)", () => {
  it("거리는 각 × 칸/라디안이고 결정적이다", () => {
    expect(Math.round(territoryDistanceMilli(at(0, 0), at(100, 0), metric))).toBe(1000);
    expect(territoryDistanceMilli(at(0, 0), at(700, 0), metric)).toBe(
      territoryDistanceMilli(at(700, 0), at(0, 0), metric),
    );
  });

  it("도시 원: 바탕 = 배후지(없으면 영향권) × 배율, 아래 끝 칸 — 안은 그 도시가 지방", () => {
    const layout = buildTerritory(
      [
        // 마을 영향권 100 → 아래 끝 1칸(1000) = 100단위
        { id: 1, faction: 10, point: at(0, 0), grade: 1 },
        // 배후지 2.5칸 → 250단위
        { id: 2, faction: 20, point: at(3000, 0), grade: 1, catchmentMilli: 2500 },
      ],
      [],
      rules,
      metric,
      values,
    );
    expect(layout.cities.map((city) => city.territoryMilli)).toEqual([1000, 2500]);
    expect(claimAt(layout, at(90, 0))).toEqual({ faction: 10, province: 1, source: "city" });
    expect(claimAt(layout, at(110, 0))).toBeNull();
    expect(claimAt(layout, at(3240, 0))).toEqual({ faction: 20, province: 2, source: "city" });
    expect(claimAt(layout, at(3260, 0))).toBeNull();
  });

  it("잇기 상한 안의 같은 국가 도시 사이 땅도 영토(띠), 밖이면 따로 — 지방은 영향력 비율이 작은 도시", () => {
    const layout = buildTerritory(
      [
        { id: 1, faction: 10, point: at(0, 0), grade: 1 },
        { id: 2, faction: 10, point: at(500, 0), grade: 1 },
        { id: 3, faction: 10, point: at(1400, 0), grade: 1 },
      ],
      [],
      rules,
      metric,
      values,
    );
    expect(layout.groups.map((group) => group.members.map((m) => m.id))).toEqual([[1, 2], [3]]);
    expect(claimAt(layout, at(250, 80))?.faction).toBe(10);
    expect(claimAt(layout, at(250, 120))).toBeNull();
    expect(claimAt(layout, at(200, 0))?.province).toBe(1);
    expect(claimAt(layout, at(300, 0))?.province).toBe(2);
    // 2와 3 사이(900단위 = 9칸 > 6칸)는 잇지 않는다
    expect(claimAt(layout, at(950, 0))).toBeNull();
  });

  it("도시 소유 비콘은 기준 도시 외곽선을 비콘까지 넓힌다(거리와 상관없이), 지방은 기준 도시", () => {
    const layout = buildTerritory(
      [
        { id: 1, faction: 10, point: at(0, 0), grade: 1 },
        { id: 2, faction: 20, point: at(-3000, 0), grade: 1 },
      ],
      [
        { id: 101, faction: 10, point: at(800, 0), anchorCity: 1 },
        // 기준 도시가 없거나 다른 세력이면 넓히지 않는다
        { id: 102, faction: 10, point: at(0, 800), anchorCity: null },
        { id: 103, faction: 10, point: at(0, -800), anchorCity: 2 },
      ],
      rules,
      metric,
      values,
    );
    expect(claimAt(layout, at(500, 0))).toEqual({ faction: 10, province: 1, source: "beacon" });
    expect(claimAt(layout, at(880, 0))).toEqual({ faction: 10, province: 1, source: "beacon" });
    expect(claimAt(layout, at(500, 150))).toBeNull();
    expect(claimAt(layout, at(0, 800))).toBeNull();
    expect(claimAt(layout, at(0, -800))).toBeNull();
    expect(layout.groups[0]?.members.map((m) => `${m.kind}${m.id}`)).toEqual(["city1", "beacon101"]);
  });

  it("다른 국가 원이 겹치면 영향력 비율(거리 ÷ 원 반지름)이 작은 도시 — 큰 도시가 조금 더 가진다", () => {
    const layout = buildTerritory(
      [
        { id: 1, faction: 10, point: at(0, 0), grade: 1, catchmentMilli: 2000 },
        { id: 2, faction: 20, point: at(250, 0), grade: 1 },
      ],
      [],
      rules,
      metric,
      values,
    );
    // 경계 x/200 = (250 − x)/100 → x ≈ 166.7
    expect(claimAt(layout, at(160, 0))?.faction).toBe(10);
    expect(claimAt(layout, at(175, 0))?.faction).toBe(20);
    expect(claimAt(layout, at(330, 0))?.faction).toBe(20);
  });

  it("비콘 놓기 검사: 거리·개수·다른 세력 영토(도시 원·비콘 외곽선 모두)", () => {
    const cities = [
      { id: 1, faction: 10, point: at(0, 0), grade: 1 },
      { id: 2, faction: 20, point: at(1200, 0), grade: 4 },
    ];
    const beacons = [
      { id: 101, faction: 10, point: at(0, 500), anchorCity: 1 },
      { id: 102, faction: 10, point: at(0, -500), anchorCity: 1 },
      { id: 201, faction: 20, point: at(700, 0), anchorCity: 2 },
    ];
    let layout = buildTerritory(cities, beacons, rules, metric, values);
    // 빈 땅·내 영토는 된다
    expect(checkBeaconPlacement(layout, rules, 10, at(-500, 0))).toEqual({ ok: true, anchorCity: 1 });
    expect(checkBeaconPlacement(layout, rules, 10, at(0, 300))).toEqual({ ok: true, anchorCity: 1 });
    expect(checkBeaconPlacement(layout, rules, 10, at(-1200, 0))).toEqual({
      ok: false,
      problem: "out_of_range",
    });
    // 세력 20 비콘이 넓힌 외곽선 안(도시 영향권 밖)도 남의 영토다
    expect(claimAt(layout, at(650, 0))?.source).toBe("beacon");
    expect(checkBeaconPlacement(layout, rules, 10, at(650, 0))).toEqual({
      ok: false,
      problem: "foreign_city",
    });
    layout = buildTerritory(
      cities,
      [...beacons, { id: 103, faction: 10, point: at(-500, 0), anchorCity: 1 }],
      rules,
      metric,
      values,
    );
    expect(checkBeaconPlacement(layout, rules, 10, at(-300, -300))).toEqual({
      ok: false,
      problem: "beacon_limit",
    });
  });

  it("비콘 재료 도시(질문 410 ①): 그 세력에서 가장 가까운 도시, 같으면 작은 ID, 없으면 null", () => {
    const cities = [
      { id: 3, faction: 10, point: at(900, 0) },
      { id: 1, faction: 10, point: at(-300, 0) },
      { id: 2, faction: 20, point: at(100, 0) },
      { id: 4, faction: 10, point: at(300, 0) },
    ];
    expect(nearestFactionCity(cities, 10, at(0, 0))).toBe(1);
    expect(nearestFactionCity(cities, 10, at(700, 0))).toBe(3);
    expect(nearestFactionCity(cities, 20, at(700, 0))).toBe(2);
    expect(nearestFactionCity(cities, 30, at(0, 0))).toBeNull();
    // 도시 1(−300)과 4(+300)의 가운데는 같은 거리 → 입력 차례와 상관없이 작은 ID
    expect(nearestFactionCity(cities.toReversed(), 10, at(0, 0))).toBe(1);
    expect(nearestFactionCity(cities, 10, at(1, 0))).toBe(4);
  });

  it("시가지(D-146, 질문 1923 나): 도시 중심에서 영토 원 ÷ 3 안, 겹치면 영향력 비율이 작은 도시(같으면 작은 ID)", () => {
    const layout = buildTerritory(
      [
        // 배후지 3칸 → 영토 원 3000 → 시가지 1000(x 100)
        { id: 2, faction: 10, point: at(0, 0), grade: 4, catchmentMilli: 3000 },
        // 마을: 영토 원 아래 끝 1칸 → 시가지 약 333(x 33)
        { id: 1, faction: 20, point: at(130, 0), grade: 1 },
        // 바탕이 0이면 영토 원·시가지가 없다
        { id: 5, faction: 30, point: at(-500, 0), grade: 1, catchmentMilli: 0 },
      ],
      [],
      rules,
      metric,
      values,
    );
    expect(urbanCityAt(layout, at(95, 0))).toBe(2);
    expect(urbanCityAt(layout, at(-105, 0))).toBeNull();
    // 둘 다 덮는 곳(x 99): 도시 2 비율 990/3000 = 0.33, 마을 1 비율 310/1000 = 0.31 → 마을
    expect(urbanCityAt(layout, at(99, 0))).toBe(1);
    expect(urbanCityAt(layout, at(-500, 0))).toBeNull();
    // 옛 규칙(영향권 1100 ÷ 3 ≈ x 37)보다 넓다
    expect(urbanCityAt(layout, at(-60, 0))).toBe(2);
  });

  it("새 도시 자리(질문 1922 나): 다른 세력 지도 영토 안이면 막고, 영토 밖·내 영토(겹치면 지도 주인)는 된다", () => {
    const layout = buildTerritory(
      [
        { id: 1, faction: 10, point: at(0, 0), grade: 1, catchmentMilli: 2000 },
        { id: 2, faction: 20, point: at(1000, 0), grade: 1, catchmentMilli: 2000 },
        { id: 3, faction: 20, point: at(1500, 0), grade: 1, catchmentMilli: 1000 },
      ],
      [{ id: 9, faction: 20, point: at(1000, 900), anchorCity: 2 }],
      rules,
      metric,
      values,
    );
    // 도시 2 원(x 200) 안 → 막는다(그 소속), 도시 2·3 사이 띠 안도 막는다
    expect(foundingClaimConflict(layout, mine, at(1150, 0))?.faction).toBe(20);
    expect(foundingClaimConflict(layout, mine, at(1300, 40))?.faction).toBe(20);
    // 비콘 외곽선(도시 2 → 비콘 9 줄) 안도 남의 영토
    expect(foundingClaimConflict(layout, mine, at(1000, 500))?.province).toBe(2);
    // 영토 밖, 내 영토
    expect(foundingClaimConflict(layout, mine, at(500, 600))).toBeNull();
    expect(foundingClaimConflict(layout, mine, at(150, 0))).toBeNull();
    // 세력 20 눈으로는 내 도시 1 영토가 막는다
    expect(foundingClaimConflict(layout, (faction) => faction === 20, at(150, 0))?.faction).toBe(10);
  });

  it("새 도시 세우기 검사: 남의 영향권 + 새 영향권 안이면 막고(작은 ID), 같은 편 도시는 보지 않는다", () => {
    const cities = [
      { id: 7, faction: 20, point: at(1000, 0), radiusMilli: 1100 },
      { id: 3, faction: 20, point: at(1050, 0), radiusMilli: 100 },
      { id: 1, faction: 10, point: at(0, 0), radiusMilli: 3600 },
    ];
    // x 100 ≈ 1000분율 1000: 도시 7 영향권 1100 + 새 마을 100 = 1200 → x 880(거리 1200)은 닿는다, x 870은 닿지 않는다
    expect(foundingConflict(cities, metric, mine, at(880, 0), 100)).toBe(7);
    expect(foundingConflict(cities, metric, mine, at(870, 0), 100)).toBeNull();
    // 둘 다 닿으면 작은 ID(입력 차례와 상관없이)
    expect(foundingConflict(cities, metric, mine, at(1040, 0), 100)).toBe(3);
    expect(foundingConflict(cities.toReversed(), metric, mine, at(1040, 0), 100)).toBe(3);
    // 내 도시 영향권 안은 막지 않는다
    expect(foundingConflict(cities, metric, mine, at(100, 0), 100)).toBeNull();
    // 다른 세력 눈으로는 내 도시(10)가 막는다
    expect(foundingConflict(cities, metric, (faction) => faction === 20, at(100, 0), 100)).toBe(1);
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
    const a = buildTerritory(cities, beacons, rules, metric, values);
    const b = buildTerritory(cities.toReversed(), beacons.toReversed(), rules, metric, values);
    expect(b.groups).toEqual(a.groups);
    expect(b.cities).toEqual(a.cities);
    for (const [x, y] of [
      [250, 150],
      [500, 300],
      [1200, 100],
      [700, 500],
    ] as const)
      expect(claimAt(b, at(x, y))).toEqual(claimAt(a, at(x, y)));
  });
});
