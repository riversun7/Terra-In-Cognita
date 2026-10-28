// tRPC 기본 구성 — 라우터와 프로시저는 여기서 만든 함수로만 만든다
import { TRPCError, initTRPC } from "@trpc/server";
import { type PermissionRequest, rolesAllow } from "../auth/permissions.ts";
import type { TrpcContext } from "./context.ts";

/** 예상하지 못한 오류(INTERNAL_SERVER_ERROR)일 때 기기에 보내는 메시지. 원문은 서버 로그에만 남긴다 */
export const INTERNAL_ERROR_MESSAGE = "internal_error";

const t = initTRPC.context<TrpcContext>().create({
  // 오류 응답에 스택을 넣지 않는다(서버 내부 경로가 드러나지 않게). 기본값은 NODE_ENV에 따라 바뀐다.
  isDev: false,
  errorFormatter({ shape, error }) {
    // DB 오류 같은 원문 메시지는 내부 정보를 담을 수 있어 기기에 보내지 않는다
    if (error.code === "INTERNAL_SERVER_ERROR") return { ...shape, message: INTERNAL_ERROR_MESSAGE };
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/** 로그인한 사용자만. 아니면 UNAUTHORIZED. 정지된 계정도 여기서 막힌다(viewer가 null) */
export const signedInProcedure = t.procedure.use(async ({ ctx, next }) => {
  const viewer = await ctx.viewer();
  if (!viewer) throw new TRPCError({ code: "UNAUTHORIZED", message: "SIGN_IN_REQUIRED" });
  return next({ ctx: { viewer } });
});

/**
 * 권한 표(src/auth/permissions.ts)에서 요청한 동작을 허용하는 역할이 있어야 한다. 아니면 FORBIDDEN.
 * 기본 거부: 관리자 프로시저는 반드시 이것으로 만든다.
 */
export function permissionProcedure(request: PermissionRequest) {
  return signedInProcedure.use(({ ctx, next }) => {
    if (!rolesAllow(ctx.viewer.roles, request))
      throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    return next();
  });
}
