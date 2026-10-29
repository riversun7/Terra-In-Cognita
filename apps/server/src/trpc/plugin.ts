// Fastify에 tRPC를 붙인다 — 공식 Fastify 어댑터, 경로 /api/trpc/<프로시저 경로>
// 어댑터는 자기 플러그인 범위 안에서만 JSON 파서를 바꾼다. 텔레메트리 같은 다른 경로에는 영향이 없다.
// 이 범위(/api/trpc 아래)의 모든 응답(오류, 없는 경로 404 포함)은 cache-control: no-store다: 관리자·편집기 응답(시드 등)이
// 브라우저·서비스 워커·프록시 캐시에 남지 않게(ADR 38 9절). 어댑터가 보내는 Response 머리글에는 cache-control이 없어
// 이 값을 덮지 않는다.
// 쓰기(GET·HEAD가 아닌 요청)의 본문은 JSON만 받는다(application/json, 기기 httpBatchLink가 보내는 것). 어댑터는
// multipart/form-data 본문을 Fastify 본문 상한(1MiB) 없이 스트림으로 넘기고, tRPC가 그것을 끝까지 메모리에 모은다
// (Request.formData). 로그인한 아무 계정이나 큰 본문 하나로 서버 메모리를 채울 수 있어서, 본문을 읽기 전(onRequest)에
// 415로 끊는다(연결도 닫는다: 남은 본문을 받지 않게).
// 묶음 요청은 프로시저 TRPC_MAX_BATCH_SIZE개까지(넘으면 맥락을 만들기 전에 BAD_REQUEST).
// 다른 사이트에서 보낸 요청은 맥락을 만들 때 막는다(src/trpc/createContext.ts).
import { TRPC_MAX_BATCH_SIZE, TRPC_PATH } from "@terra/protocol";
import type { AnyRouter, inferRouterContext } from "@trpc/server";
import { type CreateFastifyContextOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import type { FastifyInstance } from "fastify";
import { isJsonRequest } from "../auth/requestGuard.ts";

/** tRPC 응답의 캐시 머리글 */
export const TRPC_CACHE_CONTROL = "no-store";

/** JSON이 아닌 본문의 쓰기 요청에 주는 오류(415) */
export const TRPC_UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE";

/** 본문을 보지 않는 요청 */
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

export interface TrpcPluginOptions<TRouter extends AnyRouter> {
  router: TRouter;
  createContext: (
    opts: CreateFastifyContextOptions,
  ) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
}

export async function registerTrpc<TRouter extends AnyRouter>(
  app: FastifyInstance,
  options: TrpcPluginOptions<TRouter>,
): Promise<void> {
  // 범위를 하나 더 둬서(앞머리 /api/trpc) 훅과 404 처리가 tRPC 경로에만 걸리게 한다
  await app.register(
    async (scope) => {
      scope.addHook("onRequest", async (request, reply) => {
        reply.header("cache-control", TRPC_CACHE_CONTROL);
        if (!BODYLESS_METHODS.has(request.method) && !isJsonRequest(request.headers)) {
          return reply.code(415).header("connection", "close").send({ error: TRPC_UNSUPPORTED_MEDIA_TYPE });
        }
        return undefined;
      });
      // 프로시저 경로 모양이 아닌 주소(/api/trpc, /api/trpc/a/b). 위 훅이 no-store를 붙인다
      scope.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "not_found" }));
      // 어댑터의 경로는 이 범위 앞머리 아래 "/:path"다(어댑터에 prefix를 따로 주지 않는다)
      await scope.register(fastifyTRPCPlugin<TRouter>, {
        trpcOptions: {
          router: options.router,
          createContext: options.createContext,
          maxBatchSize: TRPC_MAX_BATCH_SIZE,
          // 기기 잘못(형식 오류 등)은 로그를 남기지 않고, 서버 잘못만 원문과 함께 남긴다
          onError({ error, path, req }) {
            if (error.code === "INTERNAL_SERVER_ERROR") {
              req.log.error({ err: error.cause ?? error, path }, "trpc internal error");
            }
          },
        },
      });
    },
    { prefix: TRPC_PATH },
  );
}
