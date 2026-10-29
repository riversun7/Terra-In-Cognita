// inbox 라우터 — 처리할 일 목록(조회). ADR 2026-10-29-app-shell 7절, D-6006·D-6009·D-6015
// 응답 타입은 @terra/shared/inbox InboxListResponse다. 바로 처리(게임 상태를 바꾸는 명령)는 여기가 아니라 WebSocket으로만 보낸다
// (inbox_action, 첫 실제 동작 때 ADR + PROTOCOL_VERSION). 완료 확인(inbox.ack)은 첫 완료 종류와 함께 만든다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST(입력 형식)
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const listInput = z.strictObject({ preview: previewField }).optional();

export const inboxRouter = router({
  /** 로그인한 본인의 처리할 일. 서버가 정렬·묶어서 준다 */
  list: signedInProcedure
    .input(listInput)
    .query(({ ctx, input }) =>
      ctx.home.inbox(ctx.viewer, { preview: previewRequested(ctx.viewer, input?.preview), now: ctx.now() }),
    ),
});
