// factionIdentity 라우터 — 내 세력 정체성(이름·약어·시그니처 컬러·마크) 정하기·고치기. docs/adr/2026-11-11-faction-identity.md.
// 로그인한 본인 것만 다룬다(입력에 대상이 없다). 게임 판정에 쓰이는 값이 아니라 보이는 이름표라 tRPC 쓰기다(비실시간 기능).
// 그림은 256 × 256 PNG를 base64로 받는다(tRPC 길은 multipart를 받지 않는다 — 20만 바이트의 base64는 약 27만 글자, Fastify 본문 상한 1MiB 안).
// 오류(error.data.code): UNAUTHORIZED, NOT_FOUND(DB 없는 서버), BAD_REQUEST(data.reason = @terra/shared/factionIdentity
// FACTION_IDENTITY_REASONS, 이름·약어 문제는 data.details에 문제 코드), TOO_MANY_REQUESTS(rate_limited)
import { FACTION_EMBLEM_BASE64_MAX } from "@terra/shared/factionIdentity";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";

const identityProcedure = signedInProcedure.use(({ ctx, next }) => {
  const identity = ctx.factionIdentity;
  if (!identity) throw new TRPCError({ code: "NOT_FOUND", message: "FACTION_IDENTITY_UNAVAILABLE" });
  return next({ ctx: { identity, identityViewer: { id: ctx.viewer.id, roles: ctx.viewer.roles } } });
});

/** 규칙은 서버 서비스가 다시 본다. 여기서는 길이만 크게 막는다 */
const nameText = z.string().max(64);
const emblem = z.strictObject({
  shape: z.string().max(24),
  division: z.string().max(24),
  charge: z.string().max(24),
  scheme: z.int().min(0).max(15),
});
const upload = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("keep") }),
  z.strictObject({ mode: z.literal("none") }),
  z.strictObject({ mode: z.literal("new"), pngBase64: z.string().min(1).max(FACTION_EMBLEM_BASE64_MAX) }),
]);

export const factionIdentityRouter = router({
  /** 내 세력 정체성(없으면 identity null)·그림을 올릴 수 있는지·운영자 알림 */
  mine: identityProcedure.query(({ ctx }) => ctx.identity.mine(ctx.identityViewer)),
  /** 이름·약어를 쓸 수 있는지(규칙·겹침). 저장하지 않는다 */
  check: identityProcedure
    .input(z.strictObject({ name: nameText, shortName: nameText }))
    .query(({ ctx, input }) => ctx.identity.check(ctx.identityViewer, input)),
  /** 한 번에 정한다(처음) 또는 고친다 */
  save: identityProcedure
    .input(z.strictObject({ name: nameText, shortName: nameText, color: z.string().max(16), emblem, upload }))
    .mutation(({ ctx, input }) => ctx.identity.save(ctx.identityViewer, input)),
  /** 다른 가문의 마크·이름을 신고한다(질문 930 나, 하루 횟수는 설정 칸) */
  report: identityProcedure
    .input(z.strictObject({ factionId: z.int().positive().max(Number.MAX_SAFE_INTEGER) }))
    .mutation(({ ctx, input }) => ctx.identity.report(ctx.identityViewer, input)),
  /** 운영자가 마크를 내렸다는 알림을 확인했다 */
  dismissNotice: identityProcedure.mutation(({ ctx }) => ctx.identity.dismissNotice(ctx.identityViewer)),
  /**
   * 내 가문(구성원·대기 중인 요청)·받은 초대·보낸 신청·가입할 수 있는 내 나라 가문·가문 소식(질문 985 다, @terra/shared/house HouseView).
   * 초대·신청·받기·나가기·내보내기는 WebSocket 명령이다(프로토콜 23)
   */
  house: identityProcedure.query(({ ctx }) => ctx.identity.house(ctx.identityViewer)),
  /** 가문 연맹(조약) 목록(npc-invest-2 — 가문 열쇠 p:/n:, 든 차례) */
  leagues: identityProcedure.query(({ ctx }) => ctx.identity.leagues()),
  /** 가문 소식을 확인했다(ids가 없으면 모두). 게임 상태가 아니라 읽음 표시라 tRPC다 */
  dismissHouseNotices: identityProcedure
    .input(
      z
        .strictObject({ ids: z.array(z.int().positive().max(Number.MAX_SAFE_INTEGER)).max(100).optional() })
        .optional(),
    )
    .mutation(({ ctx, input }) => ctx.identity.dismissHouseNotices(ctx.identityViewer, { ids: input?.ids })),
});
