// 배 서비스 — 조선소에서 만들기·고치기, 정박장(집)·교역 부두, 타기·내리기(docs/adr/2026-11-13-boats.md 3·4절, docs/adr/2026-11-15-shipyard-harbor.md).
// - 판정(소유·거리·자리·재료·받기 범위)은 여기서 하고, 칸·움직임은 2차맵(addBoat·board·disembark·moveUnit)이 한다. 기기는 건물·유닛·배 번호만 보낸다(서버 권위).
// - 조선소 작업은 shipyard.ts, 배 상태·정박장·교역 부두·정박료는 harbor.ts, 셈은 rules.ts.
// - 수리·집 정박장·교역 부두: 배가 그 시설 둘레에 없으면 그리로 보낸 뒤(물 길) 도착 때 다시 보고 한다(타러 걷기와 같은 틀, 메모리에만 — 다시 켜면 간 자리에 선다).
//   집 정박장은 자리를 바로 잡고 배를 보낸다(유닛 주거처럼 — 자리는 배가 떠나 있어도 지킨다). 교역 부두 요금은 바로 낸다(산 시간은 그때부터).
// - 타기: 유닛 몸과 배 몸 사이가 boat_board_cells 안이면 바로 탄다. 멀면 배 둘레 땅 칸으로 걸어가고 도착 때 다시 보고 탄다.
// - 내리기: 배가 움직이면 그 자리에 세우고 승객마다 배 둘레 boat_board_cells 안 가장 가까운 땅 칸에 내린다(가까운 칸부터 나눠 준다).
// - 자리 수·빠르기는 배 종류(조선소 boats 칸 — D-547 1484), 내구도 0이면 아주 느리게(1495).
// D-559(docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559"): 다 된 배는 도크에 들고 출고(release)해야 뜬다(dock.ts), 남의 조선소도 받기 범위 안이면
// 고친다(수리 요금은 그 조선소 금고), 조선소 모듈 묶음(레벨마다 하나 더), 요금은 그 항구 나라 화폐. 연료·오버히트·보직·빼앗기 명령은 voyage.ts.
import { boatPriceItem } from "@terra/shared/harbor";
import {
  HARBOR_FEE_MAX,
  type HarborAccess,
  type HarborPanel,
  type ShipyardModule,
  modulesValid,
  shipyardModuleSlots,
} from "@terra/shared/harbor";
import { type CellPoint, type SizeClass, anchorAt, anchorCenter, arrivalAt, positionAt } from "@terra/sim";
import type { BoatResultCode } from "@terra/protocol";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import {
  UNIT_KIND_BOAT,
  UNIT_KIND_BOT,
  UNIT_KIND_GUARDIAN,
  UNIT_KIND_NPC_LEADER,
} from "../world/unitKinds.ts";
import {
  ARRIVAL_SLACK_MS,
  BOAT_SIZE,
  type BoatCommandResult,
  type BoatDeps,
  MAX_TIMER_MS,
  bodyRect,
  facilityOf,
  fail,
  findBuilding,
  mapOfUnit,
  rectGap,
  ringCells,
  waterSpot,
} from "./core.ts";
import type { BoatCatch } from "../gather/boatCrew.ts";
import { createCargo } from "./cargo.ts";
import { createBoatGear } from "./gear.ts";
import { portView } from "./portView.ts";
import { createDock } from "./dock.ts";
import { holdCapGrams, holdGramsOf } from "./hold.ts";
import { HARBOR_TICK_MS, type HarborTick, createHarbor, harborAccepts } from "./harbor.ts";
import {
  HOUR_MS,
  berthCapacity,
  boatSpeedPm,
  boatBuildMs,
  boatCost,
  boatTypesOf,
  harborOpen,
  isBerth,
  isShipyard,
  isTradeDock,
  moduleUnlocked,
  shipyardDocks,
  tradeSlots,
} from "./rules.ts";
import { createShipyard } from "./shipyard.ts";
import { boatJobWriter } from "./store.ts";
import { type Voyage, createVoyage } from "./voyage.ts";

export { type BoatCommandResult, type BoatDeps, rectGap, ringCells } from "./core.ts";

/** 배 시설 판 원본(건물 판 조회가 보는 사람에 맞춰 own·mine·cash를 거른다 — gather/reads.ts) */
export interface HarborPanelSource
  extends Omit<HarborPanel, "jobs" | "boats" | "visits" | "mine" | "cash" | "docked"> {
  readonly ownerId: number | null;
  readonly docked: readonly (Omit<HarborPanel["docked"][number], "own"> & { readonly ownerId: number })[];
  readonly jobs: readonly (Omit<HarborPanel["jobs"][number], "own"> & { readonly ownerId: number })[];
  readonly boats: readonly (Omit<HarborPanel["boats"][number], "own"> & { readonly ownerId: number })[];
  readonly visits: readonly (Omit<HarborPanel["visits"][number], "own"> & { readonly ownerId: number })[];
  /** 같은 2차맵의 배(보는 사람의 것만 남긴다) */
  readonly nearby: readonly (Omit<HarborPanel["mine"][number], "own"> & { readonly ownerId: number })[];
  readonly cash: string;
  /** 옛 부두 판 칸(만드는 중인 첫 작업 — gather 판 boatJob) */
  readonly startedAtMs?: number;
  readonly readyAtMs?: number;
}

