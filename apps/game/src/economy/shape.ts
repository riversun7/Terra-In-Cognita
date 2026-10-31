// 경제 화면 자료 모양 만들기 — 호가 막대 길이, 봉·작은 선 좌표, 창고 요약, 남은 시간 글(순수 함수, 시험 대상).
// 값은 BigInt로 받는다. 그림 좌표만 Number로 바꾼다(화면 표시용. 값이 2^53을 넘으면 그림 비율만 흐려진다).
import type { BookLevel, Candle, EconomyHoldingsResponse } from "@terra/shared/economy";
import { toBig } from "./amount.ts";
import type { DepthLevel } from "./orderForm.ts";

/** 호가 한 줄(화면용) */
export interface DepthRow {
  readonly price: bigint;
  readonly qty: bigint;
  readonly mine: bigint;
  readonly orders: number;
  /** 막대 길이 0~1(두 쪽 가장 큰 잔량 기준) */
  readonly depth: number;
}

/** 서버 호가 단계 → BigInt 단계(주문표 미리 보기용) */
export function toDepthLevels(levels: readonly BookLevel[]): DepthLevel[] {
  return levels.map((level) => ({
    price: toBig(level.price),
    qty: toBig(level.qty),
    mine: toBig(level.mine),
  }));
}

/** 호가창 줄: 매도는 위(높은 값이 맨 위 → 가장 싼 매도가 가운데), 매수는 아래(높은 값이 가운데 쪽) */
export function bookRows(
  asks: readonly BookLevel[],
  bids: readonly BookLevel[],
): { asks: DepthRow[]; bids: DepthRow[] } {
  let max = 0n;
  for (const level of [...asks, ...bids]) {
    const qty = toBig(level.qty);
    if (qty > max) max = qty;
  }
  const row = (level: BookLevel): DepthRow => {
    const qty = toBig(level.qty);
    return {
      price: toBig(level.price),
      qty,
      mine: toBig(level.mine),
      orders: level.orders,
      depth: max === 0n ? 0 : Number((qty * 1000n) / max) / 1000,
    };
  };
  return { asks: asks.map(row).toReversed(), bids: bids.map(row) };
}

/** 최우선 매도 − 최우선 매수. 한쪽이 없으면 null */
export function spreadOf(asks: readonly BookLevel[], bids: readonly BookLevel[]): bigint | null {
  const ask = asks[0];
  const bid = bids[0];
  if (!ask || !bid) return null;
  return toBig(ask.price) - toBig(bid.price);
}

/** 봉 하나의 그림 좌표(위가 0) */
export interface CandleShape {
  readonly x: number;
  readonly width: number;
  readonly bodyTop: number;
  readonly bodyHeight: number;
  readonly wickTop: number;
  readonly wickBottom: number;
  readonly volumeTop: number;
  readonly up: boolean;
}

export interface ChartShape {
  readonly candles: readonly CandleShape[];
  readonly high: bigint;
  readonly low: bigint;
  /** 마지막 종가의 y */
  readonly lastY: number;
}

/**
 * 봉 그림: 너비 width, 값 칸 높이 priceHeight, 그 아래 거래량 칸 volumeHeight. 값 범위 위아래에 6% 여유.
 * 봉이 없으면 null
 */
export function chartShape(
  list: readonly Candle[],
  width: number,
  priceHeight: number,
  volumeHeight: number,
): ChartShape | null {
  if (list.length === 0) return null;
  let high = toBig(list[0]?.high);
  let low = toBig(list[0]?.low);
  let maxVolume = 0n;
  for (const candle of list) {
    const h = toBig(candle.high);
    const l = toBig(candle.low);
    const v = toBig(candle.volume);
    if (h > high) high = h;
    if (l < low) low = l;
    if (v > maxVolume) maxVolume = v;
  }
  const span = Number(high - low) || 1;
  const pad = span * 0.06;
  const top = Number(high) + pad;
  const range = span + 2 * pad;
  const y = (value: bigint): number => ((top - Number(value)) / range) * priceHeight;
  const slot = width / list.length;
  const bodyWidth = Math.max(1, slot * 0.64);
  const candles = list.map((candle, index) => {
    const open = toBig(candle.open);
    const close = toBig(candle.close);
    const yOpen = y(open);
    const yClose = y(close);
    const volume = toBig(candle.volume);
    const volumeRatio = maxVolume === 0n ? 0 : Number((volume * 1000n) / maxVolume) / 1000;
    return {
      x: index * slot + (slot - bodyWidth) / 2,
      width: bodyWidth,
      bodyTop: Math.min(yOpen, yClose),
      bodyHeight: Math.max(1, Math.abs(yOpen - yClose)),
      wickTop: y(toBig(candle.high)),
      wickBottom: y(toBig(candle.low)),
      volumeTop: priceHeight + volumeHeight * (1 - volumeRatio),
      up: close >= open,
    };
  });
  return { candles, high, low, lastY: y(toBig(list.at(-1)?.close)) };
}

/** 작은 선(값 목록 → SVG 경로). 값이 둘 미만이면 빈 글 */
export function sparkPath(values: readonly string[], width: number, height: number): string {
  if (values.length < 2) return "";
  const numbers = values.map((value) => Number(toBig(value)));
  const max = Math.max(...numbers);
  const min = Math.min(...numbers);
  const span = max - min || 1;
  const step = width / (numbers.length - 1);
  return numbers
    .map((value, index) => {
      const x = (index * step).toFixed(1);
      const y = (height - ((value - min) / span) * height).toFixed(1);
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

/** 곧 상한다고 알리는 길이(24시간 안) */
export const SPOIL_SOON_MS = 24 * 3_600_000;

/** 창고 요약(한눈에 카드) */
export function holdingsSummary(holdings: EconomyHoldingsResponse): {
  places: number;
  kinds: number;
  spoilingSoon: number;
} {
  const kinds = new Set<string>();
  let spoilingSoon = 0;
  for (const place of holdings.places) {
    for (const line of place.lines) {
      kinds.add(line.asset);
      if (line.spoilsAt !== null && line.spoilsAt - holdings.generatedAt < SPOIL_SOON_MS) spoilingSoon += 1;
    }
  }
  return { places: holdings.places.length, kinds: kinds.size, spoilingSoon };
}

/** 남은 시간 "MM:SS"(한 시간 넘으면 "H:MM:SS"). 지났으면 "00:00" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** 생산 진행(0~1). 끝 시각이 시작보다 앞이면 1 */
export function progressOf(startedAt: number, endsAt: number, now: number): number {
  if (endsAt <= startedAt) return 1;
  return Math.min(1, Math.max(0, (now - startedAt) / (endsAt - startedAt)));
}

/** 급여 하루 추정(D-431·D-432): 기준 단가 × (1 + 조정) × 효율 ÷ 1000 × 일꾼 수(버림) */
export function dailyWage(baseWage: string, adjustBp: number, efficiency: number, workers: number): bigint {
  const rate = (toBig(baseWage) * BigInt(10_000 + Math.trunc(adjustBp))) / 10_000n;
  const perWorker = (rate * BigInt(Math.max(0, Math.trunc(efficiency)))) / 1000n;
  return perWorker * BigInt(Math.max(0, Math.trunc(workers)));
}
