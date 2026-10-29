// summary 라우터 — 복귀 요약(조회). ADR 2026-10-29-app-shell 8절, D-6014·D-266
// 응답 타입은 @terra/shared/inbox SummaryGetResponse다. 보일지(show)는 서버가 정한다. 확인(summary.ack)은 첫 사건 출처와 함께 만든다.
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const getInput = z.strictObject({ preview: previewField }).optional();

export const summaryRouter = router({
  /** 로그인한 본인의 복귀 요약(마지막 확인 뒤 사건) */
  get: signedInProcedure
    .input(getInput)
    .query(({ ctx, input }) =>
      ctx.home.summary(ctx.viewer, { preview: previewRequested(ctx.viewer, input?.preview), now: ctx.now() }),
    ),
});
