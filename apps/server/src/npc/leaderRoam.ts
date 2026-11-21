// NPC 국가 지도자 수도 순회(leaderRoam.ts) — docs/adr/2026-11-20-npc-autonomous-ai.md 4절
// npc_ai_unit_enabled = 1 이고 npc_ai_leader_roam_cells > 0 이면 지도자 유닛이 수도 행정 건물(또는 수도 시청 칸)
// 반경 안에서 순찰/순회한다. 0이거나 스위치가 꺼지면 집을 비워 제자리에 고정한다.
import type { UnitTraits } from "@terra/shared/unitTraits";
import type { NpcAiCoefficients } from "@terra/sim/npcAi";
import type { BotHome } from "../world/bots.ts";
import type { CityRow } from "../world/cities.ts";
import { type LeaderMap, capitalsOf, leaderUnitOf } from "./leaders.ts";

export interface LeaderRoamMap extends LeaderMap {
  setHome(unitId: number, home: BotHome | null): boolean;
}

export interface LeaderRoamInput {
  readonly maps: ReadonlyMap<number, LeaderRoamMap>;
  readonly cities: readonly CityRow[];
  readonly planetId: string;
  readonly ownerOfFaction: (factionId: number) => number | undefined;
  readonly facilities: ReadonlyMap<number, { readonly facilityId: string; readonly cityId: number | null }>;
  readonly traitsOf: (unitId: number, factionId: number) => UnitTraits;
  readonly ai: NpcAiCoefficients;
}

/** 수도 행정 건물 기준 칸(없으면 수도 시청 칸) */
function capitalCenter(
  map: LeaderRoamMap,
  capital: CityRow,
  facilities: LeaderRoamInput["facilities"],
): { readonly x: number; readonly y: number } {
  let found: { readonly x: number; readonly y: number } | undefined;
  map.forEachBuilding((b) => {
    if (found) return;
    const f = facilities.get(b.id);
    if (f?.facilityId === "government_hall" && f.cityId === capital.id) found = { x: b.x, y: b.y };
  });
  return found ?? { x: capital.cellX, y: capital.cellY };
}

/**
 * 지도자 순회 상태 동기화(바뀐 지도자 수 반환).
 * - enabled && leaderRoamRadiusCells > 0: 수도 행정 건물 반경으로 role="leader" BotHome 설정
 * - 그 외: setHome(leaderId, null)로 순회 해제(고정)
 */
export function createLeaderRoam(): { sync(input: LeaderRoamInput): number } {
  const signatures = new Map<number, string>();
  return {
    sync(input) {
      const enabled = input.ai.unitAiEnabled === 1 && input.ai.leaderRoamRadiusCells > 0;
      const capitals = capitalsOf(input.cities, input.planetId);
      let changed = 0;
      const seen = new Set<number>();
      for (const [factionId, capital] of capitals) {
        const ownerId = input.ownerOfFaction(factionId);
        if (ownerId === undefined) continue;
        const map = input.maps.get(capital.mapKey);
        if (!map) continue;
        const leaderId = leaderUnitOf([map], ownerId);
        if (leaderId === undefined) continue;
        seen.add(leaderId);
        if (!enabled) {
          if (signatures.get(leaderId) !== "off") {
            if (map.setHome(leaderId, null)) changed += 1;
            signatures.set(leaderId, "off");
          }
          continue;
        }
        const center = capitalCenter(map, capital, input.facilities);
        const traits = input.traitsOf(leaderId, factionId);
        const home: BotHome = {
          x: center.x,
          y: center.y,
          homeRadius: input.ai.leaderRoamRadiusCells,
          role: "leader",
          traits,
          aiEnabled: true,
          aiRules: input.ai,
        };
        const sig = JSON.stringify(home);
        if (signatures.get(leaderId) === sig) continue;
        if (map.setHome(leaderId, home)) changed += 1;
        signatures.set(leaderId, sig);
      }
      for (const id of signatures.keys()) if (!seen.has(id)) signatures.delete(id);
      return changed;
    },
  };
}