/** 배 한 척의 표시 정보(지도 유닛 목록) */
export interface BoatInfo {
  readonly typeId: string;
  readonly capacity: number;
  /** 내구도(‰, 내림) */
  readonly hullPm: number;
  readonly homeId: number | null;
  readonly tradeUntil: number | null;
  /** 연료(‰, 내림 — D-559 1529)·오버히트·표류(내구도 0이나 연료 0)·함장 유닛 */
  readonly fuelPm: number;
  readonly overheat: boolean;
  readonly drifting: boolean;
  readonly captain: number | null;
  /** 배 창고 상한(g, D-568 — 배 종류 holdKg, 없으면 설정 칸) */
  readonly holdCapGrams: number;
}

/** 배 시설 주인 설정 바꾸기 */
export interface HarborPolicyChange {
  readonly access?: HarborAccess | undefined;
  readonly fee?: number | undefined;
  readonly module?: ShipyardModule | null | undefined;
  /** 조선소 모듈 묶음(D-559 1521 — 있으면 module보다 앞선다) */
  readonly modules?: readonly ShipyardModule[] | undefined;
}

export interface BoatService {
  /** 만들기(남의 조선소면 받기 범위를 본 뒤 외주 주문 — D-564 1682) */
  build(userId: string, buildingId: number, operator: boolean, typeId?: string): Promise<BoatCommandResult>;
  repair(userId: string, boatId: number, buildingId: number, operator: boolean): Promise<BoatCommandResult>;
  berth(
    userId: string,
    boatId: number,
    buildingId: number | null,
    operator: boolean,
  ): Promise<BoatCommandResult>;
  dockTime(
    userId: string,
    boatId: number,
    buildingId: number,
    hours: number,
    operator: boolean,
  ): Promise<BoatCommandResult>;
  policy(
    userId: string,
    buildingId: number,
    change: HarborPolicyChange,
    operator: boolean,
  ): BoatCommandResult;
  /** 도크의 배 꺼내기(D-559 1523 — 남의 조선소면 장기 보관료 정산) */
  release(userId: string, boatId: number, operator: boolean): BoatCommandResult;
  releaseAs(ownerId: number, boatId: number): BoatCommandResult;
  /** 연료·오버히트·보직·빼앗기(voyage.ts — 소유 주체로 부른다) */
  readonly voyage: Voyage;
  /** 배 창고 내리기(cargo.ts — D-568, 소유 주체로 부른다) */
  unload(me: number | undefined, boatId: number, buildingId: number, operator: boolean): BoatCommandResult;
  /** 배 창고 싣기(cargo.ts — D-570 1823, 소유 주체로 부른다) */
  load(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    item: string,
    lots: number,
    operator: boolean,
  ): BoatCommandResult;
  /** 함포 칸 포획 장비 달기·떼기(gear.ts — D-570 1821, 소유 주체로 부른다) */
  gear(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    slot: number,
    item: string | null,
    operator: boolean,
  ): BoatCommandResult;
  /** 배 채집 일꾼(gear.ts — 채집 서비스가 배 고리로 읽는다) */
  catchCrew(boatId: number): BoatCatch | undefined;
  /** 사용자 → 소유 주체 */
  ownerOf(userId: string): number | undefined;
  /** 배 시설 판 원본(배 시설이 아니면 undefined). 이름은 옛 부두 판 고리(app.ts → gather/reads.ts)를 그대로 쓰려고 둔다 */
  dockJob(buildingId: number): HarborPanelSource | undefined;
  /** 배 표시 정보(배가 아니면 undefined) */
  info(boatId: number): BoatInfo | undefined;
  /** 배 빠르기 배율(‰, 이동을 시작할 때 — world/walkSpeed.ts) */
  speedPm(boatId: number): number;
  /** 만드는·고치는 작업 수 */
  readonly building: number;
  board(userId: string, unitId: number, boatId: number, operator: boolean): Promise<BoatCommandResult>;
  leave(userId: string, boatId: number, operator: boolean): BoatCommandResult;
  /** 서버가 시키는 배 명령(NPC 배 — npcFleet.ts, 기획 D-547 1497 "플레이어와 같은 규칙"). 소유 주체로 직접, 타기는 NPC 휴먼(봇)도 */
  buildAs(ownerId: number, buildingId: number, typeId?: string): BoatCommandResult;
  boardAs(ownerId: number, unitId: number, boatId: number): Promise<BoatCommandResult>;
  leaveAs(ownerId: number, boatId: number): BoatCommandResult;
  berthAs(ownerId: number, boatId: number, buildingId: number | null): Promise<BoatCommandResult>;
  repairAs(ownerId: number, boatId: number, buildingId: number): Promise<BoatCommandResult>;
  /** 그 시설 둘레에서 배가 설 물 칸(index번째). 없으면 undefined */
  launchSpotOf(buildingId: number, index?: number): CellPoint | undefined;
  /** 정시 살피기(타이머가 부른다. 시험은 바로 부른다) */
  tick(nowMs?: number): Promise<HarborTick>;
  /** 운반꾼을 기다리는 내리기·싣기 줄 수(cargo.ts — 질문 2212) */
  cargoWaiting(): number;
  stop(): void;
}

