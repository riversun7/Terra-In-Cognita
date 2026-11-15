// 조선소 작업(만들기·수리) — 기획 D-547 1481·1483·1484·1494, D-545 1405, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15)".
// - 도크 수(rules.ts shipyardDocks)만큼 작업이 함께 돈다. 만들기·수리가 같은 도크를 쓴다.
// - 만들기: 배 종류마다 재료·시간(1484). 재료는 지금 뺀다(건물 짓기와 같은 재료 자리 materialScope). 끝 시각에 조선소 옆 물에 배가 뜨고 상태(종류·가득)가 생긴다.
//   정박 자리와 상관없다(1485 "생산과 정박은 별개") — 다 된 배는 집이 없어 정박장에 넣을 때까지 더 빨리 닳는다.
// - 수리: 배가 조선소 둘레 shipyardReachCells 안 물에 있어야 시작한다. 끝 시각에 그 배가 아직 둘레에 있으면 가득으로 고친다(아니면 버린다).
// - 조선소가 없어지면 작업을 버린다 — 재료는 돌려주지 않는다(D-545 1405).
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
  waterSpot,
} from "./core.ts";
import type { Harbor } from "./harbor.ts";
import {
  REPAIR_MIN_PPM,
  boatBuildMs,
  boatCost,
  harborOpen,
  isShipyard,
  repairPlan,
  shipyardDocks,
} from "./rules.ts";
import type { BoatJob, BoatStore } from "./store.ts";

/** 배가 뜰 물 칸이 없을 때 다시 해 보기까지(ms) [임시] */
const LAUNCH_RETRY_MS = 60_000;

export interface Shipyard {
  readonly jobs: ReadonlyMap<number, BoatJob>;
  /** 그 조선소의 작업(ID 차례) */
  jobsAt(buildingId: number): BoatJob[];
  /** 그 배를 고치는 중인가 */
  repairing(boatId: number): boolean;
  /** 만들기(me = 부르는 소유 주체, 운영자는 재료 없이) */
  build(
    me: number | undefined,
    buildingId: number,
    operator: boolean,
    typeId: string | undefined,
  ): BoatCommandResult;
  /** 수리 시작(배가 둘레에 있어야 한다 — 서비스가 먼저 보낸다) */
  startRepair(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    operator: boolean,
  ): BoatCommandResult;
  /** 수리 조건(거리 빼고)을 본다. null이면 된다 */
  repairProblem(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    operator: boolean,
  ): BoatCommandResult | null;
  stop(): void;
}

