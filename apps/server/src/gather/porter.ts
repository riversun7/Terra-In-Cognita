// 채집소 운반꾼 — 질문 1090 가·1092 가·1091 가(기획 정리 D-534 "추천대로"), 기획 43 §7.1(직접 운반 = 유닛이 들고 감, 습격 대상)·§7.3,
// docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12 2차)".
// - 채집소 창고 → 도시 창고 옮김(자동 정시·손으로 [도시 창고로 옮기기])은 보이는 운반꾼이 한다: 그 채집소 일꾼(직무 배치·노동 계약) 가운데 그
//   2차맵에 있고 움직일 수 있는 유닛 하나(물건 주인의 유닛 먼저, 그다음 유닛 ID 차례). 다른 짐을 나르는 유닛·채집 줄이 있는 유닛은 빼낸다.
// - 떠날 때 물건이 채집소 창고에서 운반꾼 화물(위치 = 화물, cargoLocation)로 간다(거래 station_haul_load) — 채집소 창고 자리가 바로 빈다(1092 가).
//   닿는 시각에 운반꾼 화물에 남은 만큼 도시 창고로 넣는다(거래 station_haul). 습격으로 빼앗기면(전투 화물 약탈) 남은 것만 닿는다.
// - 걸리는 시간은 옛 셈 그대로(@terra/sim haulMs: 무게 ÷ 화물 상한 × 왕복 2 × 칸 × 걷기 ms), 나르는 사람은 운반꾼 하나 [임시]. 운반꾼은 그동안 채집소 ↔
//   창고를 오가며 걷고(보이는 모습 — 닿는 시각은 셈이 정한다), 닿으면 채집소로 돌아간다.
// - 바뀜 (기획 D-569 1784 "거래소 반입은 실제 운반만 — 우회 길 없음"): 채집소가 아닌 건물(창고 시설·사업장)의 꺼내기와 사업장 판매(business_buy)도
//   같은 운반꾼이 나른다. 운반꾼 후보 = 그 건물 일꾼(물건 받을 사람의 유닛 먼저) → 받을 사람의 그 2차맵 유닛(ownUnits — 휴먼·사이보그 유닛, 사이보그
//   본체는 빼낸다 [임시]). 판매면 물건은 떠날 때 판 사람의 건물 창고에서 산 사람 몫의 운반꾼 화물로 간다(거래 business_sale_goods).
// - 거래소 넣기(기획 D-564 1628, docs/adr/2026-11-16-exchange-buildings.md): 도시 창고 → 물자 거래소 건물 창고도 같은 운반꾼이 나른다(deliverTo = 그 건물
//   창고). 떠날 때 도시 창고에서 운반꾼 화물로, 닿으면 거래소 건물 창고로 넣는다(같은 거래 이름).
// - 같은 채집소·같은 주인의 짐이 떠난 지 MERGE_MS 안이면 그 짐에 더한다(손으로 옮기기는 물건마다 명령을 보낸다 — 운반꾼 하나가 한 번에 진다).
// - [임시] 나르는 중 상태는 메모리다. 다시 켜면 화물은 운반꾼에 남아 있어 다음 정시에 그 유닛의 화물로 짐을 다시 떠나보낸다(resume).
// 정수 연산만 쓴다.
import { type CellPoint, type SizeClass, anchorAt, anchorCenter, arrivalAt, positionAt } from "@terra/sim";
import { cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import type { Ledger } from "../economy/ledger.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";

/** 손으로 옮기기 명령을 한 짐으로 합치는 시간(ms) */
export const MERGE_MS = 10_000;
/** 나르는 중 운반꾼 걸음을 보는 간격(ms) */
export const PORTER_TICK_MS = 5_000;
/** 채집소·창고 둘레 설 칸 찾는 반경(배치 칸) */
const STAND_CELLS = 14;

/** 짐 하나 */
export interface PorterTrip {
  readonly id: number;
  readonly buildingId: number;
  /** 물건 주인 */
  readonly ownerId: number;
  readonly cityId: number;
  readonly mapKey: number;
  readonly porter: number;
  readonly departAtMs: number;
  arriveAtMs: number;
  grams: bigint;
  /** 자산 → 운반꾼 화물로 실은 양 */
  readonly lines: Map<string, bigint>;
  /** 채집소·창고(없으면 도시 칸) 가운데 */
  readonly from: CellPoint;
  readonly to: CellPoint;
  /** 닿으면 넣는 원장 위치(도시 창고, 거래소 넣기는 그 거래소 건물 창고 — D-564 1628) */
  readonly deliverTo: number;
  /** 다음에 걸어갈 쪽 */
  heading: "store" | "station";
  /** 이동 명령을 기다리는 중 */
  walking: boolean;
}

export interface PorterDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly ledger: Ledger;
  readonly log: { error(obj: object, message: string): void };
  /** 그 채집소 일꾼(유닛 ID·유닛 주인) */
  workersAt(buildingId: number): readonly { readonly unitId: number; readonly workerOwnerId: number }[];
  /** 채집 줄 등 다른 일이 있는 유닛(운반꾼에서 뺀다). 없으면 모두 한가 */
  readonly busy?: ((unitId: number) => boolean) | undefined;
  /** 물건 받을 사람의 그 2차맵 유닛(일꾼 다음 운반꾼 후보, 기획 D-569 1784). 없으면 일꾼만 */
  readonly ownUnits?: ((ownerId: number, mapKey: number) => readonly number[]) | undefined;
}