export function createBoatService(deps: BoatDeps): BoatService {
  const { maps, now } = deps;
  /** 걸어가서 탈 유닛 → 확인 타이머(새 명령이 오면 버린다) */
  const walks = new Map<number, ReturnType<typeof setTimeout>>();
  /** 시설로 가는 배 → 도착 확인 타이머 */
  const sails = new Map<number, ReturnType<typeof setTimeout>>();
  const store = boatJobWriter(deps.writer, deps.planetId ?? "");
  // 조선소·상태·도크는 서로를 본다(수리 중이면 닳지 않음 · 도크에 든 배의 상태 · 수리 때 도크에 넣기)
  const shipyard = createShipyard(
    deps,
    store,
    () => harbor,
    () => ({ admit: (b, y) => dock.admit(b, y) }),
  );
  const harbor = createHarbor(deps, store, (boatId) => shipyard.repairing(boatId));
  const dock = createDock(
    deps,
    harbor,
    () => shipyard,
    (boatId) => leaveFor(undefined, boatId, true),
  );
  const voyage = createVoyage(deps, harbor);
  const cargo = createCargo(deps, harbor);
  const gear = createBoatGear(deps, harbor);
  let stopped = false;
  let ticking = false;
  const timer = deps.manual
    ? undefined
    : setInterval(() => {
        if (ticking) return;
        ticking = true;
        void harbor
          .tick(now())
          .then((result) => {
            dock.tick(now());
            cargo.retry(now());
            return result;
          })
          .catch((error: unknown) => deps.log.error({ err: error }, "harbor tick failed"))
          .finally(() => {
            ticking = false;
          });
      }, HARBOR_TICK_MS);
  timer?.unref?.();

  const cancelWalk = (unitId: number): void => {
    const pending = walks.get(unitId);
    if (pending !== undefined) clearTimeout(pending);
    walks.delete(unitId);
  };
  const cancelSail = (boatId: number): void => {
    const pending = sails.get(boatId);
    if (pending !== undefined) clearTimeout(pending);
    sails.delete(boatId);
  };

  /** 배 자리 수(종류, 모르면 설정 칸 boat_capacity) */
  const capacityOf = (boatId: number): number =>
    harbor.typeOf(harbor.stateOf(boatId))?.capacity ?? deps.rules().capacity;

  /** 타기 조건(거리 빼고). null이면 된다 */
  const boardProblem = (
    map: SecondMap,
    unitId: number,
    boatId: number,
    me: number | undefined,
    operator: boolean,
    bots = false,
  ): BoatResultCode | null => {
    const unit = map.unitInfo(unitId);
    const boat = map.unitInfo(boatId);
    if (!unit) return "unknown_unit";
    if (!boat) return mapOfUnit(maps, boatId) ? "wrong_map" : "unknown_unit";
    if (!operator && (unit.ownerId !== me || boat.ownerId !== me)) return "forbidden";
    if (boat.kind !== UNIT_KIND_BOAT) return "not_boat";
    if (unit.aboard !== undefined) return "already_aboard";
    if (
      unit.kind === UNIT_KIND_BOAT ||
      (unit.kind === UNIT_KIND_BOT && !bots) ||
      unit.kind === UNIT_KIND_GUARDIAN ||
      unit.kind === UNIT_KIND_NPC_LEADER ||
      unavailable(unit.condition, now()) ||
      deps.unitBusy(unitId)
    )
      return "unavailable";
    if (map.passengers(boatId).length >= capacityOf(boatId)) return "boat_full";
    return null;
  };

  /** 지금 닿으면 태운다. 탔으면 true */
  const boardIfNear = (map: SecondMap, unitId: number, boatId: number): boolean => {
    const at = now();
    const unitRect = bodyRect(map, unitId, at);
    const boatRect = bodyRect(map, boatId, at);
    if (!unitRect || !boatRect || rectGap(unitRect, boatRect) > deps.rules().boardCells) return false;
    return map.board(unitId, boatId);
  };

  /** 내 배인가(운영자는 아무 배나). 맞으면 [2차맵, 배 주인] */
  const myBoat = (
    me: number | undefined,
    boatId: number,
    operator: boolean,
  ): { readonly map: SecondMap; readonly ownerId: number } | BoatResultCode => {
    const map = mapOfUnit(maps, boatId);
    const boat = map?.unitInfo(boatId);
    if (!map || !boat) return "unknown_unit";
    if (!operator && boat.ownerId !== me) return "forbidden";
    if (boat.kind !== UNIT_KIND_BOAT) return "not_boat";
    return { map, ownerId: boat.ownerId };
  };

  /**
   * 배를 그 시설 둘레 물 칸(index번째)으로 보내고 도착 때 then을 부른다. 이미 reach 안이면 바로 부른다. "near" | "sailing" | 실패 코드
   */
  const sailThen = async (
    map: SecondMap,
    boatId: number,
    buildingId: number,
    reach: number,
    index: number,
    then: () => void,
  ): Promise<"near" | "sailing" | BoatResultCode> => {
    const found = findBuilding(maps, buildingId);
    if (!found || found.map !== map) return "wrong_map";
    cancelSail(boatId);
    if (harbor.near(boatId, found, reach, now())) {
      then();
      return "near";
    }
    const spot = waterSpot(map, found.rect, facilityOf(deps.places(), buildingId)?.def, index);
    if (!spot) return "no_water";
    const moved = await map.moveUnit(boatId, anchorCenter(spot.x, spot.y, BOAT_SIZE));
    if (!moved.ok) return moved.code === "busy" ? "busy" : "no_path";
    const motion = map.unitInfo(boatId)?.motion;
    if (!motion) return "unknown_unit";
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, arrivalAt(motion) - now()) + ARRIVAL_SLACK_MS);
    const pending = setTimeout(() => {
      sails.delete(boatId);
      // 그사이 다른 명령으로 움직임이 바뀌었으면 하지 않는다
      if (stopped || map.unitInfo(boatId)?.motion !== motion) return;
      then();
    }, delay);
    pending.unref?.();
    sails.set(boatId, pending);
    return "sailing";
  };

  // ---------- 명령 ----------

  async function repairFor(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    operator: boolean,
  ): Promise<BoatCommandResult> {
    const boat = myBoat(me, boatId, operator);
    if (typeof boat === "string") return fail(boat);
    // 남의 조선소는 받기 범위 안이면(D-559 1522) — 재료·돈을 보기 전에
    const yard = findBuilding(maps, buildingId);
    const yardRole = facilityOf(deps.places(), buildingId)?.def;
    if (
      !operator &&
      yard &&
      isShipyard(yardRole) &&
      !(await harbor.admits(buildingId, yard.ownerId, boat.ownerId))
    )
      return fail("berth_denied");
    const problem = shipyard.repairProblem(me, boatId, buildingId, operator);
    if (problem) return problem;
    let started: BoatCommandResult | undefined;
    const sailed = await sailThen(boat.map, boatId, buildingId, deps.rules().shipyardReachCells, 0, () => {
      started = shipyard.startRepair(me, boatId, buildingId, operator);
      if (!started.ok)
        deps.log.error({ boatId, buildingId, code: started.code }, "boat repair not started on arrival");
    });
    if (sailed === "near") return started ?? fail("internal_error");
    if (sailed === "sailing") return { ok: true, walking: true };
    return fail(sailed);
  }

  async function berthFor(
    me: number | undefined,
    boatId: number,
    buildingId: number | null,
    operator: boolean,
  ): Promise<BoatCommandResult> {
    const boat = myBoat(me, boatId, operator);
    if (typeof boat === "string") return fail(boat);
    const state = harbor.stateOf(boatId);
    if (!state) return fail("unknown_unit");
    const at = now();
    if (buildingId === null) {
      // 집 비우기
      harbor.settle(state, at, true);
      state.homeId = null;
      state.feePaidToMs = null;
      state.arrears = 0;
      harbor.saveState(state);
      return { ok: true };
    }
    const found = findBuilding(maps, buildingId);
    if (!found) return fail("unknown_building");
    const fac = facilityOf(deps.places(), buildingId);
    if (!fac || !isBerth(fac.def)) return fail("not_berth");
    if (found.map !== boat.map) return fail("wrong_map");
    if (state.homeId !== buildingId) {
      const open = harborAccepts(deps, buildingId);
      if (open !== "ok") return fail(open);
      if (!operator && !(await harbor.admits(buildingId, found.ownerId, boat.ownerId)))
        return fail("berth_denied");
      const homed = harbor.homedAt(buildingId).filter((other) => other.boatId !== boatId);
      if (homed.length >= berthCapacity(fac.record.level, deps.rules())) return fail("no_berth");
      harbor.settle(state, at, true);
      state.homeId = buildingId;
      state.feePaidToMs = found.ownerId !== null && found.ownerId !== boat.ownerId ? at : null;
      state.arrears = 0;
      harbor.saveState(state);
    }
    // 정박장 옆 자리: 그 정박장에 든 배 차례(겹쳐도 된다)
    const slot = Math.max(
      0,
      harbor.homedAt(buildingId).findIndex((other) => other.boatId === boatId),
    );
    const sailed = await sailThen(boat.map, boatId, buildingId, deps.rules().harborReachCells, slot, () => {
      harbor.settle(state, now(), true);
    });
    if (sailed === "near") return { ok: true };
    if (sailed === "sailing") return { ok: true, walking: true };
    // 자리는 잡았다(배를 보내지 못했을 뿐) — 주인이 몰고 오면 정박 중이 된다
    return { ok: true };
  }

  async function dockTimeFor(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    hours: number,
    operator: boolean,
  ): Promise<BoatCommandResult> {
    const boat = myBoat(me, boatId, operator);
    if (typeof boat === "string") return fail(boat);
    const state = harbor.stateOf(boatId);
    if (!state) return fail("unknown_unit");
    const found = findBuilding(maps, buildingId);
    if (!found) return fail("unknown_building");
    const fac = facilityOf(deps.places(), buildingId);
    if (!fac || !isTradeDock(fac.def)) return fail("not_trade_dock");
    if (found.map !== boat.map) return fail("wrong_map");
    const rules = deps.rules();
    if (!Number.isInteger(hours) || hours < 1 || hours > Math.max(1, rules.tradeMaxHours))
      return fail("invalid_policy");
    const open = harborAccepts(deps, buildingId);
    if (open !== "ok") return fail(open);
    if (!operator && !(await harbor.admits(buildingId, found.ownerId, boat.ownerId)))
      return fail("berth_denied");
    const at = now();
    const staying = harbor
      .visitingAt(buildingId, at)
      .filter((other) => other.boatId !== boatId && (other.tradeUntilMs ?? 0) > at);
    if (staying.length >= tradeSlots(fac.record.level, rules)) return fail("trade_full");
    const fee = BigInt(Math.max(0, harbor.facility(buildingId, found.ownerId).fee)) * BigInt(hours);
    // 제 교역 부두도 요금을 낸다(D-555 1514 — 그 사업장 금고로)
    const pays = found.ownerId !== null && fee > 0n && !operator;
    if (pays && harbor.balanceOf(boat.ownerId, buildingId) < fee) return fail("insufficient_funds");
    if (pays) harbor.charge(boat.ownerId, found.ownerId, buildingId, fee, "dock_time_fee", at);
    const base =
      state.tradeId === buildingId && (state.tradeUntilMs ?? 0) > at ? (state.tradeUntilMs ?? at) : at;
    state.tradeId = buildingId;
    state.tradeUntilMs = base + hours * HOUR_MS;
    state.tradeChargedToMs = state.tradeUntilMs;
    harbor.saveState(state);
    const sailed = await sailThen(
      boat.map,
      boatId,
      buildingId,
      rules.harborReachCells,
      staying.length,
      () => undefined,
    );
    return sailed === "sailing" ? { ok: true, walking: true } : { ok: true };
  }

  function policyFor(
    me: number | undefined,
    buildingId: number,
    change: HarborPolicyChange,
    operator: boolean,
  ): BoatCommandResult {
    const found = findBuilding(maps, buildingId);
    if (!found) return fail("unknown_building");
    if (!operator && (me === undefined || found.ownerId !== me)) return fail("forbidden");
    const fac = facilityOf(deps.places(), buildingId);
    if (!fac?.def.harbor) return fail("not_dock");
    const row = { ...harbor.facility(buildingId, found.ownerId) };
    if (change.modules !== undefined || change.module !== undefined) {
      if (!isShipyard(fac.def)) return fail("invalid_policy");
      // 옛 판 기기의 module 하나 = 첫 자리(나머지 자리는 그대로)
      const next =
        change.modules !== undefined
          ? [...change.modules]
          : change.module === null
            ? row.modules.slice(1)
            : change.module === undefined
              ? row.modules
              : [change.module, ...row.modules.slice(1)];
      if (next.length > 0 && !moduleUnlocked(fac.record.level)) return fail("module_locked");
      if (!modulesValid(next, fac.record.level)) return fail("invalid_policy");
      row.modules = next;
      row.module = next[0] ?? null;
    }
    if (change.access !== undefined || change.fee !== undefined) {
      // 조선소도 받기 범위·남의 배 수리 요금을 둔다(D-559 1522)
      if (change.access !== undefined) row.access = change.access;
      if (change.fee !== undefined) {
        if (!Number.isInteger(change.fee) || change.fee < 0 || change.fee > HARBOR_FEE_MAX)
          return fail("invalid_policy");
        row.fee = change.fee;
      }
    }
    harbor.saveFacility(row);
    return { ok: true };
  }

  /** 타기(bots = NPC 휴먼(봇)도 태운다 — NPC 배 어부, npcFleet.ts) */
  async function boardFor(
    me: number | undefined,
    unitId: number,
    boatId: number,
    operator: boolean,
    bots: boolean,
  ): Promise<BoatCommandResult> {
    const map = mapOfUnit(maps, unitId);
    if (!map) return fail("unknown_unit");
    const problem = boardProblem(map, unitId, boatId, me, operator, bots);
    if (problem) return fail(problem);
    cancelWalk(unitId);
    if (boardIfNear(map, unitId, boatId)) return { ok: true };
    // 멀다: 배 둘레 땅 칸(유닛에서 가까운 것)으로 걸어간 뒤 도착 때 다시 본다
    const at = now();
    const boatRect = bodyRect(map, boatId, at);
    const unit = map.unitInfo(unitId);
    if (!boatRect || !unit) return fail("unknown_unit");
    const from = anchorAt(positionAt(unit.motion, at), unit.size);
    const shore = ringCells(
      boatRect,
      deps.rules().boardCells,
      unit.size,
      (x, y) => map.isStandable(x, y, unit.size),
      64,
    ).toSorted((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
    const target = shore[0];
    if (!target) return fail("no_path");
    const moved = await map.moveUnit(unitId, anchorCenter(target.x, target.y, unit.size));
    if (!moved.ok) return fail(moved.code === "busy" ? "busy" : "no_path");
    const motion = map.unitInfo(unitId)?.motion;
    if (!motion) return fail("unknown_unit");
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, arrivalAt(motion) - now()) + ARRIVAL_SLACK_MS);
    const pending = setTimeout(() => {
      walks.delete(unitId);
      // 그사이 다른 명령으로 움직임이 바뀌었으면 타지 않는다
      if (map.unitInfo(unitId)?.motion !== motion) return;
      if (boardProblem(map, unitId, boatId, me, operator, bots) !== null) return;
      boardIfNear(map, unitId, boatId);
    }, delay);
    pending.unref?.();
    walks.set(unitId, pending);
    return { ok: true, walking: true };
  }

  /** 내리기 */
  function leaveFor(me: number | undefined, boatId: number, operator: boolean): BoatCommandResult {
    const map = mapOfUnit(maps, boatId);
    if (!map) return fail("unknown_unit");
    const boat = map.unitInfo(boatId);
    if (!boat) return fail("unknown_unit");
    if (!operator && boat.ownerId !== me) return fail("forbidden");
    if (boat.kind !== UNIT_KIND_BOAT) return fail("not_boat");
    const riders = map.passengers(boatId);
    if (riders.length === 0) return fail("empty");
    // 움직이면 그 자리에 세운다(승객도 같이 선다)
    if (now() < arrivalAt(boat.motion)) map.halt(boatId);
    const boatRect = bodyRect(map, boatId, now());
    if (!boatRect) return fail("unknown_unit");
    // 몸 크기마다 내릴 땅 칸(가까운 칸부터 승객에게 나눠 준다 — 유닛끼리는 막지 않으니 모자라면 겹친다)
    const shores = new Map<SizeClass, CellPoint[]>();
    const shoreFor = (size: SizeClass): CellPoint[] => {
      let cells = shores.get(size);
      if (!cells) {
        const fits = (x: number, y: number): boolean => map.isStandable(x, y, size);
        cells = ringCells(boatRect, deps.rules().boardCells, size, fits, riders.length);
        shores.set(size, cells);
      }
      return cells;
    };
    const plan = riders.map((riderId, index) => {
      const cells = shoreFor(map.unitInfo(riderId)?.size ?? 1);
      return { riderId, cell: cells[index % Math.max(1, cells.length)] };
    });
    if (plan.some((step) => step.cell === undefined)) return fail("no_shore");
    for (const { riderId, cell } of plan) if (cell) map.disembark(riderId, cell.x, cell.y);
    return { ok: true };
  }

  /** 배 시설 판 원본 */
  function panelOf(buildingId: number): HarborPanelSource | undefined {
    const found = findBuilding(maps, buildingId);
    const fac = facilityOf(deps.places(), buildingId);
    const role = fac?.def.harbor;
    if (!found || !fac || !role) return undefined;
    const rules = deps.rules();
    const at = now();
    const row = harbor.facility(buildingId, found.ownerId);
    const boatView = (boatId: number) => {
      const state = harbor.stateOf(boatId);
      return {
        boatId,
        ownerId: found.map.unitInfo(boatId)?.ownerId ?? -1,
        typeId: state?.typeId ?? "",
        hullPm: state ? Math.floor(harbor.hullOf(state, at) / 1000) : 0,
        homeId: state?.homeId ?? null,
      };
    };
    const jobs = shipyard.jobsAt(buildingId);
    const homed = isBerth(fac.def) ? harbor.homedAt(buildingId) : [];
    const visits = isTradeDock(fac.def) ? harbor.visitingAt(buildingId, at) : [];
    const nearby: number[] = [];
    found.map.forEachUnit((unit) => {
      if (unit.kind === UNIT_KIND_BOAT) nearby.push(unit.id);
    });
    const owners = new Map(nearby.map((boatId) => [boatId, found.map.unitInfo(boatId)?.ownerId ?? -1]));
    const holds = holdGramsOf(deps.ledger, deps.places()?.catalog(), owners);
    // 항구 칸(D-570 — 항구 옆 거래소·함포 칸 장비·실을 물건, portView.ts)
    const port = portView(
      deps,
      harbor,
      found,
      fac.record,
      [...owners].map(([boatId, ownerId]) => ({ boatId, ownerId })),
    );
    const level = fac.record.level;
    const docked = isShipyard(fac.def) ? harbor.dockedAt(buildingId) : [];
    const capacity = isShipyard(fac.def)
      ? shipyardDocks(level, row.modules, rules)
      : isBerth(fac.def)
        ? berthCapacity(level, rules)
        : tradeSlots(level, rules);
    const used = isShipyard(fac.def)
      ? shipyard.occupied(buildingId)
      : isBerth(fac.def)
        ? homed.length
        : visits.filter((state) => (state.tradeUntilMs ?? 0) > at).length;
    const first = jobs.find((job) => job.kind === "build");
    const typeViews = (fac.def.boats ?? []).map((type) => {
      const cost = boatCost(type, rules.costPm);
      const buildMs = boatBuildMs(type, rules, row.modules, false);
      // 배 주문 적정가(D-570 1822): 재료 기준 값 합 + 조선소 일꾼 인건비 × 만드는 시간 + 수수료 + 세금
      const catalog = deps.places()?.catalog();
      let worth = 0n;
      for (const stack of cost) worth += BigInt(stack.qty) * (catalog?.unitPriceOf?.(stack.item) ?? 1n);
      const fair = deps.fairOf?.(buildingId, worth, buildMs);
      const set = deps.business?.price?.(buildingId, boatPriceItem(type.id));
      return {
        id: type.id,
        name: type.name,
        materials: cost.map((stack) => {
          const name = catalog?.itemName(stack.item);
          return name ? { ...stack, name } : stack;
        }),
        buildMs,
        speedPm: type.speedPm,
        capacity: type.capacity,
        ...(fair ? { fair } : {}),
        // 지금 판매가(2057·2072): 주인이 정한 값, 없으면 적정가. 주인 없는 조선소는 없음
        ...(found.ownerId === null || harbor.assetAt(buildingId) === undefined
          ? {}
          : set !== undefined
            ? { price: set.toString(), priceSet: true }
            : {
                // 적정가 셈이 없는 시험 세계는 옛 셈(외주 요금 × 배수 — shipyard.ts salePrice와 같다)
                price:
                  fair?.price ??
                  ((BigInt(row.fee) * BigInt(Math.max(0, rules.shipyardBuildFeePm))) / 1000n).toString(),
                priceSet: false,
              }),
      };
    });
    return {
      role,
      closed: !harborOpen(fac.record.conditionPpm, rules),
      access: row.access,
      fee: row.fee,
      ...(isShipyard(fac.def) && typeViews[0]?.price !== undefined ? { orderFee: typeViews[0].price } : {}),
      module: row.modules[0] ?? null,
      modules: row.modules,
      moduleSlots: isShipyard(fac.def) ? shipyardModuleSlots(level) : 0,
      currency: currencyLabel(harbor.assetAt(buildingId)),
      storageFee: rules.storageFeePerDay,
      storageFreeMs: Math.max(0, rules.storageFreeHours) * HOUR_MS,
      capacity,
      used,
      ownerId: found.ownerId,
      docked: docked.map((state) => ({
        boatId: state.boatId,
        ownerId: state.ownerId ?? -1,
        typeId: state.typeId,
        hullPm: Math.floor(harbor.hullOf(state, at) / 1000),
        repairUntil: shipyard.repairUntil(state.boatId) ?? null,
        storageDue: dock.storageOf(state, at).toString(),
        impounded: dock.impounded(state, at),
        value: dock.valueOf(state).toString(),
      })),
      jobs: jobs.map((job) => ({
        kind: job.kind,
        typeId: job.typeId ?? "",
        boatId: job.boatId,
        startedAt: job.startedAtMs,
        readyAt: job.doneAtMs,
        ownerId: job.ownerId,
      })),
      types: typeViews,
      boats: homed.map((state) => boatView(state.boatId)),
      visits: visits.map((state) => ({
        boatId: state.boatId,
        ownerId: found.map.unitInfo(state.boatId)?.ownerId ?? -1,
        until: state.tradeUntilMs ?? 0,
      })),
      nearby: nearby
        .toSorted((a, b) => a - b)
        .map((boatId) => {
          // 내 배 줄(같은 2차맵 — 보는 사람의 것만 남는다)에 배 창고 무게·상한(D-568)
          const view = boatView(boatId);
          return {
            ...view,
            holdGrams: Number(holds.get(boatId) ?? 0n),
            holdCapGrams: holdCapGrams(harbor.typeOf(harbor.stateOf(boatId)), rules),
            ...port.row(boatId, view.ownerId),
          };
        }),
      cash: harbor.cashOf(found.ownerId, buildingId).toString(),
      overstayMul: rules.tradeOverstayMul,
      maxHours: rules.tradeMaxHours,
      exchangeId: port.exchangeId,
      ...(first ? { startedAtMs: first.startedAtMs, readyAtMs: first.doneAtMs } : {}),
    };
  }

  return {
    async build(userId, buildingId, operator, typeId) {
      const me = deps.ownerOf(userId);
      const yard = findBuilding(maps, buildingId);
      // 남의 조선소: 받기 범위 안이면 외주 주문(D-564 1682), 아니면 berth_denied
      const order =
        !operator &&
        yard !== undefined &&
        yard.ownerId !== null &&
        yard.ownerId !== me &&
        isShipyard(facilityOf(deps.places(), buildingId)?.def);
      if (order) {
        if (me === undefined) return fail("forbidden");
        if (!(await harbor.admits(buildingId, yard.ownerId, me))) return fail("berth_denied");
      }
      return shipyard.build(me, buildingId, operator, typeId, order);
    },
    repair(userId, boatId, buildingId, operator) {
      return repairFor(deps.ownerOf(userId), boatId, buildingId, operator);
    },
    berth(userId, boatId, buildingId, operator) {
      return berthFor(deps.ownerOf(userId), boatId, buildingId, operator);
    },
    dockTime(userId, boatId, buildingId, hours, operator) {
      return dockTimeFor(deps.ownerOf(userId), boatId, buildingId, hours, operator);
    },
    policy(userId, buildingId, change, operator) {
      return policyFor(deps.ownerOf(userId), buildingId, change, operator);
    },
    buildAs(ownerId, buildingId, typeId) {
      return shipyard.build(ownerId, buildingId, false, typeId);
    },
    boardAs(ownerId, unitId, boatId) {
      return boardFor(ownerId, unitId, boatId, false, true);
    },
    leaveAs(ownerId, boatId) {
      return leaveFor(ownerId, boatId, false);
    },
    berthAs(ownerId, boatId, buildingId) {
      return berthFor(ownerId, boatId, buildingId, false);
    },
    release(userId, boatId, operator) {
      return dock.release(deps.ownerOf(userId), boatId, operator);
    },
    releaseAs(ownerId, boatId) {
      return dock.release(ownerId, boatId, false);
    },
    voyage,
    unload: (me, boatId, buildingId, operator) => cargo.unload(me, boatId, buildingId, operator),
    cargoWaiting: () => cargo.waiting(),
    load: (me, boatId, buildingId, item, lots, operator) =>
      cargo.load(me, boatId, buildingId, item, lots, operator),
    gear: (me, boatId, buildingId, slot, item, operator) =>
      gear.mount(me, boatId, buildingId, slot, item, operator),
    catchCrew: (boatId) => gear.catchCrew(boatId),
    ownerOf: (userId) => deps.ownerOf(userId),
    repairAs(ownerId, boatId, buildingId) {
      return repairFor(ownerId, boatId, buildingId, false);
    },
    launchSpotOf(buildingId, index = 0) {
      const found = findBuilding(maps, buildingId);
      return found
        ? waterSpot(found.map, found.rect, facilityOf(deps.places(), buildingId)?.def, index)
        : undefined;
    },
    async board(userId, unitId, boatId, operator) {
      return boardFor(deps.ownerOf(userId), unitId, boatId, operator, false);
    },
    leave(userId, boatId, operator) {
      return leaveFor(deps.ownerOf(userId), boatId, operator);
    },
    dockJob: panelOf,
    info(boatId) {
      const map = mapOfUnit(maps, boatId);
      if (map?.unitInfo(boatId)?.kind !== UNIT_KIND_BOAT) return undefined;
      const state = harbor.stateOf(boatId);
      if (!state) return undefined;
      const hull = harbor.hullOf(state, now());
      const fuel = harbor.fuelOf(state);
      const captain = Object.entries(state.crew).find(
        ([id, post]) => post === "captain" && map.unitInfo(Number(id))?.aboard === boatId,
      );
      return {
        typeId: state.typeId,
        capacity: capacityOf(boatId),
        hullPm: Math.floor(hull / 1000),
        homeId: state.homeId,
        tradeUntil: state.tradeUntilMs,
        fuelPm: Math.floor((fuel.milli * 1000) / fuel.tank),
        overheat: state.overheat,
        drifting: hull <= 0 || harbor.fuelEmpty(state),
        captain: captain ? Number(captain[0]) : null,
        holdCapGrams: holdCapGrams(harbor.typeOf(state), deps.rules()),
      };
    },
    speedPm(boatId) {
      const state = harbor.states.get(boatId);
      if (!state) return 1000;
      return boatSpeedPm(harbor.typeOf(state), harbor.hullOf(state, now()), deps.rules(), {
        empty: harbor.fuelEmpty(state),
        overheat: state.overheat,
      });
    },
    get building() {
      return shipyard.jobs.size;
    },
    async tick(nowMs) {
      const result = await harbor.tick(nowMs ?? now());
      dock.tick(nowMs ?? now());
      cargo.retry(nowMs ?? now());
      return result;
    },
    stop() {
      stopped = true;
      if (timer !== undefined) clearInterval(timer);
      for (const pending of walks.values()) clearTimeout(pending);
      walks.clear();
      for (const pending of sails.values()) clearTimeout(pending);
      sails.clear();
      shipyard.stop();
    },
  };
}

/** 배 종류 표(시험·화면용 다시 내보내기) */
export { boatTypesOf };

/** 화폐 자산 → 화면 코드(나라 화폐 cur:XXX → XXX) */
const currencyLabel = (asset: string | undefined): string =>
  asset === undefined ? "" : asset.startsWith("cur:") ? asset.slice(4) : asset;
