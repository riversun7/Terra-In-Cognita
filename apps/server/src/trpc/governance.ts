// 나라 의결 라우터 — governance.view(조회). docs/adr/2026-11-21-governance.md, 질문 2351~2365 답(D-580).
// 응답 타입은 @terra/shared/governance다. 바꾸는 명령(안건 올리기·표 던지기·후보 등록)은 여기가 아니라 WebSocket gov_*다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), PRECONDITION_FAILED(data.reason world_not_ready: DB 없는 서버)
import { reasonedError, router, signedInProcedure } from "./init.ts";

export const governanceRouter = router({
  /** 내 나라 지배 가문·임기·안건·내 자격(세계 준비 전이면 status not_ready) */
  view: signedInProcedure.query(async ({ ctx }) => {
    const view = ctx.governance?.();
    if (!view) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
    return view(ctx.viewer.id);
  }),
});
