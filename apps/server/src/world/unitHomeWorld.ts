// 적색 부상 귀환 자리(unitHome.ts)를 세계 자료에 잇는다 — 사용자 결정 D-594 보충(줄기 return-home). world.ts를 키우지 않으려고 따로 둔다.
// - 소속 도시: 플레이어 유닛(주인이 사용자) = 주인 사이보그의 내 도시(cyborgs.start_city_id), NPC 유닛 = 거울 세계 휴먼의 사는 도시(SimUnit.city, 노숙 0이면 없음).
// - 소속 국가 정부 건물: 나라 = 플레이어는 사이보그 시민권 나라(cyborgs.faction_id), NPC는 주인 세력. 수도 = NPC 사회 런타임 수도(capitals.ts — D-528), 런타임이
//   없거나 모르면 부팅 도시 표의 수도(leaders.ts capitalsOf). 그 수도 행정 건물(government_hall) 칸, 없으면 수도 시청 칸(unitHome.ts).
// - 적대 세력이 아닌 가까운 도시(4번, 보충 4): 적대 = 그 유닛 나라(NPC = 주인 세력, 플레이어 = 시민권 나라의 주체)와 거울 세계에서 지금 전쟁 중인(faction.wars)
//   도시 주인 또는 그 위 나라(overlord). 런타임이 없으면 전쟁을 모르니 적대 없음으로 본다 [임시]. 가까움 = 같은 2차맵 칸 거리 → 다른 2차맵 가운데 사이 행성 위
//   거리(셀 키가 아니면 무한) → 작은 도시 ID.
// - 도시 칸: 부팅 도시 + 런타임 도시(폐허 뺌 — cities.ts cityCellsOf).
// 바뀜(fixes-1117k — 기획 검토 2752·2755):
// - 2752: 도시 칸은 띄우지 않은 2차맵의 도시도 낸다(그 차례를 건너뛰지 않는다 — unitHome.ts가 좌표 유닛으로 세운다). 가까운 도시(4번)도 띄우지 않은 2차맵 도시를 센다.
// - 2755(D-569 "유닛은 하나의 가문에만 속함 가문은 하나의 도시에 속함"): 플레이어 유닛의 소속 도시 = 그 유닛 가문의 소속 도시(유닛 → 가문 → 도시 — houseTies.ts
//   unitHouseOf → cityOfHouse: 사이보그 본체는 주인의 가문, 고용 유닛은 고용할 때 적은 가문).
// - 바뀜 (fix-2774, 기획 답 2774 — D-572 정리 "가문 없는 플레이어도 소속 도시가 있어 자기 나라 영토는 내 땅이다(D-565·D-569)"): 가문이 없는 유닛(무소속)도
//   소속 도시 차례를 건너뛰지 않는다. 그 소속 도시 = 주인(플레이어) 사이보그의 내 도시(cyborgs.start_city_id — 귀화하면 바뀐다, houseHome.ts 머리 주석).
//   그 도시가 폐허라 칸이 없을 때만 다음 차례(소속 국가 정부 건물)로 간다.
import type { CityCell } from "@terra/shared/goodsPlaces";
import { isCellKey } from "@terra/planet";
import { cellCenter } from "@terra/planet/projection";
import { HOMELESS } from "@terra/sim";
import { capitalsOf, hallCell } from "../npc/leaders.ts";
import type { TravelService, TravelSpawn } from "../travel/serviceTypes.ts";
import type { CityRow } from "./cities.ts";
import type { OwnerRow } from "./persist/load.ts";
import type { SecondMap } from "./secondMap.ts";
import { type MapCell, type UnitHome, createUnitHome } from "./unitHome.ts";

