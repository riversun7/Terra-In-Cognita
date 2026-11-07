// NPC 마을 자리 시험(docs/adr/2026-11-07-world-layout.md): 다른 세력 도시 영향권과 닿는 자리는 건너뛰고, 내 세력 영향권은 막지 않고,
// 둘레가 모두 막히면 자리가 없다(세우지 않는다).
import { territoryMetric, territoryPoint, placementCellKey } from "@terra/planet/territory";
import { territoryDistanceMilli } from "@terra/shared/territory";
import { describe, expect, it } from "vitest";
import { TEST_MAP_KEY } from "../world/testMaps.ts";
import type { CityPlace } from "./persist.ts";
import { type TownSiteCity, pickTownSite } from "./townSites.ts";

const place = (cellX: number, cellY: number): CityPlace => ({
  planetId: "s2_test_planet",
  mapKey: TEST_MAP_KEY,
  cellX,
  cellY,
  foundedAtMs: 0,
});
const metric = territoryMetric(9);
const point = (p: CityPlace) => territoryPoint(placementCellKey(TEST_MAP_KEY, p.cellX, p.cellY));

describe("NPC 마을 자리(다른 세력 영향권 밖)", () => {
  const home: TownSiteCity = { id: 1, place: place(128, 128), owner: 10, radiusMilli: 500 };

  it("다른 세력 도시가 없으면 첫 자리(거리 28 · 동쪽)", () => {
    const site = pickTownSite({
      from: home.place,
      founder: 10,
      cities: [home],
      newRadiusMilli: 100,
      nowMs: 5,
    });
    expect(site).toMatchObject({ cellX: 156, cellY: 128, foundedAtMs: 5 });
  });

  it("다른 세력 도시 영향권 + 새 마을 영향권과 닿는 자리는 건너뛴다", () => {
    const rival: TownSiteCity = { id: 2, place: place(200, 128), owner: 20, radiusMilli: 200 };
    const site = pickTownSite({
      from: home.place,
      founder: 10,
      cities: [home, rival],
      newRadiusMilli: 100,
      nowMs: 0,
    });
    expect(site).toBeDefined();
    if (!site) return;
    expect(territoryDistanceMilli(point(site), point(rival.place), metric)).toBeGreaterThan(200 + 100);
    // 내 세력 도시 영향권(반경 500) 안은 괜찮다
    expect(territoryDistanceMilli(point(site), point(home.place), metric)).toBeLessThan(500);
  });

  it("둘레가 모두 다른 세력 영향권이면 자리가 없다", () => {
    const giant: TownSiteCity = { id: 3, place: place(130, 130), owner: 30, radiusMilli: 3600 };
    expect(
      pickTownSite({ from: home.place, founder: 10, cities: [home, giant], newRadiusMilli: 100, nowMs: 0 }),
    ).toBeUndefined();
    // 폐허 자리(주인 없음)는 띄우기만 한다
    const ruin: TownSiteCity = { id: 4, place: place(156, 128), owner: null, radiusMilli: 0 };
    const site = pickTownSite({
      from: home.place,
      founder: 10,
      cities: [home, ruin],
      newRadiusMilli: 100,
      nowMs: 0,
    });
    expect(site).not.toMatchObject({ cellX: 156, cellY: 128 });
  });
});
