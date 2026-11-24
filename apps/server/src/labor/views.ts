// 노동 계약 화면 조회(tRPC labor.overview·labor.jobs) — docs/adr/2026-11-03-labor-contracts.md
// 세계(DB)가 있고 준비되면 서비스의 자료, 아니면 빈 자료(status "not_ready", 규칙 값은 sim 시험 계수표)다.
import type { LaborBuildingResponse, LaborJobsResponse, LaborOverviewResponse } from "@terra/shared/labor";
import { TEST_SOCIETY_COEFFICIENTS, defaultGatherStat, requiredDeposit } from "@terra/sim";
import type { Viewer } from "../trpc/context.ts";
import { NO_NATION_MONEY } from "../world/money.ts";
import type { JobBoardFilter } from "./jobBoard.ts";
import type { LaborService } from "./service.ts";

export interface LaborScreenServices {
  overview(viewer: Viewer, nowMs: number): LaborOverviewResponse;
  jobs(viewer: Viewer, filter: JobBoardFilter, nowMs: number): LaborJobsResponse;
  /** 건물 하나의 노동 판(누구나 — docs/adr/2026-11-15-building-screen.md) */
  building(viewer: Viewer, buildingId: number): LaborBuildingResponse;
}

function notReady(nowMs: number): LaborOverviewResponse {
  const c = TEST_SOCIETY_COEFFICIENTS;
  return {
    status: "not_ready",
    generatedAt: nowMs,
    currency: NO_NATION_MONEY, // 세계가 아직 없다(잔고 0) — 준비되면 내 돈(소속 국가 화폐)
    balance: "0",
    rules: {
      wageCycleMs: c.labor.wageCycleMs,
      depositDays: c.labor.depositDays,
      warnDays: c.labor.warnDays,
      rentCycleMs: c.labor.rentCycleMs,
      graceMs: c.labor.graceMs,
      adjustMinPm: c.employerAdjustMinPm,
      adjustMaxPm: c.employerAdjustMaxPm,
      efficiency: defaultGatherStat(c.cyborg.initialSum),
      rateMilli: c.wageRateMilli,
      depositCycles: Number(requiredDeposit(1n, c.labor)),
    },
    contracts: [],
    buildings: [],
    units: [],
    jobs: [],
  };
}

export function createLaborScreenServices(service?: () => LaborService | undefined): LaborScreenServices {
  return {
    overview(viewer, nowMs) {
      const found = service?.();
      return found ? found.overview(viewer.id) : notReady(nowMs);
    },
    jobs(viewer, filter, nowMs) {
      const found = service?.();
      return found
        ? found.jobs(viewer.id, filter)
        : { status: "not_ready", generatedAt: nowMs, jobs: [], total: 0, cities: [] };
    },
    building(viewer, buildingId) {
      const found = service?.();
      return found ? found.building(viewer.id, buildingId) : { status: "not_ready", buildingId };
    },
  };
}
