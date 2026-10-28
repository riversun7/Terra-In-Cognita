// tRPC 기본 구성 — 라우터와 프로시저는 여기서 만든 함수로만 만든다
import { initTRPC } from "@trpc/server";
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
