// 2차맵 사이 이동 조회(서버, 읽기만) — tRPC world.travelPlan·world.travels. docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동".
// - travelPlan: 1차맵 명령 판의 확인 단계(지나는 2차맵·곧은 거리·걸리는 시간·직무가 끝나는지). 보내지 않는다(보내기는 WebSocket travel_start).
// - travels: 내 유닛의 길(가는 중 + 최근 끝난 것)과 지금 자리의 위도·경도(1차맵 표시).
// 판정·걷기는 이동 서비스(src/travel/service.ts)가 한다. 세계가 준비되기 전이면 not_ready.
import type { WorldTravelPlanResponse, WorldTravelsResponse } from "@terra/shared/worldMap";
import type { TravelService, TravelTarget } from "../travel/service.ts";
import type { Viewer } from "../trpc/context.ts";

/** 확인 단계 입력: 목적 2차맵·칸, 보낼 유닛(없으면 내 사이보그 본체) */
export type TravelPlanInput = TravelTarget & { readonly unitId?: number | undefined };

export interface TravelReads {
  travels(viewer: Viewer, nowMs: number): WorldTravelsResponse;
  travelPlan(viewer: Viewer, input: TravelPlanInput, nowMs: number): WorldTravelPlanResponse;
}

export function createTravelReads(
  travel: () => TravelService | undefined,
  latLon: (mapKey: number, x: number, y: number) => { latDeg: number; lonDeg: number },
): TravelReads {
  return {
    travels(viewer, nowMs) {
      const service = travel();
      if (!service) return { status: "not_ready", travels: [], generatedAt: nowMs };
      const travels = service
        .list(viewer.id)
        .map((view) => ({ ...view, ...latLon(view.mapKey, view.cellX, view.cellY) }));
      return { status: "ready", travels, generatedAt: nowMs };
    },
    travelPlan(viewer, input, nowMs) {
      const service = travel();
      if (!service) return { status: "not_ready", plan: null, problem: null, generatedAt: nowMs };
      const result = service.plan(viewer.id, input);
      return result.ok
        ? { status: "ready", plan: result.plan, problem: null, generatedAt: nowMs }
        : { status: "ready", plan: null, problem: result.problem, generatedAt: nowMs };
    },
  };
}
