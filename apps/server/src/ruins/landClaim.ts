// 빈 2차맵 알박기 완성(서버 권위) — 기획 D-572 "세력범위에는 포함되나 정부건물이 없는 땅에는 다른세력이 건설가능하고 건설되면 해당 정부가
// 영토소유 알박기처럼 가능. 물론 군사력이 약하여 뺐기고 자원과 시간만 날릴수있음", 알박기 시점 "정부 건물을 다 지으면"(ADR
// docs/adr/2026-11-14-second-map-build.md 3단계, 질문 2122 가, docs/questions/2026-11-16-alpak-2122.md).
// - 자리: 도시(world_cities·거울 세계 도시)도 폐허도 없는 2차맵. 행정 건물(시설 단계 government)은 그런 2차맵 어디에나 짓는다(1차맵 세력
//   범위 안이어도 — 알박기는 정부 건물이 없는 땅의 규칙이라 새 마을 자리 규칙 foundingClaimConflict "남의 지도 영토 안이면 막음"을 거치지
//   않는다, 질문 2191). 폐허가 있는 2차맵은 폐허 복원 길(ruins/service.ts), 도시가 있는 2차맵은 정부를 더 짓지 못한다(not_ruin 그대로).
// - 편(새 도시가 드는 세력): 폐허 복원과 같은 joinOf — 도시 가진 가문의 가문장 = 그 가문, 그 밖의 유저 = 사이보그의 나라(가문원은 가문 소속
//   도시의 나라로 맞춰져 있다), 세력 주체 = 그 세력(질문 2193). **가문 없는 플레이어(무소속)는 사용자에게 묻는 중이라 막는다**(짓기 forbidden,
//   미리 묻기 claim = no_house — 질문 2192). 편은 다 지었을 때 다시 센다(짓는 동안 가문을 바꾸면 바뀐 편으로).
// - 다 지음 = 행정 건물 레벨 1 이상·상태 0% 초과·2차맵에 서 있음. NPC 사회 런타임 틱(5초)마다 훑어(foundPendingClaims) 그 2차맵에 아직 도시·
//   폐허가 없으면 그 편의 새 도시를 세운다 — 가문 마을 세우기와 같은 길(npc/houseRuntime.ts foundVillage: 행정 Lv1·연구 0·휴먼 없음·지분
//   1,000주를 그 세력 국고에, 주거 = 설정 칸 house_village_housing). 도시 자리 = 행정 건물 가운데 칸. 그 행정 건물은 새 도시의 시설이 된다
//   (시설 줄 도시 = 새 도시 → 행정 레벨 = 그 건물 레벨, 489 다). 시설 줄·세력 행·도시 행을 같은 동기 처리에서 쓰기 대기열에 넣는다.
// - 경쟁: 같은 2차맵에 여러 세력이 짓고 있으면 먼저 다 지은 쪽이 도시가 된다. 늦은 쪽 행정 건물은 남의 도시 2차맵의 알박기 건물로 남는다
//   (도시가 서면 땅 규칙 foreign_city가 새 짓기를 막는다 — 이미 지은 건물은 그대로, 질문 2194).
// - 저장할 새 값은 없다: "알박기 중" = 시설 줄 도시가 비어 있는(null) 행정 건물이다. 그래서 다시 켜도 틱이 그대로 잇는다(리셋·마이그레이션 없음).
//   옛 판에서 시설 줄 도시가 비어 있는 행정 건물은 없다(행정 건물은 폐허에만 지어 폐허 ID를 적었다, NPC 씨앗은 도시 ID).
import type { SocietyCoefficients } from "@terra/sim";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { TEST_HOUSE_RULES, houseRulesFrom } from "../factionIdentity/rules.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { OwnerRow } from "../world/persist/load.ts";

/** 빈 2차맵에 정부를 다 지으면 새 도시가 드는 편 | 가문 없는 플레이어라 아직 못 짓는다(질문 2192) */
export type LandClaimKind = "house" | "nation" | "faction" | "no_house";

export interface LandClaimDeps {
  readonly places: PlaceWorld;
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly facilities: {
    readonly facilities: ReadonlyMap<number, FacilityRecord>;
    seedBuilt(record: FacilityRecord): void;
  };
  /** 소유 주체가 정부를 지으면 도시가 드는 세력(폐허 복원과 같은 함수) */
  readonly joinOf: (runtime: NpcRuntime, ownerId: number) => number | undefined;
  /** 사용자가 든 가문 행(world/houseTies.ts houseOfUser). 없으면(무소속) undefined */
  readonly houseOfUser?: ((userId: string) => number | undefined) | undefined;
  /** 설정 칸(새 도시 주거 = house_village_housing). 없으면 시험 계수표 */
  readonly rules?: (() => SocietyCoefficients) | undefined;
}

