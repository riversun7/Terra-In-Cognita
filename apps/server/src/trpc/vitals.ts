// vitals 라우터 — 유닛 생명 수치(HP·아머·쉴드) 조회(기획 D-512, docs/adr/2026-10-31-combat-core.md "바뀜 (D-512 …)").
// 응답 타입은 @terra/shared/vitals다. 값을 바꾸는 일(회복 물약)은 WebSocket item_use다(AGENTS 4장).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지)
import { router, signedInProcedure } from "./init.ts";

export const vitalsRouter = router({
  /** 로그인한 본인의 사이보그·보유 유닛 생명 수치(응답 시각까지 분 단위 회복을 셈함). 월드가 준비 전이면 빈 목록 */
  list: signedInProcedure.query(({ ctx }) => ctx.vitals.list(ctx.viewer, ctx.now())),
});
