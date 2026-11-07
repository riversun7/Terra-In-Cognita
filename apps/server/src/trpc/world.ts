// world 라우터 — 지도 흐름 조회(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1·§7.1). 응답 타입은 @terra/shared/worldMap이다.
// - cities: 1차맵에 그릴 도시·국가(색·이름)·영토 껍질, 도시마다 시작 도시 여부·둘레 땅(행성 값)·띄운 맵인지·내가 볼 수 있는지.
// - myPosition: 내 사이보그 본체가 있는 2차맵·배치 칸(2차맵 화면이 그 맵을 열고 카메라를 맞춘다), 없으면 띄운 첫 2차맵.
// - travelPlan·travels(WP9·WP11 2차맵 사이 이동): 1차맵 명령 판의 확인 단계(지나는 2차맵·거리·걸리는 시간·위험 구간)와 내 유닛의 가는 중인 길·최근 도착.
// 읽기만 한다. 게임 상태를 바꾸는 명령은 WebSocket이다(AGENTS 4장 — 보내기·멈추기는 travel_start·travel_cancel).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), BAD_REQUEST(틀린 입력). 세계(DB)가 없거나 부팅 복구 전이면 status "not_ready"(빈 목록)
import type {
  WorldCitiesResponse,
  WorldPositionResponse,
  WorldTravelPlanResponse,
  WorldTravelsResponse,
} from "@terra/shared/worldMap";
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";

/** 확인 단계 입력: 목적 2차맵 키(셀 키 검사는 서버 길 찾기가 한다)·배치 칸, 보낼 유닛(없으면 내 사이보그 본체) */
const travelPlanInput = z.object({
  mapKey: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(255),
  unitId: z.number().int().positive().max(0xffff_ffff).optional(),
});

const notReadyCities = (nowMs: number): WorldCitiesResponse => ({
  status: "not_ready",
  planetId: "",
  faceLevel: 0,
  factions: [],
  cities: [],
  hulls: [],
  milliPerRadian: 0,
  myFactionId: null,
  generatedAt: nowMs,
});

const notReadyPosition = (nowMs: number): WorldPositionResponse => ({
  status: "not_ready",
  position: null,
  fallbackMapKey: null,
  generatedAt: nowMs,
});

export const worldRouter = router({
  /** 1차맵 도시·국가·영토 껍질과 도시마다 둘레 땅·들어가기 가능 여부 */
  cities: signedInProcedure.query(async ({ ctx }) => {
    const services = ctx.worldMap?.();
    return services ? services.cities(ctx.viewer, ctx.now()) : notReadyCities(ctx.now());
  }),
  /** 내 사이보그 자리(2차맵 키·배치 칸·위도·경도) */
  myPosition: signedInProcedure.query(({ ctx }) => {
    const services = ctx.worldMap?.();
    return services ? services.position(ctx.viewer, ctx.now()) : notReadyPosition(ctx.now());
  }),
  /** 2차맵 사이 이동 확인 단계(보내지 않는다) */
  travelPlan: signedInProcedure
    .input(travelPlanInput)
    .query(async ({ ctx, input }): Promise<WorldTravelPlanResponse> => {
      const services = ctx.worldMap?.();
      return services?.travelPlan
        ? services.travelPlan(ctx.viewer, input, ctx.now())
        : { status: "not_ready", plan: null, problem: null, generatedAt: ctx.now() };
    }),
  /** 내 유닛의 길(가는 중 + 최근 끝난 것) */
  travels: signedInProcedure.query(({ ctx }): WorldTravelsResponse => {
    const services = ctx.worldMap?.();
    return services?.travels
      ? services.travels(ctx.viewer, ctx.now())
      : { status: "not_ready", travels: [], generatedAt: ctx.now() };
  }),
});
