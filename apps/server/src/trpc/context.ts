// tRPC 요청 맥락 — 프로시저가 읽는 값. 요청마다 새로 만든다.
// 이 타입은 AppRouter 타입에 들어가 게임 앱의 타입 검사에도 쓰인다.
// 그래서 Node 전용 타입(fastify, pg, drizzle 등)을 여기에 직접 넣지 않는다.
// 넣으면 기기 코드에서 Node 전역(process, Buffer)이 타입 오류 없이 보이게 된다 — scripts/check-boundaries.mjs가 잡는다.

export interface TrpcContext {
  /** 콘텐츠 팩 버전 */
  contentVersion: string;
  /** 서버 시각(UTC ms). 시험에서는 고정값을 넣는다 */
  now: () => number;
}

export interface TrpcContextOptions {
  contentVersion: string;
  now: () => number;
}

/** 요청마다 맥락을 만드는 함수. 인증(Better Auth)이 붙으면 요청 머리글에서 세션을 읽는다 */
export function createContextFactory(options: TrpcContextOptions): () => TrpcContext {
  return () => ({ contentVersion: options.contentVersion, now: options.now });
}
