// 로그인 상태 규칙 시험 — 세션 조회 응답 읽기, 상태 바꾸기, 다시 확인할 때
import type { AccountView } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  SESSION_RECHECK_MS,
  type SessionState,
  isAdmin,
  isStaff,
  nextSessionState,
  parseSessionResponse,
  shouldRecheck,
  toSessionCheck,
} from "./sessionState.ts";

const user: AccountView = {
  id: "0b8f1c9e-7a4d-4f51-9a8e-1f2b3c4d5e6f",
  loginId: "Fake_Admin",
  roles: ["player", "admin"],
};
const expiresAt = "2026-11-04T12:00:00.000Z";
const signedIn: SessionState = { kind: "signed_in", user, expiresAt };

describe("세션 조회 응답", () => {
  it("null은 로그인 안 함, 사용자·만료 시각이 있으면 세션", () => {
    expect(parseSessionResponse(null)).toBeNull();
    expect(parseSessionResponse({ user, expiresAt })).toEqual({ user, expiresAt });
  });

  it("모르는 모양은 받지 않는다(세션 토큰 같은 다른 값은 버린다)", () => {
    expect(parseSessionResponse({ user })).toBeUndefined();
    expect(parseSessionResponse({ user, expiresAt: "soon" })).toBeUndefined();
    expect(parseSessionResponse({ user: { id: user.id }, expiresAt })).toBeUndefined();
    expect(parseSessionResponse(undefined)).toBeUndefined();
    expect(parseSessionResponse({ user: { ...user, token: "t", email: "e" }, expiresAt })).toEqual({
      user,
      expiresAt,
    });
  });

  it("200이 아니거나 모르는 모양이면 실패", () => {
    expect(toSessionCheck(200, null)).toEqual({ kind: "session", session: null });
    expect(toSessionCheck(404, { error: "not_found" })).toEqual({ kind: "failed" });
    expect(toSessionCheck(502, undefined)).toEqual({ kind: "failed" });
    expect(toSessionCheck(200, { ok: true })).toEqual({ kind: "failed" });
  });
});

describe("상태 바꾸기", () => {
  const session = { kind: "session", session: { user, expiresAt } } as const;
  const none = { kind: "session", session: null } as const;
  const failed = { kind: "failed" } as const;

  it("처음 확인: 세션이면 로그인됨, 없으면 로그인 화면, 실패하면 다시 시도 화면", () => {
    expect(nextSessionState({ kind: "loading" }, session)).toEqual(signedIn);
    expect(nextSessionState({ kind: "loading" }, none)).toEqual({ kind: "signed_out" });
    expect(nextSessionState({ kind: "loading" }, failed)).toEqual({ kind: "unavailable" });
    expect(nextSessionState({ kind: "unavailable" }, none)).toEqual({ kind: "signed_out" });
  });

  it("로그인한 채로 잠깐 실패하면 그대로 둔다", () => {
    expect(nextSessionState(signedIn, failed)).toBe(signedIn);
  });

  it("로그인한 채였는데 세션이 없으면 '로그인이 끝남'", () => {
    expect(nextSessionState(signedIn, none)).toEqual({ kind: "signed_out", reason: "ended" });
  });

  it("로그인 화면에서는 안내(reason)를 지킨다", () => {
    const out: SessionState = { kind: "signed_out", reason: "signed_out" };
    expect(nextSessionState(out, none)).toBe(out);
    expect(nextSessionState(out, failed)).toBe(out);
    expect(nextSessionState(out, session)).toEqual(signedIn);
  });
});

describe("다시 확인할 때", () => {
  it("처음이거나 30분이 지났으면 다시 확인", () => {
    expect(shouldRecheck(null, 0)).toBe(true);
    expect(shouldRecheck(1_000, 1_000 + SESSION_RECHECK_MS - 1)).toBe(false);
    expect(shouldRecheck(1_000, 1_000 + SESSION_RECHECK_MS)).toBe(true);
    // 시계가 뒤로 가도 멈추지 않는다
    expect(shouldRecheck(1_000 + SESSION_RECHECK_MS, 1_000)).toBe(true);
  });
});

describe("관리자 버튼", () => {
  it("admin 역할이 있을 때만", () => {
    expect(isAdmin(signedIn)).toBe(true);
    expect(isAdmin({ ...signedIn, user: { ...user, roles: ["player", "gm", "dev"] } })).toBe(false);
    expect(isAdmin({ kind: "signed_out" })).toBe(false);
  });
});

describe("운영진 표시(지도 성능 판)", () => {
  it("gm·admin·dev 중 하나가 있으면 운영진, player만이거나 로그인 안 했으면 아니다", () => {
    expect(isStaff(signedIn)).toBe(true);
    expect(isStaff({ ...signedIn, user: { ...user, roles: ["player", "gm"] } })).toBe(true);
    expect(isStaff({ ...signedIn, user: { ...user, roles: ["dev"] } })).toBe(true);
    expect(isStaff({ ...signedIn, user: { ...user, roles: ["player"] } })).toBe(false);
    expect(isStaff({ ...signedIn, user: { ...user, roles: [] } })).toBe(false);
    expect(isStaff({ kind: "signed_out" })).toBe(false);
  });
});