/** 목표 칸 둘레에서 가장 가까운 설 칸(체비셰프 고리). 없으면 null */
function standNear(map: SecondMap, target: CellPoint, size: SizeClass, from: CellPoint): CellPoint | null {
  for (let ring = 0; ring <= STAND_CELLS; ring++) {
    let best: CellPoint | null = null;
    let bestDistance = 0;
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cell = { x: target.x + dx, y: target.y + dy };
        if (cell.x < 0 || cell.y < 0 || !map.isStandable(cell.x, cell.y, size)) continue;
        const distance = (cell.x - from.x) * (cell.x - from.x) + (cell.y - from.y) * (cell.y - from.y);
        if (!best || distance < bestDistance) {
          best = cell;
          bestDistance = distance;
        }
      }
    if (best) return best;
  }
  return null;
}

export interface Porters {
  /** 나르는 중인 짐(채집소마다 여럿일 수 있다) */
  readonly trips: ReadonlyMap<number, PorterTrip>;
  /** 그 채집소에서 나르는 중인 짐이 있나 */
  busyAt(buildingId: number): boolean;
  /** 그 채집소의 가장 늦게 닿는 짐 */
  latestAt(buildingId: number): PorterTrip | undefined;
  /** 운반꾼으로 쓸 유닛(없으면 undefined) */
  pick(buildingId: number, mapKey: number, ownerId: number, nowMs: number): number | undefined;
  /**
   * 짐을 떠나보낸다: 채집소 창고(stationLocation)의 그 주인 물건 qty를 운반꾼 화물로 싣고 걷기 시작한다. 같은 채집소·주인의 짐이 MERGE_MS 안에
   * 떠났으면 거기에 더하고 닿는 시각을 다시 센다(timeMs(전체 무게)). 실은 짐
   */
  depart(spec: {
    readonly buildingId: number;
    readonly ownerId: number;
    readonly cityId: number;
    readonly mapKey: number;
    readonly porter: number;
    readonly stationLocation: number;
    readonly loads: readonly { readonly asset: string; readonly qty: bigint; readonly grams: bigint }[];
    readonly from: CellPoint;
    readonly to: CellPoint;
    readonly nowMs: number;
    readonly timeMs: (grams: bigint) => number;
    /** 이미 화물에 든 것을 다시 떠나보낸다(다시 켠 뒤) — 원장을 옮기지 않는다 */
    readonly resumed?: boolean | undefined;
    /** 건물 창고에서 물건을 내는 사람(사업장 판매면 판 사람, D-569 1784). 없으면 ownerId */
    readonly sourceOwnerId?: number | undefined;
    /** 닿으면 넣는 원장 위치(없으면 그 도시 창고 — 거래소 넣기는 거래소 건물 창고, docs/adr/2026-11-16-exchange-buildings.md) */
    readonly deliverTo?: number | undefined;
  }): PorterTrip;
  /** 닿은 짐을 도시 창고에 넣는다. 넣은 계정 수 */
  arriveDue(nowMs: number): number;
  /** 나르는 중 운반꾼 걸음(닿은 쪽에서 반대쪽으로) */
  step(nowMs: number): void;
  /** 다음에 깨어날 시각(짐이 없으면 undefined) */
  nextWakeAt(nowMs: number): number | undefined;
}

