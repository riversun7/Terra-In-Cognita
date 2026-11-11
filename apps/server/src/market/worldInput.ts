// 월드 → NPC 도시 경제 입력 — docs/adr/2026-11-07-play-flow.md WP4. world.ts가 NPC 사회 런타임을 켤 때 한 줄로 넘긴다.
// 도시 시설 = 건물 서비스의 시설 줄 가운데 그 도시에 선 것(다 지었고 일하는 상태 — 상태 30% 미만·짓는 중은 빼기, 건물 서비스 works),
// 주인 = 2차맵 건물 주인. 국가 프리셋(나라 성격: 도시 직무·처음 창고, 기획 답 531 다·533 다)도 함께 넘긴다.
import type { WorldFacilities } from "../facilities/world.ts";
import type { CityFacility, NpcEconomyInput } from "../npc/economy.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { ServerEconomyCatalog } from "./catalog.ts";

export function npcEconomyInputOf(
  catalog: (() => ServerEconomyCatalog) | undefined,
  facilities: WorldFacilities,
  maps: ReadonlyMap<number, SecondMap>,
  presets?: readonly NationPreset[],
): NpcEconomyInput | undefined {
  if (!catalog) return undefined;
  const ownerOf = (buildingId: number): number | null => {
    for (const map of maps.values()) {
      const owner = map.buildingOwner(buildingId);
      if (owner !== undefined) return owner;
    }
    return null;
  };
  return {
    catalog,
    presets,
    facilitiesIn(cityId) {
      const out: CityFacility[] = [];
      for (const record of facilities.service.facilities.values()) {
        if (record.cityId !== cityId || record.level < 1 || !facilities.service.works(record.buildingId))
          continue;
        out.push({
          buildingId: record.buildingId,
          facility: record.facilityId,
          level: record.level,
          ownerId: ownerOf(record.buildingId),
        });
      }
      return out;
    },
    lodgingsIn(cityId) {
      const catalog = facilities.catalog();
      const out: number[] = [];
      for (const record of facilities.service.facilities.values())
        if (
          record.cityId === cityId &&
          record.level >= 1 &&
          catalog.facility(record.facilityId)?.stage === "living"
        )
          out.push(record.buildingId);
      return out.toSorted((a, b) => a - b);
    },
  };
}
