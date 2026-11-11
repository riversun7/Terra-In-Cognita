// 유닛·사이보그 화면 라우터 — units.list·cyborg.get(조회). ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)".
// 사이보그 만들기 조회(cyborg.status·creation·nameCheck)는 docs/adr/2026-11-01-first-login-cyborg.md 4절이다.
// 응답 타입은 @terra/shared/roster·@terra/shared/cyborg다. 직무 배치·장착·파티 편성·굴리기·만들기 같은 바꾸는 명령은 여기가 아니라
// WebSocket으로만 보낸다(그 명령을 만들 때 ADR + PROTOCOL_VERSION). 시안 자료(preview)는 홈 시안 자료와 같은 스위치·권한
// (home: preview, dev·admin)이다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST(입력 형식),
// PRECONDITION_FAILED(data.reason world_not_ready: 세계가 없거나 부팅 복구 전 — 기기는 막지 않고 그대로 연다)
import { z } from "zod";
import type { CyborgReadServices, TrpcContext } from "./context.ts";
import { reasonedError, router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const listInput = z.strictObject({ preview: previewField }).optional();
/** 이름 확인 입력: 서버가 정규화·검사한다(길이 상한만 여기서) */
const nameInput = z.strictObject({ name: z.string().max(64) });

export const unitsRouter = router({
  /**
   * 유닛 추천 표(1차 생산 여섯 가지의 스탯 짝·전투 클래스 표·분류 문턱 — 실효 팩 + 세계 덮어쓰기, docs/adr/2026-11-11-production-six.md).
   * 추천 셈은 화면이 한다(@terra/shared/unitGuide). 표시만 하고 판정에 쓰지 않는다
   */
  guide: signedInProcedure.query(({ ctx }) => ctx.roster.guide(ctx.now())),
  /** 로그인한 본인의 유닛(잡힌 것 포함)·내가 잡은 포로, 시안이면 파티·직무 프리셋·관리인·경매소도 */
  list: signedInProcedure.input(listInput).query(({ ctx, input }) =>
    ctx.roster.units(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
});

function cyborgReads(ctx: Pick<TrpcContext, "cyborgs">): CyborgReadServices {
  const services = ctx.cyborgs?.();
  if (!services) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
  return services;
}

export const cyborgRouter = router({
  /** 로그인한 본인의 사이보그 화면 자료(사이보그가 있으면 실제 이름·본체, 없으면 계정 이름. 시안이면 시안 본체) */
  get: signedInProcedure.input(listInput).query(({ ctx, input }) =>
    ctx.roster.cyborg(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
  /** 사이보그가 있는지(틀 길잡이: 없으면 /start)와 이름·외형(위 띠 얼굴) */
  status: signedInProcedure.query(({ ctx }) => cyborgReads(ctx).status(ctx.viewer)),
  /** 만들기 화면 자료: 지금 굴림·규칙·성향·세력·시작 도시·붐빔 */
  creation: signedInProcedure.query(({ ctx }) => cyborgReads(ctx).creation(ctx.viewer, ctx.now())),
  /** 이름을 쓸 수 있는지(규칙·사칭·이미 있음). 최종 확인은 만들 때 서버가 다시 한다 */
  nameCheck: signedInProcedure
    .input(nameInput)
    .query(({ ctx, input }) => cyborgReads(ctx).nameCheck(input.name)),
});
