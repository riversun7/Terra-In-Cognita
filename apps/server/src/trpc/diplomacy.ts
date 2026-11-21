// 외교 라우터 — diplomacy.view(조회). docs/adr/2026-11-21-diplomacy-treaties.md, 사용자 결정 D-588(질문 2497 가·나).
// 응답 타입은 @terra/shared/treaty다. 바꾸는 명령(조약 제안·맞제안·답·참전 요청)은 여기가 아니라 WebSocket dip_*다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), PRECONDITION_FAILED(data.reason world_not_ready: DB 없는 서버)
import { reasonedError, router, signedInProcedure } from "./init.ts";

export const diplomacyRouter = router({
  /** 내 나라 조약·참전 요청·제안 상대(세계 준비 전이면 status not_ready) */
  view: signedInProcedure.query(async ({ ctx }) => {
    const view = ctx.diplomacy?.();
    if (!view) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
    return view(ctx.viewer.id);
  }),
});
