// summary 라우터 — 복귀 요약(조회). ADR 2026-10-29-app-shell 8절, D-6014·D-266
// 응답 타입은 @terra/shared/inbox SummaryGetResponse다. 보일지(show)는 서버가 정한다. 확인(summary.ack)은 그 요약의 until까지 본 것으로 적는다.
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const getInput = z.strictObject({ preview: previewField }).optional();
/** 확인: 받은 요약의 until(서버 시각 ms) */
const ackInput = z.strictObject({ until: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });

export const summaryRouter = router({
  /** 로그인한 본인의 복귀 요약(마지막 확인 뒤 사건) */
  get: signedInProcedure
    .input(getInput)
    .query(({ ctx, input }) =>
      ctx.home.summary(ctx.viewer, { preview: previewRequested(ctx.viewer, input?.preview), now: ctx.now() }),
    ),
  /** 복귀 요약을 닫았다([확인]·Esc·숫자 눌러 이동). 다음 요약은 until 뒤 사건만 센다. 화면 확인 기록이라 게임 상태가 아니다 */
  ack: signedInProcedure.input(ackInput).mutation(async ({ ctx, input }) => {
    await ctx.home.ackSummary(ctx.viewer, input.until, ctx.now());
    return { ok: true as const };
  }),
});
