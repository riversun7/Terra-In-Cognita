// world 라우터 — 지도 흐름 조회(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1·§7.1). 응답 타입은 @terra/shared/worldMap이다.
// - cities: 1차맵에 그릴 도시·국가(색·이름)·영토 껍질, 도시마다 시작 도시 여부·둘레 땅(행성 값)·띄운 맵인지·내가 볼 수 있는지.
// - myPosition: 내 사이보그 본체가 있는 2차맵·배치 칸(2차맵 화면이 그 맵을 열고 카메라를 맞춘다), 없으면 띄운 첫 2차맵.
// 읽기만 한다. 게임 상태를 바꾸는 명령은 WebSocket이다(AGENTS 4장).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지). 세계(DB)가 없거나 부팅 복구 전이면 status "not_ready"(빈 목록)
import type { WorldCitiesResponse, WorldPositionResponse } from "@terra/shared/worldMap";
import { router, signedInProcedure } from "./init.ts";

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
});
