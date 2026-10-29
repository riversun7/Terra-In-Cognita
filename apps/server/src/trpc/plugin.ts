// Fastify에 tRPC를 붙인다 — 공식 Fastify 어댑터, 경로 /api/trpc/<프로시저 경로>
// 어댑터는 자기 플러그인 범위 안에서만 JSON 파서를 바꾼다. 텔레메트리 같은 다른 경로에는 영향이 없다.
// 응답(오류 포함)은 모두 cache-control: no-store다: 관리자·편집기 응답(시드 등)이 브라우저·서비스 워커·프록시 캐시에
// 남지 않게(ADR 38 9절). 어댑터가 보내는 Response 머리글에는 cache-control이 없어 이 값을 덮지 않는다.
// 다른 사이트에서 보낸 쓰기는 맥락을 만들 때 막는다(src/trpc/createContext.ts).
import { TRPC_PATH } from "@terra/protocol";
import type { AnyRouter, inferRouterContext } from "@trpc/server";
import { type CreateFastifyContextOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import type { FastifyInstance } from "fastify";

/** tRPC 응답의 캐시 머리글 */
export const TRPC_CACHE_CONTROL = "no-store";

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
  // 범위를 하나 더 둬서 머리글 훅이 tRPC 경로에만 걸리게 한다
  await app.register(async (scope) => {
    scope.addHook("onRequest", async (_request, reply) => {
      reply.header("cache-control", TRPC_CACHE_CONTROL);
    });
    await scope.register(fastifyTRPCPlugin<TRouter>, {
      prefix: TRPC_PATH,
      trpcOptions: {
        router: options.router,
        createContext: options.createContext,
        // 기기 잘못(형식 오류 등)은 로그를 남기지 않고, 서버 잘못만 원문과 함께 남긴다
        onError({ error, path, req }) {
          if (error.code === "INTERNAL_SERVER_ERROR") {
            req.log.error({ err: error.cause ?? error, path }, "trpc internal error");
          }
        },
      },
    });
  });
}
