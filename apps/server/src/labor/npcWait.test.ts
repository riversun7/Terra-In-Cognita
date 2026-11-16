// NPC 일꾼 소유자의 기다림(D-573 2045): 상업 성향이 높을수록 빨리 해지
import { describe, expect, it } from "vitest";
import { npcQuits, npcWaitMs } from "./npcWait.ts";

const DAY = 86_400_000;
const range = { traitMin: 0, traitMax: 1000 };

describe("NPC 일꾼 소유자의 기다림(D-573 2045)", () => {
  it("기다리는 날 = 칸 × (1500 − 상업 치우침) ÷ 1000", () => {
    expect(npcWaitMs(0, 2, range)).toBe(3 * DAY);
    expect(npcWaitMs(1000, 2, range)).toBe(DAY);
    expect(npcWaitMs(500, 2, range)).toBe(2 * DAY);
    expect(npcWaitMs(500, 0, range)).toBe(0);
  });

  it("기다린 시간이 지나야 해지한다", () => {
    const base = { commerce: 500, waitDays: 2, range, pausedSinceMs: 0 };
    expect(npcQuits({ ...base, nowMs: 2 * DAY - 1 })).toBe(false);
    expect(npcQuits({ ...base, nowMs: 2 * DAY })).toBe(true);
  });
});
