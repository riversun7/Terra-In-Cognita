// settings 라우터 — 계정 화면 설정(테마·기기 설정 따르기·언어). 로그인한 본인 것만 읽고 쓴다.
// 기기는 로그인할 때 읽어 기기 값과 맞추고, 로그인한 동안 바꾼 값을 올린다(게임 앱 src/settings/accountSync.ts).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), BAD_REQUEST(목록에 없는 값, 빈 요청, 모르는 칸)
import { LOCALES, THEMES } from "@terra/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SettingsServices } from "./context.ts";
import { router, signedInProcedure } from "./init.ts";

const setInput = z
  .strictObject({
    /** null은 "정하지 않음"(기기 규칙을 따른다) */
    theme: z.enum(THEMES).nullable().optional(),
    followSystem: z.boolean().optional(),
    locale: z.enum(LOCALES).nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "EMPTY_PATCH",
  });

function services(settings: SettingsServices | undefined): SettingsServices {
  // 인증이 꺼진 서버(DB 없음)에서는 로그인 미들웨어가 먼저 UNAUTHORIZED를 낸다. 여기는 만일을 위한 것
  if (!settings) throw new TRPCError({ code: "UNAUTHORIZED", message: "SIGN_IN_REQUIRED" });
  return settings;
}

export const settingsRouter = router({
  /** 저장한 설정. 아직 아무것도 저장하지 않았으면 null */
  get: signedInProcedure.query(({ ctx }) => services(ctx.settings).get(ctx.viewer.id)),
  /** 보낸 칸만 바꾼다. 저장한 뒤의 설정 */
  set: signedInProcedure
    .input(setInput)
    .mutation(({ ctx, input }) => services(ctx.settings).set(ctx.viewer.id, input)),
});
