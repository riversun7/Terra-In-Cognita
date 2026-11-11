// facilities 라우터 — 건물 조회(docs/adr/2026-11-07-buildings-runtime.md). 응답 타입은 @terra/shared/facilities
// FacilitiesOverviewResponse, 2차맵 건물 겉모습은 @terra/shared/mapLooks MapLooksResponse(ADR 2026-11-08-building-art)다.
// 짓기·레벨업·수리·장비 수리·개발 시험 명령은 게임 상태를 바꾸는 명령이라 WebSocket으로만 보낸다(AGENTS 4장).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지)
import { z } from "zod";
import { createFacilityScreenServices } from "../facilities/screen.ts";
import { router, signedInProcedure } from "./init.ts";

const notReady = createFacilityScreenServices();

export const facilitiesRouter = router({
  /** 로그인한 본인의 시설·작업·재료·유닛·고칠 장비·내 세력 비콘, 지을 수 있는 시설 목록, N50 규칙 값 */
  overview: signedInProcedure.query(({ ctx }) =>
    (ctx.facilities ?? notReady).overview(ctx.viewer, ctx.now()),
  ),
  /** 띄운 2차맵의 건물 겉모습(시설·레벨·상태·국가) — 2차맵 건물 모델 고르기용. 띄우지 않은 2차맵은 status "unknown_map" */
  mapLooks: signedInProcedure
    .input(z.strictObject({ mapKey: z.int().min(0).max(Number.MAX_SAFE_INTEGER) }))
    .query(({ ctx, input }) => (ctx.facilities ?? notReady).mapLooks(ctx.viewer, input.mapKey, ctx.now())),
  /**
   * 띄운 2차맵의 물 표(지형 칸마다 1비트, 16진수 — 질문 947 나): 짓기 폼의 물가 조건 미리 보기. 지형 파일(/api/maps/:mapKey/terrain)과 같은
   * 공개 범위(로그인한 누구나)다
   */
  waterMask: signedInProcedure
    .input(z.strictObject({ mapKey: z.int().min(0).max(Number.MAX_SAFE_INTEGER) }))
    .query(({ ctx, input }) => (ctx.facilities ?? notReady).waterMask(input.mapKey)),
});
