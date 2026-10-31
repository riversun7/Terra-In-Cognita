// 유닛·사이보그 화면 라우터 — units.list·cyborg.get(조회). ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)".
// 응답 타입은 @terra/shared/roster다. 직무 배치·장착·파티 편성 같은 바꾸는 명령은 여기가 아니라 WebSocket으로만 보낸다(그 명령을
// 만들 때 ADR + PROTOCOL_VERSION). 시안 자료(preview)는 홈 시안 자료와 같은 스위치·권한(home: preview, dev·admin)이다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST(입력 형식)
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const listInput = z.strictObject({ preview: previewField }).optional();

export const unitsRouter = router({
  /** 로그인한 본인의 유닛(잡힌 것 포함)·내가 잡은 포로, 시안이면 파티·직무 프리셋·관리인·경매소도 */
  list: signedInProcedure.input(listInput).query(({ ctx, input }) =>
    ctx.roster.units(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
});

export const cyborgRouter = router({
  /** 로그인한 본인의 사이보그 화면 자료(이름·유닛 수는 실제, 본체는 시안만) */
  get: signedInProcedure.input(listInput).query(({ ctx, input }) =>
    ctx.roster.cyborg(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
});
