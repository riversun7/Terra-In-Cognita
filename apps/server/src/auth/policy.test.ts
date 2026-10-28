// 요청 검사(출처·JSON), 새 비밀번호 규칙, 시도 제한(가짜 시계), 인증 설정 시험 — DB 없이 돈다
import { describe, expect, it } from "vitest";
import { readConfig } from "../config.ts";
import { readAuthConfig } from "./config.ts";
import { createAccountLimiters, takeAll } from "./limits.ts";
import { checkNewPassword } from "./passwordPolicy.ts";
import { isAllowedSocketOrigin, isJsonRequest, isSameOriginRequest } from "./requestGuard.ts";

const APP = "https://game.example.test:4443";

describe("같은 출처 검사", () => {
  it("Origin이 앱 출처와 같으면 통과", () => {
    expect(isSameOriginRequest({ origin: APP }, APP)).toBe(true);
    expect(isSameOriginRequest({ origin: APP, "sec-fetch-site": "same-origin" }, APP)).toBe(true);
  });

  it("다른 출처·다른 포트·http·null Origin은 거절", () => {
    expect(isSameOriginRequest({ origin: "https://evil.example.test" }, APP)).toBe(false);
    expect(isSameOriginRequest({ origin: "https://game.example.test" }, APP)).toBe(false);
    expect(isSameOriginRequest({ origin: "http://game.example.test:4443" }, APP)).toBe(false);
    expect(isSameOriginRequest({ origin: "null" }, APP)).toBe(false);
  });

  it("Sec-Fetch-Site가 same-origin이 아니면 Origin이 맞아도 거절(같은 도메인의 다른 앱 포함)", () => {
    expect(isSameOriginRequest({ origin: APP, "sec-fetch-site": "same-site" }, APP)).toBe(false);
    expect(isSameOriginRequest({ "sec-fetch-site": "cross-site" }, APP)).toBe(false);
    expect(isSameOriginRequest({ "sec-fetch-site": "none" }, APP)).toBe(false);
  });

  it("Origin 없이 Sec-Fetch-Site: same-origin만 있으면 통과, 둘 다 없으면 거절", () => {
    expect(isSameOriginRequest({ "sec-fetch-site": "same-origin" }, APP)).toBe(true);
    expect(isSameOriginRequest({}, APP)).toBe(false);
  });
});

describe("WebSocket 출처 검사", () => {
  it("Origin이 앱 출처와 같거나 없으면(브라우저가 아님) 쿠키를 믿는다", () => {
    expect(isAllowedSocketOrigin({ origin: APP }, APP)).toBe(true);
    expect(isAllowedSocketOrigin({}, APP)).toBe(true);
  });

  it("다른 출처·null Origin이면 믿지 않는다", () => {
    expect(isAllowedSocketOrigin({ origin: "https://evil.example.test" }, APP)).toBe(false);
    expect(isAllowedSocketOrigin({ origin: "https://game.example.test" }, APP)).toBe(false);
    expect(isAllowedSocketOrigin({ origin: "null" }, APP)).toBe(false);
  });
});

describe("JSON 요청 검사", () => {
  it("application/json(매개변수 허용)만 통과", () => {
    expect(isJsonRequest({ "content-type": "application/json" })).toBe(true);
    expect(isJsonRequest({ "content-type": "Application/JSON; charset=utf-8" })).toBe(true);
    expect(isJsonRequest({ "content-type": "text/plain" })).toBe(false);
    expect(isJsonRequest({ "content-type": "application/x-www-form-urlencoded" })).toBe(false);
    expect(isJsonRequest({ "content-type": "multipart/form-data; boundary=x" })).toBe(false);
    expect(isJsonRequest({})).toBe(false);
  });
});

describe("새 비밀번호 규칙", () => {
  it("길이: 7자는 짧고 8자는 되고, 128자는 되고 129자는 길다", () => {
    expect(checkNewPassword("abcdef7", "tester")).toBe("PASSWORD_TOO_SHORT");
    expect(checkNewPassword("abcdef78", "tester")).toBeNull();
    expect(checkNewPassword("x".repeat(128), "tester")).toBeNull();
    expect(checkNewPassword("x".repeat(129), "tester")).toBe("PASSWORD_TOO_LONG");
  });

  it("아이디와 같으면 안 된다(대소문자·전각 무시)", () => {
    expect(checkNewPassword("TesterOne", "testerone")).toBe("PASSWORD_SAME_AS_ID");
    expect(checkNewPassword("ｔｅｓｔｅｒｏｎｅ", "testerone")).toBe("PASSWORD_SAME_AS_ID");
  });

  it("흔한 비밀번호는 안 된다(대소문자 무시)", () => {
    expect(checkNewPassword("Password1", "tester")).toBe("PASSWORD_TOO_COMMON");
    expect(checkNewPassword("1q2w3e4r", "tester")).toBe("PASSWORD_TOO_COMMON");
    expect(checkNewPassword("QWERTY123", "tester")).toBe("PASSWORD_TOO_COMMON");
  });

  it("한글·공백이 섞인 긴 비밀번호는 된다", () => {
    expect(checkNewPassword("우리 집 강아지 이름", "tester")).toBeNull();
  });
});

