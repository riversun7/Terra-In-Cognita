// tRPC 기본 구성 — 라우터와 프로시저는 여기서 만든 함수로만 만든다
import { TRPCError, initTRPC } from "@trpc/server";
import { type PermissionRequest, rolesAllow } from "../auth/permissions.ts";
import type { TrpcContext } from "./context.ts";

/** 예상하지 못한 오류(INTERNAL_SERVER_ERROR)일 때 기기에 보내는 메시지. 원문은 서버 로그에만 남긴다 */
export const INTERNAL_ERROR_MESSAGE = "internal_error";

/**
 * 기계가 읽는 이유 코드 — 오류 응답 data.reason에 실린다(예: 행성 초안 받지 않음 코드 "invalid_entry").
 * TRPCError의 cause로 넣는다(reasonedError). 화면은 이 코드를 메시지 키로 바꾼다(문장은 보내지 않는다)
 */
export class ErrorReason extends Error {
  readonly reason: string;
  /** 이유를 더 나눈 코드들(data.details, 예: 설정 칸 규칙 문제 코드). 없으면 undefined */
  readonly details: readonly string[] | undefined;

  constructor(reason: string, details?: readonly string[]) {
    super(reason);
    this.name = "ErrorReason";
    this.reason = reason;
    this.details = details;
  }
}

/**
 * 이유 코드를 단 tRPC 오류. message는 고정된 대문자 낱말(사람이 읽는 문장이 아니다), 이유 코드는 data.reason,
 * 더 나눈 코드(선택)는 data.details
 */
export function reasonedError(
  code: TRPCError["code"],
  message: string,
  reason: string,
  details?: readonly string[],
): TRPCError {
  return new TRPCError({ code, message, cause: new ErrorReason(reason, details) });
}

const t = initTRPC.context<TrpcContext>().create({
  // 오류 응답에 스택을 넣지 않는다(서버 내부 경로가 드러나지 않게). 기본값은 NODE_ENV에 따라 바뀐다.
  isDev: false,
  errorFormatter({ shape, error }) {
    // 이유 코드가 없으면 undefined(JSON에서 빠진다). 타입은 늘 같은 모양(data.reason?: string, data.details?: string[])
    const reason = error.cause instanceof ErrorReason ? error.cause.reason : undefined;
    const details = error.cause instanceof ErrorReason ? error.cause.details : undefined;
    const data = { ...shape.data, reason, details };
    // DB 오류 같은 원문 메시지는 내부 정보를 담을 수 있어 기기에 보내지 않는다
    if (error.code === "INTERNAL_SERVER_ERROR") return { ...shape, message: INTERNAL_ERROR_MESSAGE, data };
    return { ...shape, data };
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
