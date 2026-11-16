// NPC 휴먼의 집·일터 — 기획 답 740 나(NPC 휴먼이 실제 직무 자리로 오가며 일하는 모습, D-523 포인터), docs/adr/2026-11-07-play-flow.md
// "WP-NPC2". 도시 경제(npc/economy.ts, WP4)가 시설마다 일꾼 수를 정한다(@terra/sim assignCityWorkers — 사람을 고르지 않고 수만 센다).
// 여기서 그 수를 그 도시 휴먼에게 차례로 나눈다 [임시]: 휴먼은 유닛 ID 차례, 시설은 시설 ID 차례(건물 시설이 앞, 도시 직무가 뒤)로 앞에서부터
// 일꾼 수만큼 채운다. 건물이 있는 시설의 일꾼은 그 건물 둘레가 일터(bots.ts 일 주기 동안 그곳에서 일하고 나머지는 집 둘레), 건물이 없는 도시
// 직무·일이 없는 휴먼은 집(도시 시청 칸) 둘레만 걷는다. 보이는 움직임만 정한다(산출은 도시 경제가 센다 — 휴먼이 어디 있든 같다).
// 일하는 때(기획 답 770 나, "WP-NPC4"): 일터를 받은 휴먼은 그 2차맵 지역 시각의 낮(설정 칸 npc_work_start_pm~npc_work_end_pm)에 일터로 간다 —
// 2차맵 경도는 2차맵 빛(엔진 secondMapPlace)과 같은 셈(칸 가운데 방향의 경도)이다.
// 숙소(docs/adr/2026-11-11-city-building-layout.md, 사용자 요청 2026-11-11 "숙소는 노동자 회복 루트"·기획 D-245 "가장 가까운 숙소"): 그 도시에
// 숙소가 있으면 일터를 받은 휴먼의 집은 일터에서 가장 가까운 숙소 둘레다(밤에 거기서 쉰다 — 전략 배치는 숙소를 일터와 가운데 사이에 둔다).
// 일이 없는 휴먼·경비대는 그대로 도시 시청 칸 둘레.
// 쉼터 계획(질문 1047 다, npc/cityRest.ts — 도시 경제가 맞출 때마다 셈): 있으면 일꾼마다 그 계획의 숙소(침대 수 안, 길 위가 먼저)에서 쉬고, 침대가
// 모자란 일꾼은 시청 칸 둘레(집)에서 쉰다. 같은 계획이 생산 속도 배율을 정하므로 보이는 쉼터와 셈이 같다.
// 피로 바퀴(질문 1095 가, 설정 칸 worker_rest_cycle_mode 1): 일꾼은 낮·밤 대신 생산 셈과 같은 일·쉼 바퀴로 일터 ↔ 쉼터를 오간다(지치면 스스로 쉼터로).
// 보이는 운반꾼(기획 D-564 1626·D-570 1886 "보이는 운반꾼이 원칙(NPC 포함), 부하가 크면 보이지 않는 곳만 시간 계산"): 건물 시설의 산출을 창고로
// 나르는 시간(도시 경제 haul)이 있으면 그 시설 첫 일꾼이 그 시간 동안 창고 둘레로 걸어가 내려놓는다(BotHome.haul). 보는 사람이 있는 2차맵
// (구독자가 있는 2차맵)에만 붙인다 — 보지 않는 2차맵은 시간 셈만(같은 결과).
// 바뀜 (기획 대조 2052·2088 — D-555 1505 "어떤 유닛이든 실제로 옮겨야한다", D-564 1626 "보이는게 원칙"): 보는 2차맵의 운반꾼은 실제 화물을 진다 — 운반꾼을
// 정하면 운반 일(npcCarry.ts)에 알려 그 휴먼 화물로 싣는다(약탈 대상). 시설 산출 운반은 그 시설 첫 일꾼이, 거래소 운반(빈 일꾼 운반)은 일 없는 휴먼이 열쇠
// 차례로 하나씩 맡는다(일 없는 휴먼이 모자라면 남은 운반은 시간 셈). 판정(닿는 시각)은 운반 일의 시간 그대로다.
import { isCellKey } from "@terra/planet";
import { cellCenter } from "@terra/planet/projection";
import { type BuildingPlacement, footprintRect } from "@terra/sim";
import {
  type BotHome,
  DEFAULT_WORK_SHIFT,
  type HaulTrip,
  type RestCycle,
  type TripArea,
  type WorkShift,
} from "../world/bots.ts";
import type { CityRestPlan, WorkerRest } from "./cityRest.ts";
import type { CarryBoard } from "./npcCarry.ts";

