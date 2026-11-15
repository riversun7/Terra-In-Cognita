// 조선소 작업(만들기·수리) — 기획 D-547 1481·1483·1484·1494, D-545 1405, D-559 1521~1523, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15)"·"바뀜 (2026-11-15) D-559".
// - 도크 수(rules.ts shipyardDocks — 모듈 묶음)만큼 쓴다. 도크를 쓰는 것 = 만드는 작업 + 도크에 든 배(고치는 중·출고 기다림).
// - 만들기: 내 조선소에서만. 배 종류마다 재료·시간(1484). 재료는 지금 뺀다(건물 짓기와 같은 재료 자리 materialScope). 끝 시각에 배가 **도크에 든다**
//   (D-559 1523 — 2차맵 유닛이 아니다, 꺼낼 때(출고 — dock.ts) 조선소 옆 물에 뜬다). 연료는 가득.
// - 수리: 배가 조선소 둘레 shipyardReachCells 안 물에 있어야 시작한다. 승객을 내리고 배를 도크에 넣는다(2차맵에서 뺀다). 끝 시각에 가득으로 고치고 배는 도크에
//   남는다(출고 기다림). 남의 조선소도 받기 범위 안이면 고친다(D-559 1522) — 재료는 배 주인이 그 자리에서 내고, 수리 요금은 조선소 금고로(그 나라 화폐).
// - 조선소가 없어지면 만들던 작업을 버린다 — 재료는 돌려주지 않는다(D-545 1405). 도크에 든 배는 dock.ts가 조선소 자리 옆 물에 띄운다.
// - 옛 수리 작업(배가 2차맵에 있는 채로 고치던 것 — 이 판 전에 시작)은 예전처럼 끝 때 그 배가 둘레에 있으면 가득으로 고친다.
import type { BoatTypeDef } from "../facilities/catalog.ts";
import { hasGoods, spendGoods } from "../facilities/materials.ts";
import { cityAt, materialScope } from "../facilities/places.ts";
import { HULL_FULL } from "@terra/shared/harbor";
import {
  type BoatCommandResult,
  type BoatDeps,
  MAX_TIMER_MS,
  facilityOf,
  fail,
  findBuilding,
} from "./core.ts";
import type { Harbor } from "./harbor.ts";
import {
  REPAIR_MIN_PPM,
  boatBuildMs,
  boatCost,
  fuelTankMilli,
  harborOpen,
  isShipyard,
  repairPlan,
  shipyardDocks,
} from "./rules.ts";
import type { BoatJob, BoatStore } from "./store.ts";

export interface Shipyard {
  readonly jobs: ReadonlyMap<number, BoatJob>;
  /** 그 조선소의 작업(ID 차례) */
  jobsAt(buildingId: number): BoatJob[];
  /** 그 조선소에서 쓰는 도크 수(만드는 작업 + 도크에 든 배) */
  occupied(buildingId: number): number;
  /** 그 배를 고치는 중인가(끝 시각, 아니면 undefined) */
  repairUntil(boatId: number): number | undefined;
  repairing(boatId: number): boolean;
  /** 만들기(me = 부르는 소유 주체, 운영자는 재료 없이) */
  build(
    me: number | undefined,
    buildingId: number,
    operator: boolean,
    typeId: string | undefined,
  ): BoatCommandResult;
  /** 수리 시작(배가 둘레에 있어야 한다 — 서비스가 먼저 보낸다. 받기 범위는 서비스가 먼저 봤다) */
  startRepair(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    operator: boolean,
  ): BoatCommandResult;
  /** 수리 조건(거리·받기 범위 빼고)을 본다. null이면 된다 */
  repairProblem(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    operator: boolean,
  ): BoatCommandResult | null;
  stop(): void;
}

export interface ShipyardHooks {
  /** 수리를 시작할 때 배를 도크에 넣는다(승객 내리기·2차맵에서 빼기 — dock.ts). 실패하면 결과 코드 */
  readonly admit: (boatId: number, buildingId: number) => BoatCommandResult | null;
}