export interface LandClaims {
  /** 그 2차맵이 알박기 자리(도시·폐허 없음)면 정부를 지었을 때의 편, 아니면 null(런타임이 없어도 null) */
  kindOf(runtime: NpcRuntime, ownerId: number, mapKey: number): LandClaimKind | null;
  /** 그 2차맵에 도시나 폐허가 있나 */
  settled(runtime: NpcRuntime, mapKey: number): boolean;
  /** 다 지은 알박기 행정 건물마다 그 2차맵에 새 도시를 세운다. 세운 수 */
  foundPending(runtime: NpcRuntime, nowMs: number): number;
}

export function createLandClaims(d: LandClaimDeps): LandClaims {
  const { places } = d;
  const settled = (runtime: NpcRuntime, mapKey: number): boolean => {
    if (places.cities().some((city) => city.mapKey === mapKey)) return true;
    for (const [id, place] of runtime.places)
      if (place.mapKey === mapKey && (runtime.world.cities.has(id) || runtime.world.ruins.has(id)))
        return true;
    return false;
  };
  /** 편(위 머리 주석). 무소속 유저 = no_house, 편이 없으면(나라가 사라짐 등) undefined */
  const sideOf = (runtime: NpcRuntime, ownerId: number): LandClaimKind | undefined => {
    const owner = d.owners.get(ownerId);
    if (owner?.userId && d.houseOfUser?.(owner.userId) === undefined) return "no_house";
    const join = d.joinOf(runtime, ownerId);
    if (join === undefined) return undefined;
    if (owner?.userId === null || owner?.userId === undefined) return "faction";
    return runtime.world.factions.get(join)?.player === true ? "house" : "nation";
  };
  const isGovernment = (record: FacilityRecord): boolean =>
    places.catalog().facility(record.facilityId)?.stage === "government";

  return {
    settled,
    kindOf(runtime, ownerId, mapKey) {
      if (settled(runtime, mapKey)) return null;
      return sideOf(runtime, ownerId) ?? null;
    },
    foundPending(runtime, nowMs) {
      let founded = 0;
      for (const record of [...d.facilities.facilities.values()].toSorted(
        (a, b) => a.buildingId - b.buildingId,
      )) {
        if (record.cityId !== null || record.level < 1 || record.conditionPpm <= 0 || !isGovernment(record))
          continue;
        const found = cellOf(places, record);
        if (!found || found.ownerId === null || settled(runtime, found.mapKey)) continue;
        const side = sideOf(runtime, found.ownerId);
        const join = side === undefined || side === "no_house" ? undefined : d.joinOf(runtime, found.ownerId);
        if (join === undefined) continue;
        const map = places.maps.get(found.mapKey);
        if (!map) continue;
        const housing = (d.rules ? houseRulesFrom(d.rules()) : TEST_HOUSE_RULES).villageHousing;
        const planetId = [...runtime.places.values()].find((p) => p.mapKey === found.mapKey)?.planetId;
        const cityId = runtime.houses.foundVillage(
          join,
          { planetId: planetId ?? map.planetId, mapKey: found.mapKey, cellX: found.x, cellY: found.y },
          housing,
          nowMs,
        );
        // 행정 건물은 새 도시의 시설(489 다 — 행정 레벨 = 건물 레벨). 시설 줄·세력 행·도시 행을 같은 동기 처리에서 쓰기 대기열로
        d.facilities.seedBuilt({ ...record, cityId });
        runtime.houses.flush(join, cityId);
        founded += 1;
      }
      return founded;
    },
  };
}

/** 행정 건물의 2차맵·가운데 칸·주인(2차맵에 없으면 undefined) */
function cellOf(
  places: PlaceWorld,
  record: FacilityRecord,
): { mapKey: number; x: number; y: number; ownerId: number | null } | undefined {
  for (const map of places.maps.values()) {
    if (map.buildingOwner(record.buildingId) === undefined) continue;
    let found: { mapKey: number; x: number; y: number; ownerId: number | null } | undefined;
    map.forEachBuilding((building) => {
      if (building.id !== record.buildingId) return;
      const footprint = places.catalog().facility(record.facilityId)?.footprint;
      found = {
        mapKey: map.mapKey,
        x: building.x + Math.floor((footprint?.width ?? 1) / 2),
        y: building.y + Math.floor((footprint?.height ?? 1) / 2),
        ownerId: building.ownerId,
      };
    });
    return found;
  }
  return undefined;
}
