// 경제 화면 모양 시험 — 호가 줄·막대 길이, 차이, 봉 좌표, 작은 선, 창고 요약, 남은 시간, 급여 추정
import type { Candle, EconomyHoldingsResponse } from "@terra/shared/economy";
import { describe, expect, it } from "vitest";
import {
  bookRows,
  chartShape,
  dailyWage,
  formatCountdown,
  holdingsSummary,
  progressOf,
  sparkPath,
  spreadOf,
} from "./shape.ts";

const level = (price: string, qty: string, mine = "0") => ({ price, qty, orders: 1, mine });

describe("호가 줄", () => {
  it("매도는 높은 값이 위(뒤집음), 막대는 두 쪽 가장 큰 잔량 기준", () => {
    const rows = bookRows([level("101", "10"), level("102", "40", "5")], [level("99", "20")]);
    expect(rows.asks.map((row) => row.price)).toEqual([102n, 101n]);
    expect(rows.asks[0]).toMatchObject({ depth: 1, mine: 5n });
    expect(rows.bids[0]?.depth).toBe(0.5);
    expect(spreadOf([level("101", "1")], [level("99", "1")])).toBe(2n);
    expect(spreadOf([], [level("99", "1")])).toBeNull();
  });
});

/** 봉 하나(시험용) */
const candle = (open: string, high: string, low: string, close: string, volume: string): Candle => ({
  at: 0,
  open,
  high,
  low,
  close,
  volume,
});

describe("봉·작은 선", () => {
  it("값 칸 위아래 여유, 오름·내림, 거래량 막대", () => {
    const shape = chartShape(
      [candle("100", "110", "90", "105", "10"), candle("105", "106", "100", "101", "0")],
      100,
      80,
      20,
    );
    expect(shape?.high).toBe(110n);
    expect(shape?.low).toBe(90n);
    const [first, second] = shape?.candles ?? [];
    expect(first?.up).toBe(true);
    expect(second?.up).toBe(false);
    expect(first?.wickTop).toBeGreaterThan(0);
    expect(first?.wickBottom).toBeLessThan(80);
    expect(first?.volumeTop).toBe(80);
    expect(second?.volumeTop).toBe(100);
    expect(chartShape([], 100, 80, 20)).toBeNull();
  });

  it("작은 선 경로", () => {
    expect(sparkPath(["1", "3", "2"], 10, 4)).toBe("M0.0 4.0 L5.0 0.0 L10.0 2.0");
    expect(sparkPath(["5"], 10, 4)).toBe("");
  });
});

describe("요약·시간·급여", () => {
  it("창고 요약: 곳 수, 물건 종류(자산 코드), 24시간 안에 상하는 줄", () => {
    const holdings: EconomyHoldingsResponse = {
      generatedAt: 1_000,
      preview: false,
      status: "ready",
      hasOwner: true,
      wallet: [],
      places: [
        {
          id: "101",
          kind: "warehouse",
          name: "Nova",
          store: "general",
          capacity: null,
          lines: [
            {
              asset: "item:grain",
              item: "grain",
              currency: null,
              qty: "5",
              locked: "0",
              spoilsAt: 3_600_000,
            },
            { asset: "item:ore", item: "ore", currency: null, qty: "5", locked: "0", spoilsAt: null },
          ],
        },
        {
          id: "102",
          kind: "warehouse",
          name: "Aster",
          store: "food",
          capacity: null,
          lines: [
            {
              asset: "item:grain",
              item: "grain",
              currency: null,
              qty: "1",
              locked: "0",
              spoilsAt: 99 * 3_600_000,
            },
          ],
        },
      ],
    };
    expect(holdingsSummary(holdings)).toEqual({ places: 2, kinds: 2, spoilingSoon: 1 });
  });

  it("남은 시간·진행·급여", () => {
    expect(formatCountdown(65_400)).toBe("01:05");
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
    expect(formatCountdown(-5)).toBe("00:00");
    expect(progressOf(0, 100, 25)).toBe(0.25);
    expect(progressOf(0, 100, 500)).toBe(1);
    // 2,400 × 1.05 = 2,520, × 1.08 = 2,721(버림), × 18명
    expect(dailyWage("2400", 500, 1080, 18)).toBe(2_721n * 18n);
  });
});
