import { describe, expect, it } from "vitest";
import {
  TELEMETRY_LIMITS,
  clientErrorReportSchema,
  clip,
  perfReportSchema,
  type PerfReport,
} from "./telemetry.ts";

const perf: PerfReport = {
  clientBuild: "dev",
  page: "/",
  windowSec: 60,
  frames: 3_600,
  fps: 60,
  frameP50Ms: 16.7,
  frameP95Ms: 18.2,
  frameMaxMs: 40,
  longFrames: 0,
  device: { screenW: 390, screenH: 844, dpr: 3 },
};

describe("텔레메트리 형식", () => {
  it("정상 오류 보고를 받는다", () => {
    expect(
      clientErrorReportSchema.safeParse({ clientBuild: "dev", kind: "error", message: "boom" }).success,
    ).toBe(true);
  });

  it("상한을 넘는 오류 메시지나 모르는 종류는 거부한다", () => {
    const long = "x".repeat(TELEMETRY_LIMITS.message + 1);
    expect(
      clientErrorReportSchema.safeParse({ clientBuild: "dev", kind: "error", message: long }).success,
    ).toBe(false);
    expect(
      clientErrorReportSchema.safeParse({ clientBuild: "dev", kind: "crash", message: "x" }).success,
    ).toBe(false);
  });

  it("정상 성능 요약을 받는다 (선택 값 없이도)", () => {
    expect(perfReportSchema.safeParse(perf).success).toBe(true);
  });

  it("음수·NaN(JSON에서는 null)·소수 프레임 수는 거부한다", () => {
    expect(perfReportSchema.safeParse({ ...perf, frameP95Ms: -1 }).success).toBe(false);
    expect(perfReportSchema.safeParse(JSON.parse(JSON.stringify({ ...perf, fps: Number.NaN }))).success).toBe(
      false,
    );
    expect(perfReportSchema.safeParse({ ...perf, frames: 1.5 }).success).toBe(false);
  });

  it("clip은 상한까지만 남긴다", () => {
    expect(clip("abcdef", 3)).toBe("abc");
    expect(clip("ab", 3)).toBe("ab");
  });
});
