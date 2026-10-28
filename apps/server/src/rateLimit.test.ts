import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit.ts";

describe("속도 제한", () => {
  it("capacity만큼 허용하고 그다음은 거절한다 (키마다 따로)", () => {
    const limiter = createRateLimiter({ capacity: 3, refillPerMinute: 3, now: () => 0 });
    expect([1, 2, 3, 4].map(() => limiter.take("a"))).toEqual([true, true, true, false]);
    expect(limiter.take("b")).toBe(true);
  });

  it("시간이 지나면 분당 refill만큼 다시 채운다 (capacity를 넘지 않음)", () => {
    let time = 0;
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 2, now: () => time });
    limiter.take("a");
    limiter.take("a");
    expect(limiter.take("a")).toBe(false);
    time = 30_000; // 30초 → 1개
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    time = 10 * 60_000; // 오래 지나도 capacity(2)까지만
    expect([1, 2, 3].map(() => limiter.take("a"))).toEqual([true, true, false]);
  });

  it("키가 상한에 닿으면 가득 찬 버킷부터 지운다", () => {
    let time = 0;
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 1, now: () => time, maxKeys: 2 });
    limiter.take("a");
    limiter.take("b");
    time = 60_000; // a, b 모두 다시 가득 참
    limiter.take("c");
    expect(limiter.size()).toBe(1);
  });
});
