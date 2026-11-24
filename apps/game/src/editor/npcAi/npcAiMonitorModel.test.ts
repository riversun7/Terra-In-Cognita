import { describe, expect, it } from "vitest";
import {
  type PillarCounts,
  countLevels,
  durationParts,
  levelOf,
  pillarLevels,
  pillarRatios,
  productionLevel,
  rationLevel,
  sharePct,
  stockLevel,
} from "./npcAiMonitorModel.ts";

const counts = (patch: Partial<PillarCounts> = {}): PillarCounts => ({
  humans: 40,
  guards: 4,
  food: { ok: 44, bad: 0, unknown: 0 },
  income: { workers: 30, idle: 10, paid: 30, unpaid: 0 },
  housing: { lodging: 10, home: 34, homeless: 0 },
  recovery: { injured: 0, down: 0 },
  motion: { moving: 10, standing: 34, stuck: 0, offMap: 0, away: 0 },
  order: { strikes: 0, avgSatisfaction: 70 },
  ...patch,
});

describe("작동 모니터 판정", () => {
  it("문제 몫 20% 이상이면 문제, 하나라도 있으면 주의, 전체가 없으면 자료 없음", () => {
    expect(levelOf(0, 10)).toBe("ok");
    expect(levelOf(1, 10)).toBe("warn");
    expect(levelOf(2, 10)).toBe("bad");
    expect(levelOf(0, 0)).toBe("none");
  });

  it("모두 정상이면 여섯 기둥이 정상이다", () => {
    expect(Object.values(pillarLevels(counts()))).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    expect(pillarRatios(counts()).recovery).toEqual({ ok: 44, total: 44 });
  });

  it("기둥마다 제 문제만 본다", () => {
    expect(pillarLevels(counts({ food: { ok: 0, bad: 0, unknown: 44 } })).food).toBe("none");
    expect(pillarLevels(counts({ food: { ok: 30, bad: 14, unknown: 0 } })).food).toBe("bad");
    expect(pillarLevels(counts({ income: { workers: 10, idle: 30, paid: 10, unpaid: 0 } })).income).toBe(
      "warn",
    );
    expect(pillarLevels(counts({ income: { workers: 30, idle: 10, paid: 20, unpaid: 10 } })).income).toBe(
      "bad",
    );
    expect(pillarLevels(counts({ housing: { lodging: 0, home: 43, homeless: 1 } })).housing).toBe("warn");
    expect(pillarLevels(counts({ recovery: { injured: 3, down: 0 } })).recovery).toBe("warn");
    expect(pillarLevels(counts({ recovery: { injured: 9, down: 9 } })).recovery).toBe("bad");
    expect(
      pillarLevels(counts({ motion: { moving: 0, standing: 30, stuck: 10, offMap: 4, away: 0 } })).motion,
    ).toBe("bad");
    expect(pillarLevels(counts({ order: { strikes: 0, avgSatisfaction: 30 } })).order).toBe("bad");
    expect(pillarLevels(counts({ order: { strikes: 1, avgSatisfaction: 70 } })).order).toBe("warn");
  });

  it("생산·재고", () => {
    expect(productionLevel(null)).toBe("none");
    expect(productionLevel({ facilities: 5, stalled: 0, unstaffed: 0 })).toBe("ok");
    expect(productionLevel({ facilities: 5, stalled: 0, unstaffed: 1 })).toBe("warn");
    expect(productionLevel({ facilities: 5, stalled: 2, unstaffed: 0 })).toBe("bad");
    expect(stockLevel(null)).toBe("none");
    expect(stockLevel(0)).toBe("bad");
    expect(stockLevel(12)).toBe("warn");
    expect(stockLevel(72)).toBe("ok");
    expect(rationLevel(0, 0)).toBe("none");
    expect(rationLevel(100, 0)).toBe("ok");
    expect(rationLevel(100, 5)).toBe("warn");
    expect(rationLevel(100, 30)).toBe("bad");
  });

  it("총평·시간·막대 폭", () => {
    expect(countLevels(["ok", "bad", "warn", "warn", "none"])).toEqual({ bad: 1, warn: 2, none: 1 });
    expect(durationParts(3_725_000)).toEqual({ h: 1, m: 2, s: 5 });
    expect(sharePct(1, 1000)).toBe(2);
    expect(sharePct(0, 10)).toBe(0);
    expect(sharePct(5, 10)).toBe(50);
  });
});
