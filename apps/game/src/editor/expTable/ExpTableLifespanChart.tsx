// 유닛 경험치 테이블 수명 대비 도달 기간 SVG 차트 + 공용 축 도우미(/dev/exp-table)
import { m } from "../../paraglide/messages.js";
import { fmtCompact, fmtDecimal, fmtInt } from "./expTableFormat.ts";
import type { ComputedExpRow } from "./expTableModel.ts";

export interface ExpTableChartsProps {
  readonly rows: readonly ComputedExpRow[];
  readonly baseCapLevel: number;
  readonly maxLevel: number;
  readonly dailyXp: number;
  readonly lifespanMinDays: number;
  readonly lifespanMaxDays: number;
  readonly focusLevel: number;
  readonly onFocusLevel: (level: number) => void;
  readonly locale: string;
}

const GATHER_DAILY_XP = 1500 * 15;
const COMBAT_DAILY_XP = 2500 * 15;

export function niceUpper(value: number): number {
  if (value <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  const step = norm <= 1.2 ? 1.2 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.ceil(value / ((step * pow) / 4)) * ((step * pow) / 4);
}

export function YAxisGrid({
  ticks,
  padL,
  xEnd,
  yOf,
  format,
}: {
  readonly ticks: readonly number[];
  readonly padL: number;
  readonly xEnd: number;
  readonly yOf: (value: number) => number;
  readonly format: (value: number) => string;
}) {
  return (
    <>
      {ticks.map((val) => {
        const y = yOf(val);
        return (
          <g key={val}>
            <line x1={padL} y1={y} x2={xEnd} y2={y} className="exp-grid-line" />
            <text x={padL - 6} y={y + 4} textAnchor="end" className="exp-axis-text">
              {format(val)}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** 1) 유닛 수명(T4: 60~90일) 및 1~2개월 목표 구역 대비 레벨 도달 기간 차트 */
export function LifespanPacingChart({
  rows,
  baseCapLevel,
  maxLevel,
  dailyXp,
  lifespanMinDays,
  lifespanMaxDays,
  focusLevel,
  onFocusLevel,
  locale,
}: ExpTableChartsProps) {
  const W = 760;
  const H = 290;
  const padL = 56;
  const padR = 24;
  const padT = 20;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const totalExp = rows[rows.length - 1]?.cumEnd ?? 0;
  const maxSelectedDays = totalExp / Math.max(1, dailyXp);
  const maxGatherDays = totalExp / GATHER_DAILY_XP;
  const rawMaxY = Math.max(lifespanMaxDays * 1.15, maxSelectedDays * 1.08, maxGatherDays * 1.05, 90);
  const maxY = niceUpper(rawMaxY);

  const xOf = (lv: number) => padL + ((lv - 1) / Math.max(1, maxLevel - 1)) * plotW;
  const yOf = (days: number) => padT + plotH - (Math.min(maxY, Math.max(0, days)) / maxY) * plotH;

  const pointsForRate = (rate: number, usePack = false): string => {
    const pts: string[] = [`${xOf(1).toFixed(1)},${yOf(0).toFixed(1)}`];
    for (const row of rows) {
      const cum = usePack ? row.packCumEnd : row.cumEnd;
      if (cum === null) continue;
      pts.push(`${xOf(row.nextLevel).toFixed(1)},${yOf(cum / Math.max(1, rate)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const hasDiff = rows.some((row) => row.packCumEnd !== null && row.packCumEnd !== row.cumEnd);
  const showGatherRef = Math.abs(dailyXp - GATHER_DAILY_XP) > 100;
  const showCombatRef = Math.abs(dailyXp - COMBAT_DAILY_XP) > 100;

  const yTicks = [0, 30, 60, 90, 120, 150, 180, 240, 300].filter((d) => d <= maxY);
  const xTicks = [1, 10, 20, 30, 40, baseCapLevel, maxLevel].filter(
    (lv, idx, arr) => lv >= 1 && lv <= maxLevel && arr.indexOf(lv) === idx,
  );

  const capRow = rows.find((row) => row.nextLevel === baseCapLevel);
  const endRow = rows[rows.length - 1];
  const focusRow = rows.find((row) => row.level === focusLevel) ?? rows[rows.length - 1];

  const targetTopY = yOf(60);
  const targetBotY = yOf(30);
  const lifeTopY = yOf(lifespanMaxDays);
  const lifeBotY = yOf(lifespanMinDays);

  return (
    <section className="exp-chart-card exp-chart-wide" aria-label={m.dev_exp_chart_lifespan_title()}>
      <header className="exp-chart-head">
        <h3>{m.dev_exp_chart_lifespan_title()}</h3>
        <p className="field-hint">
          {m.dev_exp_chart_lifespan_desc({
            min: Math.round(lifespanMinDays),
            max: Math.round(lifespanMaxDays),
          })}
        </p>
      </header>

      <div className="exp-legend">
        <span className="exp-legend-item">
          <span className="exp-swatch exp-swatch-line" data-tone="focus" aria-hidden="true" />
          {m.dev_exp_legend_selected({ xp: fmtCompact(dailyXp, locale) })}
        </span>
        {showGatherRef ? (
          <span className="exp-legend-item">
            <span className="exp-swatch exp-swatch-line" data-tone="gather" aria-hidden="true" />
            {m.dev_exp_legend_gather({ xp: fmtCompact(GATHER_DAILY_XP, locale) })}
          </span>
        ) : null}
        {showCombatRef ? (
          <span className="exp-legend-item">
            <span
              className="exp-swatch exp-swatch-line exp-swatch-dashed"
              data-tone="combat"
              aria-hidden="true"
            />
            {m.dev_exp_legend_combat({ xp: fmtCompact(COMBAT_DAILY_XP, locale) })}
          </span>
        ) : null}
        {hasDiff ? (
          <span className="exp-legend-item exp-legend-muted">
            <span
              className="exp-swatch exp-swatch-line exp-swatch-dashed"
              data-tone="muted"
              aria-hidden="true"
            />
            {m.dev_exp_legend_pack()}
          </span>
        ) : null}
        <span className="exp-legend-item">
          <span className="exp-swatch exp-swatch-band" data-tone="target" aria-hidden="true" />
          {m.dev_exp_legend_target_zone()}
        </span>
        <span className="exp-legend-item">
          <span className="exp-swatch exp-swatch-band" data-tone="lifespan" aria-hidden="true" />
          {m.dev_exp_legend_lifespan_zone({
            min: Math.round(lifespanMinDays),
            max: Math.round(lifespanMaxDays),
          })}
        </span>
      </div>

      <div className="exp-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="exp-svg"
          role="img"
          aria-label={m.dev_exp_chart_lifespan_title()}
        >
          <rect
            x={padL}
            y={targetTopY}
            width={plotW}
            height={Math.max(0, targetBotY - targetTopY)}
            className="exp-band-target"
          />
          <rect
            x={padL}
            y={lifeTopY}
            width={plotW}
            height={Math.max(0, lifeBotY - lifeTopY)}
            className="exp-band-lifespan"
          />

          <YAxisGrid ticks={yTicks} padL={padL} xEnd={W - padR} yOf={yOf} format={(d) => `${d}d`} />

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

          {xTicks.map((lv) => (
            <text key={lv} x={xOf(lv)} y={H - 10} textAnchor="middle" className="exp-axis-text">
              Lv {lv}
            </text>
          ))}

          {hasDiff ? (
            <polyline
              fill="none"
              points={pointsForRate(dailyXp, true)}
              stroke="var(--color-text-muted)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          ) : null}

          {showGatherRef ? (
            <polyline
              fill="none"
              points={pointsForRate(GATHER_DAILY_XP)}
              stroke="var(--color-stat-vit)"
              strokeWidth={1.75}
              strokeOpacity={0.8}
            />
          ) : null}

          {showCombatRef ? (
            <polyline
              fill="none"
              points={pointsForRate(COMBAT_DAILY_XP)}
              stroke="var(--color-stat-str)"
              strokeWidth={1.75}
              strokeDasharray="8 4"
              strokeOpacity={0.8}
            />
          ) : null}

          <polyline
            fill="none"
            points={pointsForRate(dailyXp)}
            stroke="var(--color-focus)"
            strokeWidth={2.75}
          />

          {capRow ? (
            <g>
              <circle
                cx={xOf(capRow.nextLevel)}
                cy={yOf(capRow.daysToReach)}
                r={5}
                fill="var(--color-success)"
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
              <text
                x={xOf(capRow.nextLevel) - 8}
                y={Math.max(padT + 14, yOf(capRow.daysToReach) - 10)}
                textAnchor="end"
                className="exp-callout-text"
              >
                Lv {baseCapLevel}: {fmtDecimal(capRow.daysToReach, locale, 1)}d
              </text>
            </g>
          ) : null}

          {endRow ? (
            <g>
              <circle
                cx={xOf(endRow.nextLevel)}
                cy={yOf(endRow.daysToReach)}
                r={5}
                fill="var(--color-warning)"
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
              <text
                x={xOf(endRow.nextLevel) - 8}
                y={Math.max(padT + 14, yOf(endRow.daysToReach) - 10)}
                textAnchor="end"
                className="exp-callout-text"
              >
                Lv {maxLevel}: {fmtDecimal(endRow.daysToReach, locale, 1)}d
              </text>
            </g>
          ) : null}

          {focusRow ? (
            <circle
              cx={xOf(focusRow.nextLevel)}
              cy={yOf(focusRow.daysToReach)}
              r={4.5}
              fill="var(--color-focus)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          ) : null}

          {rows.map((row) => {
            const stepW = plotW / Math.max(1, rows.length);
            const cx = xOf(row.nextLevel);
            return (
              <rect
                key={row.id}
                x={cx - stepW / 2}
                y={padT}
                width={stepW}
                height={plotH}
                fill="transparent"
                className="exp-hit-area"
                onClick={() => onFocusLevel(row.level)}
              >
                <title>
                  Lv {row.level} → {row.nextLevel}: {fmtInt(row.cumEnd, locale)} XP (
                  {fmtDecimal(row.daysToReach, locale, 1)}d)
                </title>
              </rect>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
