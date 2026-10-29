// dashboard 라우터 — 홈 서버 카드 상태(조회). ADR 2026-10-29-app-shell 6절, D-6001
// 응답 타입은 @terra/shared/dashboard DashboardCardsResponse다. 카드마다 not_ready | empty | ready.
// 시안 자료(preview)에서도 사이보그·보유 유닛·자산·세력 카드는 "준비 중"이지만 권한은 같게 본다(home: preview).
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST(입력 형식, 카드 25장 이상)
import { HOME_CARDS_MAX } from "@terra/shared/dashboard";
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const cardsInput = z.strictObject({
  /** 홈에 있는 카드 ID. 모르는 ID(더 새 기기)는 빼고 답한다 */
  ids: z.array(z.string().min(1).max(64)).max(HOME_CARDS_MAX),
  preview: previewField,
});

export const dashboardRouter = router({
  /** 로그인한 본인의 서버 카드 상태(요청 순서, 서버 카드만) */
  cards: signedInProcedure.input(cardsInput).query(({ ctx, input }) =>
    ctx.home.cards(ctx.viewer, input.ids, {
      preview: previewRequested(ctx.viewer, input.preview),
      now: ctx.now(),
    }),
  ),
});
