// 항해 명령(연료 보급·오버히트·보직·표류한 배 빼앗기) — 기획 D-559 1529·1533·1534·1537·1540, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559",
// docs/adr/2026-11-15-sea-combat-routes.md "바뀜 (2026-11-15) D-559".
// - 연료 보급(1529 "교역 부두에서 보급"): 교역 부두에 시간을 사고 둘레에 대어 있어야 한다. 통을 채우는 만큼 연료 값(그 항구 나라 화폐)을 부두 금고에 낸다.
// - 오버히트(1540 "연료도 씀", "전투 밖에서도"): 켜면 빠르기가 오르고 연료·내구도를 더 쓴다(셈은 harbor.ts 정시 살피기). 끄면 식는 시간 동안 다시 못 켠다.
//   연료가 없으면 켜지 않는다. 켜고 끌 때 지난 구간을 먼저 셈하고 빠르기를 다시 읽는다(가던 길은 새 빠르기로 이어 간다).
// - 보직(1533 "캡틴함장, 화포수, 엔진실, 갑판병 기본수리"): 배에 탄 내 유닛을 보직에 둔다. 자리 수는 배 종류 함선 칸(함장 1, 없으면 갑판병 1).
// - 빼앗기(1534 "침략 세력이 선장을 앉혀 소유권을 뺐어올수있음"): 표류(내구도 0이나 연료 0)하고 아무도 타지 않은 남의 배에, 내 배에 탄 내 유닛을 함장으로
//   옮겨 앉히면 그 배가 내 것이 된다. 내 배가 붙어 있어야 한다(boat_board_cells). 같은 나라 배는 빼앗지 않는다 [임시]. 승객이 남은 배는 해상 전투(백병전)가
//   생기면 그때(함장 포로·짐 약탈은 전투 고리 — ADR).
import { type CrewPost, postSeats } from "@terra/shared/naval";
import {
  type BoatCommandResult,
  type BoatDeps,
  bodyRect,
  fail,
  findBuilding,
  mapOfUnit,
  rectGap,
} from "./core.ts";
import { type Harbor, harborAccepts } from "./harbor.ts";
import { UNIT_KIND_BOAT } from "../world/unitKinds.ts";

export interface Voyage {
  refuel(me: number | undefined, boatId: number, buildingId: number, operator: boolean): BoatCommandResult;
  overheat(me: number | undefined, boatId: number, on: boolean, operator: boolean): BoatCommandResult;
  crew(
    me: number | undefined,
    boatId: number,
    unitId: number,
    post: CrewPost | null,
    operator: boolean,
  ): BoatCommandResult;
  seize(me: number | undefined, boatId: number, unitId: number, operator: boolean): BoatCommandResult;
}

