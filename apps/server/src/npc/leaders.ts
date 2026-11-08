// NPC 국가 지도자 사이보그 — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "Npc사이보그 세력이 없어"), 기획 46 §10.1
// "NPC 지도자"(지도자 사이보그가 NPC가 되어 세력이 이어진다), 30 §5.3 국가 대표 유닛(D-075).
// - 고정 NPC 국가(시작 도시가 있는 세력)마다 지도자 하나: 유닛 종류 7(UNIT_KIND_NPC_LEADER), 주인 = 그 국가 소유 주체.
// - 자리 = 수도의 행정 건물(government_hall) 바로 곁. 수도 = 그 국가의 가장 작은 ID 시작 도시(세계 배치가 수도를 먼저 세운다 —
//   docs/adr/2026-11-07-world-layout.md) [임시, 질문 741]. 행정 건물이 없으면 도시 시청 칸 둘레.
// - 켤 때 한 번(기본 시설 씨앗 다음, 봇을 채우기 전): 띄운 2차맵 어디에도 그 국가 지도자가 없을 때만 세운다(멱등 — 있는 것은 옮기지
//   않는다). 스스로 움직이지 않는다(봇이 아니다). 판단·대사·교체는 아직 없다(질문 742).
// - 이름은 저장하지 않는다: 팩 국가 프리셋 leaderName(nations.ts nationLeaderName)을 화면마다 읽는다.
import { WALK_SPEED } from "@terra/sim";
import { spiralCells } from "../cyborg/service.ts";
import { type NpcSeedResult, seedNpcFacilitiesAtBoot } from "../facilities/npcSeed.ts";
import type { CityRow } from "../world/cities.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";

/** 지도자를 세울 빈 칸을 찾는 반지름(칸) */
const PLACE_RADIUS = 16;

/** 유닛을 훑을 수 있는 2차맵 몫(지도자 찾기) */
export interface LeaderUnits {
  forEachUnit(
    visit: (unit: { readonly id: number; readonly ownerId: number; readonly kind: number }) => void,
  ): void;
}

/** 지도자 씨앗이 읽는 2차맵 몫 */
export type LeaderMap = LeaderUnits & Pick<SecondMap, "mapKey" | "forEachBuilding" | "addUnit">;

/** 국가(세력 행 ID)마다 수도: 그 행성 시작 도시 가운데 가장 작은 ID */
export function capitalsOf(cities: readonly CityRow[], planetId: string): Map<number, CityRow> {
  const out = new Map<number, CityRow>();
  for (const city of cities) {
    if (!city.start || city.planetId !== planetId) continue;
    const have = out.get(city.factionId);
    if (!have || city.id < have.id) out.set(city.factionId, city);
  }
  return out;
}

/** 그 소유 주체의 지도자 유닛 ID(띄운 2차맵 가운데, 없으면 undefined) */
export function leaderUnitOf(maps: Iterable<LeaderUnits>, ownerId: number): number | undefined {
  let found: number | undefined;
  for (const map of maps) {
    map.forEachUnit((unit) => {
      if (found === undefined && unit.kind === UNIT_KIND_NPC_LEADER && unit.ownerId === ownerId)
        found = unit.id;
    });
    if (found !== undefined) return found;
  }
  return undefined;
}

export interface LeaderSeedInput {
  readonly maps: ReadonlyMap<number, LeaderMap>;
  readonly cities: readonly CityRow[];
  readonly planetId: string;
  /** 세력 행 ID → 그 세력 소유 주체 ID(없으면 그 국가는 건너뛴다) */
  readonly ownerOfFaction: (factionId: number) => number | undefined;
  /** 시설 줄(건물 ID → 시설 ID·도시 ID). 수도 행정 건물을 찾는다 */
  readonly facilities: ReadonlyMap<number, { readonly facilityId: string; readonly cityId: number | null }>;
  readonly nextUnitId: () => number;
}

export interface LeaderSeedResult {
  /** 이번에 세운 지도자 수 */
  readonly placed: number;
  /** 수도 2차맵을 띄우지 않았거나 설 곳이 없어 못 세운 수 */
  readonly missing: number;
}

/** 그 도시 행정 건물의 기준 칸(없으면 undefined) */
function hallCell(
  map: LeaderMap,
  cityId: number,
  facilities: LeaderSeedInput["facilities"],
): { x: number; y: number } | undefined {
  let cell: { x: number; y: number } | undefined;
  map.forEachBuilding((building) => {
    if (cell) return;
    const record = facilities.get(building.id);
    if (record?.facilityId === "government_hall" && record.cityId === cityId)
      cell = { x: building.x, y: building.y };
  });
  return cell;
}

/** 지도자가 없는 고정 국가마다 수도 행정 건물 곁에 지도자를 세운다(위 머리 주석) */
export function seedNationLeaders(input: LeaderSeedInput): LeaderSeedResult {
  let placed = 0;
  let missing = 0;
  const capitals = [...capitalsOf(input.cities, input.planetId).values()].toSorted((a, b) => a.id - b.id);
  for (const capital of capitals) {
    const ownerId = input.ownerOfFaction(capital.factionId);
    if (ownerId === undefined) continue;
    if (leaderUnitOf(input.maps.values(), ownerId) !== undefined) continue;
    const map = input.maps.get(capital.mapKey);
    if (!map) {
      missing += 1;
      continue;
    }
    const at = hallCell(map, capital.id, input.facilities) ?? { x: capital.cellX, y: capital.cellY };
    const id = input.nextUnitId();
    let done = false;
    for (const cell of spiralCells(at.x, at.y, PLACE_RADIUS)) {
      if (
        map.addUnit({
          id,
          size: 1,
          speed: WALK_SPEED,
          cellX: cell.x,
          cellY: cell.y,
          ownerId,
          kind: UNIT_KIND_NPC_LEADER,
        })
      ) {
        done = true;
        break;
      }
    }
    if (done) placed += 1;
    else missing += 1;
  }
  return { placed, missing };
}

/**
 * 부팅 복구 때 한 번(world.ts): 기본 시설 씨앗(facilities/npcSeed.ts) → 지도자 씨앗. 둘 다 동기로 끝난다(경로 서비스를 켜기 전).
 * 지도자 유닛 줄은 2차맵 저장 고리(쓰기 대기열)로 커밋된다
 */
export function seedNpcAtBoot(
  options: Parameters<typeof seedNpcFacilitiesAtBoot>[0] & { readonly ids: { readonly unit: () => number } },
): NpcSeedResult & { readonly leaders: LeaderSeedResult } {
  const facilities = seedNpcFacilitiesAtBoot(options);
  const leaders = seedNationLeaders({
    maps: options.maps,
    cities: options.cities,
    planetId: options.planetId,
    ownerOfFaction: (factionId) => {
      for (const owner of options.owners.values()) if (owner.factionId === factionId) return owner.id;
      return undefined;
    },
    facilities: options.facilities.service.facilities,
    nextUnitId: options.ids.unit,
  });
  if (leaders.placed > 0 || leaders.missing > 0)
    options.log.info(leaders, "world boot: seeded npc nation leaders");
  return { ...facilities, leaders };
}
