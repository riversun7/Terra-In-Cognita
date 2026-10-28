// 오류 코드 → 문구 키 시험 — 서버 오류 코드 목록(@terra/shared) 전체를 돌며 ko·en 문구가 모두 있는지 본다
import { ACCOUNT_ERROR_CODES } from "@terra/shared";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json" with { type: "json" };
import ko from "../../messages/ko.json" with { type: "json" };
import { formatWait } from "../ui/messageRef.ts";
import { parseFailure } from "./accountResponse.ts";
import {
  ACCOUNT_ERROR_MESSAGE_KEYS,
  DEFAULT_RETRY_AFTER_SEC,
  accountFailureMessage,
  isNewPasswordRuleCode,
} from "./errorMessages.ts";

const messages: Record<"ko" | "en", Record<string, string>> = { ko, en };

describe("계정 오류 코드 → 메시지 키", () => {
  it("공용 오류 코드마다 키가 있고, 표에는 모르는 코드가 없다", () => {
    expect(Object.keys(ACCOUNT_ERROR_MESSAGE_KEYS).toSorted()).toEqual([...ACCOUNT_ERROR_CODES].toSorted());
  });

  it.each(ACCOUNT_ERROR_CODES)("%s의 문구가 한국어·영어 모두 있다", (code) => {
    const ref = accountFailureMessage({ kind: "code", code });
    for (const locale of ["ko", "en"] as const) {
      const message = messages[locale][ref.key];
      expect(message, `${locale}.json: ${ref.key}`).toBeTypeOf("string");
      expect(message?.trim()).not.toBe("");
      // 기다릴 시간이 붙는 문구만 {wait}을 쓴다
      expect(message?.includes("{wait}")).toBe("waitSec" in ref);
    }
  });

  it("429는 서버가 준 기다릴 시간을 쓰고, 없으면 기본값", () => {
    expect(accountFailureMessage({ kind: "code", code: "TOO_MANY_REQUESTS", retryAfterSec: 42 })).toEqual({
      key: "auth_err_too_many",
      waitSec: 42,
    });
    expect(accountFailureMessage({ kind: "code", code: "SIGNUP_LIMIT", retryAfterSec: 1_200 })).toEqual({
      key: "auth_err_signup_limit",
      waitSec: 1_200,
    });
    expect(accountFailureMessage({ kind: "code", code: "TOO_MANY_REQUESTS" })).toEqual({
      key: "auth_err_too_many",
      waitSec: DEFAULT_RETRY_AFTER_SEC,
    });
  });

  it("모르는 코드·모르는 모양은 일반 문구, 서버에 닿지 못하면 연결 문구", () => {
    expect(accountFailureMessage(parseFailure({ error: "SOMETHING_NEW" }))).toEqual({ key: "err_unknown" });
    expect(accountFailureMessage(parseFailure("<html>502</html>"))).toEqual({ key: "err_unknown" });
    expect(accountFailureMessage({ kind: "network" })).toEqual({ key: "err_network" });
    expect(accountFailureMessage({ kind: "code", code: "INTERNAL_ERROR" })).toEqual({ key: "err_server" });
  });

  it("일반 문구·연결 문구도 한국어·영어가 있다", () => {
    for (const key of ["err_unknown", "err_network", "err_server"]) {
      expect(messages.ko[key]).toBeTypeOf("string");
      expect(messages.en[key]).toBeTypeOf("string");
    }
  });

  it("비밀번호 규칙 코드만 [다시 입력] 안내 대상", () => {
    const rules = ACCOUNT_ERROR_CODES.filter(isNewPasswordRuleCode);
    expect(rules).toEqual([
      "PASSWORD_TOO_SHORT",
      "PASSWORD_TOO_LONG",
      "PASSWORD_SAME_AS_ID",
      "PASSWORD_TOO_COMMON",
    ]);
  });
});

describe("기다릴 시간 표시", () => {
  it("1분 미만은 초, 1시간 미만은 분(올림), 그 이상은 시간(올림)", () => {
    expect(formatWait(30, "ko")).toBe("30초");
    expect(formatWait(60, "ko")).toBe("1분");
    expect(formatWait(61, "ko")).toBe("2분");
    expect(formatWait(3_599, "ko")).toBe("60분");
    expect(formatWait(3_600, "ko")).toBe("1시간");
    expect(formatWait(30, "en")).toBe("30 seconds");
    expect(formatWait(1, "en")).toBe("1 second");
    expect(formatWait(720, "en")).toBe("12 minutes");
    expect(formatWait(7_200, "en")).toBe("2 hours");
  });

  it("0·음수·숫자가 아닌 값은 1초", () => {
    expect(formatWait(0, "ko")).toBe("1초");
    expect(formatWait(-5, "en")).toBe("1 second");
    expect(formatWait(Number.NaN, "en")).toBe("1 second");
  });
});
