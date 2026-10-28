// 계정 HTTP 응답 읽기 시험 — 서버 약속(@terra/shared accountApi.ts) 모양과, 모르는 모양을 믿지 않는지 본다
import { describe, expect, it } from "vitest";
import { parseAccountView, parseEnterResponse, parseFailure, parseResetResponse } from "./accountResponse.ts";

const user = { id: "0b8f1c9e-7a4d-4f51-9a8e-1f2b3c4d5e6f", loginId: "Fake_Player", roles: ["player"] };
const ok = (body: unknown) => ({ status: 200, body, retryAfter: null });

describe("들어가기 응답", () => {
  it("signed_in·created는 사용자, new_id는 아이디", () => {
    expect(parseEnterResponse(ok({ status: "signed_in", user }))).toEqual({
      ok: true,
      value: { status: "signed_in", user },
    });
    expect(parseEnterResponse(ok({ status: "created", user }))).toEqual({
      ok: true,
      value: { status: "created", user },
    });
    expect(parseEnterResponse(ok({ status: "new_id", loginId: "Fake_New" }))).toEqual({
      ok: true,
      value: { status: "new_id", loginId: "Fake_New" },
    });
  });

  it("200이어도 모르는 모양이면 알 수 없음", () => {
    for (const body of [
      null,
      "ok",
      { status: "signed_in" },
      { status: "new_id" },
      { status: "new_id", loginId: "" },
      { status: "welcome", user },
      { status: "created", user: { ...user, roles: "player" } },
    ]) {
      expect(parseEnterResponse(ok(body))).toEqual({ ok: false, failure: { kind: "unknown" } });
    }
  });

  it("실패 응답의 오류 코드와 기다릴 시간", () => {
    expect(
      parseEnterResponse({ status: 401, body: { error: "INVALID_PASSWORD" }, retryAfter: null }),
    ).toEqual({
      ok: false,
      failure: { kind: "code", code: "INVALID_PASSWORD" },
    });
    expect(
      parseEnterResponse({
        status: 429,
        body: { error: "TOO_MANY_REQUESTS", retryAfterSec: 7 },
        retryAfter: "9",
      }),
    ).toEqual({ ok: false, failure: { kind: "code", code: "TOO_MANY_REQUESTS", retryAfterSec: 7 } });
  });
});

describe("실패 본문", () => {
  it("본문에 시간이 없으면 Retry-After 머리글(초)", () => {
    expect(parseFailure({ error: "SIGNUP_LIMIT" }, "120")).toEqual({
      kind: "code",
      code: "SIGNUP_LIMIT",
      retryAfterSec: 120,
    });
  });

  it("틀린 시간 값은 버린다", () => {
    for (const [body, header] of [
      [{ error: "TOO_MANY_REQUESTS", retryAfterSec: -1 }, null],
      [{ error: "TOO_MANY_REQUESTS", retryAfterSec: "soon" }, "Wed, 21 Oct 2026 07:28:00 GMT"],
      [{ error: "TOO_MANY_REQUESTS" }, ""],
    ] as const) {
      expect(parseFailure(body, header)).toEqual({ kind: "code", code: "TOO_MANY_REQUESTS" });
    }
  });

  it("공용 목록에 없는 코드, 오류 본문이 아닌 것은 알 수 없음", () => {
    expect(parseFailure({ error: "not_found" })).toEqual({ kind: "unknown" });
    expect(parseFailure({ error: 401 })).toEqual({ kind: "unknown" });
    expect(parseFailure(undefined)).toEqual({ kind: "unknown" });
    expect(parseFailure({ message: "Invalid input: expected string" })).toEqual({ kind: "unknown" });
  });
});

describe("비밀번호 찾기 응답", () => {
  it("password_reset만 성공", () => {
    expect(parseResetResponse(ok({ status: "password_reset" }))).toEqual({
      ok: true,
      value: { status: "password_reset" },
    });
    expect(parseResetResponse(ok({ status: "signed_in", user }))).toEqual({
      ok: false,
      failure: { kind: "unknown" },
    });
    expect(parseResetResponse({ status: 400, body: { error: "RESET_FAILED" }, retryAfter: null })).toEqual({
      ok: false,
      failure: { kind: "code", code: "RESET_FAILED" },
    });
  });
});

describe("계정 정보", () => {
  it("모르는 역할 이름은 버리고, 필수 값이 없으면 받지 않는다", () => {
    expect(parseAccountView({ ...user, roles: ["admin", "superuser", 3, "gm"] })).toEqual({
      ...user,
      roles: ["admin", "gm"],
    });
    expect(parseAccountView({ ...user, id: "" })).toBeUndefined();
    expect(parseAccountView({ ...user, loginId: undefined })).toBeUndefined();
    expect(parseAccountView({ id: user.id, loginId: user.loginId })).toBeUndefined();
  });
});
