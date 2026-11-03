// 노동 계약 화면 조회(tRPC labor.overview) — docs/adr/2026-11-03-labor-contracts.md
// 세계(DB)가 있고 준비되면 서비스의 자료, 아니면 빈 자료(status "not_ready", 규칙 값은 sim 시험 계수표)다.
import type { LaborOverviewResponse } from "@terra/shared/labor";
import { TEST_ASSET_CREDIT, TEST_SOCIETY_COEFFICIENTS, defaultGatherStat, requiredDeposit } from "@terra/sim";
import type { Viewer } from "../trpc/context.ts";
import type { LaborService } from "./service.ts";

export interface LaborScreenServices {
  overview(viewer: Viewer, nowMs: number): LaborOverviewResponse;
}

function notReady(nowMs: number): LaborOverviewResponse {
  const c = TEST_SOCIETY_COEFFICIENTS;
  return {
    status: "not_ready",
    generatedAt: nowMs,
    currency: TEST_ASSET_CREDIT,
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
  };
}

export function createLaborScreenServices(service?: () => LaborService | undefined): LaborScreenServices {
  return {
    overview(viewer, nowMs) {
      const found = service?.();
      return found ? found.overview(viewer.id) : notReady(nowMs);
    },
  };
}
