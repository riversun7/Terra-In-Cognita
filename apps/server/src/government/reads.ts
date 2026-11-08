// 정부(행정 건물) 판 조회(tRPC world.government) — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도
// 없음"). 응답 타입은 @terra/shared/government. 읽기만 한다(구인 고용은 WebSocket recruit_hire, 화면이 recruit.board를 따로 받는다).
// - 건물 → 시설 줄(행정 건물 government_hall·도시 ID) → NPC 사회 런타임 거울 도시(주인·행정 레벨·주거·휴먼 수) → 주인 나라(코드·고정·
//   지금 거래세) → 지도자(국가 지도자 사이보그 유닛, npc/leaders.ts)·이름(팩 국가 프리셋).
// - 안개(서버 권위): 내가 모르는 도시(1차맵 도시 안개 knownCities.ts와 같은 아는 도시)의 건물이면 unknown_building(없는 건물과 같은 답 —
//   모르는 도시의 세율·인구가 새지 않게). 2차맵에서 보이는 행정 건물은 보통 아는 도시다(시청 칸이 시야 칸 안).
// - 시장(46 §2, 기획 답 744 나): NPC 사회 런타임이 그 도시 휴먼 가운데 자동으로 고른 휴먼(npc/cityPeople.ts)의 레벨·1차 스탯·만족도.
//   저장된 스탯이 없는 휴먼은 [임시] 기본값(모두 10, 유닛 화면 기본 스탯과 같다).
import type { GovernmentMayor, GovernmentResponse } from "@terra/shared/government";
import type { LocalizedName } from "@terra/shared/roster";
import type { SimCity, SimFaction, SimUnit } from "@terra/sim";
import type { Viewer } from "../trpc/context.ts";
import { BASELINE_HUMAN_STAT } from "../npc/cityPeople.ts";
import { type LeaderUnits, leaderUnitOf } from "../npc/leaders.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { World } from "../world/world.ts";

/** 행정 건물 시설 ID(팩 content/core/facilities.json, npcSeed.ts seedPlan과 같다) */
export const GOVERNMENT_FACILITY = "government_hall";

/** 이 조회가 세계에서 읽는 것(시험은 가짜를 넣는다) */
export interface GovernmentSource {
  /** 띄운 2차맵(건물이 서 있나·지도자 유닛) */
  readonly maps: ReadonlyMap<number, LeaderUnits & Pick<SecondMap, "buildingOwner" | "forEachBuilding">>;
  /** 건물 ID → 시설 줄(없으면 undefined) */
  facility(buildingId: number): { readonly facilityId: string; readonly cityId: number | null } | undefined;
  /** NPC 사회 런타임 거울 세계·도시 자리·도시 경제 세율(런타임이 없으면 undefined) */
  runtime():
    | {
        readonly world: {
          readonly cities: ReadonlyMap<
            number,
            Pick<SimCity, "id" | "owner" | "start" | "adminLevel" | "housing">
          >;
          readonly factions: ReadonlyMap<number, Pick<SimFaction, "code" | "fixed">>;
          readonly units: ReadonlyMap<number, Pick<SimUnit, "city" | "recruit" | "satisfactionMilli">>;
        };
        readonly places: ReadonlyMap<number, { readonly mapKey: number; readonly name?: string | undefined }>;
        readonly taxOf?: ((factionId: number) => number | undefined) | undefined;
        /** 그 도시 시장 유닛(npc/cityPeople.ts). 없으면 undefined */
        readonly mayorOf?: ((cityId: number) => number | undefined) | undefined;
      }
    | undefined;
  /** 소유 주체 ID → 세력 행 ID(유저 주체·없으면 undefined) */
  factionRowOf(ownerId: number): number | undefined;
  /** 사용자가 든 나라(세력 행 ID). 사이보그가 없으면 undefined */
  myFactionRow(userId: string): number | undefined;
  /** 그 사람이 아는 도시(1차맵 도시 안개) */
  knownCityIds(viewer: Viewer): Promise<ReadonlySet<number>>;
  /** 세력 코드 → 나라 이름·지도자 이름(팩 국가 프리셋) */
  nationName(code: string): LocalizedName | undefined;
  leaderName(code: string): LocalizedName | undefined;
}

export interface GovernmentReads {
  government(viewer: Viewer, buildingId: number, nowMs: number): Promise<GovernmentResponse>;
}

const empty = (
  status: GovernmentResponse["status"],
  buildingId: number,
  nowMs: number,
): GovernmentResponse => ({
  status,
  buildingId,
  city: null,
  nation: null,
  leader: null,
  building: null,
  mayor: null,
  generatedAt: nowMs,
});

/** 시장 휴먼 → 화면 자료(스탯 차례 STR·DEX·AGI·VIT·INT·WIS, 저장된 스탯이 없으면 기본값 모두 BASELINE_HUMAN_STAT) */
export function mayorView(
  unitId: number,
  unit: Pick<SimUnit, "recruit" | "satisfactionMilli">,
): GovernmentMayor {
  const stats = unit.recruit?.stats;
  const known = stats !== undefined && stats.length >= 6;
  const at = (index: number): number => (known ? (stats[index] ?? 0) : BASELINE_HUMAN_STAT);
  return {
    unitId,
    level: unit.recruit?.level ?? 1,
    stats: { str: at(0), dex: at(1), agi: at(2), vit: at(3), int: at(4), wis: at(5) },
    baseline: !known,
    satisfaction: Math.max(0, Math.min(100, Math.round(unit.satisfactionMilli / 1000))),
  };
}

