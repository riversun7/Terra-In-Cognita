import { describe, expect, it } from "vitest";
import {
  TERRITORY_MAP_START,
  type TerritoryMapSite,
  buildTerritoryMap,
  territoryCircleMilli,
  territoryCorridorRadius,
  territoryMapClaim,
  territoryMapOwnerOf,
} from "./territoryMap.ts";

// 평면 시험: (x, y) → (x, y, Z), x 1000 ≈ 1/60 라디안
const Z = 60_000;
const at = (x: number, y: number) => [x, y, Z] as const;
const R = 1 / 60;
const city = (id: number, faction: number, x: number, y: number, radius = R): TerritoryMapSite => ({
  kind: "city",
  id,
  faction,
  point: at(x, y),
  radius,
});

describe("1차맵 영토 지도(판정·표시 공용, D-568)", () => {
  it("도시 원 반지름: 바탕 × 배율, 아래 끝 칸, 바탕이 없으면 0", () => {
    expect(territoryCircleMilli(3000, TERRITORY_MAP_START)).toBe(6000);
    expect(territoryCircleMilli(500, TERRITORY_MAP_START)).toBe(4000);
    expect(territoryCircleMilli(null, TERRITORY_MAP_START)).toBe(0);
    expect(territoryCircleMilli(0, TERRITORY_MAP_START)).toBe(0);
    expect(territoryCorridorRadius(TERRITORY_MAP_START, 0)).toBe(0);
  });

  it("셋이 서로 이어지면 삼각형 속도 채운다(원·띠 밖이어도)", () => {
    const sites = [city(1, 10, 0, 0, R / 4), city(2, 10, 6000, 0, R / 4), city(3, 10, 3000, 5000, R / 4)];
    const map = buildTerritoryMap(sites, 10 * R);
    expect(map.groups).toHaveLength(1);
    expect(map.groups[0]?.triangles).toHaveLength(1);
    expect(territoryMapClaim(map, at(3000, 2000))?.faction).toBe(10);
    // 잇지 않으면(잇기 상한 0) 속은 비고 원만 남는다
    const apart = buildTerritoryMap(sites, 0);
    expect(apart.groups).toHaveLength(3);
    expect(territoryMapClaim(apart, at(3000, 2000))).toBeNull();
  });

  it("같은 비율이면 도시 → 작은 ID, 입력 차례와 상관없다", () => {
    const sites = [city(2, 20, 500, 0), city(1, 10, -500, 0)];
    const a = buildTerritoryMap(sites, 0);
    const b = buildTerritoryMap(sites.toReversed(), 0);
    expect(territoryMapOwnerOf(a, at(0, 0))?.node.site.id).toBe(1);
    expect(territoryMapOwnerOf(b, at(0, 0))?.node.site.id).toBe(1);
    expect(territoryMapClaim(a, at(10, 0))?.faction).toBe(20);
  });

  it("틀린 자리(0 벡터·반지름 0)는 넣지 않고, 0 벡터 점은 영토 밖", () => {
    const map = buildTerritoryMap([{ ...city(1, 10, 0, 0), point: [0, 0, 0] }, city(2, 10, 0, 0, 0)], R);
    expect(map.groups).toHaveLength(0);
    expect(territoryMapClaim(buildTerritoryMap([city(1, 10, 0, 0)], R), [0, 0, 0])).toBeNull();
  });
});
