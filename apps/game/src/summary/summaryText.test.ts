// 복귀 요약 문구 시험 — 덮는 길이(분·시간·날로 올림, 단위 경계), 그릴 칸(아는 종류·사건 있음)
import type { SummaryGetResponse } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import { formatSpan, visibleSections } from "./summaryText.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("덮는 길이", () => {
  it("1시간 안은 분, 48시간 안은 시간, 그 뒤는 날(오래 비워도 '1,284시간'이 되지 않게)", () => {
    expect(formatSpan(45 * MIN, "ko")).toBe("45분");
    expect(formatSpan(20 * 1_000, "ko")).toBe("1분");
    expect(formatSpan(8 * HOUR, "ko")).toBe("8시간");
    expect(formatSpan(30 * HOUR, "en")).toBe("30 hours");
    expect(formatSpan(72 * HOUR, "ko")).toBe("3일");
    expect(formatSpan(1_284 * HOUR, "en")).toBe("54 days");
    expect(formatSpan(1 * HOUR, "en")).toBe("1 hour");
  });

  it("단위 경계에서 '60분'·'48시간'이 아니라 다음 단위로 넘어간다", () => {
    expect(formatSpan(59 * MIN, "ko")).toBe("59분");
    expect(formatSpan(59.5 * MIN, "ko")).toBe("1시간");
    expect(formatSpan(59.5 * MIN, "en")).toBe("1 hour");
    expect(formatSpan(47.4 * HOUR, "ko")).toBe("47시간");
    expect(formatSpan(47.6 * HOUR, "ko")).toBe("2일");
  });

  it("0 이하·수가 아닌 값도 견딘다(1분)", () => {
    expect(formatSpan(0, "ko")).toBe("1분");
    expect(formatSpan(-5 * MIN, "en")).toBe("1 minute");
    expect(formatSpan(Number.NaN, "en")).toBe("1 minute");
  });
});

describe("그릴 칸", () => {
  it("아는 칸 종류이고 사건이 있는 칸만, 받은 차례로", () => {
    const summary: SummaryGetResponse = {
      show: true,
      since: 0,
      until: 1,
      sections: [
        { kind: "weather", count: 3, params: {}, target: null },
        { kind: "raid", count: 0, params: {}, target: null },
        { kind: "injury", count: 2, params: {}, target: { route: "units" } },
        { kind: "production", count: 1, params: {}, target: null },
        { kind: "__proto__", count: 1, params: {}, target: null },
      ],
    };
    expect(visibleSections(summary).map((section) => [section.kind, section.count])).toEqual([
      ["injury", 2],
      ["production", 1],
    ]);
  });
});
