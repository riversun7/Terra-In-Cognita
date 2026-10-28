import { describe, expect, it } from "vitest";
import { estimateClockOffset } from "./clock.ts";

describe("estimateClockOffset", () => {
  it("대칭 지연이면 차이를 정확히 구한다", () => {
    // 기기 시계가 서버보다 1000ms 느리고, 편도 지연이 20ms인 경우
    const samples = [0, 100, 200].map((t) => ({
      clientSendTime: t,
      serverTime: t + 20 + 1000,
      clientReceiveTime: t + 40,
    }));
    const estimate = estimateClockOffset(samples);
    expect(estimate.offsetMs).toBe(1000);
    expect(estimate.roundTripMs).toBe(40);
  });

  it("왕복 시간이 튄 표본은 버린다", () => {
    const samples = [
      { clientSendTime: 0, serverTime: 1020, clientReceiveTime: 40 },
      { clientSendTime: 100, serverTime: 1120, clientReceiveTime: 140 },
      { clientSendTime: 200, serverTime: 1700, clientReceiveTime: 1400 },
    ];
    const estimate = estimateClockOffset(samples);
    expect(estimate.offsetMs).toBe(1000);
  });

  it("유효한 표본이 없으면 오류", () => {
    expect(() => estimateClockOffset([])).toThrow();
  });
});
