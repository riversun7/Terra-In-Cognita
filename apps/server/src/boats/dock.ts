// 조선소 도크에 든 배(D-559 1523) — docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559".
// 사용자 원문: "항구 정박장과 조선소는 아예 별개라고. 완성되어도 조선소 도크에 있는거고 출고시에 정박을하든 별개라고. 안빼면 도크를 사용하지 못하는거고 배가
// 다른 사람거라면 장기보관료를 청구하고 정산해야 출고가능."
// - 도크에 든 배는 2차맵 유닛이 아니다(유닛 줄이 없다 — 상태 줄 boat_states.yard_id·owner_id만). 그래서 움직임·타기·전투·이동 명령이 닿지 않는다.
//   ID는 세계 유닛 ID를 미리 받아 두고(부팅 때 유닛 ID 셈이 상태 줄 ID도 넘는다 — persist/load.ts), 꺼낼 때 그 ID로 조선소 옆 물에 띄운다.
// - 들이기(admit): 수리를 시작할 때 승객을 내리고 배를 2차맵에서 뺀다. 교역 부두 머묾·오버히트·보직은 지운다. 집 정박장은 그대로(자리를 지킨다).
// - 출고(release): 배 주인(또는 운영자)만. 고치는 중이면 dock_busy. 남의 조선소면 다 된 뒤 보관료 없는 시간이 지나 하루(올림)마다 장기 보관료를 그 조선소 금고에
//   내야 꺼낸다(모자라면 insufficient_funds — 그동안 그 도크는 막힌다). 꺼낸 배는 집이 없으면 집 없는 배다(정박은 따로 — 1485 "생산과 정박은 별개").
// - 조선소가 없어지면(관리자 지움·재배치) 그 도크의 배는 조선소가 섰던 자리 옆 물에 띄운다(보관료 없음). 그 2차맵을 띄우지 않았으면 띄울 때까지 기다린다.
import { type CellPoint, PLACEMENT_SIZE } from "@terra/sim";
import {
  BOAT_SIZE,
  type BoatCommandResult,
  type BoatDeps,
  facilityOf,
  fail,
  findBuilding,
  mapOfUnit,
  ringCells,
  waterSpot,
} from "./core.ts";
import type { Harbor } from "./harbor.ts";
import { storageDue } from "./rules.ts";
import type { Shipyard } from "./shipyard.ts";
import type { BoatState } from "./store.ts";

/** 조선소가 없어졌을 때 배를 띄울 물을 찾는 거리(배치 칸) [임시] */
const LOST_YARD_RING = 24;

export interface Dock {
  /** 수리 때 배를 도크에 넣는다. 실패하면 결과 */
  admit(boatId: number, buildingId: number): BoatCommandResult | null;
  /** 출고(me = 부르는 소유 주체) */
  release(me: number | undefined, boatId: number, operator: boolean): BoatCommandResult;
  /** 지금 꺼내면 낼 장기 보관료(남의 배만) */
  storageOf(state: BoatState, nowMs: number): bigint;
  /** 정시 살피기: 없어진 조선소의 배 띄우기·조선소 자리 채우기. 띄운 수 */
  tick(nowMs: number): number;
}