export function createShipyard(
  deps: BoatDeps,
  store: BoatStore,
  harborOf: () => Harbor,
  hooks: () => ShipyardHooks,
): Shipyard {
  const { maps, now, ledger } = deps;
  const jobs = new Map<number, BoatJob>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let lastJobId = 0;
  let stopped = false;

  const jobsAt = (buildingId: number): BoatJob[] =>
    [...jobs.values()].filter((job) => job.buildingId === buildingId).toSorted((a, b) => a.id - b.id);

  /** 도크를 쓰는 수: 만드는 작업 + 도크에 든 배(고치는 배는 도크에 든 배로 센다) + 옛 수리(2차맵에 있는 배) */
  const occupied = (buildingId: number): number => {
    const docked = harborOf().dockedAt(buildingId);
    const dockedIds = new Set(docked.map((state) => state.boatId));
    const working = jobsAt(buildingId).filter(
      (job) => job.kind === "build" || job.boatId === null || !dockedIds.has(job.boatId),
    );
    return working.length + docked.length;
  };

  const arm = (job: BoatJob): void => {
    const old = timers.get(job.id);
    if (old !== undefined) clearTimeout(old);
    if (stopped) return;
    const timer = setTimeout(() => finish(job.id), Math.min(MAX_TIMER_MS, Math.max(0, job.doneAtMs - now())));
    timer.unref?.();
    timers.set(job.id, timer);
  };

  const drop = (id: number): void => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
    jobs.delete(id);
    store.remove(id);
  };

  /** 그 조선소의 배 종류(옛 줄 typeId null = 첫 종류) */
  const typeFor = (buildingId: number, typeId: string | null): BoatTypeDef | undefined => {
    const def = facilityOf(deps.places(), buildingId)?.def;
    const list = def?.boats ?? [];
    return typeId === null ? list[0] : list.find((type) => type.id === typeId);
  };

  /** 조선소 자리(띄운 2차맵일 때만 — 조선소가 없어졌을 때 배를 띄울 곳) */
  const yardSpot = (buildingId: number) => {
    const found = findBuilding(maps, buildingId);
    return found
      ? { yardMapKey: found.map.mapKey, yardX: found.rect.x, yardY: found.rect.y }
      : { yardMapKey: null, yardX: null, yardY: null };
  };

  /** 다 만든 배를 도크에 넣는다(D-559 1523 — 2차맵 유닛은 꺼낼 때 만든다). 배 ID */
  const dockNew = (buildingId: number, ownerId: number, type: BoatTypeDef | undefined, typeId: string) => {
    const boatId = deps.nextUnitId();
    const at = now();
    harborOf().create(boatId, type?.id ?? typeId, at, {
      ownerId,
      yardId: buildingId,
      yardSinceMs: at,
      ...yardSpot(buildingId),
      fuelMilli: fuelTankMilli(type, deps.rules()),
      fuelAtMs: at,
    });
    return boatId;
  };

  const finish = (id: number): void => {
    timers.delete(id);
    const job = jobs.get(id);
    if (!job || stopped) return;
    if (now() < job.doneAtMs) {
      arm(job);
      return;
    }
    try {
      const places = deps.places();
      // 시설 줄이 없으면 조선소가 없어졌다(2차맵을 띄우지 않았어도 시설 줄은 있다). 물자 자리가 없으면(부팅 중) 띄운 건물로 본다
      if (places ? !facilityOf(places, job.buildingId) : !findBuilding(maps, job.buildingId)) {
        deps.log.error(
          { jobId: id, buildingId: job.buildingId, lost: job.materials },
          "boat job dropped: the shipyard is gone (materials are lost)",
        );
        drop(id);
        return;
      }
      const harbor = harborOf();
      if (job.kind === "repair") {
        const state = job.boatId === null ? undefined : harbor.stateOf(job.boatId);
        if (state?.yardId === job.buildingId) {
          // 도크에 든 배: 가득으로 고치고 출고를 기다린다(보관료는 지금부터)
          drop(id);
          state.hullPpm = HULL_FULL;
          state.hullAtMs = now();
          state.yardSinceMs = now();
          harbor.saveState(state);
          return;
        }
        // 옛 수리(배가 2차맵에 있는 채로): 끝 때 둘레에 있으면 가득으로
        const found = findBuilding(maps, job.buildingId);
        const there =
          state !== undefined &&
          found !== undefined &&
          harbor.near(state.boatId, found, deps.rules().shipyardReachCells, now());
        if (state && there) {
          harbor.settle(state, now());
          drop(id);
          state.hullPpm = HULL_FULL;
          state.hullAtMs = now();
          harbor.saveState(state);
        } else {
          deps.log.error(
            { jobId: id, boatId: job.boatId },
            "boat repair dropped: the boat left the shipyard",
          );
          drop(id);
        }
        return;
      }
      const type = typeFor(job.buildingId, job.typeId);
      dockNew(job.buildingId, job.ownerId, type, type?.id ?? job.typeId ?? "rowboat");
      drop(id);
    } catch (error) {
      deps.log.error({ err: error, jobId: id }, "boat job failed");
      drop(id);
    }
  };

  for (const job of deps.jobs ?? []) {
    jobs.set(job.id, job);
    lastJobId = Math.max(lastJobId, job.id);
    arm(job);
  }

  /**
   * 조선소 공통 조건: 조선소·다 지음·일함·운행 정지 아님·도크 빈 자리. ownOnly면 내 조선소만(만들기).
   * payer = 재료를 내는 주체(만들기 = 나, 수리 = 배 주인)
   */
  const yardProblem = (
    me: number | undefined,
    buildingId: number,
    operator: boolean,
    ownOnly: boolean,
    payerOverride?: number,
  ) => {
    const places = deps.places();
    if (!places) return { problem: fail("busy") } as const;
    const found = findBuilding(maps, buildingId);
    if (!found) return { problem: fail("unknown_building") } as const;
    if (ownOnly && !operator && (me === undefined || found.ownerId !== me))
      return { problem: fail("forbidden") } as const;
    const fac = facilityOf(places, buildingId);
    if (!fac || !isShipyard(fac.def)) return { problem: fail("not_shipyard") } as const;
    if (fac.record.level < 1 || !deps.works(buildingId)) return { problem: fail("not_ready") } as const;
    const rules = deps.rules();
    if (!harborOpen(fac.record.conditionPpm, rules)) return { problem: fail("harbor_closed") } as const;
    const modules = harborOf().facility(buildingId, found.ownerId).modules;
    if (occupied(buildingId) >= shipyardDocks(fac.record.level, modules, rules)) {
      const first = jobsAt(buildingId).toSorted((a, b) => a.doneAtMs - b.doneAtMs)[0];
      return {
        problem: { ok: false, code: "dock_busy", ...(first ? { readyAtMs: first.doneAtMs } : {}) } as const,
      } as const;
    }
    const owner = payerOverride ?? (operator ? (found.ownerId ?? me) : me);
    if (owner === undefined) return { problem: fail("forbidden") } as const;
    const scope = materialScope(
      places,
      owner,
      found.map.mapKey,
      fac.record.cityId ?? cityAt(places, found.map.mapKey, found.rect.x, found.rect.y),
    );
    return { found, fac, modules, owner, scope, rules } as const;
  };

  const addJob = (job: Omit<BoatJob, "id">): BoatJob => {
    lastJobId += 1;
    const full: BoatJob = { ...job, id: lastJobId };
    jobs.set(full.id, full);
    store.save(full);
    arm(full);
    return full;
  };

  const repairUntil = (boatId: number): number | undefined =>
    [...jobs.values()].find((job) => job.kind === "repair" && job.boatId === boatId)?.doneAtMs;

  const repairProblem = (
    me: number | undefined,
    boatId: number,
    buildingId: number,
    operator: boolean,
  ): BoatCommandResult | null => {
    // 가득인 배는 도크가 비었는지 보기 전에 알린다(고칠 것이 없다)
    const harbor = harborOf();
    const known = harbor.stateOf(boatId);
    if (known && harbor.hullOf(known, now()) > HULL_FULL - REPAIR_MIN_PPM) return fail("hull_full");
    const found = findBuilding(maps, buildingId);
    const boat = found?.map.unitInfo(boatId);
    if (found && !boat) return fail("wrong_map");
    if (boat && !operator && boat.ownerId !== me) return fail("forbidden");
    const yard = yardProblem(me, buildingId, operator, false, boat?.ownerId);
    if ("problem" in yard) return yard.problem;
    const state = harbor.stateOf(boatId);
    if (!state || !boat) return fail("wrong_map");
    if (repairUntil(boatId) !== undefined) return { ok: false, code: "dock_busy" };
    const type = harbor.typeOf(state);
    const plan = type
      ? repairPlan(type, harbor.hullOf(state, now()), yard.rules, yard.modules, operator)
      : null;
    if (!plan) return fail("hull_full");
    if (!hasGoods(ledger, yard.owner, plan.materials, yard.scope)) return fail("insufficient_materials");
    // 수리 요금(그 나라 화폐)을 낼 돈이 있어야 한다(D-559 1522·D-555 1514)
    const fee = foreignFee(yard.found.ownerId, buildingId, operator);
    if (fee > 0n && harbor.balanceOf(boat.ownerId, buildingId) < fee) return fail("insufficient_funds");
    return null;
  };

  /** 조선소 수리 요금(운영자·주인 없는 조선소는 0). 제 조선소도 낸다(D-555 1514 — 그 사업장 금고로) */
  const foreignFee = (yardOwner: number | null, buildingId: number, operator: boolean) =>
    yardOwner === null || operator ? 0n : BigInt(Math.max(0, harborOf().facility(buildingId, yardOwner).fee));

  return {
    jobs,
    jobsAt,
    occupied,
    repairUntil,
    repairing: (boatId) => repairUntil(boatId) !== undefined,
    build(me, buildingId, operator, typeId) {
      const yard = yardProblem(me, buildingId, operator, true);
      if ("problem" in yard) return yard.problem;
      const { fac, modules, owner, scope, rules } = yard;
      const list = fac.def.boats ?? [];
      const type = typeId === undefined ? list[0] : list.find((entry) => entry.id === typeId);
      if (!type) return fail("unknown_boat_type");
      const at = now();
      const materials = operator ? [] : boatCost(type, rules.costPm);
      if (!hasGoods(ledger, owner, materials, scope)) return fail("insufficient_materials");
      const ms = boatBuildMs(type, rules, modules, operator);
      if (!spendGoods(ledger, owner, materials, at, "boat_build", scope))
        return fail("insufficient_materials");
      if (ms > 0) {
        const job = addJob({
          ownerId: owner,
          buildingId,
          materials,
          startedAtMs: at,
          doneAtMs: at + ms,
          kind: "build",
          typeId: type.id,
          boatId: null,
        });
        return { ok: true, readyAtMs: job.doneAtMs };
      }
      return { ok: true, boatId: dockNew(buildingId, owner, type, type.id) };
    },
    repairProblem,
    startRepair(me, boatId, buildingId, operator) {
      const problem = repairProblem(me, boatId, buildingId, operator);
      if (problem) return problem;
      const harbor = harborOf();
      const state = harbor.stateOf(boatId);
      const found = findBuilding(maps, buildingId);
      const boatOwner = found?.map.unitInfo(boatId)?.ownerId;
      const yard = yardProblem(me, buildingId, operator, false, boatOwner);
      if ("problem" in yard) return yard.problem;
      const type = harbor.typeOf(state);
      if (!state || !type || boatOwner === undefined) return fail("unknown_unit");
      const at = now();
      if (!harbor.near(boatId, yard.found, yard.rules.shipyardReachCells, at)) return fail("no_path");
      const plan = repairPlan(type, harbor.hullOf(state, at), yard.rules, yard.modules, operator);
      if (!plan) return fail("hull_full");
      // 수리 전 처지로 닳음을 들인 뒤 배를 도크에 넣는다(작업 동안·도크에서는 닳지 않는다)
      harbor.settle(state, at, true);
      if (!hasGoods(ledger, yard.owner, plan.materials, yard.scope)) return fail("insufficient_materials");
      const admitted = hooks().admit(boatId, buildingId);
      if (admitted) return admitted;
      if (!spendGoods(ledger, yard.owner, plan.materials, at, "boat_repair", yard.scope))
        return fail("insufficient_materials");
      const fee = foreignFee(yard.found.ownerId, buildingId, operator);
      if (fee > 0n) harbor.charge(boatOwner, yard.found.ownerId, buildingId, fee, "shipyard_repair_fee", at);
      const job = addJob({
        ownerId: boatOwner,
        buildingId,
        materials: plan.materials,
        startedAtMs: at,
        doneAtMs: at + plan.ms,
        kind: "repair",
        typeId: state.typeId,
        boatId,
      });
      return { ok: true, readyAtMs: job.doneAtMs };
    },
    stop() {
      stopped = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