/** 그 2차맵에서 건물 기준 칸(없으면 null) */
function buildingCell(
  map: Pick<SecondMap, "forEachBuilding"> | undefined,
  buildingId: number,
): { x: number; y: number } | null {
  let cell: { x: number; y: number } | null = null;
  map?.forEachBuilding((building) => {
    if (building.id === buildingId) cell = { x: building.x, y: building.y };
  });
  return cell;
}

export function createGovernmentReads(source: GovernmentSource): GovernmentReads {
  /** 건물이 띄운 2차맵에 서 있나 */
  const standing = (buildingId: number): boolean => {
    for (const map of source.maps.values()) if (map.buildingOwner(buildingId) !== undefined) return true;
    return false;
  };

  return {
    async government(viewer, buildingId, nowMs) {
      const runtime = source.runtime();
      if (!runtime) return empty("not_ready", buildingId, nowMs);
      const record = source.facility(buildingId);
      if (!record || !standing(buildingId)) return empty("unknown_building", buildingId, nowMs);
      if (record.facilityId !== GOVERNMENT_FACILITY || record.cityId === null)
        return empty("not_government", buildingId, nowMs);
      const city = runtime.world.cities.get(record.cityId);
      const place = runtime.places.get(record.cityId);
      if (!city || !place) return empty("not_government", buildingId, nowMs);
      // 모르는 도시의 건물은 없는 건물과 같은 답(안개)
      const known = await source.knownCityIds(viewer);
      if (!known.has(city.id)) return empty("unknown_building", buildingId, nowMs);
      const faction = runtime.world.factions.get(city.owner);
      const factionRow = source.factionRowOf(city.owner);
      let humans = 0;
      for (const unit of runtime.world.units.values()) if (unit.city === city.id) humans += 1;
      // 수도 = 그 나라의 가장 작은 ID 시작 도시(npc/leaders.ts capitalsOf와 같은 규칙)
      let capital: number | undefined;
      for (const other of runtime.world.cities.values())
        if (other.start && other.owner === city.owner && (capital === undefined || other.id < capital))
          capital = other.id;
      const leaderUnit = faction?.fixed ? leaderUnitOf(source.maps.values(), city.owner) : undefined;
      // 지도자가 이 도시 2차맵에 있나(아니면 화면이 "수도에 있음")
      const cityMap = source.maps.get(place.mapKey);
      const here = cityMap !== undefined && leaderUnitOf([cityMap], city.owner) === leaderUnit;
      const code = faction?.code ?? null;
      const mayorId = runtime.mayorOf?.(city.id);
      const mayorUnit = mayorId === undefined ? undefined : runtime.world.units.get(mayorId);
      return {
        status: "ready",
        buildingId,
        city: {
          id: city.id,
          name: place.name ?? null,
          mapKey: String(place.mapKey),
          start: city.start,
          capital: capital === city.id,
          adminLevel: city.adminLevel,
          humans,
          housing: city.housing,
        },
        nation: {
          id: factionRow ?? city.owner,
          code,
          name: code === null ? null : (source.nationName(code) ?? null),
          fixed: faction?.fixed ?? false,
          mine: factionRow !== undefined && source.myFactionRow(viewer.id) === factionRow,
          taxBp: runtime.taxOf?.(city.owner) ?? null,
        },
        leader:
          leaderUnit === undefined
            ? null
            : {
                unitId: leaderUnit,
                name: code === null ? null : (source.leaderName(code) ?? null),
                here,
              },
        building: buildingCell(cityMap, buildingId),
        mayor: mayorId === undefined || !mayorUnit ? null : mayorView(mayorId, mayorUnit),
        generatedAt: nowMs,
      };
    },
  };
}

/** 월드(app.ts → worldMap/reads.ts worldMapReadsOf)로 정부 판 조회를 만든다. 아는 도시·이름은 지도 흐름 조회와 같은 함수 */
export function governmentReadsOfWorld(
  world: Pick<World, "maps" | "persistence" | "npc">,
  names: Pick<GovernmentSource, "knownCityIds" | "nationName" | "leaderName">,
): GovernmentReads {
  return createGovernmentReads({
    ...names,
    maps: world.maps,
    facility: (buildingId) => world.persistence?.facilities.service.facilities.get(buildingId),
    runtime: () => {
      const npc = world.npc;
      if (!npc) return undefined;
      return {
        world: npc.world,
        places: npc.places,
        taxOf: (factionId) => npc.economy?.economy.taxOf.get(factionId),
        mayorOf: (cityId) => npc.mayorOf(cityId),
      };
    },
    factionRowOf: (ownerId) => world.persistence?.owners.get(ownerId)?.factionId ?? undefined,
    myFactionRow: (userId) => world.persistence?.cyborgs.record(userId)?.factionId,
  });
}
