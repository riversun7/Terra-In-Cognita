import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { DEFAULT_NPC_AI_COEFFICIENTS } from "@terra/sim/npcAi";
import { describe, expect, it } from "vitest";
import type { BotHome } from "../world/bots.ts";
import type { CityRow } from "../world/cities.ts";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import { type LeaderRoamMap, createLeaderRoam } from "./leaderRoam.ts";

function fakeMap(
  leaderId: number,
  ownerId: number,
): { map: LeaderRoamMap; homes: Map<number, BotHome | null> } {
  const homes = new Map<number, BotHome | null>();
  const map: LeaderRoamMap = {
    mapKey: 1001,
    forEachUnit(visit) {
      visit({ id: leaderId, ownerId, kind: UNIT_KIND_NPC_LEADER });
    },
    forEachBuilding(visit) {
      visit({
        id: 50,
        ownerId,
        x: 120,
        y: 130,
        placement: { x: 120, y: 130, width: 4, height: 4, rotation: 0 },
      });
    },
    addUnit: () => true,
    setHome(unitId, home) {
      homes.set(unitId, home);
      return true;
    },
  };
  return { map, homes };
}

describe("leaderRoam", () => {
  it("leaderRoamRadiusCells > 0이면 수도 행정 건물 둘레로 순회 집을 설정하고 0이면 해제한다", () => {
    const { map, homes } = fakeMap(9001, 10);
    const roam = createLeaderRoam();
    const cities: readonly CityRow[] = [
      {
        id: 1,
        factionId: 1,
        planetId: "p1",
        mapKey: 1001,
        cellX: 80,
        cellY: 80,
        start: true,
        capital: true,
      },
    ];
    const facilities = new Map([[50, { facilityId: "government_hall", cityId: 1 }]]);

    const c1 = roam.sync({
      maps: new Map([[1001, map]]),
      cities,
      planetId: "p1",
      ownerOfFaction: () => 10,
      facilities,
      traitsOf: () => DEFAULT_UNIT_TRAITS,
      ai: { ...DEFAULT_NPC_AI_COEFFICIENTS, unitAiEnabled: 1, leaderRoamRadiusCells: 18 },
    });
    expect(c1).toBe(1);
    expect(homes.get(9001)).toMatchObject({
      x: 120,
      y: 130,
      homeRadius: 18,
      role: "leader",
      aiEnabled: true,
    });

    // 반경 0으로 바꾸면 순회 해제(고정)
    const c2 = roam.sync({
      maps: new Map([[1001, map]]),
      cities,
      planetId: "p1",
      ownerOfFaction: () => 10,
      facilities,
      traitsOf: () => DEFAULT_UNIT_TRAITS,
      ai: { ...DEFAULT_NPC_AI_COEFFICIENTS, unitAiEnabled: 1, leaderRoamRadiusCells: 0 },
    });
    expect(c2).toBe(1);
    expect(homes.get(9001)).toBeNull();
  });
});
