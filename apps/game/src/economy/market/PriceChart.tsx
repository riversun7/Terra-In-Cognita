// 값 차트 — 30분 봉 + 거래량 막대(SVG, 꾸러미 없이). 색은 토큰(오름 = 성공색, 내림 = 위험색 [임시], 질문 141)이고
// 봉 모양(속이 찬 칸·빈 칸)으로도 오름·내림을 가른다. 그림은 칸 너비에 맞춰 늘고(preserveAspectRatio none), 글자(고가·저가·
// 현재가·시각)는 HTML로 얹어 늘어나지 않는다. 읽기 프로그램에는 한 줄 설명(고가·저가)을 준다.
import type { Candle } from "@terra/shared/economy";
import { m } from "../../paraglide/messages.js";
import { fmt, formatClock } from "../economyText.ts";
import { chartShape } from "../shape.ts";

const WIDTH = 600;
const PRICE_HEIGHT = 160;
const VOLUME_HEIGHT = 36;
const GAP = 8;
const HEIGHT = PRICE_HEIGHT + GAP + VOLUME_HEIGHT;

export function PriceChart({
  candles,
  label,
  now,
}: {
  candles: readonly Candle[];
  /** 무엇의 차트인지(물건, 도시) */
  label: { item: string; city: string };
  now: number;
}) {
  const shape = chartShape(candles, WIDTH, PRICE_HEIGHT, VOLUME_HEIGHT);
  if (!shape) return <p className="eco-chart-empty">{m.economy_chart_empty()}</p>;
  const last = candles.at(-1);
  const first = candles[0];
  const lastPct = (shape.lastY / HEIGHT) * 100;
  return (
    <figure className="eco-chart">
      <div className="eco-chart-plot">
        <svg
          className="eco-chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={m.economy_chart_label({
            item: label.item,
            city: label.city,
            high: fmt(shape.high),
            low: fmt(shape.low),
          })}
        >
          <line
            className="eco-chart-grid"
            x1="0"
            x2={WIDTH}
            y1={PRICE_HEIGHT + GAP / 2}
            y2={PRICE_HEIGHT + GAP / 2}
          />
          <line className="eco-chart-last" x1="0" x2={WIDTH} y1={shape.lastY} y2={shape.lastY} />
          {shape.candles.map((candle, index) => (
            <g key={candles[index]?.at ?? index} data-trend={candle.up ? "up" : "down"}>
              <line
                className="eco-chart-wick"
                x1={candle.x + candle.width / 2}
                x2={candle.x + candle.width / 2}
                y1={candle.wickTop}
                y2={candle.wickBottom}
              />
              <rect
                className="eco-chart-candle"
                x={candle.x}
                y={candle.bodyTop}
                width={candle.width}
                height={candle.bodyHeight}
              />
              <rect
                className="eco-chart-volume"
                x={candle.x}
                y={candle.volumeTop + GAP}
                width={candle.width}
                height={Math.max(0, PRICE_HEIGHT + VOLUME_HEIGHT - candle.volumeTop)}
              />
            </g>
          ))}
        </svg>
        <span className="eco-chart-label eco-chart-high" aria-hidden="true">
          {m.economy_high()} {fmt(shape.high)}
        </span>
        <span className="eco-chart-label eco-chart-low" aria-hidden="true">
          {m.economy_low()} {fmt(shape.low)}
        </span>
        {last ? (
          <span
            className="eco-chart-price"
            style={{ insetBlockStart: `${lastPct.toFixed(1)}%` }}
            aria-hidden="true"
          >
            {fmt(last.close)}
          </span>
        ) : null}
      </div>
      <figcaption className="eco-chart-axis" aria-hidden="true">
        <span>{first ? formatClock(first.at, now) : ""}</span>
        <span>{last ? formatClock(last.at, now) : ""}</span>
      </figcaption>
    </figure>
  );
}
