import { describe, expect, it } from "vitest";
import {
  buildStampOf,
  buildStampSource,
  buildStampText,
  buildsDiffer,
  formatKstMinute,
  shortCommit,
} from "./buildStamp.ts";

describe("formatKstMinute", () => {
  it("UTC에 9시간을 더해 분까지 적는다(초는 버린다)", () => {
    expect(formatKstMinute(Date.UTC(2026, 10, 14, 23, 12, 59))).toBe("2026-11-15 08:12");
  });

  it("날짜·달·해가 넘어간다", () => {
    expect(formatKstMinute(Date.UTC(2026, 11, 31, 15, 0, 0))).toBe("2027-01-01 00:00");
    expect(formatKstMinute(Date.UTC(2026, 1, 28, 14, 59, 0))).toBe("2026-02-28 23:59");
    expect(formatKstMinute(Date.UTC(2026, 1, 28, 15, 0, 0))).toBe("2026-03-01 00:00");
  });
});

describe("shortCommit", () => {
  it("16진수면 앞 7자(소문자)", () => {
    expect(shortCommit("83709095C9AB")).toBe("8370909");
    expect(shortCommit(" abc1234\n")).toBe("abc1234");
  });

  it("16진수가 아니거나 짧으면 null", () => {
    expect(shortCommit("dev")).toBeNull();
    expect(shortCommit("")).toBeNull();
    expect(shortCommit("abc12")).toBeNull();
    expect(shortCommit("xyz1234")).toBeNull();
  });
});

describe("buildStampOf", () => {
  it("ISO 시각과 커밋을 한국 시각 도장으로", () => {
    expect(buildStampOf("2026-11-14T23:20:05.123Z", "def5678abcd")).toEqual({
      time: "2026-11-15 08:20",
      commit: "def5678",
    });
  });

  it("넣은 값이 없으면(개발 실행) 둘 다 null", () => {
    expect(buildStampOf("", "")).toEqual({ time: null, commit: null });
    expect(buildStampOf("not a date", "dev")).toEqual({ time: null, commit: null });
  });
});

describe("buildStampSource", () => {
  const base = { dev: false, envTime: undefined, envCommit: undefined, nowMs: Date.UTC(2026, 10, 14, 23, 12) };

  it("개발 서버는 빈 글(git을 읽지 않는다)", () => {
    expect(
      buildStampSource({
        ...base,
        dev: true,
        gitCommit: () => {
          throw new Error("불리면 안 된다");
        },
      }),
    ).toEqual({ time: "", commit: "" });
  });

  it("환경 변수(CI·Docker)가 있으면 그 값", () => {
    expect(
      buildStampSource({
        ...base,
        envTime: "2026-11-14T22:00:00Z",
        envCommit: "83709095c9ab",
        gitCommit: () => "ffffffff",
      }),
    ).toEqual({ time: "2026-11-14T22:00:00.000Z", commit: "8370909" });
  });

  it("환경 변수가 없거나 틀리면 지금 시각과 git 커밋", () => {
    expect(buildStampSource({ ...base, envTime: " ", envCommit: "dev", gitCommit: () => "abc1234\n" })).toEqual({
      time: "2026-11-14T23:12:00.000Z",
      commit: "abc1234",
    });
  });

  it("git도 없으면 커밋은 빈 글(빌드는 계속)", () => {
    expect(buildStampSource({ ...base, gitCommit: () => "" })).toEqual({
      time: "2026-11-14T23:12:00.000Z",
      commit: "",
    });
  });
});

describe("buildStampText·buildsDiffer", () => {
  it("시각과 커밋을 함께, 하나만 있으면 그것만, 없으면 dev", () => {
    expect(buildStampText({ time: "2026-11-15 08:12", commit: "abc1234" })).toBe("2026-11-15 08:12 (abc1234)");
    expect(buildStampText({ time: "2026-11-15 08:12", commit: null })).toBe("2026-11-15 08:12");
    expect(buildStampText({ time: null, commit: "abc1234" })).toBe("abc1234");
    expect(buildStampText({ time: null, commit: null })).toBe("dev");
  });

  it("커밋이 둘 다 있고 다를 때만 다르다(시각은 보지 않는다)", () => {
    const app = { time: "2026-11-15 08:12", commit: "abc1234" };
    expect(buildsDiffer(app, { time: "2026-11-15 08:13", commit: "abc1234" })).toBe(false);
    expect(buildsDiffer(app, { time: "2026-11-15 08:20", commit: "def5678" })).toBe(true);
    expect(buildsDiffer(app, { time: null, commit: null })).toBe(false);
    expect(buildsDiffer({ time: null, commit: null }, app)).toBe(false);
  });
});
