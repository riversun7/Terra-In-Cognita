// 로그인 상태 규칙 — 순수 함수(시험 대상). 요청·이벤트 연결은 session.ts가 한다.
// 세션 조회(GET /api/auth/get-session) 응답: { user: { id, loginId, roles }, expiresAt } 또는 null
import type { AccountView, SessionResponse } from "@terra/shared";
import { field } from "../net/json.ts";
import { parseAccountView } from "./accountResponse.ts";

export type SignedOutReason =
  /** 이 기기에서 로그아웃을 눌렀다 */
  | "signed_out"
  /** 로그인한 채였는데 서버가 세션이 없다고 했다(만료, 다른 기기에서 비밀번호를 바꿈, 정지) */
  | "ended";

export type SessionState =
  /** 앱을 켜고 처음 확인하는 중 */
  | { kind: "loading" }
  /** 처음 확인을 하지 못했다(서버에 닿지 못함, 인증이 꺼진 서버) */
  | { kind: "unavailable" }
  | { kind: "signed_out"; reason?: SignedOutReason }
  | { kind: "signed_in"; user: AccountView; expiresAt: string };

/** 세션 조회 결과: 응답을 읽었다 / 읽지 못했다 */
export type SessionCheck = { kind: "session"; session: SessionResponse } | { kind: "failed" };

/** 다시 보일 때 세션을 다시 확인하는 최소 간격. 서버는 하루 넘게 쓴 세션이면 쿠키를 새로 준다 */
export const SESSION_RECHECK_MS = 30 * 60_000;

/** get-session 본문 읽기. null은 로그인 안 함, undefined는 모르는 모양 */
export function parseSessionResponse(body: unknown): SessionResponse | undefined {
  if (body === null) return null;
  const user = parseAccountView(field(body, "user"));
  const expiresAt = field(body, "expiresAt");
  if (!user || typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt))) return undefined;
  return { user, expiresAt };
}

/** HTTP 상태와 본문 → 조회 결과. 200이 아니거나 모르는 모양이면 실패로 본다 */
export function toSessionCheck(status: number, body: unknown): SessionCheck {
  if (status !== 200) return { kind: "failed" };
  const session = parseSessionResponse(body);
  return session === undefined ? { kind: "failed" } : { kind: "session", session };
}

/**
 * 다음 상태. 실패했을 때는 아는 상태를 지킨다: 로그인한 채로 잠깐 서버에 닿지 못했다고 로그인 화면으로 보내지 않는다.
 * 처음 확인(loading)이 실패하면 unavailable(다시 시도 버튼).
 */
export function nextSessionState(previous: SessionState, check: SessionCheck): SessionState {
  if (check.kind === "failed") {
    return previous.kind === "loading" || previous.kind === "unavailable"
      ? { kind: "unavailable" }
      : previous;
  }
  const { session } = check;
  if (session) return { kind: "signed_in", user: session.user, expiresAt: session.expiresAt };
  if (previous.kind === "signed_in") return { kind: "signed_out", reason: "ended" };
  // 이미 로그인 화면이면 알림(reason)을 그대로 둔다
  return previous.kind === "signed_out" ? previous : { kind: "signed_out" };
}

/** 다시 확인할 때가 됐는지. 시계가 뒤로 가도 차이의 절댓값으로 본다 */
export function shouldRecheck(lastCheckedAt: number | null, now: number): boolean {
  return lastCheckedAt === null || Math.abs(now - lastCheckedAt) >= SESSION_RECHECK_MS;
}

export function isAdmin(state: SessionState): boolean {
  return state.kind === "signed_in" && state.user.roles.includes("admin");
}
