// Fastify에 tRPC를 붙인다 — 공식 Fastify 어댑터, 경로 /api/trpc/<프로시저 경로>
// 어댑터는 자기 플러그인 범위 안에서만 JSON 파서를 바꾼다. 텔레메트리 같은 다른 경로에는 영향이 없다.
import { TRPC_PATH } from "@terra/protocol";
import type { AnyRouter, inferRouterContext } from "@trpc/server";
import { type CreateFastifyContextOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import type { FastifyInstance } from "fastify";

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
  await app.register(fastifyTRPCPlugin<TRouter>, {
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
}
