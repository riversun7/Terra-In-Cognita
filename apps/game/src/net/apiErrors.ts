// 조회 API(tRPC) 오류 → 화면 문구 키 — 순수 함수(시험 대상). 관리자 화면(admin/adminErrors.ts)과 같은 방식이다.
// 처리할 일·복귀 요약·홈 카드처럼 여러 화면이 함께 쓴다(ADR 2026-10-29-app-shell 앱 뼈대 W3·W4).
// 서버 약속: error.data.code가 UNAUTHORIZED(로그인 끝남)·FORBIDDEN(권한 없음)·BAD_REQUEST(입력 형식)·
// INTERNAL_SERVER_ERROR다. 서버·Zod 메시지 원문은 화면에 쓰지 않는다(AGENTS 6장 "Zod 4 + tRPC 11").
// 문구는 이미 있는 일반 키를 다시 쓴다(로그인 끝남·권한 없음·입력값이 올바르지 않음은 관리자 화면 것과 같은 문장).
import { field } from "./json.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";

export interface ApiErrorInfo {
  /** 서버가 준 tRPC 오류 코드. 응답을 받지 못했거나 tRPC 응답이 아니면 null */
  code: string | null;
  key: PlainMessageKey;
  /** 로그인이 끝났을 수 있다 → 세션을 다시 확인한다 */
  sessionEnded: boolean;
}

export function apiErrorInfo(error: unknown): ApiErrorInfo {
  const raw = field(field(error, "data"), "code");
  const code = typeof raw === "string" ? raw : null;
  switch (code) {
    case "UNAUTHORIZED":
      return { code, key: "auth_notice_session_ended", sessionEnded: true };
    case "FORBIDDEN":
      return { code, key: "admin_err_forbidden", sessionEnded: false };
    case "BAD_REQUEST":
      return { code, key: "admin_err_bad_request", sessionEnded: false };
    case "INTERNAL_SERVER_ERROR":
      return { code, key: "err_server", sessionEnded: false };
    case null:
      // 응답을 받지 못했거나 tRPC 응답이 아니다(오프라인, 프록시 오류 화면, 시간 초과로 끊음)
      return { code, key: "err_network", sessionEnded: false };
    default:
      return { code, key: "err_unknown", sessionEnded: false };
  }
}
