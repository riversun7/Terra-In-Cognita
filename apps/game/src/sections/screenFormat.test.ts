// 화면 공용 수·시간 글자 시험 — 금액 자리 나눔(BigInt), 시간 길이 단위(내림)
import { describe, expect, it } from "vitest";
import { formatAmount, formatSpan, spanOf } from "./screenFormat.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("금액", () => {
  it("최소 단위 정수 글자를 자리 나눔으로(아주 큰 수도 잃지 않는다)", () => {
    expect(formatAmount("1250000", "ko")).toBe("1,250,000");
    expect(formatAmount("9007199254740993123", "en")).toBe("9,007,199,254,740,993,123");
    expect(formatAmount("-42", "en")).toBe("-42");
    expect(formatAmount("1.5", "en")).toBe("1.5");
  });
});

describe("시간 길이", () => {
  it("1분 미만·분·48시간까지 시간·그 뒤 날(내림, 과거도 같은 길이)", () => {
    expect(spanOf(59_999)).toEqual({ unit: "under_minute" });
    expect(spanOf(MINUTE)).toEqual({ unit: "minute", value: 1 });
    expect(spanOf(HOUR - 1)).toEqual({ unit: "minute", value: 59 });
    expect(spanOf(20 * HOUR + 59 * MINUTE)).toEqual({ unit: "hour", value: 20 });
    expect(spanOf(48 * HOUR - 1)).toEqual({ unit: "hour", value: 47 });
    expect(spanOf(48 * HOUR)).toEqual({ unit: "day", value: 2 });
    expect(spanOf(-3 * DAY)).toEqual({ unit: "day", value: 3 });
  });

  it("길이 글자는 Intl 단위(복수형 포함), 1분 미만은 null", () => {
    expect(formatSpan({ unit: "hour", value: 20 }, "en")).toBe("20 hours");
    expect(formatSpan({ unit: "day", value: 1 }, "en")).toBe("1 day");
    expect(formatSpan({ unit: "minute", value: 5 }, "ko")).toBe("5분");
    expect(formatSpan({ unit: "under_minute" }, "ko")).toBeNull();
  });
});
