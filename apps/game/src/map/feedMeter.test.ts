// 받기 측정 시험 — 1초 구간의 초당 값, 지연 중앙값, 조용하면 0으로 내려감
import { describe, expect, it } from "vitest";
import { RATE_WINDOW_MS, createFeedMeter, median } from "./feedMeter.ts";

describe("받기 측정", () => {
  it("구간이 끝나야 값이 바뀌고, 초당 값으로 나눈다", () => {
    let at = 0;
    const meter = createFeedMeter(() => at);
    meter.message(100);
    meter.update(80);
    meter.update(120);
    at = 500;
    meter.message(300);
    expect(meter.rates()).toEqual({
      messagesPerSec: 0,
      unitUpdatesPerSec: 0,
      bytesPerSec: 0,
      pathLagMs: null,
    });
    at = 2_000;
    expect(meter.rates()).toEqual({
      messagesPerSec: 1,
      unitUpdatesPerSec: 1,
      bytesPerSec: 200,
      pathLagMs: 100,
    });
  });

  it("아무것도 오지 않은 구간은 0과 null", () => {
    let at = 0;
    const meter = createFeedMeter(() => at);
    meter.message(10);
    at = RATE_WINDOW_MS;
    meter.rates();
    at = RATE_WINDOW_MS * 3;
    expect(meter.rates()).toEqual({
      messagesPerSec: 0,
      unitUpdatesPerSec: 0,
      bytesPerSec: 0,
      pathLagMs: null,
    });
  });

  it("지연 표본은 구간마다 256개까지만 둔다", () => {
    let at = 0;
    const meter = createFeedMeter(() => at);
    for (let i = 0; i < 1_000; i++) meter.update(i < 256 ? 10 : 9_999);
    at = RATE_WINDOW_MS;
    expect(meter.rates()).toMatchObject({ unitUpdatesPerSec: 1_000, pathLagMs: 10 });
  });

  it("중앙값: 홀수는 가운데, 짝수는 가운데 둘의 평균, 비면 null", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
