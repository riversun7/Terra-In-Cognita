// 유닛 경험치 테이블 SVG 시각화 묶음(/dev/exp-table) — 누적 경험치 곡선 · 구간 막대 차트 · 수명 도달 차트를 묶는다.
import { m } from "../../paraglide/messages.js";
import { fmtCompact, fmtDecimal, fmtInt } from "./expTableFormat.ts";
import {
  type ExpTableChartsProps,
  LifespanPacingChart,
  YAxisGrid,
  niceUpper,
} from "./ExpTableLifespanChart.tsx";

/** 2) 누적 경험치 곡선 (Lv 1 → 60) */
function CumulativeExpChart({
  rows,
  baseCapLevel,
  maxLevel,
  focusLevel,
  onFocusLevel,
  locale,
}: ExpTableChartsProps) {
  const W = 440;
  const H = 230;
  const padL = 58;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxCum = Math.max(...rows.map((row) => Math.max(row.cumEnd, row.packCumEnd ?? 0)), 1000);
  const maxY = niceUpper(maxCum * 1.05);
  const xOf = (lv: number) => padL + ((lv - 1) / Math.max(1, maxLevel - 1)) * plotW;
  const yOf = (xp: number) => padT + plotH - (Math.min(maxY, Math.max(0, xp)) / maxY) * plotH;

  const linePts = [
    `${xOf(1).toFixed(1)},${yOf(0).toFixed(1)}`,
    ...rows.map((row) => `${xOf(row.nextLevel).toFixed(1)},${yOf(row.cumEnd).toFixed(1)}`),
  ].join(" ");

  const areaPts = `${linePts} ${xOf(maxLevel).toFixed(1)},${yOf(0).toFixed(1)}`;
  const hasDiff = rows.some((row) => row.packCumEnd !== null && row.packCumEnd !== row.cumEnd);
  const packPts = hasDiff
    ? [
        `${xOf(1).toFixed(1)},${yOf(0).toFixed(1)}`,
        ...rows
          .filter((row) => row.packCumEnd !== null)
          .map((row) => `${xOf(row.nextLevel).toFixed(1)},${yOf(row.packCumEnd ?? 0).toFixed(1)}`),
      ].join(" ")
    : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxY * t));
  const focusRow = rows.find((row) => row.level === focusLevel) ?? rows[rows.length - 1];

  return (
    <section className="exp-chart-card" aria-label={m.dev_exp_chart_cum_title({ max: maxLevel })}>
      <header className="exp-chart-head">
        <h3>{m.dev_exp_chart_cum_title({ max: maxLevel })}</h3>
        <p className="field-hint">{m.dev_exp_chart_cum_desc({ cap: baseCapLevel, max: maxLevel })}</p>
      </header>
      <div className="exp-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="exp-svg"
          role="img"
          aria-label={m.dev_exp_chart_cum_title({ max: maxLevel })}
        >
          <YAxisGrid
            ticks={yTicks}
            padL={padL}
            xEnd={W - padR}
            yOf={yOf}
            format={(val) => fmtCompact(val, locale)}
          />
          <line
            x1={xOf(baseCapLevel)}
            y1={padT}
            x2={xOf(baseCapLevel)}
            y2={padT + plotH}
            className="exp-cap-line"
          />
          {focusRow ? (
            <line
              x1={xOf(focusRow.nextLevel)}
              y1={padT}
              x2={xOf(focusRow.nextLevel)}
              y2={padT + plotH}
              className="exp-cursor-line"
            />
          ) : null}
          <polygon points={areaPts} className="exp-area-fill" />
          {hasDiff ? (
            <polyline
              fill="none"
              points={packPts}
              stroke="var(--color-text-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ) : null}
          <polyline fill="none" points={linePts} stroke="var(--color-stat-int)" strokeWidth={2.5} />
          {focusRow ? (
            <circle
              cx={xOf(focusRow.nextLevel)}
              cy={yOf(focusRow.cumEnd)}
              r={4.5}
              fill="var(--color-focus)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          ) : null}
          {[1, 20, 40, baseCapLevel, maxLevel].map((lv) => (
            <text key={lv} x={xOf(lv)} y={H - 8} textAnchor="middle" className="exp-axis-text">
              {lv}
            </text>
          ))}
          {rows.map((row) => {
            const stepW = plotW / Math.max(1, rows.length);
            return (
              <rect
                key={row.id}
                x={xOf(row.nextLevel) - stepW / 2}
                y={padT}
                width={stepW}
                height={plotH}
                fill="transparent"
                className="exp-hit-area"
                onClick={() => onFocusLevel(row.level)}
              />
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/** 3) 레벨당 필요 경험치 막대 차트 (Lv 1→2 … 59→60) */
function SpanBarsChart({
  rows,
  baseCapLevel,
  maxLevel,
  focusLevel,
  onFocusLevel,
  locale,
}: ExpTableChartsProps) {
  const W = 440;
  const H = 230;
  const padL = 58;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxSpan = Math.max(...rows.map((row) => Math.max(row.requiredExp, row.packRequiredExp ?? 0)), 100);
  const maxY = niceUpper(maxSpan * 1.08);
  const barSlot = plotW / Math.max(1, rows.length);
  const barW = Math.max(2, barSlot * 0.72);
  const yOf = (val: number) => padT + plotH - (Math.min(maxY, Math.max(0, val)) / maxY) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxY * t));
  const hasDiff = rows.some((row) => row.deltaSpan !== 0);
  const packLinePts = hasDiff
    ? rows
        .filter((row) => row.packRequiredExp !== null)
        .map(
          (row, idx) =>
            `${(padL + (idx + 0.5) * barSlot).toFixed(1)},${yOf(row.packRequiredExp ?? 0).toFixed(1)}`,
        )
        .join(" ")
    : "";

  return (
    <section className="exp-chart-card" aria-label={m.dev_exp_chart_span_title()}>
      <header className="exp-chart-head">
        <h3>{m.dev_exp_chart_span_title()}</h3>
        <p className="field-hint">{m.dev_exp_chart_span_desc()}</p>
      </header>
      <div className="exp-legend">
        <span className="exp-legend-item">
          <span className="exp-swatch exp-swatch-bar" data-tone="base" aria-hidden="true" />
          {m.dev_exp_legend_base_phase({ cap: baseCapLevel })}
        </span>
        <span className="exp-legend-item">
          <span className="exp-swatch exp-swatch-bar" data-tone="prestige" aria-hidden="true" />
          {m.dev_exp_legend_prestige_phase({ cap: baseCapLevel, max: maxLevel })}
        </span>
      </div>
      <div className="exp-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="exp-svg"
          role="img"
          aria-label={m.dev_exp_chart_span_title()}
        >
          <YAxisGrid
            ticks={yTicks}
            padL={padL}
            xEnd={W - padR}
            yOf={yOf}
            format={(val) => fmtCompact(val, locale)}
          />
          {rows.map((row, index) => {
            const x = padL + index * barSlot + (barSlot - barW) / 2;
            const y = yOf(row.requiredExp);
            const h = Math.max(1, padT + plotH - y);
            const focused = row.level === focusLevel;
            const fill = row.nonMonotone
              ? "var(--color-danger)"
              : row.isPrestige
                ? "var(--color-warning)"
                : "var(--color-stat-int)";
            return (
              <rect
                key={row.id}
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={1}
                fill={fill}
                fillOpacity={focused ? 1 : 0.78}
                stroke={focused ? "var(--color-text)" : "none"}
                strokeWidth={focused ? 1.5 : 0}
                className="exp-hit-area"
                onClick={() => onFocusLevel(row.level)}
              >
                <title>
                  Lv {row.level} → {row.nextLevel}: {fmtInt(row.requiredExp, locale)} XP
                </title>
              </rect>
            );
          })}
          {hasDiff ? (
            <polyline
              fill="none"
              points={packLinePts}
              stroke="var(--color-text-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ) : null}
          {[1, 15, 30, 45, baseCapLevel, maxLevel - 1].map((lv) => {
            const idx = rows.findIndex((row) => row.level === lv);
            if (idx < 0) return null;
            return (
              <text
                key={lv}
                x={padL + (idx + 0.5) * barSlot}
                y={H - 8}
                textAnchor="middle"
                className="exp-axis-text"
              >
                {lv}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

export function ExpTableCharts(props: ExpTableChartsProps) {
  const focusRow =
    props.rows.find((row) => row.level === props.focusLevel) ?? props.rows[props.rows.length - 1];
  const totalExp = props.rows[props.rows.length - 1]?.cumEnd ?? 1;
  const pct = focusRow ? ((focusRow.cumEnd / Math.max(1, totalExp)) * 100).toFixed(1) : "0.0";

  return (
    <div className="exp-charts-wrap">
      {focusRow ? (
        <p className="exp-focus-banner" role="status">
          {m.dev_exp_focus_readout({
            level: focusRow.level,
            next: focusRow.nextLevel,
            span: fmtInt(focusRow.requiredExp, props.locale),
            cum: fmtInt(focusRow.cumEnd, props.locale),
            pct,
            days: fmtDecimal(focusRow.daysToReach, props.locale, 1),
          })}
        </p>
      ) : null}
      <div className="exp-charts-grid">
        <LifespanPacingChart {...props} />
        <CumulativeExpChart {...props} />
        <SpanBarsChart {...props} />
      </div>
    </div>
  );
}
