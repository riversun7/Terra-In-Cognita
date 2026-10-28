// 입력 검사 시험 — 아이디 규칙은 공용 parseLoginId, 새 비밀번호 길이·아이디와 같음은 서버 규칙과 같은 숫자
import { describe, expect, it } from "vitest";
import {
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  checkCreate,
  checkLogin,
  checkReset,
  hasErrors,
  newPasswordProblem,
} from "./validation.ts";

describe("로그인 화면", () => {
  it("맞는 아이디는 공백을 지우고 정규화한 모양으로 보낸다(대소문자는 그대로)", () => {
    expect(checkLogin({ id: "  Fake_Player1 ", password: "x" })).toEqual({
      ok: true,
      loginId: "Fake_Player1",
    });
    // 전각 영문은 NFKC로 반각이 된다
    expect(checkLogin({ id: "ｆａｋｅ_1", password: "x" })).toEqual({ ok: true, loginId: "fake_1" });
  });

  it("아이디 문제마다 다른 문구", () => {
    expect(checkLogin({ id: "", password: "x" })).toEqual({ ok: false, errors: { id: "auth_id_empty" } });
    expect(checkLogin({ id: "테라", password: "x" })).toEqual({
      ok: false,
      errors: { id: "auth_id_invalid_chars" },
    });
    expect(checkLogin({ id: "ab", password: "x" })).toEqual({
      ok: false,
      errors: { id: "auth_id_too_short" },
    });
    expect(checkLogin({ id: "a".repeat(21), password: "x" })).toEqual({
      ok: false,
      errors: { id: "auth_id_too_long" },
    });
  });

  it("비밀번호가 비면 그 칸 오류(로그인에는 길이 규칙을 보지 않는다)", () => {
    expect(checkLogin({ id: "fake_user", password: "" })).toEqual({
      ok: false,
      errors: { password: "auth_password_empty" },
    });
    expect(checkLogin({ id: "fake_user", password: "short" })).toEqual({ ok: true, loginId: "fake_user" });
    expect(checkLogin({ id: "", password: "" })).toEqual({
      ok: false,
      errors: { id: "auth_id_empty", password: "auth_password_empty" },
    });
  });
});

describe("새 비밀번호 규칙", () => {
  it("길이 경계", () => {
    expect(newPasswordProblem("a".repeat(NEW_PASSWORD_MIN_LENGTH - 1), "fake_user")).toBe(
      "auth_err_password_too_short",
    );
    expect(newPasswordProblem("a".repeat(NEW_PASSWORD_MIN_LENGTH), "fake_user")).toBeUndefined();
    expect(newPasswordProblem("a".repeat(NEW_PASSWORD_MAX_LENGTH), "fake_user")).toBeUndefined();
    expect(newPasswordProblem("a".repeat(NEW_PASSWORD_MAX_LENGTH + 1), "fake_user")).toBe(
      "auth_err_password_too_long",
    );
  });

  it("아이디와 같으면 안 된다(대소문자 무시)", () => {
    expect(newPasswordProblem("Fake_User", "fake_user")).toBe("auth_err_password_same_as_id");
    expect(newPasswordProblem("fake_user!", "fake_user")).toBeUndefined();
  });
});

describe("새 아이디 확인 화면", () => {
  const base = {
    loginId: "Fake_New",
    password: "correct-horse-9",
    passwordConfirm: "correct-horse-9",
    email: "",
  };

  it("이메일은 넣지 않아도 된다", () => {
    expect(checkCreate(base)).toEqual({ passwordRule: undefined, fields: {} });
    expect(checkCreate({ ...base, email: "  fake1@example.com " })).toEqual({
      passwordRule: undefined,
      fields: {},
    });
  });

  it("확인이 비거나 다르면 확인 칸 오류", () => {
    expect(checkCreate({ ...base, passwordConfirm: "" }).fields).toEqual({
      passwordConfirm: "auth_password_empty",
    });
    expect(checkCreate({ ...base, passwordConfirm: "correct-horse-8" }).fields).toEqual({
      passwordConfirm: "auth_err_password_mismatch",
    });
  });

  it("이메일 모양이 틀리면 이메일 칸 오류", () => {
    for (const email of ["fake", "fake@", "fake@example", "a b@example.com", "fake@@example.com"]) {
      expect(checkCreate({ ...base, email }).fields, email).toEqual({ email: "auth_err_invalid_email" });
    }
  });

  it("로그인 화면에서 넣은 비밀번호가 규칙에 걸리면 따로 알린다(확인 칸 오류가 아니다)", () => {
    expect(checkCreate({ ...base, password: "short", passwordConfirm: "short" })).toEqual({
      passwordRule: "auth_err_password_too_short",
      fields: {},
    });
    expect(checkCreate({ ...base, password: "FAKE_NEW", passwordConfirm: "FAKE_NEW" }).passwordRule).toBe(
      "auth_err_password_same_as_id",
    );
  });
});

describe("비밀번호 찾기 화면", () => {
  const base = {
    id: "fake_user",
    email: "fake1@example.com",
    newPassword: "correct-horse-9",
    newPasswordConfirm: "correct-horse-9",
  };

  it("모두 맞으면 오류 없음", () => {
    expect(hasErrors(checkReset(base))).toBe(false);
  });

  it("이메일은 꼭 넣어야 한다", () => {
    expect(checkReset({ ...base, email: " " })).toEqual({ email: "auth_email_empty" });
    expect(checkReset({ ...base, email: "fake" })).toEqual({ email: "auth_err_invalid_email" });
  });

  it("칸마다 오류를 모은다", () => {
    expect(checkReset({ id: "x", email: "", newPassword: "short", newPasswordConfirm: "" })).toEqual({
      id: "auth_id_too_short",
      email: "auth_email_empty",
      newPassword: "auth_err_password_too_short",
      newPasswordConfirm: "auth_password_empty",
    });
    expect(checkReset({ ...base, newPassword: "Fake_User1", newPasswordConfirm: "Fake_User2" })).toEqual({
      newPasswordConfirm: "auth_err_password_mismatch",
    });
    expect(checkReset({ ...base, newPassword: "FAKE_USER", newPasswordConfirm: "FAKE_USER" })).toEqual({
      newPassword: "auth_err_password_same_as_id",
    });
  });
});