export function createShipyard(
  deps: BoatDeps,
  store: BoatStore,
  harborOf: () => Harbor,
  launched?: (boatId: number, ownerId: number, buildingId: number) => void,
): Shipyard {
  const { maps, now, ledger } = deps;
  const jobs = new Map<number, BoatJob>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let lastJobId = 0;
  let stopped = false;

  const jobsAt = (buildingId: number): BoatJob[] =>
    [...jobs.values()].filter((job) => job.buildingId === buildingId).toSorted((a, b) => a.id - b.id);

  const arm = (job: BoatJob, delay?: number): void => {
    const old = timers.get(job.id);
    if (old !== undefined) clearTimeout(old);
    if (stopped) return;
    const timer = setTimeout(
      () => finish(job.id),
      Math.min(MAX_TIMER_MS, Math.max(0, delay ?? job.doneAtMs - now())),
    );
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

  /** 그 조선소의 첫 배 종류(옛 줄 typeId null) */
  const typeFor = (buildingId: number, typeId: string | null): BoatTypeDef | undefined => {
    const def = facilityOf(deps.places(), buildingId)?.def;
    const list = def?.boats ?? [];
    return typeId === null ? list[0] : list.find((type) => type.id === typeId);
  };

  /** 배 띄우기(조선소 옆 물). 띄웠으면 배 ID */
  const launch = (buildingId: number, ownerId: number, typeId: string): number | undefined => {
    const found = findBuilding(maps, buildingId);
    const def = facilityOf(deps.places(), buildingId)?.def;
    if (!found) return undefined;
    const spot = waterSpot(found.map, found.rect, def);
    if (!spot) return undefined;
    const boatId = deps.nextUnitId();
    if (!found.map.addBoat({ id: boatId, ownerId, speed: deps.rules().speed, cellX: spot.x, cellY: spot.y }))
      return undefined;
    harborOf().create(boatId, typeId, now());
    launched?.(boatId, ownerId, buildingId);
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
      const found = findBuilding(maps, job.buildingId);
      const places = deps.places();
      if (!found || (places && !facilityOf(places, job.buildingId))) {
        deps.log.error(
          { jobId: id, buildingId: job.buildingId, lost: job.materials },
          "boat job dropped: the shipyard is gone (materials are lost)",
        );
        drop(id);
        return;
      }
      if (job.kind === "repair") {
        const harbor = harborOf();
        const state = job.boatId === null ? undefined : harbor.stateOf(job.boatId);
        const there =
          state !== undefined && harbor.near(state.boatId, found, deps.rules().shipyardReachCells, now());
        if (state && there) {
          // 고치는 동안은 닳지 않았다(처지 repair) — 작업을 지운 뒤 가득으로
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
      const boatId = launch(job.buildingId, job.ownerId, type?.id ?? job.typeId ?? "rowboat");
      if (boatId === undefined) {
        arm(job, LAUNCH_RETRY_MS);
        return;
      }
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

  /** 조선소 공통 조건: 내 조선소·다 지음·일함·운행 정지 아님·도크 빈 자리 */
  const yardProblem = (me: number | undefined, buildingId: number, operator: boolean) => {
    const places = deps.places();
    if (!places) return { problem: fail("busy") } as const;
    const found = findBuilding(maps, buildingId);
    if (!found) return { problem: fail("unknown_building") } as const;
    if (!operator && (me === undefined || found.ownerId !== me))
      return { problem: fail("forbidden") } as const;
    const fac = facilityOf(places, buildingId);
    if (!fac || !isShipyard(fac.def)) return { problem: fail("not_shipyard") } as const;
    if (fac.record.level < 1 || !deps.works(buildingId)) return { problem: fail("not_ready") } as const;
    const rules = deps.rules();
    if (!harborOpen(fac.record.conditionPpm, rules)) return { problem: fail("harbor_closed") } as const;
    const module = harborOf().facility(buildingId, found.ownerId).module;
    const busy = jobsAt(buildingId);
    if (busy.length >= shipyardDocks(fac.record.level, module, rules)) {
      const first = busy.toSorted((a, b) => a.doneAtMs - b.doneAtMs)[0];
      return {
        problem: { ok: false, code: "dock_busy", ...(first ? { readyAtMs: first.doneAtMs } : {}) } as const,
      } as const;
    }
    const owner = operator ? (found.ownerId ?? me) : me;
    if (owner === undefined) return { problem: fail("forbidden") } as const;
    const scope = materialScope(
      places,
      owner,
      found.map.mapKey,
      fac.record.cityId ?? cityAt(places, found.map.mapKey, found.rect.x, found.rect.y),
    );
    return { found, fac, module, owner, scope, rules } as const;
  };

  const addJob = (job: Omit<BoatJob, "id">): BoatJob => {
    lastJobId += 1;
    const full: BoatJob = { ...job, id: lastJobId };
    jobs.set(full.id, full);
    store.save(full);
    arm(full);
    return full;
  };

  const repairing = (boatId: number): boolean =>
    [...jobs.values()].some((job) => job.kind === "repair" && job.boatId === boatId);

  const repairProblem = (
    me: number | undefined,
    boatId: number,
    buildingId: number,
    operator: boolean,
  ): BoatCommandResult | null => {
    // 가득인 배는 도크가 비었는지 보기 전에 알린다(고칠 것이 없다)
    const early = harborOf();
    const known = early.stateOf(boatId);
    if (known && early.hullOf(known, now()) > HULL_FULL - REPAIR_MIN_PPM) return fail("hull_full");
    const yard = yardProblem(me, buildingId, operator);
    if ("problem" in yard) return yard.problem;
    const harbor = harborOf();
    const state = harbor.stateOf(boatId);
    const boat = yard.found.map.unitInfo(boatId);
    if (!state || !boat) return fail("wrong_map");
    if (!operator && boat.ownerId !== yard.owner) return fail("forbidden");
    if (repairing(boatId)) return { ok: false, code: "dock_busy" };
    const type = harbor.typeOf(state);
    const plan = type
      ? repairPlan(type, harbor.hullOf(state, now()), yard.rules, yard.module, operator)
      : null;
    if (!plan) return fail("hull_full");
    if (!hasGoods(ledger, yard.owner, plan.materials, yard.scope)) return fail("insufficient_materials");
    return null;
  };

  return {
    jobs,
    jobsAt,
    repairing,
    build(me, buildingId, operator, typeId) {
      const yard = yardProblem(me, buildingId, operator);
      if ("problem" in yard) return yard.problem;
      const { found, fac, module, owner, scope, rules } = yard;
      const list = fac.def.boats ?? [];
      const type = typeId === undefined ? list[0] : list.find((entry) => entry.id === typeId);
      if (!type) return fail("unknown_boat_type");
      if (!waterSpot(found.map, found.rect, fac.def)) return fail("no_water");
      const at = now();
      const materials = operator ? [] : boatCost(type, rules.costPm);
      if (!hasGoods(ledger, owner, materials, scope)) return fail("insufficient_materials");
      const ms = boatBuildMs(type, rules, module, operator);
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
      const boatId = launch(buildingId, owner, type.id);
      return boatId === undefined ? fail("internal_error") : { ok: true, boatId };
    },
    repairProblem,
    startRepair(me, boatId, buildingId, operator) {
      const problem = repairProblem(me, boatId, buildingId, operator);
      if (problem) return problem;
      const yard = yardProblem(me, buildingId, operator);
      if ("problem" in yard) return yard.problem;
      const harbor = harborOf();
      const state = harbor.stateOf(boatId);
      const type = harbor.typeOf(state);
      if (!state || !type) return fail("unknown_unit");
      const at = now();
      if (!harbor.near(boatId, yard.found, yard.rules.shipyardReachCells, at)) return fail("no_path");
      const plan = repairPlan(type, harbor.hullOf(state, at), yard.rules, yard.module, operator);
      if (!plan) return fail("hull_full");
      // 수리 전 처지로 닳음을 들인 뒤 작업을 건다(작업 동안은 닳지 않는다)
      harbor.settle(state, at, true);
      if (!spendGoods(ledger, yard.owner, plan.materials, at, "boat_repair", yard.scope))
        return fail("insufficient_materials");
      const job = addJob({
        ownerId: yard.owner,
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