export function createPorters(deps: PorterDeps): Porters {
  const { maps, ledger } = deps;
  const trips = new Map<number, PorterTrip>();
  let nextId = 1;

  const carrying = (unitId: number): boolean => {
    for (const trip of trips.values()) if (trip.porter === unitId) return true;
    return false;
  };

  const walk = (trip: PorterTrip, nowMs: number): void => {
    const map = maps.get(trip.mapKey);
    const info = map?.unitInfo(trip.porter);
    if (!map || !info || trip.walking) return;
    const here = anchorAt(positionAt(info.motion, nowMs), info.size);
    const target = trip.heading === "store" ? trip.to : trip.from;
    const goal = standNear(map, target, info.size, here);
    if (!goal || (goal.x === here.x && goal.y === here.y)) return;
    trip.walking = true;
    map
      .moveUnit(trip.porter, anchorCenter(goal.x, goal.y, info.size))
      .catch((error: unknown) => {
        deps.log.error({ err: error, unitId: trip.porter }, "porter move failed");
      })
      .finally(() => {
        trip.walking = false;
      });
  };

  /** 닿은 뒤 채집소로 돌려보낸다(짐은 끝났다) */
  const sendBack = (trip: PorterTrip, nowMs: number): void => {
    const map = maps.get(trip.mapKey);
    const info = map?.unitInfo(trip.porter);
    if (!map || !info) return;
    const here = anchorAt(positionAt(info.motion, nowMs), info.size);
    const goal = standNear(map, trip.from, info.size, here);
    if (!goal || (goal.x === here.x && goal.y === here.y)) return;
    map.moveUnit(trip.porter, anchorCenter(goal.x, goal.y, info.size)).catch((error: unknown) => {
      deps.log.error({ err: error, unitId: trip.porter }, "porter return failed");
    });
  };

  const deliver = (trip: PorterTrip): number => {
    const entries: { account: number; amount: bigint }[] = [];
    let count = 0;
    for (const [asset, qty] of [...trip.lines].toSorted((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      const from = ledger.ownerAccount(trip.ownerId, asset, cargoLocation(trip.porter));
      const have = ledger.balance(from);
      const moved = have < qty ? have : qty;
      if (moved <= 0n) continue;
      entries.push(
        { account: from, amount: -moved },
        { account: ledger.ownerAccount(trip.ownerId, asset, trip.deliverTo), amount: moved },
      );
      count += 1;
    }
    if (entries.length > 0) ledger.post({ kind: "station_haul", atMs: trip.arriveAtMs, entries });
    return count;
  };

  return {
    trips,
    busyAt(buildingId) {
      for (const trip of trips.values()) if (trip.buildingId === buildingId) return true;
      return false;
    },
    latestAt(buildingId) {
      let found: PorterTrip | undefined;
      for (const trip of trips.values())
        if (trip.buildingId === buildingId && (!found || trip.arriveAtMs > found.arriveAtMs)) found = trip;
      return found;
    },
    pick(buildingId, mapKey, ownerId, nowMs) {
      const map = maps.get(mapKey);
      if (!map) return undefined;
      const workers = deps
        .workersAt(buildingId)
        .toSorted(
          (a, b) =>
            Number(b.workerOwnerId === ownerId) - Number(a.workerOwnerId === ownerId) || a.unitId - b.unitId,
        )
        .map((worker) => worker.unitId);
      // 일꾼 다음은 받을 사람의 그 2차맵 유닛(D-569 1784 — 창고 시설·일꾼 없는 사업장)
      const own = (deps.ownUnits?.(ownerId, mapKey) ?? []).filter((unitId) => !workers.includes(unitId));
      for (const unitId of [...workers, ...own.toSorted((a, b) => a - b)]) {
        const info = map.unitInfo(unitId);
        if (!info || unavailable(info.condition, nowMs)) continue;
        if (deps.busy?.(unitId) === true) continue;
        // 같은 채집소 짐에 더할 수 있으면 그 운반꾼
        if (carrying(unitId)) {
          const merging = [...trips.values()].some(
            (trip) =>
              trip.porter === unitId &&
              trip.buildingId === buildingId &&
              trip.ownerId === ownerId &&
              nowMs - trip.departAtMs <= MERGE_MS,
          );
          if (!merging) continue;
        }
        return unitId;
      }
      return undefined;
    },
    depart(spec) {
      const entries: { account: number; amount: bigint }[] = [];
      let grams = 0n;
      const lines = new Map<string, bigint>();
      const source = spec.sourceOwnerId ?? spec.ownerId;
      for (const load of spec.loads) {
        if (load.qty <= 0n) continue;
        if (!spec.resumed)
          entries.push(
            {
              account: ledger.ownerAccount(source, load.asset, spec.stationLocation),
              amount: -load.qty,
            },
            {
              account: ledger.ownerAccount(spec.ownerId, load.asset, cargoLocation(spec.porter)),
              amount: load.qty,
            },
          );
        lines.set(load.asset, (lines.get(load.asset) ?? 0n) + load.qty);
        grams += load.grams;
      }
      // 판매(D-569 1781·1784)면 물건이 산 사람에게 넘어가는 거래(장부 물건 칸), 아니면 옮겨 싣기
      if (entries.length > 0)
        ledger.post({
          kind: spec.sourceOwnerId === undefined ? "station_haul_load" : "business_sale_goods",
          atMs: spec.nowMs,
          entries,
        });
      const deliverTo = spec.deliverTo ?? cityLocation(spec.cityId);
      // 같은 채집소·주인·운반꾼·받는 자리의 막 떠난 짐에 더한다
      for (const trip of trips.values()) {
        if (
          trip.buildingId !== spec.buildingId ||
          trip.deliverTo !== deliverTo ||
          trip.ownerId !== spec.ownerId ||
          trip.porter !== spec.porter ||
          spec.nowMs - trip.departAtMs > MERGE_MS
        )
          continue;
        for (const [asset, qty] of lines) trip.lines.set(asset, (trip.lines.get(asset) ?? 0n) + qty);
        trip.grams += grams;
        trip.arriveAtMs = trip.departAtMs + Math.max(1, spec.timeMs(trip.grams));
        return trip;
      }
      const trip: PorterTrip = {
        id: nextId++,
        buildingId: spec.buildingId,
        ownerId: spec.ownerId,
        cityId: spec.cityId,
        mapKey: spec.mapKey,
        porter: spec.porter,
        departAtMs: spec.nowMs,
        arriveAtMs: spec.nowMs + Math.max(1, spec.timeMs(grams)),
        grams,
        lines,
        from: spec.from,
        to: spec.to,
        deliverTo,
        heading: "store",
        walking: false,
      };
      trips.set(trip.id, trip);
      walk(trip, spec.nowMs);
      return trip;
    },
    arriveDue(nowMs) {
      let accounts = 0;
      for (const trip of [...trips.values()].toSorted((a, b) => a.arriveAtMs - b.arriveAtMs || a.id - b.id)) {
        if (trip.arriveAtMs > nowMs) continue;
        trips.delete(trip.id);
        accounts += deliver(trip);
        sendBack(trip, nowMs);
      }
      return accounts;
    },
    step(nowMs) {
      for (const trip of trips.values()) {
        if (trip.walking) continue;
        const map = maps.get(trip.mapKey);
        const info = map?.unitInfo(trip.porter);
        if (!map || !info || nowMs < arrivalAt(info.motion)) continue;
        // 가던 쪽 설 칸에 닿았으면(또는 설 칸이 없으면) 반대쪽으로 — 닿는 시각까지 오간다
        const here = anchorAt(positionAt(info.motion, nowMs), info.size);
        const goal = standNear(map, trip.heading === "store" ? trip.to : trip.from, info.size, here);
        if (!goal || Math.max(Math.abs(here.x - goal.x), Math.abs(here.y - goal.y)) <= 1)
          trip.heading = trip.heading === "store" ? "station" : "store";
        walk(trip, nowMs);
      }
    },
    nextWakeAt(nowMs) {
      if (trips.size === 0) return undefined;
      let next = nowMs + PORTER_TICK_MS;
      for (const trip of trips.values()) if (trip.arriveAtMs < next) next = trip.arriveAtMs;
      return next;
    },
  };
}
