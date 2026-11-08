// NPC 휴먼의 집·일터 — 기획 답 740 나(NPC 휴먼이 실제 직무 자리로 오가며 일하는 모습, D-523 포인터), docs/adr/2026-11-07-play-flow.md
// "WP-NPC2". 도시 경제(npc/economy.ts, WP4)가 시설마다 일꾼 수를 정한다(@terra/sim assignCityWorkers — 사람을 고르지 않고 수만 센다).
// 여기서 그 수를 그 도시 휴먼에게 차례로 나눈다 [임시]: 휴먼은 유닛 ID 차례, 시설은 시설 ID 차례(건물 시설이 앞, 도시 직무가 뒤)로 앞에서부터
// 일꾼 수만큼 채운다. 건물이 있는 시설의 일꾼은 그 건물 둘레가 일터(bots.ts 일 주기 동안 그곳에서 일하고 나머지는 집 둘레), 건물이 없는 도시
// 직무·일이 없는 휴먼은 집(도시 시청 칸) 둘레만 걷는다. 보이는 움직임만 정한다(산출은 도시 경제가 센다 — 휴먼이 어디 있든 같다).
import { type BuildingPlacement, footprintRect } from "@terra/sim";
import type { BotHome, TripArea } from "../world/bots.ts";

/** [임시] 일터 네모 = 건물 가운데 칸 둘레, 건물 반 폭 + 이 칸(건물 칸은 설 수 없어 그 둘레에서 고른다) */
export const WORK_MARGIN_CELLS = 3;

/** 시설 하나의 일꾼(도시 경제 시설 ID 차례) */
export interface WorkFacility {
  /** 도시 경제 시설 ID(건물 시설 = 건물 ID, 도시 직무 = 큰 수) */
  readonly id: number;
  /** 건물 ID(도시 직무면 null) */
  readonly buildingId: number | null;
  readonly workers: number;
}

/** 건물 배치 → 일터 네모 */
export function workAreaOf(placement: BuildingPlacement): TripArea {
  const rect = footprintRect(placement);
  return {
    x: rect.x + Math.floor(rect.width / 2),
    y: rect.y + Math.floor(rect.height / 2),
    radius: Math.ceil(Math.max(rect.width, rect.height) / 2) + WORK_MARGIN_CELLS,
  };
}

/**
 * 한 도시 휴먼의 집·일터(순수 함수). humans = 그 도시 휴먼 유닛 ID(차례 상관없음), facilities = 그 도시 시설 일꾼, areas = 그 도시 2차맵에 선
 * 건물의 일터 네모. 일꾼 수 합이 휴먼보다 많으면 앞 시설부터 채우고 끝난다
 */
export function assignHumanPlaces(input: {
  readonly humans: readonly number[];
  readonly home: { readonly x: number; readonly y: number };
  readonly facilities: readonly WorkFacility[];
  readonly areas: ReadonlyMap<number, TripArea>;
}): Map<number, BotHome> {
  const out = new Map<number, BotHome>();
  const humans = input.humans.toSorted((a, b) => a - b);
  let next = 0;
  for (const facility of input.facilities.toSorted((a, b) => a.id - b.id)) {
    const work = facility.buildingId === null ? undefined : input.areas.get(facility.buildingId);
    for (let taken = 0; taken < facility.workers && next < humans.length; taken++) {
      const unitId = humans[next] ?? 0;
      next += 1;
      out.set(unitId, work ? { x: input.home.x, y: input.home.y, work } : { ...input.home });
    }
  }
  for (; next < humans.length; next++) out.set(humans[next] ?? 0, { x: input.home.x, y: input.home.y });
  return out;
}

/** 휴먼 자리를 맞출 때 읽는 2차맵 몫 */
export interface PlacesMap {
  forEachBuilding(
    visit: (building: { readonly id: number; readonly placement: BuildingPlacement }) => void,
  ): void;
  unitInfo(unitId: number): object | undefined;
  setHome(unitId: number, home: BotHome | null): boolean;
}

export interface HumanPlacesInput {
  /** 거울 세계 휴먼(유닛 ID → 도시) */
  readonly units: ReadonlyMap<number, { readonly id: number; readonly city: number }>;
  /** 도시 자리(2차맵·시청 칸) */
  readonly places: ReadonlyMap<
    number,
    { readonly mapKey: number; readonly cellX: number; readonly cellY: number }
  >;
  readonly maps: ReadonlyMap<number, PlacesMap>;
  /** 그 도시 시설 일꾼(도시 경제가 없으면 undefined — 모두 집 둘레) */
  readonly facilitiesOf?: ((cityId: number) => readonly WorkFacility[]) | undefined;
}

/** 지난번에 넣은 자리(유닛 ID → 모양 글자)와 견줘 바뀐 휴먼만 2차맵에 넣는다. 넣은 수를 돌려준다 */
export function createHumanPlaces(): { sync(input: HumanPlacesInput): number } {
  const placed = new Map<number, string>();
  return {
    sync(input) {
      // 도시마다 그 도시 휴먼(그 도시 2차맵에 서 있는 것만 — 다른 2차맵 도시로 옮겨 간 휴먼은 그대로)
      const byCity = new Map<number, number[]>();
      for (const unit of input.units.values()) {
        const list = byCity.get(unit.city);
        if (list) list.push(unit.id);
        else byCity.set(unit.city, [unit.id]);
      }
      const areasByMap = new Map<number, Map<number, TripArea>>();
      const areasOf = (mapKey: number, map: PlacesMap): Map<number, TripArea> => {
        let areas = areasByMap.get(mapKey);
        if (!areas) {
          const found = new Map<number, TripArea>();
          map.forEachBuilding((building) => found.set(building.id, workAreaOf(building.placement)));
          areasByMap.set(mapKey, found);
          areas = found;
        }
        return areas;
      };
      const seen = new Set<number>();
      let changed = 0;
      for (const [cityId, humans] of byCity) {
        const place = input.places.get(cityId);
        const map = place ? input.maps.get(place.mapKey) : undefined;
        if (!place || !map) continue;
        const here = humans.filter((id) => map.unitInfo(id) !== undefined);
        const homes = assignHumanPlaces({
          humans: here,
          home: { x: place.cellX, y: place.cellY },
          facilities: input.facilitiesOf?.(cityId) ?? [],
          areas: areasOf(place.mapKey, map),
        });
        for (const [unitId, home] of homes) {
          seen.add(unitId);
          const sig = JSON.stringify(home);
          if (placed.get(unitId) === sig) continue;
          if (map.setHome(unitId, home)) changed += 1;
          placed.set(unitId, sig);
        }
      }
      // 사라진 휴먼(사망·노숙)은 잊는다(지운 유닛은 2차맵에서 이미 빠졌다)
      for (const unitId of placed.keys()) if (!seen.has(unitId)) placed.delete(unitId);
      return changed;
    },
  };
}
