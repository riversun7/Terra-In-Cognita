// mail 라우터 — 우편 목록 조회(D-270, 기획 46 §10.2). 응답 타입은 @terra/shared/mail MailListResponse다.
// 보내기·첨부 받기·지우기는 게임 상태를 바꾸는 명령이라 WebSocket으로만 보낸다(AGENTS 4장). 지금은 곧 열림.
// 시안 자료(preview)는 권한 home: preview(dev·admin)가 있어야 한다(홈과 같은 스위치, ADR 37 6절).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST(입력 형식)
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const listInput = z.strictObject({ preview: previewField }).optional();

export const mailRouter = router({
  /** 로그인한 본인의 받은·보낸 우편 */
  list: signedInProcedure
    .input(listInput)
    .query(({ ctx, input }) =>
      ctx.mail.list(ctx.viewer, { preview: previewRequested(ctx.viewer, input?.preview), now: ctx.now() }),
    ),
});
