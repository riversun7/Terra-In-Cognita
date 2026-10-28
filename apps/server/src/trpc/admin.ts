// admin 라우터 — 관리자 화면(게임 앱 안 메뉴, admin에게만 보임)의 기능. 매 요청 서버가 세션·역할을 확인한다(기본 거부).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함), FORBIDDEN(권한 없음), BAD_REQUEST(입력 형식),
// NOT_FOUND(대상 계정 없음), PRECONDITION_FAILED(마지막 admin의 admin 역할은 뺄 수 없음, message "LAST_ADMIN")
import { ROLES } from "@terra/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AdminServices } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

const listInput = z.strictObject({
  /** 아이디 일부(대소문자 무시). 비우면 전체 */
  search: z.string().max(40).default(""),
  limit: z.int().min(1).max(100).default(20),
  offset: z.int().min(0).max(1_000_000).default(0),
});

const setRolesInput = z.strictObject({
  userId: z.uuid(),
  /** 역할 배열. 쉼표로 이은 문자열("player,admin")은 받지 않는다 */
  roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
});

function services(admin: AdminServices | undefined): AdminServices {
  // 인증이 꺼진 서버(DB 없음)에서는 권한 미들웨어가 먼저 UNAUTHORIZED를 낸다. 여기는 만일을 위한 것
  if (!admin) throw new TRPCError({ code: "UNAUTHORIZED", message: "SIGN_IN_REQUIRED" });
  return admin;
}

export const adminRouter = router({
  users: router({
    /** 사용자 찾기(아이디), 쪽 나누기. 아이디 순 */
    list: permissionProcedure({ user: ["list"] })
      .input(listInput)
      .query(({ ctx, input }) => services(ctx.admin).listUsers(input)),
    /** 역할 바꾸기(admin만). 감사 기록을 남긴다 */
    setRoles: permissionProcedure({ user: ["set-role"] })
      .input(setRolesInput)
      .mutation(({ ctx, input }) => services(ctx.admin).setRoles(input)),
  }),
});