export function createDock(
  deps: BoatDeps,
  harbor: Harbor,
  shipyard: () => Shipyard,
  /** 승객을 모두 내린다(서비스 내리기 — 내릴 땅이 없으면 실패 코드) */
  disembark: (boatId: number) => BoatCommandResult,
): Dock {
  const { maps, now } = deps;

  const yardOwner = (state: BoatState): number | null | undefined =>
    state.yardId === null ? undefined : findBuilding(maps, state.yardId)?.ownerId;

  const storageOf = (state: BoatState, nowMs: number): bigint => {
    const owner = yardOwner(state);
    if (owner === undefined || owner === null || owner === state.ownerId) return 0n;
    return storageDue(state.yardSinceMs, nowMs, deps.rules().storageFeePerDay, deps.rules());
  };

  /** 배를 그 자리에 띄우고 상태를 2차맵 배로 돌린다 */
  const launch = (state: BoatState, mapKey: number, spot: CellPoint, ownerId: number): boolean => {
    const map = maps.get(mapKey);
    if (!map) return false;
    if (!map.addBoat({ id: state.boatId, ownerId, speed: deps.rules().speed, cellX: spot.x, cellY: spot.y }))
      return false;
    const at = now();
    harbor.settle(state, at, false);
    state.yardId = null;
    state.ownerId = null;
    state.yardSinceMs = null;
    state.hullAtMs = at;
    state.fuelAtMs = at;
    harbor.saveState(state);
    return true;
  };

  return {
    admit(boatId, buildingId) {
      const map = mapOfUnit(maps, boatId);
      const boat = map?.unitInfo(boatId);
      const state = harbor.stateOf(boatId);
      const found = findBuilding(maps, buildingId);
      if (!map || !boat || !state || !found) return fail("unknown_unit");
      if (map.passengers(boatId).length > 0) {
        const left = disembark(boatId);
        if (!left.ok) return left;
      }
      if (!map.removeUnit(boatId)) return fail("internal_error");
      state.ownerId = boat.ownerId;
      state.yardId = buildingId;
      state.yardSinceMs = null;
      state.yardMapKey = found.map.mapKey;
      state.yardX = found.rect.x;
      state.yardY = found.rect.y;
      state.tradeId = null;
      state.tradeUntilMs = null;
      state.tradeChargedToMs = null;
      state.overheat = false;
      state.crew = {};
      harbor.saveState(state);
      return null;
    },
    storageOf,
    release(me, boatId, operator) {
      const state = harbor.states.get(boatId);
      if (!state || state.yardId === null) return fail("not_docked");
      const owner = state.ownerId;
      if (owner === null) return fail("not_docked");
      if (!operator && owner !== me) return fail("forbidden");
      const until = shipyard().repairUntil(boatId);
      if (until !== undefined) return { ok: false, code: "dock_busy", readyAtMs: until };
      const found = findBuilding(maps, state.yardId);
      // 조선소 2차맵을 띄우지 않았다(보는 사람이 없다) — 다시 해 볼 수 있다
      if (!found) return fail("busy");
      const spot = waterSpot(
        found.map,
        found.rect,
        facilityOf(deps.places(), state.yardId)?.def,
        harbor.dockedAt(state.yardId).findIndex((other) => other.boatId === boatId),
      );
      if (!spot) return fail("no_water");
      const at = now();
      const due = operator ? 0n : storageOf(state, at);
      if (due > 0n) {
        if (harbor.balanceOf(owner, state.yardId) < due) return fail("insufficient_funds");
        harbor.charge(owner, found.ownerId, state.yardId, due, "shipyard_storage_fee", at);
      }
      return launch(state, found.map.mapKey, spot, owner) ? { ok: true, boatId } : fail("internal_error");
    },
    tick(nowMs) {
      const places = deps.places();
      if (!places) return 0;
      let launched = 0;
      for (const state of harbor.states.values()) {
        if (state.yardId === null || state.ownerId === null) continue;
        const found = findBuilding(maps, state.yardId);
        if (found && state.yardMapKey === null) {
          state.yardMapKey = found.map.mapKey;
          state.yardX = found.rect.x;
          state.yardY = found.rect.y;
          harbor.saveState(state);
        }
        if (facilityOf(places, state.yardId)) continue;
        // 조선소가 없어졌다: 섰던 자리 옆 물에 띄운다(그 2차맵을 띄웠을 때만, 고치던 작업은 shipyard가 버린다)
        if (state.yardMapKey === null || state.yardX === null || state.yardY === null) continue;
        const map = maps.get(state.yardMapKey);
        if (!map) continue;
        const near = {
          x: Math.min(PLACEMENT_SIZE - 1, state.yardX),
          y: Math.min(PLACEMENT_SIZE - 1, state.yardY),
          width: 1,
          height: 1,
        };
        const spot = ringCells(near, LOST_YARD_RING, BOAT_SIZE, (x, y) =>
          map.isNavigable(x, y, BOAT_SIZE),
        )[0];
        const lostYard = state.yardId;
        if (spot && launch(state, map.mapKey, spot, state.ownerId ?? 0)) {
          launched += 1;
          deps.log.info?.(
            { boatId: state.boatId, yardId: lostYard, at: nowMs },
            "docked boat launched: the shipyard is gone",
          );
        }
      }
      return launched;
    },
  };
}