/** [임시] 일터 네모 = 건물 가운데 칸 둘레, 건물 반 폭 + 이 칸(건물 칸은 설 수 없어 그 둘레에서 고른다) */
export const WORK_MARGIN_CELLS = 3;
/** [임시] 운반꾼이 내려놓는 창고 둘레 반경(칸 — 창고 건물 칸은 설 수 없어 그 둘레) */
export const HAUL_DROP_RADIUS_CELLS = 4;

/** 시설 하나의 일꾼(도시 경제 시설 ID 차례) */
export interface WorkFacility {
  /** 도시 경제 시설 ID(건물 시설 = 건물 ID, 도시 직무 = 큰 수) */
  readonly id: number;
  /** 건물 ID(도시 직무면 null) */
  readonly buildingId: number | null;
  readonly workers: number;
  /**
   * 보이는 운반(D-570 1886): 이번 산출을 이 칸(창고 가운데)으로 [fromMs, untilMs)에 나른다. key = 운반 일 열쇠(npcCarry.ts — 운반꾼을 정하면 화물을 싣는다).
   * 없으면 운반 모습 없음
   */
  readonly haul?:
    | {
        readonly x: number;
        readonly y: number;
        readonly fromMs: number;
        readonly untilMs: number;
        readonly key?: string | undefined;
      }
    | undefined;
}

/**
 * 2차맵 경도(°, −180 초과 180 이하): 2차맵 키(1차맵 최소 칸의 셀 키) → 칸 가운데 방향의 경도. 엔진 lighting/secondMapLight.ts secondMapPlace와
 * 같은 셈이라 휴먼의 낮밤이 화면 빛과 맞는다. 셀 키가 아니면(옛 시험 2차맵) 0
 */
