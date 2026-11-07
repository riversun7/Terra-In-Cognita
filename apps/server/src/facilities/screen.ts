// 건물 화면 조회(tRPC facilities.overview) — docs/adr/2026-11-07-buildings-runtime.md
// 세계(DB)가 있고 준비되면 건물 서비스의 자료, 아니면 빈 자료(status "not_ready", 규칙 값은 출발값)다.
import type { FacilitiesOverviewResponse, FacilityTargetView } from "@terra/shared/facilities";
import { OLD_FACILITY_RUNTIME_RULES as R } from "@terra/shared/facilityRuntime";
import { rolesAllow } from "../auth/permissions.ts";
import type { Viewer } from "../trpc/context.ts";
import { type BeaconEntry, type FacilityViewSource, facilitiesOverview } from "./views.ts";

export interface FacilityScreenServices {
  overview(viewer: Viewer, nowMs: number): Promise<FacilitiesOverviewResponse>;
}

/** 세계가 준비됐을 때의 자료 */
export interface FacilityScreenSource {
  readonly view: FacilityViewSource;
  /** 사용자의 소유 주체(없으면 undefined) */
  ownerOf(userId: string): number | undefined;
  /** 내 세력 영토 비콘(기획 336 건물 규칙 — 수리 화면)과 재료를 꺼내는 도시(질문 410 ①) */
  beaconsOf(userId: string): Promise<readonly BeaconEntry[]>;
  /** 칠 수 있는 남의 시설·다른 세력 비콘(질문 381) */
  targetsOf(userId: string, nowMs: number): Promise<readonly FacilityTargetView[]>;
}

function notReady(nowMs: number, dev: boolean): FacilitiesOverviewResponse {
  return {
    status: "not_ready",
    generatedAt: nowMs,
    rules: { ...R },
    maps: [],
    catalog: [],
    facilities: [],
    beacons: [],
    cities: [],
    places: [],
    materials: [],
    units: [],
    holdings: [],
    targets: [],
    dev,
  };
}

export function createFacilityScreenServices(
  source?: () => FacilityScreenSource | undefined,
): FacilityScreenServices {
  return {
    async overview(viewer, nowMs) {
      // 개발 시험 명령(재료 받기·바로 끝내기)은 dev·admin(gateway.ts와 같은 권한)
      const dev = rolesAllow(viewer.roles, { secondMap: ["dev-spawn"] });
      const found = source?.();
      if (!found) return notReady(nowMs, dev);
      const beacons = await found.beaconsOf(viewer.id);
      const targets = await found.targetsOf(viewer.id, nowMs);
      return facilitiesOverview(
        found.view,
        { userId: viewer.id, ownerId: found.ownerOf(viewer.id), nowMs, dev },
        beacons,
        targets,
      );
    },
  };
}
