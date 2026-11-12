// 시뮬레이터 도시 공성 전투맵(citySiege.ts) 시험 — 질문 1068 가. 값은 형식 확인용이다.
import { CONDITION_FULL, durabilityPoints, maxDurabilityAt } from "@terra/shared/facilityRuntime";
import { describe, expect, it } from "vitest";
import { createBattle } from "../combat/battle.ts";
import { TEST_COMBAT_CATALOG } from "../combat/catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "../combat/coefficients.ts";
import { runWaveToEnd, waveBattleInit } from "../simulator/waveBattle.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { START_WORLD_SEED } from "../society/worldSeed.ts";
import {
  type SimCitySiegeInput,
  TEST_SIEGE_KIT,
  simCityFacilities,
  simCitySiegeLayout,
} from "./citySiege.ts";

const base: SimCitySiegeInput = {
  cityId: 1,
  start: true,
  housing: 40,
  adminLevel: 2,
  seed: START_WORLD_SEED,
  kit: TEST_SIEGE_KIT,
  runtime: TEST_SOCIETY_COEFFICIENTS.facilityRuntime,
  bedsPerLevel: TEST_SOCIETY_COEFFICIENTS.logistics.lodgingBedsPerLevel,
  layoutSeed: 12_345,
};

describe("시뮬 도시 공성 전투맵", () => {
  it("시작 도시: 행정 건물이 가운데 넥서스, 서버 씨앗 차례의 건물, 성벽 고리와 성문", () => {
    const layout = simCitySiegeLayout(base);
    expect(layout).toBeDefined();
    if (!layout) return;
    const hall = layout.buildings.find((building) => building.sourceId === layout.nexusSourceId);
    expect(hall).toBeDefined();
    // 행정 건물 내구도 = 팩 내구도 × 행정 레벨(상태 가득)
    const rt = TEST_SOCIETY_COEFFICIENTS.facilityRuntime;
    expect(hall?.durability).toBe(durabilityPoints(CONDITION_FULL, maxDurabilityAt(500, 2, rt)));
    expect(Math.abs((hall?.x ?? 0) + 1 - 128)).toBeLessThanOrEqual(2);
    const walls = layout.buildings.filter((building) => building.wall === true);
    expect(walls.length).toBeGreaterThanOrEqual(4);
    expect(layout.gates?.length).toBeGreaterThanOrEqual(1);
    const others = layout.buildings.filter((building) => building.wall !== true);
    expect(others).toHaveLength(simCityFacilities(base).length);
    // 같은 입력이면 같은 배치
    expect(simCitySiegeLayout(base)).toEqual(layout);
  });

  it("마을은 행정 건물 + 숙소만, 성벽 없음. 옛 배치 설정이면 열린 맵(undefined)", () => {
    const village = simCitySiegeLayout({ ...base, start: false });
    expect(village?.buildings.some((building) => building.wall === true)).toBe(false);
    expect(village?.gates).toBeUndefined();
    expect(village?.buildings).toHaveLength(1 + START_WORLD_SEED.villageLodgings);
    expect(simCitySiegeLayout({ ...base, seed: { ...START_WORLD_SEED, cityLayoutMode: 0 } })).toBeUndefined();
    const noWalls = simCitySiegeLayout({ ...base, seed: { ...START_WORLD_SEED, cityWallMode: 0 } });
    expect(noWalls?.buildings.some((building) => building.wall === true)).toBe(false);
  });

  it("시뮬 웨이브가 서버와 같은 전투맵 함수로 싸운다(넥서스 = 행정 건물, 성벽은 부술 막음)", () => {
    const layout = simCitySiegeLayout(base);
    const init = waveBattleInit(
      {
        battleId: 1,
        seed: 4,
        defenderFaction: 2,
        defenders: [],
        defenderTech: 2,
        strength: 8,
        physical: 8,
        creatureTech: 2,
        firstCreatureId: 1000,
        mapSize: 128,
        nexusDurability: 2000,
        maxDefenders: 0,
        layout,
        attackEdge: 1,
      },
      TEST_COMBAT_CATALOG,
      TEST_COMBAT_COEFFICIENTS,
    );
    expect(init.map.buildings.some((building) => building.wall === true)).toBe(true);
    expect(init.map.buildings.some((building) => building.gateSide === 2)).toBe(true);
    expect(init.map.buildings.find((building) => building.nexus)?.durability).toBeLessThan(2000);
    const { result } = runWaveToEnd(createBattle(init, TEST_COMBAT_COEFFICIENTS), []);
    expect(result?.winner).toBe(1);
  });
});