export function mapLongitudeDeg(mapKey: number): number {
  if (!isCellKey(mapKey)) return 0;
  const up = cellCenter(mapKey);
  return (Math.atan2(up[1], up[0]) * 180) / Math.PI;
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

/** 네모 가운데끼리 체비셰프 거리가 가장 짧은 네모(같으면 앞의 것). 없으면 undefined */
export function nearestArea(areas: readonly TripArea[], from: TripArea): TripArea | undefined {
  let best: { area: TripArea; d: number } | undefined;
  for (const area of areas) {
    const d = Math.max(Math.abs(area.x - from.x), Math.abs(area.y - from.y));
    if (!best || d < best.d) best = { area, d };
  }
  return best?.area;
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
  /** 일터를 받은 휴먼의 일하는 때(없으면 DEFAULT_WORK_SHIFT) */
  readonly shift?: WorkShift | undefined;
  /** 경비대(일터를 받지 않고 늘 집 = 도시 시청 칸 둘레에 머문다). humans에 들어 있지 않은 유닛 ID */
  readonly guards?: readonly number[] | undefined;
  /** 그 도시 숙소의 쉼터 네모(없거나 비면 일꾼도 시청 칸 둘레에서 쉰다) */
  readonly lodgings?: readonly TripArea[] | undefined;
  /**
   * 쉼터 계획(일꾼 차례 = 시설 ID 차례 × 일꾼 수, npc/cityRest.ts): 있으면 i번째 일꾼은 이 값(undefined = 시청 칸 둘레)에서 쉰다. 없으면
   * 일터에서 가장 가까운 숙소(lodgings)
   */
  readonly rests?: readonly (TripArea | undefined)[] | undefined;
  /** 일꾼마다 피로 바퀴(rests와 같은 차례, 질문 1095 가). 있으면 그 일꾼은 낮·밤 대신 이 바퀴로 일터 ↔ 쉼터를 오간다 */
  readonly cycles?: readonly (RestCycle | undefined)[] | undefined;
  /** 빈 일꾼 운반(거래소 운반 — 기획 대조 2088, 열쇠 차례): 일 없는 휴먼에게 하나씩 */
  readonly trips?: readonly CityTrip[] | undefined;
  /** 운반꾼을 정했다(열쇠, 유닛) — 화물 싣기(npcCarry.ts load) */
  readonly onCarrier?: ((key: string, unitId: number) => void) | undefined;
}): Map<number, BotHome> {
  const shift = input.shift ?? DEFAULT_WORK_SHIFT;
  const out = new Map<number, BotHome>();
  const humans = input.humans.toSorted((a, b) => a - b);
  let next = 0;
  for (const facility of input.facilities.toSorted((a, b) => a.id - b.id)) {
    const work = facility.buildingId === null ? undefined : input.areas.get(facility.buildingId);
    // 그 시설 첫 일꾼이 운반꾼(D-570 1886)
    const haul: HaulTrip | undefined =
      work && facility.haul
        ? {
            area: { x: facility.haul.x, y: facility.haul.y, radius: HAUL_DROP_RADIUS_CELLS },
            fromMs: facility.haul.fromMs,
            untilMs: facility.haul.untilMs,
          }
        : undefined;
    for (let taken = 0; taken < facility.workers && next < humans.length; taken++) {
      const unitId = humans[next] ?? 0;
      next += 1;
      const order = next - 1;
      const rest = !work
        ? undefined
        : input.rests
          ? input.rests[order]
          : nearestArea(input.lodgings ?? [], work);
      const cycle = input.cycles?.[order];
      const own = cycle ? { ...shift, cycle } : shift;
      const carry = taken === 0 && haul ? { haul } : {};
      if (taken === 0 && haul && facility.haul?.key !== undefined)
        input.onCarrier?.(facility.haul.key, unitId);
      out.set(
        unitId,
        work
          ? rest
            ? { x: rest.x, y: rest.y, homeRadius: rest.radius, work, shift: own, ...carry }
            : { x: input.home.x, y: input.home.y, work, shift: own, ...carry }
          : { ...input.home },
      );
    }
  }
  // 일 없는 휴먼: 빈 일꾼 운반을 하나씩(기획 대조 2088), 나머지는 집 둘레
  const trips = input.trips ?? [];
  for (let k = 0; next < humans.length; next++, k++) {
    const unitId = humans[next] ?? 0;
    const trip = trips[k];
    if (!trip) {
      out.set(unitId, { x: input.home.x, y: input.home.y });
      continue;
    }
    out.set(unitId, {
      x: input.home.x,
      y: input.home.y,
      haul: {
        area: { x: trip.x, y: trip.y, radius: HAUL_DROP_RADIUS_CELLS },
        fromMs: trip.fromMs,
        untilMs: trip.untilMs,
      },
    });
    input.onCarrier?.(trip.key, unitId);
  }
  for (const unitId of input.guards ?? []) out.set(unitId, { x: input.home.x, y: input.home.y });
  return out;
}

/** 빈 일꾼 운반 하나(npcCarry.ts CarryJob의 보이는 몫) */
export interface CityTrip {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly fromMs: number;
  readonly untilMs: number;
}

/** 휴먼 자리를 맞출 때 읽는 2차맵 몫 */
export interface PlacesMap {
  forEachBuilding(
    visit: (building: { readonly id: number; readonly placement: BuildingPlacement }) => void,
  ): void;
  unitInfo(unitId: number): object | undefined;
  setHome(unitId: number, home: BotHome | null): boolean;
  /** 이 2차맵을 보는 연결(구독자) 수 — 보이는 운반꾼은 보는 사람이 있을 때만(D-570 1886). 없으면 보지 않는 2차맵 */
  readonly stream?: { readonly subscriberCount: number } | undefined;
}

export interface HumanPlacesInput {
  /** 거울 세계 휴먼(유닛 ID → 도시) */
  readonly units: ReadonlyMap<
    number,
    { readonly id: number; readonly city: number; readonly guard?: boolean | undefined }
  >;
  /** 도시 자리(2차맵·시청 칸) */
  readonly places: ReadonlyMap<
    number,
    { readonly mapKey: number; readonly cellX: number; readonly cellY: number }
  >;
  readonly maps: ReadonlyMap<number, PlacesMap>;
  /** 그 도시 시설 일꾼(도시 경제가 없으면 undefined — 모두 집 둘레) */
  readonly facilitiesOf?: ((cityId: number) => readonly WorkFacility[]) | undefined;
  /** 그 도시 숙소 건물 ID(없으면 일꾼도 시청 칸 둘레에서 쉰다) */
  readonly lodgingsOf?: ((cityId: number) => readonly number[]) | undefined;
  /** 그 도시 쉼터 계획(질문 1047 다, 도시 경제 restPlan). 있으면 lodgingsOf 대신 이것으로 쉼터를 고른다 */
  readonly restOf?: ((cityId: number) => CityRestPlan | undefined) | undefined;
  /** 일하는 지역 시각(지역 하루 천분율, 설정 칸 npc_work_start_pm·npc_work_end_pm). 없으면 DEFAULT_WORK_SHIFT의 값 */
  readonly workHours?: { readonly startPm: number; readonly endPm: number } | undefined;
  /** 쉼터 계획 일꾼 하나의 피로 바퀴(질문 1095 가, npc/cityRest.ts restCycleOf). 없거나 undefined면 낮·밤 */
  readonly restCycle?: ((worker: WorkerRest) => RestCycle | undefined) | undefined;
  /** NPC 운반꾼 화물(기획 대조 2052·2088, npcCarry.ts)과 지금 시각. 없으면 운반꾼을 알리지 않는다(모습만) */
  readonly carry?: { readonly board: Pick<CarryBoard, "load" | "idle">; readonly nowMs: number } | undefined;
}

