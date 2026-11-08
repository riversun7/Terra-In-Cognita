// 밸런스 분석 그래프(새 의존성 없이 SVG·HTML) — 순위 막대(가운데 0, 구간 수염)와 단계별 곡선(1차 여섯 줄).
// 색은 1차 스탯 토큰(--color-stat-*, 화면 규칙 ADR 2026-11-01-ui-visibility)이고, 색만으로 가르지 않게 줄마다 점선 모양·끝 이름표·
// 범례를 함께 둔다(검사기: 여섯 색의 색약 구분이 모자라 보조 표시가 필요하다). 값 글자는 글자색 토큰, 축·격자는 흐린 테두리색.
// 곡선은 칸 폭을 재서(ResizeObserver) 화면 px로 그린다(좁은 화면에서 글자가 줄지 않게). 마우스·손가락을 대면 그 단계의 값 풍선.
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { primaryCode } from "../balanceMessages.ts";
import { niceTicks } from "./analysisModel.ts";

/** 줄 모양(색 말고 둘째 표시) — 화면 차례 */
const DASH: Readonly<Record<PrimaryStat, string | undefined>> = {
  str: undefined,
  vit: "7 3",
  int: "2 3",
  wis: "9 3 2 3",
  dex: "4 4",
  agi: "1 2",
};

export interface BarRow {
  readonly stat: PrimaryStat;
  /** 변화(‰ 또는 ‰p). null = 값 없음 */
  readonly change: number | null;
  readonly low: number | null;
  readonly high: number | null;
  readonly text: string;
}

