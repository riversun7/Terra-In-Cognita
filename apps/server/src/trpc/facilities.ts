// facilities 라우터 — 건물 조회(docs/adr/2026-11-07-buildings-runtime.md). 응답 타입은 @terra/shared/facilities
// FacilitiesOverviewResponse다. 짓기·레벨업·수리·장비 수리·개발 시험 명령은 게임 상태를 바꾸는 명령이라 WebSocket으로만 보낸다(AGENTS 4장).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지)
import { createFacilityScreenServices } from "../facilities/screen.ts";
import { router, signedInProcedure } from "./init.ts";

const notReady = createFacilityScreenServices();

export const facilitiesRouter = router({
  /** 로그인한 본인의 시설·작업·재료·유닛·고칠 장비·내 세력 비콘, 지을 수 있는 시설 목록, N50 규칙 값 */
  overview: signedInProcedure.query(({ ctx }) => (ctx.facilities ?? notReady).overview(ctx.viewer, ctx.now())),
});