export interface UnitHomeWorldInput {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly ledger: object;
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly planetId: string;
  /** 그 플레이어 유닛 가문의 소속 도시(유닛 → 가문 → 도시, D-569 — 가문이 없거나 모르면 undefined) */
  readonly houseCityOf: (unitId: number, userId: string) => number | undefined;
  /** 사용자의 사이보그 기록(시민권 나라 — 미소속이면 null) */
  readonly cyborgOf: (
    userId: string,
  ) => { readonly startCityId: number; readonly factionId: number | null } | undefined;
  /** 거울 세계 휴먼의 사는 도시(NPC 사회 런타임이 없거나 거울 휴먼이 아니면 undefined) */
  readonly npcCityOf: (unitId: number) => number | undefined;
  /** 그 세력(소유 주체 ID)의 수도(NPC 사회 런타임, 없으면 undefined) */
  readonly npcCapitalOf: (ownerId: number) => number | undefined;
  /** 거울 세계의 세력·도시(전쟁·도시 주인 — 적대 세력이 아닌 가까운 도시). 런타임이 없으면 undefined */
  readonly npcWorld: () =>
    | {
        readonly cities: ReadonlyMap<number, { readonly owner: number }>;
        readonly factions: ReadonlyMap<
          number,
          { readonly wars: ReadonlySet<number>; readonly overlord: number | null }
        >;
      }
    | undefined;
  /** 부팅 때 읽은 도시 표(수도 대비) */
  readonly cities: () => readonly CityRow[];
  /** 이 행성 도시 칸(폐허 뺌 — 띄우지 않은 2차맵 도시도, fixes-1117k 2752) */
  readonly cityCells: () => readonly CityCell[];
  /** 건물 시설 줄(행정 건물 찾기) */
  readonly facilities: () =>
    | ReadonlyMap<number, { readonly facilityId: string; readonly cityId: number | null }>
    | undefined;
  readonly travel: () => Pick<TravelService, "cancel" | "cancelNpc" | "parkAt"> | undefined;
  /** 2차맵 띄우기(봇이 띄우지 않은 2차맵으로 돌아갈 때) */
  readonly spawn?: (() => TravelSpawn | undefined) | undefined;
  readonly log?: { warn(obj: object, message: string): void } | undefined;
}

/** 두 2차맵 가운데 사이 거리 제곱(행성 위 단위 구 — 셀 키가 아니면 무한) */
function mapDistance2(a: number, b: number): number {
  if (a === b) return 0;
  if (!isCellKey(a) || !isCellKey(b)) return Number.POSITIVE_INFINITY;
  const p = cellCenter(a);
  const q = cellCenter(b);
  return (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]);
}

/** [임시] 위 나라를 따라 올라가는 상한(고리 막기) */
const OVERLORD_DEPTH = 8;