/** 순위 막대: 가운데가 0, 오른쪽 = 오름, 왼쪽 = 내림. 수염 = 95% 구간 */
export function RankedBars({
  rows,
  label,
  emptyText,
}: {
  rows: readonly BarRow[];
  label: string;
  emptyText: string;
}) {
  const extent = Math.max(
    1,
    ...rows.flatMap((row) => [Math.abs(row.change ?? 0), Math.abs(row.low ?? 0), Math.abs(row.high ?? 0)]),
  );
  const pos = (value: number) => 50 + (value / extent) * 50;
  return (
    <ol className="an-bars" aria-label={label}>
      {rows.map((row) => {
        const change = row.change;
        return (
          <li key={row.stat} className="an-bar-row" data-stat={row.stat}>
            <span className="an-bar-label">
              <span className="an-swatch" data-stat={row.stat} aria-hidden="true" />
              {primaryCode(row.stat)}
            </span>
            <span className="an-bar-track" aria-hidden="true">
              <span className="an-bar-zero" />
              {change === null ? null : (
                <span
                  className="an-bar-fill"
                  data-stat={row.stat}
                  style={{
                    insetInlineStart: `${Math.min(pos(change), 50)}%`,
                    inlineSize: `${Math.abs(pos(change) - 50)}%`,
                  }}
                />
              )}
              {row.low !== null && row.high !== null ? (
                <span
                  className="an-bar-whisker"
                  style={{
                    insetInlineStart: `${pos(row.low)}%`,
                    inlineSize: `${pos(row.high) - pos(row.low)}%`,
                  }}
                />
              ) : null}
            </span>
            <span className="an-bar-value">{change === null ? emptyText : row.text}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** 칸 폭(px). 처음과 재지 못하는 환경은 fallback */
function useWidth(fallback: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? fallback);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width];
}

export interface CurveSeries {
  readonly stat: PrimaryStat;
  readonly points: readonly { readonly step: number; readonly change: number }[];
}

const MARGIN = { top: 12, right: 48, bottom: 34, left: 52 };
const HEIGHT = 260;

/** 단계별 곡선(x = 단계 점, y = 기준 대비 변화). format = y 값 글 */
export function CurveChart({
  series,
  steps,
  format,
  xLabel,
  yLabel,
  label,
}: {
  series: readonly CurveSeries[];
  steps: readonly number[];
  format: (value: number) => string;
  xLabel: string;
  yLabel: string;
  label: string;
}) {
  const [ref, width] = useWidth(640);
  const [hover, setHover] = useState<number | null>(null);
  const xs = [...new Set([0, ...steps])].toSorted((a, b) => a - b);
  const values = series.flatMap((entry) => entry.points.map((point) => point.change));
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const yMin = ticks[0] ?? 0;
  const yMax = ticks[ticks.length - 1] ?? 1;
  const innerW = Math.max(40, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 1;
  const x = (step: number) => MARGIN.left + ((step - xMin) / (xMax - xMin || 1)) * innerW;
  const y = (value: number) => MARGIN.top + (1 - (value - yMin) / (yMax - yMin || 1)) * innerH;

  // 끝 이름표: 마지막 점 높이, 겹치면 12px씩 벌린다(차례 고정)
  const ends = series
    .flatMap((entry) => {
      const last = entry.points[entry.points.length - 1];
      return last ? [{ stat: entry.stat, at: y(last.change) }] : [];
    })
    .toSorted((a, b) => a.at - b.at);
  for (let i = 1; i < ends.length; i++) {
    const previous = ends[i - 1];
    const current = ends[i];
    if (previous && current && current.at - previous.at < 12) current.at = previous.at + 12;
  }

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left + MARGIN.left;
    let best = 0;
    xs.forEach((step, index) => {
      if (Math.abs(x(step) - px) < Math.abs(x(xs[best] ?? 0) - px)) best = index;
    });
    setHover(best);
  };
  const hoverStep = hover === null ? null : (xs[hover] ?? null);

  return (
    <div className="an-curve" ref={ref}>
      <p className="an-curve-y" aria-hidden="true">
        {yLabel}
      </p>
      <svg className="an-curve-svg" width={width} height={HEIGHT} role="img" aria-label={label}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? "an-axis-zero" : "an-grid"}
              x1={MARGIN.left}
              x2={MARGIN.left + innerW}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="an-tick"
              x={MARGIN.left - 6}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {format(tick)}
            </text>
          </g>
        ))}
        {xs.map((step) => (
          <text key={step} className="an-tick" x={x(step)} y={MARGIN.top + innerH + 16} textAnchor="middle">
            {step > 0 ? `+${step}` : String(step).replace("-", "−")}
          </text>
        ))}
        <text className="an-axis-title" x={MARGIN.left + innerW / 2} y={HEIGHT - 4} textAnchor="middle">
          {xLabel}
        </text>
        {hoverStep === null ? null : (
          <line
            className="an-crosshair"
            x1={x(hoverStep)}
            x2={x(hoverStep)}
            y1={MARGIN.top}
            y2={MARGIN.top + innerH}
          />
        )}
        {series.map((entry) => (
          <g key={entry.stat} className="an-series" data-stat={entry.stat}>
            <polyline
              className="an-line"
              points={entry.points.map((point) => `${x(point.step)},${y(point.change)}`).join(" ")}
              strokeDasharray={DASH[entry.stat]}
            />
            {entry.points.map((point) => (
              <circle key={point.step} className="an-dot" cx={x(point.step)} cy={y(point.change)} r={4} />
            ))}
          </g>
        ))}
        {ends.map((end) => (
          <text
            key={end.stat}
            className="an-end-label"
            x={MARGIN.left + innerW + 8}
            y={end.at}
            dominantBaseline="middle"
          >
            {primaryCode(end.stat)}
          </text>
        ))}
        <rect
          className="an-hit"
          x={MARGIN.left}
          y={MARGIN.top}
          width={innerW}
          height={innerH}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hoverStep === null ? null : (
        <div
          className="an-tooltip"
          style={{ insetInlineStart: `${Math.min(x(hoverStep), width - 140)}px` }}
          role="status"
        >
          <strong>{hoverStep > 0 ? `+${hoverStep}` : String(hoverStep).replace("-", "−")}</strong>
          <ul>
            {series
              .flatMap((entry) => {
                const point = entry.points.find((candidate) => candidate.step === hoverStep);
                return point ? [{ stat: entry.stat, change: point.change }] : [];
              })
              .toSorted((a, b) => b.change - a.change)
              .map((row) => (
                <li key={row.stat}>
                  <span className="an-swatch" data-stat={row.stat} aria-hidden="true" />
                  {primaryCode(row.stat)} {format(row.change)}
                </li>
              ))}
          </ul>
        </div>
      )}
      <ul className="an-legend" aria-hidden="true">
        {PRIMARY_STATS.map((stat) => (
          <li key={stat}>
            <svg className="an-legend-line" width={24} height={8} data-stat={stat}>
              <line className="an-line" x1={0} x2={24} y1={4} y2={4} strokeDasharray={DASH[stat]} />
            </svg>
            {primaryCode(stat)}
          </li>
        ))}
      </ul>
    </div>
  );
}
