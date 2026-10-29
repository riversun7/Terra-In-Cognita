// settings 라우터 — 계정 설정(테마·기기 설정 따르기·언어·메뉴·홈). 로그인한 본인 것만 읽고 쓴다.
// 기기는 로그인할 때 읽어 기기 값과 맞추고, 로그인한 동안 바꾼 값을 묶음마다 올린다(게임 앱 src/settings/accountSync.ts).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), BAD_REQUEST(목록에 없는 값, 빈 요청, 모르는 칸, 메뉴·홈의 틀린 모양·상한 넘음·
// jsonb에 넣을 수 없는 글자)
// 메뉴(nav)·홈(home) 입력 검사(ADR 2026-10-29-app-shell 5절)
// - 바깥은 strictObject 그대로다. 그래서 옛 서버는 새 칸을 400으로 막는다(기기는 묶음마다 따로 올려 다른 묶음은 올라간다).
// - nav·home 안의 객체는 looseObject다. 모르는 칸(더 새 버전)도 그대로 저장한다. 직렬화 크기는 4KB까지.
// - 칸 이름·글자 값의 NUL·짝 없는 대리 문자는 받지 않는다(jsonb가 받지 않아 DB 오류 500이 되고 오류 로그가 남았다).
// - ID 모양(SAVED_ID_PATTERN)과 목록 길이 상한(메뉴 32, 카드 24)은 아는 칸에만 건다. 목록에 있는지는 보지 않는다:
//   되돌림 배포 때 더 새 기기의 값을 막지 않으려고다.
// - 역할에 따라 저장값이 달라지는 칸은 home.template 하나다(enforceHomeTemplate, ADR 37 6절·사용자 결정 2).
import {
  LOCALES,
  NAV_MENU_MAX,
  type Role,
  SAVED_ID_PATTERN,
  SETTINGS_OBJECT_MAX_BYTES,
  type SettingsObject,
  THEMES,
  hasUnstorableText,
  isSettingsObject,
  settingsObjectBytes,
} from "@terra/shared";
import { DEFAULT_HOME_TEMPLATE, HOME_CARDS_MAX, mergeHome } from "@terra/shared/dashboard";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { rolesAllow } from "../auth/permissions.ts";
import type { SettingsServices, UserSettingsPatch } from "./context.ts";
import { router, signedInProcedure } from "./init.ts";

/** 계정에 저장되는 ID(메뉴 항목·카드·템플릿)의 모양 */
const savedId = z.string().regex(SAVED_ID_PATTERN);

/** 짧은 값(배치·카드 크기). 목록에 있는지는 보지 않는다 */
const shortToken = z.string().regex(/^[a-z0-9][a-z0-9_]{0,15}$/);

/**
 * 메뉴·홈 값: JSON 객체 → 크기(4KB) → jsonb에 넣을 수 있는 글자 → 아는 칸의 모양. 입력 타입은 모양을 모르는 객체
 * (SettingsObject)다 — 기기는 안쪽을 읽지 않고 보낸다(게임 앱 settings/settings.ts chooseNavigation·chooseHome).
 * 크기를 넘으면 글자는 보지 않는다(abort: 큰 본문을 두 번 훑지 않게)
 */
function settingsObjectInput<T extends z.ZodType<SettingsObject, SettingsObject>>(fields: T) {
  return z
    .custom<SettingsObject>(isSettingsObject, { message: "NOT_AN_OBJECT" })
    .refine((value) => settingsObjectBytes(value) <= SETTINGS_OBJECT_MAX_BYTES, {
      message: "TOO_LARGE",
      abort: true,
    })
    .refine((value) => !hasUnstorableText(value), { message: "UNSTORABLE_TEXT" })
    .pipe(fields);
}

/**
 * 메뉴(nav, @terra/shared navigation.ts의 아는 칸): 배치(layout), 메뉴 순서(menu). 탭 칸은 따로 저장하지 않는다
 * (D-265: 하단 탭 = 메뉴 순서의 앞에서부터 폭에 맞는 칸 수). nav 모양이 바뀌면 이 표를 함께 고친다(꽂는 줄)
 */
const navInput = settingsObjectInput(
  z.looseObject({
    layout: shortToken.optional(),
    menu: z.array(savedId).max(NAV_MENU_MAX).optional(),
  }),
);

/** 홈(home, @terra/shared/dashboard의 아는 칸): 템플릿, 카드 목록({ id, size }) */
const homeInput = settingsObjectInput(
  z.looseObject({
    template: savedId.optional(),
    cards: z
      .array(z.looseObject({ id: savedId, size: shortToken.optional() }))
      .max(HOME_CARDS_MAX)
      .optional(),
  }),
);

const setInput = z
  .strictObject({
    /** null은 "정하지 않음"(기기 규칙을 따른다) */
    theme: z.enum(THEMES).nullable().optional(),
    followSystem: z.boolean().optional(),
    locale: z.enum(LOCALES).nullable().optional(),
    nav: navInput.optional(),
    home: homeInput.optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "EMPTY_PATCH",
  });

/**
 * 템플릿 저장 규칙(ADR 37 6절, 사용자 결정 2): dev·admin(권한 home: template)이 아닌 계정이 보낸 home.template이
 * 기본값(dt_hybrid)이 아니면 그 칸만 기본값으로 바꿔 저장한다(mergeHome — cards와 모르는 칸은 그대로).
 * 거절(403)하지 않는다: 같은 기기를 dev·admin과 함께 쓰면 기기에 남은 다른 템플릿이 플레이어 계정으로 올라갈 수 있는데,
 * 거절하면 그 플레이어의 홈 묶음(카드 순서) 올리기가 계속 실패한다. 템플릿 칸이 없으면 그대로 둔다(읽을 때 기본값이다).
 */
function enforceHomeTemplate(home: SettingsObject, roles: readonly Role[]): SettingsObject {
  if (!Object.hasOwn(home, "template") || home["template"] === DEFAULT_HOME_TEMPLATE) return home;
  if (rolesAllow(roles, { home: ["template"] })) return home;
  return mergeHome(home, { template: DEFAULT_HOME_TEMPLATE });
}

function services(settings: SettingsServices | undefined): SettingsServices {
  // 인증이 꺼진 서버(DB 없음)에서는 로그인 미들웨어가 먼저 UNAUTHORIZED를 낸다. 여기는 만일을 위한 것
  if (!settings) throw new TRPCError({ code: "UNAUTHORIZED", message: "SIGN_IN_REQUIRED" });
  return settings;
}

export const settingsRouter = router({
  /** 저장한 설정. 아직 아무것도 저장하지 않았으면 null. 메뉴·홈은 저장한 적이 있을 때만 칸이 있다 */
  get: signedInProcedure.query(({ ctx }) => services(ctx.settings).get(ctx.viewer.id)),
  /** 보낸 칸만 바꾼다. 저장한 뒤의 설정 */
  set: signedInProcedure.input(setInput).mutation(({ ctx, input }) => {
    const patch: UserSettingsPatch =
      input.home === undefined
        ? input
        : { ...input, home: enforceHomeTemplate(input.home, ctx.viewer.roles) };
    return services(ctx.settings).set(ctx.viewer.id, patch);
  }),
});