describe("시도 제한 (가짜 시계)", () => {
  it("주소별 들어가기는 분당 10회, 시간이 지나면 다시 채워진다", () => {
    let time = 0;
    const limits = createAccountLimiters(() => time);
    for (let i = 0; i < 10; i += 1) expect(takeAll([[limits.enterPerIp, "1.2.3.4"]])).toBeNull();
    expect(takeAll([[limits.enterPerIp, "1.2.3.4"]])).toBe(6);
    expect(takeAll([[limits.enterPerIp, "5.6.7.8"]])).toBeNull();
    time = 6_000;
    expect(takeAll([[limits.enterPerIp, "1.2.3.4"]])).toBeNull();
  });

  it("계정 만들기는 주소별 시간당 3개, 비밀번호 찾기는 아이디별 시간당 3회", () => {
    let time = 0;
    const limits = createAccountLimiters(() => time);
    for (let i = 0; i < 3; i += 1) expect(takeAll([[limits.createPerIp, "ip"]])).toBeNull();
    expect(takeAll([[limits.createPerIp, "ip"]])).toBe(1_200);
    for (let i = 0; i < 3; i += 1) expect(takeAll([[limits.resetPerId, "tester"]])).toBeNull();
    expect(takeAll([[limits.resetPerId, "tester"]])).toBe(1_200);
    time = 20 * 60_000;
    expect(takeAll([[limits.createPerIp, "ip"]])).toBeNull();
  });

  it("앞의 제한에서 막히면 뒤의 제한은 쓰지 않는다", () => {
    const limits = createAccountLimiters(() => 0, { enterPerIp: { capacity: 1, perHour: 1 } });
    expect(
      takeAll([
        [limits.enterPerIp, "ip"],
        [limits.enterGlobal, "all"],
      ]),
    ).toBeNull();
    for (let i = 0; i < 5; i += 1)
      takeAll([
        [limits.enterPerIp, "ip"],
        [limits.enterGlobal, "all"],
      ]);
    // 전체 상한(20)은 첫 1회만 썼다
    for (let i = 0; i < 19; i += 1) expect(takeAll([[limits.enterGlobal, "all"]])).toBeNull();
    expect(takeAll([[limits.enterGlobal, "all"]])).not.toBeNull();
  });
});

describe("인증 설정", () => {
  const SECRET = "f".repeat(64);

  it("DB가 없으면 인증을 켜지 않는다(비밀값이 없어도 운영 모드로 뜬다 — CI 이미지 확인)", () => {
    expect(readConfig({ NODE_ENV: "production" }).auth).toBeUndefined();
  });

  it("운영 + DB: 비밀값·https 주소가 없으면 시작하지 않는다", () => {
    const base = { NODE_ENV: "production", DATABASE_URL: "postgres://x@db/terra" };
    expect(() => readConfig(base)).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => readConfig({ ...base, BETTER_AUTH_SECRET: SECRET })).toThrow(/BETTER_AUTH_URL/);
    expect(() =>
      readConfig({ ...base, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: "http://a.test" }),
    ).toThrow(/https/);
    expect(() => readConfig({ ...base, BETTER_AUTH_SECRET: "short", BETTER_AUTH_URL: APP })).toThrow(/32/);
    expect(readConfig({ ...base, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: APP }).auth).toEqual({
      secret: SECRET,
      baseUrl: APP,
      openSignup: true,
    });
  });

  it("주소는 출처만 받는다(경로가 붙으면 오류), 끝의 /는 지운다", () => {
    expect(readAuthConfig({ BETTER_AUTH_URL: "https://a.test:4443/" }).baseUrl).toBe("https://a.test:4443");
    expect(() => readAuthConfig({ BETTER_AUTH_URL: "https://a.test/app" })).toThrow(/origin/);
    expect(() => readAuthConfig({ BETTER_AUTH_URL: "not a url" })).toThrow(/valid URL/);
  });

  it("개발: 주소 기본값은 서버 포트, 가입 스위치는 true/false/1/0", () => {
    expect(readAuthConfig({}, 4100)).toEqual({
      secret: undefined,
      baseUrl: "http://localhost:4100",
      openSignup: true,
    });
    expect(readAuthConfig({ AUTH_OPEN_SIGNUP: "false" }).openSignup).toBe(false);
    expect(readAuthConfig({ AUTH_OPEN_SIGNUP: "0" }).openSignup).toBe(false);
    expect(readAuthConfig({ AUTH_OPEN_SIGNUP: "1" }).openSignup).toBe(true);
    expect(() => readAuthConfig({ AUTH_OPEN_SIGNUP: "yes" })).toThrow(/AUTH_OPEN_SIGNUP/);
  });
});
