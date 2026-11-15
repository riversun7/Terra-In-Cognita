// 2차맵 사이 이동 조회(서버, 읽기만) — tRPC world.travelPlan·world.travels. docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동"·"WP11".
// - travelPlan: 1차맵 명령 판의 확인 단계(지나는 2차맵·곧은 거리·걸리는 시간·직무가 끝나는지·건너뛰는 2차맵 수·비용) + 위험 구간(내가 아는
//   것만, travelDanger.ts — 질문 594 나). 보내지 않는다(보내기는 WebSocket travel_start).
// - travels: 내 유닛의 길(가는 중 + 최근 끝난 것)과 지금 자리의 위도·경도(1차맵 표시 — 건너뛰는 중이면 곧은 선을 따라 지금 있을 자리).
//   + 내 좌표 유닛(서 있음, parked — docs/adr/2026-11-15-unloaded-second-maps.md 5절: 띄우지 않은 2차맵 위 유닛은 1차맵에만 보인다).
// 판정·걷기는 이동 서비스(src/travel/service.ts)가 한다. 세계가 준비되기 전이면 not_ready.
import type {
  WorldParkedUnit,
  WorldTravelDanger,
  WorldTravelPlanResponse,
  WorldTravelsResponse,
} from "@terra/shared/worldMap";
import type { TravelService, TravelTarget } from "../travel/service.ts";
import type { Viewer } from "../trpc/context.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_CYBORG } from "../world/unitKinds.ts";

/** 확인 단계 입력: 목적 2차맵·칸, 보낼 유닛(없으면 내 사이보그 본체) */
export type TravelPlanInput = TravelTarget & { readonly unitId?: number | undefined };

/** 위험 구간을 붙이는 함수(없으면 위험 없음·모르는 2차맵 0) */
export type TravelDangerOf = (
  viewer: Viewer,
  route: readonly number[],
) => Promise<{ dangers: WorldTravelDanger[]; unknownMaps: number }>;

export interface TravelReads {
  travels(viewer: Viewer, nowMs: number): WorldTravelsResponse;
  travelPlan(viewer: Viewer, input: TravelPlanInput, nowMs: number): Promise<WorldTravelPlanResponse>;
}

export function createTravelReads(
  travel: () => TravelService | undefined,
  latLon: (mapKey: number, x: number, y: number) => { latDeg: number; lonDeg: number },
  danger?: TravelDangerOf,
  ownerOf?: (userId: string) => number | undefined,
): TravelReads {
  return {
    travels(viewer, nowMs) {
      const service = travel();
      if (!service) return { status: "not_ready", travels: [], generatedAt: nowMs };
      const travels = service
        .list(viewer.id)
        .map((view) => ({ ...view, ...latLon(view.mapKey, view.cellX, view.cellY) }));
      const ownerId = ownerOf?.(viewer.id);
      const parked: WorldParkedUnit[] =
        ownerId === undefined
          ? []
          : service
              .coordinateUnits(new Set([ownerId]))
              .filter((unit) => !unit.moving && unit.aboard === null)
              .map((unit) => ({
                unitId: unit.unitId,
                mapKey: unit.mapKey,
                cellX: unit.cellX,
                cellY: unit.cellY,
                ...latLon(unit.mapKey, unit.cellX, unit.cellY),
                cyborg: unit.kind === UNIT_KIND_CYBORG,
                boat: unit.kind === UNIT_KIND_BOAT,
              }));
      return { status: "ready", travels, parked, generatedAt: nowMs };
    },
    async travelPlan(viewer, input, nowMs) {
      const service = travel();
      if (!service) return { status: "not_ready", plan: null, problem: null, generatedAt: nowMs };
      const result = service.plan(viewer.id, input);
      if (!result.ok) return { status: "ready", plan: null, problem: result.problem, generatedAt: nowMs };
      const known = danger ? await danger(viewer, result.plan.route) : { dangers: [], unknownMaps: 0 };
      return { status: "ready", plan: { ...result.plan, ...known }, problem: null, generatedAt: nowMs };
    },
  };
}
