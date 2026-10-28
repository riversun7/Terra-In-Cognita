// 요청·응답 API(tRPC) 경로 — 조회와 비실시간 기능용 (PLAN 4.3).
// 게임 상태를 바꾸는 명령은 이 경로가 아니라 WebSocket으로만 보낸다.
// WebSocket 메시지가 아니라서 PROTOCOL_VERSION과 무관하다. 기기·서버가 같은 값을 쓴다.

/** tRPC 경로 앞부분. 프로시저 `system.info`는 `/api/trpc/system.info`가 된다 */
export const TRPC_PATH = "/api/trpc";
