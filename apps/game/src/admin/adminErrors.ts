// 관리자 기능(tRPC) 오류 → 화면 문구 키 — 순수 함수(시험 대상).
// 서버 약속(apps/server/src/trpc/admin.ts): error.data.code가 UNAUTHORIZED·FORBIDDEN·BAD_REQUEST·NOT_FOUND·
// PRECONDITION_FAILED(message "LAST_ADMIN")다. 서버·Zod 메시지 원문은 보여 주지 않는다(LAST_ADMIN 비교에만 쓴다).
import { field } from "../net/json.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";

/** 마지막 admin의 admin 역할을 빼려 할 때 서버가 주는 메시지 */
export const LAST_ADMIN_MESSAGE = "LAST_ADMIN";

export interface AdminErrorInfo {
  key: PlainMessageKey;
  /** 로그인이 끝났을 수 있다 → 세션을 다시 확인한다 */
  sessionEnded: boolean;
}

export function adminErrorInfo(error: unknown): AdminErrorInfo {
  const code = field(field(error, "data"), "code");
  switch (code) {
    case "UNAUTHORIZED":
      return { key: "admin_err_unauthorized", sessionEnded: true };
    case "FORBIDDEN":
      return { key: "admin_err_forbidden", sessionEnded: false };
    case "BAD_REQUEST":
      return { key: "admin_err_bad_request", sessionEnded: false };
    case "NOT_FOUND":
      return { key: "admin_err_not_found", sessionEnded: false };
    case "PRECONDITION_FAILED":
      return {
        key: field(error, "message") === LAST_ADMIN_MESSAGE ? "admin_err_last_admin" : "err_unknown",
        sessionEnded: false,
      };
    case "INTERNAL_SERVER_ERROR":
      return { key: "err_server", sessionEnded: false };
    case undefined:
      // 응답을 받지 못했거나 tRPC 응답이 아니다(오프라인, 프록시 오류 화면)
      return { key: "err_network", sessionEnded: false };
    default:
      return { key: "err_unknown", sessionEnded: false };
  }
}