/** 운반꾼을 정하면 화물을 싣는다(이미 실었거나 끝난 일은 운반 일이 무시한다) */
const loadOf =
  (carry: NonNullable<HumanPlacesInput["carry"]>) =>
  (key: string, unitId: number): void => {
    carry.board.load(key, unitId, carry.nowMs);
  };

/** 지난번에 넣은 자리(유닛 ID → 모양 글자)와 견줘 바뀐 휴먼만 2차맵에 넣는다. 넣은 수를 돌려준다 */
export function createHumanPlaces(): { sync(input: HumanPlacesInput): number } {
  const placed = new Map<number, string>();
  /** 2차맵 경도(바뀌지 않는다) */
  const longitudes = new Map<number, number>();
  return {
    sync(input) {
      // 도시마다 그 도시 휴먼(그 도시 2차맵에 서 있는 것만 — 다른 2차맵 도시로 옮겨 간 휴먼은 그대로)
      const byCity = new Map<number, number[]>();
      const guards = new Set<number>();
      for (const unit of input.units.values()) {
        if (unit.guard === true) guards.add(unit.id);
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
      const hours = input.workHours ?? DEFAULT_WORK_SHIFT;
      const carry = input.carry;
      const shiftOf = (mapKey: number): WorkShift => {
        let lonDeg = longitudes.get(mapKey);
        if (lonDeg === undefined) {
          lonDeg = mapLongitudeDeg(mapKey);
          longitudes.set(mapKey, lonDeg);
        }
        return { lonDeg, startPm: hours.startPm, endPm: hours.endPm };
      };
      const seen = new Set<number>();
      let changed = 0;
      for (const [cityId, humans] of byCity) {
        const place = input.places.get(cityId);
        const map = place ? input.maps.get(place.mapKey) : undefined;
        if (!place || !map) continue;
        const here = humans.filter((id) => map.unitInfo(id) !== undefined);
        // 보는 사람이 없는 2차맵은 운반 모습 없이(시간 셈만 — D-570 1886)
        const watched = (map.stream?.subscriberCount ?? 0) > 0;
        const facilities = (input.facilitiesOf?.(cityId) ?? []).map((facility) =>
          watched || !facility.haul ? facility : { ...facility, haul: undefined },
        );
        const homes = assignHumanPlaces({
          humans: here.filter((id) => !guards.has(id)),
          guards: here.filter((id) => guards.has(id)),
          home: { x: place.cellX, y: place.cellY },
          facilities,
          areas: areasOf(place.mapKey, map),
          shift: shiftOf(place.mapKey),
          lodgings: (input.lodgingsOf?.(cityId) ?? []).flatMap((id) => {
            const area = areasOf(place.mapKey, map).get(id);
            return area ? [area] : [];
          }),
          rests: input
            .restOf?.(cityId)
            ?.workers.map((worker) =>
              worker.lodgingId === null ? undefined : areasOf(place.mapKey, map).get(worker.lodgingId),
            ),
          cycles: input.restCycle
            ? input.restOf?.(cityId)?.workers.map((worker) => input.restCycle?.(worker))
            : undefined,
          // 보는 2차맵만 운반꾼이 화물을 진다(기획 대조 2052·2088). 보지 않으면 시간 셈(운반꾼 없음)
          ...(watched && carry
            ? { trips: carry.board.idle(cityId, carry.nowMs), onCarrier: loadOf(carry) }
            : {}),
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