export function createUnitHomeWorld(input: UnitHomeWorldInput): UnitHome {
  const userOf = (ownerId: number): string | null => input.owners.get(ownerId)?.userId ?? null;
  /** 나라(세력 행 ID)의 소유 주체(사용자가 아닌 주체 — 없으면 undefined) */
  const nationOwner = (factionId: number): number | undefined => {
    for (const owner of input.owners.values())
      if (owner.userId === null && owner.factionId === factionId) return owner.id;
    return undefined;
  };
  /** 그 유닛 나라의 소유 주체(NPC = 주인 세력 주체, 플레이어 = 시민권 나라의 주체) */
  const nationSubject = (ownerId: number): number | undefined => {
    const userId = userOf(ownerId);
    if (userId === null) return input.owners.get(ownerId)?.factionId === null ? undefined : ownerId;
    const nation = input.cyborgOf(userId)?.factionId;
    return nation === undefined || nation === null ? undefined : nationOwner(nation);
  };
  /** 도시 주인 주체(거울 세계 → 부팅 도시 표의 세력 행 주체) */
  const cityOwner = (cityId: number): number | undefined => {
    const live = input.npcWorld()?.cities.get(cityId)?.owner;
    if (live !== undefined) return live;
    const row = input.cities().find((city) => city.id === cityId);
    return row ? nationOwner(row.factionId) : undefined;
  };
  /** 그 도시가 그 나라와 전쟁 중인 세력(주인이나 그 위 나라)의 것인가 */
  const hostile = (nation: number | undefined, cityId: number): boolean => {
    const world = input.npcWorld();
    const wars = nation === undefined ? undefined : world?.factions.get(nation)?.wars;
    let owner = cityOwner(cityId);
    if (!wars || owner === undefined) return false;
    for (let depth = 0; depth < OVERLORD_DEPTH && owner !== undefined; depth++) {
      if (wars.has(owner)) return true;
      owner = world?.factions.get(owner)?.overlord ?? undefined;
    }
    return false;
  };
  return createUnitHome({
    maps: input.maps,
    ledger: input.ledger,
    userOf,
    homeCityOf(unitId, ownerId) {
      const userId = userOf(ownerId);
      // 가문 없는 유닛(무소속)은 주인 사이보그의 내 도시(cyborgs.start_city_id — 2774 답: D-565·D-569·D-572 "가문 없는 플레이어도 소속 도시가 있다")
      if (userId !== null) return input.houseCityOf(unitId, userId) ?? input.cyborgOf(userId)?.startCityId;
      const city = input.npcCityOf(unitId);
      return city === undefined || city === HOMELESS ? undefined : city;
    },
    capitalOf(_unitId, ownerId, at) {
      const userId = userOf(ownerId);
      const nation =
        userId === null ? input.owners.get(ownerId)?.factionId : input.cyborgOf(userId)?.factionId;
      if (nation === null || nation === undefined) return undefined;
      const subject = userId === null ? ownerId : nationOwner(nation);
      // 소속 국가의 도시 중 현재 위치에서 가장 가까운 도시 우선(전쟁 퇴거 뒤 주거지 없음 귀환 — ADR 2026-11-24-house-membership-separation.md)
      if (at && subject !== undefined) {
        const world = input.npcWorld();
        const belongsToNation = (cityId: number): boolean => {
          let owner = cityOwner(cityId);
          for (let depth = 0; depth < OVERLORD_DEPTH && owner !== undefined; depth++) {
            if (owner === subject) return true;
            owner = world?.factions.get(owner)?.overlord ?? undefined;
          }
          return false;
        };
        let best: { id: number; same: boolean; d: number } | undefined;
        for (const cell of input.cityCells()) {
          if (!belongsToNation(cell.id)) continue;
          const same = cell.mapKey === at.mapKey;
          const d = same
            ? (cell.x - at.x) * (cell.x - at.x) + (cell.y - at.y) * (cell.y - at.y)
            : mapDistance2(at.mapKey, cell.mapKey);
          if (!best || (same !== best.same ? same : d !== best.d ? d < best.d : cell.id < best.id))
            best = { id: cell.id, same, d };
        }
        if (best) return best.id;
      }
      const live = subject === undefined ? undefined : input.npcCapitalOf(subject);
      return live ?? capitalsOf(input.cities(), input.planetId).get(nation)?.id;
    },
    cityCell(cityId) {
      const city = input.cityCells().find((cell) => cell.id === cityId);
      return city ? { mapKey: city.mapKey, x: city.x, y: city.y } : undefined;
    },
    hallOf(cityId) {
      const facilities = input.facilities();
      if (!facilities) return undefined;
      for (const map of input.maps.values()) {
        const cell = hallCell(map, cityId, facilities);
        if (cell) return { mapKey: map.mapKey, ...cell } satisfies MapCell;
      }
      return undefined;
    },
    nearestCity(_unitId, ownerId, at) {
      const nation = nationSubject(ownerId);
      let best: { cell: CityCell; same: boolean; d: number } | undefined;
      for (const cell of input.cityCells()) {
        if (hostile(nation, cell.id)) continue;
        const same = cell.mapKey === at.mapKey;
        const d = same
          ? (cell.x - at.x) * (cell.x - at.x) + (cell.y - at.y) * (cell.y - at.y)
          : mapDistance2(at.mapKey, cell.mapKey);
        const better =
          !best || (same !== best.same ? same : d !== best.d ? d < best.d : cell.id < best.cell.id);
        if (better) best = { cell, same, d };
      }
      return best ? { mapKey: best.cell.mapKey, x: best.cell.x, y: best.cell.y } : undefined;
    },
    travel: input.travel,
    spawn: input.spawn,
    log: input.log,
  });
}
