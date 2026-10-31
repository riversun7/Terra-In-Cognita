// faction 라우터 — 세력 화면 조회(D-439, 기획 46). 응답 타입은 @terra/shared/faction FactionOverviewResponse다.
// 선전포고·투표·편입 답 같은 게임 상태를 바꾸는 명령은 여기가 아니라 WebSocket으로만 보낸다(AGENTS 4장). 지금은 곧 열림.
// 시안 자료(preview)는 권한 home: preview(dev·admin)가 있어야 한다(홈과 같은 스위치, ADR 37 6절).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST(입력 형식)
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const overviewInput = z.strictObject({ preview: previewField }).optional();

export const factionRouter = router({
  /** 로그인한 본인의 세력 화면 한 장 */
  overview: signedInProcedure.input(overviewInput).query(({ ctx, input }) =>
    ctx.faction.overview(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
});