export function createVoyage(deps: BoatDeps, harbor: Harbor): Voyage {
  const { maps, now } = deps;

  /** 내 2차맵 배와 상태 */
  const mine = (me: number | undefined, boatId: number, operator: boolean) => {
    const map = mapOfUnit(maps, boatId);
    const boat = map?.unitInfo(boatId);
    if (!map || !boat) return fail("unknown_unit");
    if (!operator && boat.ownerId !== me) return fail("forbidden");
    if (boat.kind !== UNIT_KIND_BOAT) return fail("not_boat");
    const state = harbor.stateOf(boatId);
    if (!state) return fail("unknown_unit");
    return { map, boat, state };
  };

  return {
    refuel(me, boatId, buildingId, operator) {
      const found = mine(me, boatId, operator);
      if ("ok" in found) return found;
      const { map, boat, state } = found;
      const dock = findBuilding(maps, buildingId);
      if (!dock) return fail("unknown_building");
      if (dock.map !== map) return fail("wrong_map");
      const open = harborAccepts(deps, buildingId);
      if (open !== "ok") return fail(open);
      const at = now();
      const rules = deps.rules();
      if (
        state.tradeId !== buildingId ||
        (state.tradeUntilMs ?? 0) <= at ||
        !harbor.near(boatId, dock, rules.harborReachCells, at)
      )
        return fail("not_moored");
      harbor.account(state, at);
      const fuel = harbor.fuelOf(state);
      const units = Math.ceil((fuel.tank - fuel.milli) / 1000);
      if (units <= 0) return fail("fuel_full");
      const cost = BigInt(units) * BigInt(Math.max(0, rules.fuelPrice));
      const pays = !operator && dock.ownerId !== null && dock.ownerId !== boat.ownerId && cost > 0n;
      if (pays && harbor.balanceOf(boat.ownerId, buildingId) < cost) return fail("insufficient_funds");
      if (pays) harbor.charge(boat.ownerId, dock.ownerId, buildingId, cost, "boat_fuel", at);
      const wasEmpty = harbor.fuelEmpty(state);
      state.fuelMilli = fuel.tank;
      state.fuelAtMs = at;
      harbor.saveState(state);
      if (wasEmpty) map.refreshSpeed(boatId);
      return { ok: true };
    },
    overheat(me, boatId, on, operator) {
      const found = mine(me, boatId, operator);
      if ("ok" in found) return found;
      const { map, state } = found;
      const at = now();
      if (state.overheat === on) return { ok: true };
      harbor.account(state, at);
      if (on) {
        if ((state.coolUntilMs ?? 0) > at)
          return { ok: false, code: "cooling", readyAtMs: state.coolUntilMs ?? at };
        if (harbor.fuelEmpty(state)) return fail("fuel_empty");
        state.overheat = true;
      } else {
        state.overheat = false;
        state.coolUntilMs = at + Math.max(0, deps.rules().overheatCoolMin) * 60_000;
      }
      harbor.saveState(state);
      map.refreshSpeed(boatId);
      return { ok: true };
    },
    crew(me, boatId, unitId, post, operator) {
      const found = mine(me, boatId, operator);
      if ("ok" in found) return found;
      const { map, state } = found;
      const unit = map.unitInfo(unitId);
      if (!unit || unit.aboard !== boatId) return fail("not_aboard");
      if (!operator && unit.ownerId !== me) return fail("forbidden");
      const aboard = new Set(map.passengers(boatId));
      // 내린 유닛의 보직은 지운다
      for (const id of Object.keys(state.crew).map(Number)) if (!aboard.has(id)) delete state.crew[id];
      if (post === null) delete state.crew[unitId];
      else {
        const seats = postSeats(harbor.typeOf(state)?.naval, post);
        const taken = Object.entries(state.crew).filter(
          ([id, value]) => value === post && Number(id) !== unitId,
        ).length;
        if (taken >= seats) return fail("post_full");
        state.crew[unitId] = post;
      }
      harbor.saveState(state);
      return { ok: true };
    },
    seize(me, boatId, unitId, operator) {
      const map = mapOfUnit(maps, boatId);
      const target = map?.unitInfo(boatId);
      if (!map || !target) return fail("unknown_unit");
      if (target.kind !== UNIT_KIND_BOAT) return fail("not_boat");
      const unit = map.unitInfo(unitId);
      if (!unit) return fail("unknown_unit");
      if (!operator && unit.ownerId !== me) return fail("forbidden");
      const owner = unit.ownerId;
      if (target.ownerId === owner) return fail("own_boat");
      const rideId = unit.aboard;
      const ride = rideId === undefined ? undefined : map.unitInfo(rideId);
      if (rideId === undefined || !ride || ride.kind !== UNIT_KIND_BOAT || ride.ownerId !== owner)
        return fail("not_aboard");
      const at = now();
      const a = bodyRect(map, rideId, at);
      const b = bodyRect(map, boatId, at);
      if (!a || !b || rectGap(a, b) > deps.rules().boardCells) return fail("no_path");
      const state = harbor.stateOf(boatId);
      if (!state) return fail("unknown_unit");
      harbor.account(state, at);
      if (harbor.hullOf(state, at) > 0 && !harbor.fuelEmpty(state)) return fail("not_drifting");
      if (map.passengers(boatId).length > 0) return fail("boat_full");
      const mineNation = deps.nationOf?.(owner);
      if (!operator && mineNation !== undefined && mineNation === deps.nationOf?.(target.ownerId))
        return fail("forbidden");
      if (!map.board(unitId, boatId)) return fail("internal_error");
      map.setOwner(boatId, owner);
      state.homeId = null;
      state.feePaidToMs = null;
      state.arrears = 0;
      state.tradeId = null;
      state.tradeUntilMs = null;
      state.tradeChargedToMs = null;
      state.overheat = false;
      state.crew = { [unitId]: "captain" };
      harbor.saveState(state);
      deps.log.info?.({ boatId, from: target.ownerId, to: owner, captain: unitId }, "drifting boat seized");
      return { ok: true, boatId };
    },
  };
}
