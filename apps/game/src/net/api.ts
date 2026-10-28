// 요청·응답 API(tRPC) 클라이언트 — 조회와 비실시간 기능용 (PLAN 4.3).
// 게임 상태를 바꾸는 명령은 여기가 아니라 WebSocket(connection.ts)으로만 보낸다.
// 서버의 AppRouter는 타입만 가져온다(`import type`). 서버 코드는 기기 번들에 들어가지 않는다.
// 값 import는 scripts/check-boundaries.mjs가 막는다 (ADR 2026-10-28-trpc-type-sharing).
import { TRPC_PATH } from "@terra/protocol";
import type { AppRouter } from "@terra/server/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

type BatchLinkOptions = Parameters<typeof httpBatchLink<AppRouter>>[0];

export interface ApiClientOptions {
  /** 기본은 같은 주소의 /api/trpc (개발 서버는 vite.config.ts의 프록시로 넘긴다) */
  url?: string;
  /** 시험에서 가짜 fetch를 넣을 때 */
  fetch?: BatchLinkOptions["fetch"];
}

export function createApiClient(options: ApiClientOptions = {}) {
  return createTRPCClient<AppRouter>({
    links: [
      // 같은 틱에 부른 요청은 HTTP 요청 하나로 묶는다
      httpBatchLink({ url: options.url ?? TRPC_PATH, ...(options.fetch ? { fetch: options.fetch } : {}) }),
    ],
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** 앱 전체가 함께 쓰는 클라이언트. 만들기만 해서는 요청을 보내지 않는다 */
export const api: ApiClient = createApiClient();
