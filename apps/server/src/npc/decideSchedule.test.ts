// 켤 때 첫 NPC 판단 시각(decideSchedule.ts) 단위 시험 — 저장된 시각 잇기, 지난 시각 흩기, 없을 때 [0, 간격) 고른 점, 감싼 루프의 예약 기록.
import { EVENT_DECIDE, type SimEvent, createSimLoop, newFaction } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { CATCH_UP_MS, createDecideClock, resumeDecideAt } from "./decideSchedule.ts";

const EVERY = 21_600_000;
const START = 1_800_000_000_000;
const at = (id: number, stored: number | null, aiStep = 0): number =>
  resumeDecideAt({ seed: 7, faction: { id, aiStep }, stored, startMs: START, everyMs: EVERY });

describe("resumeDecideAt", () => {
  it("저장된 시각이 앞으로 한 번 거는 최대 지연(간격 × 1.25) 안이면 그대로 잇는다", () => {
    expect(at(1, START)).toBe(START);
    expect(at(1, START + 3_600_000)).toBe(START + 3_600_000);
    expect(at(1, START + EVERY + EVERY / 4)).toBe(START + EVERY + EVERY / 4);
  });

  it("지난 시각은 켠 뒤 짧은 창 안에, 세력마다 다르게 흩는다", () => {
    const times = Array.from({ length: 17 }, (_, i) => at(100 + i, START - 60_000));
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(START);
      expect(t).toBeLessThan(START + CATCH_UP_MS);
    }
    expect(new Set(times).size).toBeGreaterThan(12);
  });

  it("저장된 시각이 없거나 너무 멀면 [0, 간격) 안에 고르게 흩는다(시뮬의 4.5~7.5시간 아님)", () => {
    const delays = Array.from({ length: 2000 }, (_, i) => at(i + 1, null) - START);
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(EVERY);
    }
    // 네 칸에 고르게(각 500 ± 100), 평균 ≈ 간격의 절반
    const buckets = [0, 0, 0, 0];
    for (const d of delays)
      buckets[Math.floor((d / EVERY) * 4)] = (buckets[Math.floor((d / EVERY) * 4)] ?? 0) + 1;
    for (const n of buckets) expect(Math.abs(n - 500)).toBeLessThan(100);
    const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
    expect(Math.abs(mean - EVERY / 2)).toBeLessThan(EVERY / 20);
    // 간격 설정이 줄어 저장된 시각이 너무 먼 것도 같은 길
    expect(at(5, START + 2 * EVERY)).toBe(at(5, null));
  });

  it("같은 입력이면 같은 값, 판단 차례가 다르면 다른 값", () => {
    expect(at(3, null, 4)).toBe(at(3, null, 4));
    expect(at(3, null, 4)).not.toBe(at(3, null, 5));
  });
});

describe("createDecideClock", () => {
  it("판단 예약만 적어 두고, 세력의 예약 번호가 바뀌거나 지워지면 걸린 시각이 없다", () => {
    const clock = createDecideClock();
    const loop = clock.wrap(createSimLoop<SimEvent>({ startMs: START, handle: () => {} }));
    const faction = newFaction(9, "fake_nation", {
      fixed: true,
      tech: 1,
      regime: "democracy",
      settledAtMs: START,
      traits: { aggression: 0, commerce: 0, faith: 0, station: 0 },
    });
    expect(clock.nextOf(faction)).toBeNull();
    faction.eventId = loop.schedule(START + 120_000, { kind: EVENT_DECIDE, subject: 9 });
    loop.schedule(START + 60_000, { kind: "day", subject: 9 });
    expect(clock.nextOf(faction)).toBe(START + 120_000);
    expect(clock.minutesUntilNext([faction], START)).toBe(2);
    faction.eventId = undefined;
    expect(clock.nextOf(faction)).toBeNull();
    expect(clock.minutesUntilNext([faction], START)).toBe(-1);
    expect(loop.pending).toBe(2);
  });
});
