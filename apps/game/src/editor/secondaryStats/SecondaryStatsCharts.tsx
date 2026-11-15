// 2차 스탯 에디터 SVG 시각화 4종 — 새 런타임 의존성 없이 순수 SVG + CSS 토큰 색·선 패턴으로 그린다.
// 1) 1차 스탯: 식의 가중치(1차가 모두 같을 때 +10) · 이 분포에서의 기여 몫 · +10 한계 효과  2) 계열별 레벨 성장 곡선(물리·재능·지능·균형·커스텀)
// 3) K 편차 밴드 & 확률 수확체감 곡선  4) 선택 레벨 전체 2차 스탯 비교표
// 사용자 결정 D-556(질문 1253): 카드·표 줄마다 값을 낸 식을 글로 보인다. 옛 "기여 비중"은 분포에 따라 바뀌는 몫이라(AGI + DEX도 재능계에서
// DEX 54% · AGI 46%) 가중치로 읽혔다 → "이 분포에서의 기여 몫"으로 이름을 바꾸고, 분포와 상관없는 식의 가중치를 따로 보인다.
import type { BalanceRowView } from "@terra/shared/balance";
import { FX_SCALE } from "@terra/shared/formula";
import type { FormulaText } from "@terra/shared/formulaText";
import type { PrimaryStat } from "@terra/shared/roster";
import type { ArchetypeLevelCurve, KBandPoint } from "@terra/shared/secondaryStatsSim";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { SecondaryFormulaLine } from "./SecondaryFormulaLine.tsx";
import { archetypeText, primaryCode, primaryName } from "./secondaryStatsMessages.ts";
import {
  EXCLUDED_STAT_ID,
  type SecondaryChartBundle,
  type SimulationConfig,
  type TargetEntry,
  targetLineUnit,
  targetUnitKind,
} from "./secondaryStatsModel.ts";

/** 카드 머리의 식 글(선택한 대상) */
interface FormulaHead {
  readonly name: string;
  readonly text: FormulaText | null;
  readonly unit: "pm" | "ms" | "none";
  readonly formulaId: string | null;
}

/** 계열별 선 색·패턴(색약·흑백에서도 구분 가능) */
const ARCHETYPE_STYLES: Readonly<Record<string, { readonly color: string; readonly dash?: string }>> = {
  physical: { color: "var(--color-stat-str)" },
  talent: { color: "var(--color-stat-dex)", dash: "7 3" },
  magic: { color: "var(--color-stat-int)", dash: "2 3" },
  balanced: { color: "var(--color-stat-agi)", dash: "10 4 2 4" },
  custom: { color: "var(--color-warning)", dash: "4 2" },
};

const PRIMARY_COLOR: Readonly<Record<PrimaryStat, string>> = {
  str: "var(--color-stat-str)",
  vit: "var(--color-stat-vit)",
  int: "var(--color-stat-int)",
  wis: "var(--color-stat-wis)",
  dex: "var(--color-stat-dex)",
  agi: "var(--color-stat-agi)",
};

function fmtVal(rawDisplayValue: number, unitKind: "pm" | "x" | "ms" | "points", locale: string): string {
  // evaluateTargetFixed 결과는 ÷ FX_SCALE 상태이므로 pm은 *1000 하지 않고 바로 퍼밀로 변환 가능
  // formatMetricValue는 pm=밀리(1000=100%), x=밀리(1000=1x), ms=밀리(1000=1ms? 아니, evaluateTargetFixed에서 combat/stat는 모두 FX_SCALE로 나눴다)
  // 따라서 pm·ms·points는 scale 확인: stat row(points or pm)는 이미 정수(예: defense_rate 350 -> 35.0%), combat pm도 FX_SCALE로 나누면 900(=90.0%), crit_multiplier는 1500(=1.5x)!
  if (unitKind === "pm")
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rawDisplayValue / 10)}%`;
  if (unitKind === "x")
    return `×${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rawDisplayValue / 1000)}`;
  if (unitKind === "ms")
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(rawDisplayValue)}ms`;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rawDisplayValue);
}

const signedVal = (fx: number, unitKind: "pm" | "x" | "ms" | "points", locale: string): string => {
  const shown = fx / FX_SCALE;
  return `${shown > 0 ? "+" : ""}${fmtVal(shown, unitKind, locale)}`;
};

/** 1) 1차 스탯: 식의 가중치(1차가 모두 같을 때 +10) · 이 분포에서의 기여 몫 · +10 한계 효과 */
function InfluenceChartCard({
  bundle,
  unitKind,
  config,
  locale,
  head,
}: {
  bundle: SecondaryChartBundle;
  unitKind: "pm" | "x" | "ms" | "points";
  config: SimulationConfig;
  locale: string;
  head: FormulaHead;
}) {
  const items = bundle.influence.items;
  const weightTotal = items.reduce((sum, item) => sum + Math.abs(item.equalPlus10), 0);
  const fmtPct = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  return (
    <section className="sec-chart-card" aria-label={m.dev_sec_chart_influence_title()}>
      <header className="sec-chart-head">
        <h3>{m.dev_sec_chart_influence_title()}</h3>
        <p className="field-hint">
          {m.dev_sec_chart_influence_desc({
            level: config.focusLevel,
            archetype: archetypeText(config.archetype),
            sum: config.initialSum,
          })}
        </p>
      </header>
      <SecondaryFormulaLine name={head.name} text={head.text} unit={head.unit} formulaId={head.formulaId} />

      <section
        className="sec-inf-part"
        data-kind="weight"
        aria-label={m.dev_sec_chart_weight_title({ level: bundle.influence.equalLevel })}
      >
        <h4 className="sec-inf-part-title">
          {m.dev_sec_chart_weight_title({ level: bundle.influence.equalLevel })}
        </h4>
        <p className="field-hint">{m.dev_sec_chart_weight_hint()}</p>
        <div className="sec-inf-bars">
          {items.map((item) => {
            const pct = weightTotal === 0 ? 0 : (Math.abs(item.equalPlus10) / weightTotal) * 100;
            return (
              <div key={item.stat} className="sec-inf-row" data-stat={item.stat}>
                <div className="sec-inf-label">
                  <span className="sec-stat-dot" data-stat={item.stat} aria-hidden="true" />
                  <strong>{primaryCode(item.stat)}</strong>
                  <span className="sec-inf-name">{primaryName(item.stat)}</span>
                </div>
                <div className="sec-inf-track" title={`${fmtPct.format(pct)}%`}>
                  <div
                    className="sec-inf-fill"
                    style={{ width: `${pct}%`, backgroundColor: PRIMARY_COLOR[item.stat] }}
                  />
                </div>
                <div className="sec-inf-nums">
                  <span className="sec-inf-share">{weightTotal === 0 ? "—" : `${fmtPct.format(pct)}%`}</span>
                  <span
                    className="sec-inf-plus"
                    data-sign={item.equalPlus10 > 0 ? "up" : item.equalPlus10 < 0 ? "down" : "flat"}
                  >
                    +10: {signedVal(item.equalPlus10, unitKind, locale)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sec-inf-part" data-kind="share" aria-label={m.dev_sec_chart_share_title()}>
        <h4 className="sec-inf-part-title">{m.dev_sec_chart_share_title()}</h4>
        <p className="field-hint">{m.dev_sec_chart_share_hint()}</p>
        <div className="sec-inf-bars">
          {items.map((item) => {
            const sharePct = item.sharePm === null ? 0 : Math.max(0, Math.min(100, item.sharePm / 10));
            return (
              <div key={item.stat} className="sec-inf-row" data-stat={item.stat}>
                <div className="sec-inf-label">
                  <span className="sec-stat-dot" data-stat={item.stat} aria-hidden="true" />
                  <strong>{primaryCode(item.stat)}</strong>
                  <span className="sec-inf-name">{primaryName(item.stat)}</span>
                </div>
                <div className="sec-inf-track" title={`${fmtPct.format(sharePct)}%`}>
                  <div
                    className="sec-inf-fill sec-inf-fill-share"
                    style={{ width: `${sharePct}%`, backgroundColor: PRIMARY_COLOR[item.stat] }}
                  />
                </div>
                <div className="sec-inf-nums">
                  <span className="sec-inf-share">
                    {item.sharePm === null ? "—" : `${fmtPct.format(sharePct)}%`}
                  </span>
                  <span
                    className="sec-inf-plus"
                    data-sign={item.plus10 > 0 ? "up" : item.plus10 < 0 ? "down" : "flat"}
                  >
                    {m.dev_sec_chart_plus10_col()}: {signedVal(item.plus10, unitKind, locale)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="field-hint">{m.dev_sec_chart_plus10_hint()}</p>
      </section>
    </section>
  );
}

/** 좌표 변환 헬퍼 */
function chartBounds(values: readonly number[]) {
  let min = values[0] ?? 0;
  let max = values[0] ?? 1;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) {
    max = min + 1;
  }
  return { min, max };
}

/** 2) 계열별 레벨 성장 곡선(물리·재능·지능·균형·커스텀) */
function LevelCurvesChartCard({
  curves,
  unitKind,
  config,
  locale,
  head,
}: {
  curves: readonly ArchetypeLevelCurve[];
  unitKind: "pm" | "x" | "ms" | "points";
  config: SimulationConfig;
  locale: string;
  head: FormulaHead;
}) {
  const [hoverLevel, setHoverLevel] = useState<number | null>(null);
  const activeLevel = hoverLevel ?? config.focusLevel;

  const allVals: number[] = [];
  for (const c of curves) {
    for (const pt of c.points) {
      allVals.push(pt.draftValue);
      if (pt.baselineValue !== null) allVals.push(pt.baselineValue);
    }
  }
  const { min, max } = chartBounds(allVals);
  const w = 640;
  const h = 250;
  const pad = { l: 58, r: 16, t: 14, b: 28 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const maxLv = Math.max(2, config.maxLevel);
  const xOf = (lv: number) => pad.l + ((lv - 1) / (maxLv - 1)) * plotW;
  const yOf = (val: number) => pad.t + (1 - (val - min) / (max - min)) * plotH;

  const yTicks = [min, (min + max) / 2, max];
  const xTicks = [1, Math.round(maxLv / 2), maxLv];

  return (
    <section
      className="sec-chart-card sec-chart-wide"
      aria-label={m.dev_sec_chart_curves_title({ maxLevel: config.maxLevel })}
    >
      <header className="sec-chart-head">
        <h3>{m.dev_sec_chart_curves_title({ maxLevel: config.maxLevel })}</h3>
        <p className="field-hint">{m.dev_sec_chart_curves_desc()}</p>
      </header>
      <SecondaryFormulaLine name={head.name} text={head.text} unit={head.unit} formulaId={head.formulaId} />
      <div className="sec-legend">
        {curves.map((c) => {
          const style = ARCHETYPE_STYLES[c.id] ?? { color: "var(--color-text)" };
          const pt = c.points.find((p) => p.level === activeLevel);
          return (
            <span key={c.id} className="sec-legend-item">
              <svg width="24" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="24"
                  y2="4"
                  stroke={style.color}
                  strokeWidth="2.5"
                  strokeDasharray={style.dash}
                />
              </svg>
              <span>{archetypeText(c.id)}</span>
              {pt ? (
                <strong>
                  Lv.{activeLevel}: {fmtVal(pt.draftValue, unitKind, locale)}
                </strong>
              ) : null}
            </span>
          );
        })}
        {config.showBaseline ? (
          <span className="sec-legend-item sec-legend-muted">{m.dev_sec_chart_baseline_legend()}</span>
        ) : null}
      </div>
      <div className="sec-svg-wrap">
        <svg
          className="sec-svg"
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={m.dev_sec_chart_curves_title({ maxLevel: config.maxLevel })}
          onMouseLeave={() => setHoverLevel(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width <= 0) return;
            const relX = ((event.clientX - rect.left) / rect.width) * w;
            const ratio = Math.max(0, Math.min(1, (relX - pad.l) / plotW));
            setHoverLevel(Math.max(1, Math.min(maxLv, Math.round(1 + ratio * (maxLv - 1)))));
          }}
        >
          {yTicks.map((tick, idx) => (
            <g key={idx}>
              <line x1={pad.l} y1={yOf(tick)} x2={w - pad.r} y2={yOf(tick)} className="sec-grid-line" />
              <text x={pad.l - 6} y={yOf(tick) + 4} textAnchor="end" className="sec-axis-text">
                {fmtVal(tick, unitKind, locale)}
              </text>
            </g>
          ))}
          {xTicks.map((lv) => (
            <text key={lv} x={xOf(lv)} y={h - 6} textAnchor="middle" className="sec-axis-text">
              Lv.{lv}
            </text>
          ))}
          <line
            x1={xOf(activeLevel)}
            y1={pad.t}
            x2={xOf(activeLevel)}
            y2={h - pad.b}
            className="sec-cursor-line"
          />
          {config.showBaseline
            ? curves.map((c) => {
                const style = ARCHETYPE_STYLES[c.id] ?? { color: "var(--color-text)" };
                const pts = c.points
                  .filter((p) => p.baselineValue !== null)
                  .map((p) => `${xOf(p.level).toFixed(1)},${yOf(p.baselineValue ?? 0).toFixed(1)}`)
                  .join(" ");
                return pts ? (
                  <polyline
                    key={`${c.id}-base`}
                    fill="none"
                    stroke={style.color}
                    strokeOpacity="0.35"
                    strokeWidth="1.75"
                    strokeDasharray="3 3"
                    points={pts}
                  />
                ) : null;
              })
            : null}
          {curves.map((c) => {
            const style = ARCHETYPE_STYLES[c.id] ?? { color: "var(--color-text)" };
            const pts = c.points
              .map((p) => `${xOf(p.level).toFixed(1)},${yOf(p.draftValue).toFixed(1)}`)
              .join(" ");
            const dot = c.points.find((p) => p.level === activeLevel);
            return (
              <g key={c.id}>
                <polyline
                  fill="none"
                  stroke={style.color}
                  strokeWidth="2.4"
                  strokeDasharray={style.dash}
                  points={pts}
                />
                {dot ? (
                  <circle cx={xOf(dot.level)} cy={yOf(dot.draftValue)} r="4" fill={style.color} />
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/** 3a) K 편차 밴드 */
function KBandCard({
  kBand,
  kMinPm,
  kMaxPm,
  unitKind,
  config,
  locale,
}: {
  kBand: readonly KBandPoint[];
  kMinPm: number;
  kMaxPm: number;
  unitKind: "pm" | "x" | "ms" | "points";
  config: SimulationConfig;
  locale: string;
}) {
  const vals = kBand.flatMap((pt) => [pt.minValue, pt.maxValue]);
  const { min, max } = chartBounds(vals);
  const w = 520;
  const h = 210;
  const pad = { l: 54, r: 14, t: 14, b: 26 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const maxLv = Math.max(2, config.maxLevel);
  const xOf = (lv: number) => pad.l + ((lv - 1) / (maxLv - 1)) * plotW;
  const yOf = (val: number) => pad.t + (1 - (val - min) / (max - min)) * plotH;

  const upper = kBand.map((pt) => `${xOf(pt.level).toFixed(1)},${yOf(pt.maxValue).toFixed(1)}`);
  const lower = kBand.toReversed().map((pt) => `${xOf(pt.level).toFixed(1)},${yOf(pt.minValue).toFixed(1)}`);
  const midPts = kBand.map((pt) => `${xOf(pt.level).toFixed(1)},${yOf(pt.midValue).toFixed(1)}`).join(" ");
  const style = ARCHETYPE_STYLES[config.archetype] ?? { color: "var(--color-focus)" };

  return (
    <section
      className="sec-chart-card"
      aria-label={m.dev_sec_chart_kband_title({
        kMin: (kMinPm / 1000).toFixed(2),
        kMax: (kMaxPm / 1000).toFixed(2),
      })}
    >
      <header className="sec-chart-head">
        <h3>
          {m.dev_sec_chart_kband_title({
            kMin: (kMinPm / 1000).toFixed(2),
            kMax: (kMaxPm / 1000).toFixed(2),
          })}
        </h3>
        <p className="field-hint">
          {m.dev_sec_chart_kband_desc({ archetype: archetypeText(config.archetype) })}
        </p>
      </header>
      <div className="sec-svg-wrap">
        <svg className="sec-svg" viewBox={`0 0 ${w} ${h}`}>
          <line x1={pad.l} y1={yOf(min)} x2={w - pad.r} y2={yOf(min)} className="sec-grid-line" />
          <line x1={pad.l} y1={yOf(max)} x2={w - pad.r} y2={yOf(max)} className="sec-grid-line" />
          <text x={pad.l - 6} y={yOf(min) + 4} textAnchor="end" className="sec-axis-text">
            {fmtVal(min, unitKind, locale)}
          </text>
          <text x={pad.l - 6} y={yOf(max) + 4} textAnchor="end" className="sec-axis-text">
            {fmtVal(max, unitKind, locale)}
          </text>
          <polygon points={[...upper, ...lower].join(" ")} fill={style.color} fillOpacity="0.18" />
          <polyline fill="none" stroke={style.color} strokeWidth="2.4" points={midPts} />
          <text x={pad.l} y={h - 6} className="sec-axis-text">
            Lv.1
          </text>
          <text x={w - pad.r} y={h - 6} textAnchor="end" className="sec-axis-text">
            Lv.{maxLv}
          </text>
        </svg>
      </div>
    </section>
  );
}

/** 3b) 확률형 스탯 수확체감 곡선 */
function ProbabilityCurveCard({
  bundle,
  config,
  locale,
}: {
  bundle: SecondaryChartBundle;
  config: SimulationConfig;
  locale: string;
}) {
  const curve = bundle.probabilityCurve;
  const marker = bundle.probabilityMarker;
  if (!curve || !marker || curve.length === 0) return null;
  const w = 520;
  const h = 210;
  const pad = { l: 54, r: 16, t: 18, b: 28 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const maxScore = Math.max(1, curve[curve.length - 1]?.score ?? 1);
  const maxPm = Math.max(10, marker.cap, ...curve.map((pt) => pt.valuePm));
  const xOf = (s: number) => pad.l + (s / maxScore) * plotW;
  const yOf = (pm: number) => pad.t + (1 - pm / maxPm) * plotH;
  const pts = curve.map((pt) => `${xOf(pt.score).toFixed(1)},${yOf(pt.valuePm).toFixed(1)}`).join(" ");
  const halfPm = marker.cap / 2;

  return (
    <section className="sec-chart-card" aria-label={m.dev_sec_chart_prob_title()}>
      <header className="sec-chart-head">
        <h3>{m.dev_sec_chart_prob_title()}</h3>
        <p className="field-hint">{m.dev_sec_chart_prob_desc()}</p>
      </header>
      <div className="sec-prob-pills">
        <span className="sec-prob-pill">
          {m.dev_sec_chart_prob_cap({ value: `${(marker.cap / 10).toFixed(1)}%` })}
        </span>
        <span className="sec-prob-pill">
          {m.dev_sec_chart_prob_half({ score: new Intl.NumberFormat(locale).format(marker.half) })}
        </span>
        <span className="sec-prob-pill sec-prob-pill-now">
          {m.dev_sec_chart_prob_current({
            level: config.focusLevel,
            score: new Intl.NumberFormat(locale).format(marker.score),
            prob: `${(marker.valuePm / 10).toFixed(1)}%`,
          })}
        </span>
      </div>
      <div className="sec-svg-wrap">
        <svg className="sec-svg" viewBox={`0 0 ${w} ${h}`}>
          <line
            x1={pad.l}
            y1={yOf(marker.cap)}
            x2={w - pad.r}
            y2={yOf(marker.cap)}
            stroke="var(--color-warning)"
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
          <text x={pad.l - 6} y={yOf(marker.cap) + 4} textAnchor="end" className="sec-axis-text">
            {(marker.cap / 10).toFixed(1)}%
          </text>
          <text x={pad.l - 6} y={yOf(0) + 4} textAnchor="end" className="sec-axis-text">
            0%
          </text>
          <polyline fill="none" stroke="var(--color-focus)" strokeWidth="2.5" points={pts} />
          <circle cx={xOf(marker.half)} cy={yOf(halfPm)} r="4" fill="var(--color-warning)" />
          <circle
            cx={xOf(Math.min(maxScore, marker.score))}
            cy={yOf(marker.valuePm)}
            r="5.5"
            fill="var(--color-success)"
          />
          <text x={xOf(marker.half)} y={h - 6} textAnchor="middle" className="sec-axis-text">
            half={marker.half}
          </text>
          <text x={w - pad.r} y={h - 6} textAnchor="end" className="sec-axis-text">
            {maxScore}
          </text>
        </svg>
      </div>
    </section>
  );
}

/** 4) 선택 레벨 전체 2차 스탯 비교표 */
function ComparisonMatrixCard({
  bundle,
  rows,
  selectedRowId,
  config,
  locale,
  formulaTexts,
  onSelectStat,
}: {
  bundle: SecondaryChartBundle;
  rows: readonly BalanceRowView[];
  selectedRowId: string;
  config: SimulationConfig;
  locale: string;
  formulaTexts: ReadonlyMap<string, FormulaText | null>;
  onSelectStat: (rowId: string) => void;
}) {
  const rowById = new Map(rows.filter((r) => r.id !== EXCLUDED_STAT_ID).map((r) => [r.id, r]));
  const archIds = Object.keys(bundle.matrix[0]?.values ?? {});

  return (
    <section
      className="sec-chart-card sec-chart-wide"
      aria-label={m.dev_sec_chart_matrix_title({ level: config.focusLevel })}
    >
      <header className="sec-chart-head">
        <h3>{m.dev_sec_chart_matrix_title({ level: config.focusLevel })}</h3>
        <p className="field-hint">{m.dev_sec_chart_matrix_desc({ sum: config.initialSum })}</p>
      </header>
      <div className="sec-matrix-wrap">
        <table className="sec-matrix-table">
          <thead>
            <tr>
              <th>{m.dev_sec_chart_matrix_stat()}</th>
              {archIds.map((id) => (
                <th key={id}>{archetypeText(id)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bundle.matrix.map((entry) => {
              const row = rowById.get(entry.rowId);
              if (!row) return null;
              const name = locale === "en" ? row.name.en : row.name.ko;
              const fmt = (val: number) =>
                row.shape === "probability"
                  ? `${(val / 10).toFixed(1)}%`
                  : row.id === "crit_multiplier"
                    ? `×${(val / 1000).toFixed(2)}`
                    : new Intl.NumberFormat(locale).format(val);
              const selected = row.id === selectedRowId;
              return (
                <tr key={row.id} data-selected={selected ? "" : undefined}>
                  <td>
                    <button type="button" className="sec-matrix-link" onClick={() => onSelectStat(row.id)}>
                      {name}
                    </button>
                    <SecondaryFormulaLine
                      compact
                      name={name}
                      text={formulaTexts.get(row.id) ?? null}
                      unit={row.shape === "probability" || row.id === "crit_multiplier" ? "pm" : "none"}
                      formulaId={null}
                    />
                  </td>
                  {archIds.map((archId) => {
                    const cell = entry.values[archId];
                    if (!cell) return <td key={archId}>—</td>;
                    const diff = cell.baseline === null ? 0 : cell.draft - cell.baseline;
                    return (
                      <td key={archId}>
                        <span className="sec-matrix-val">{fmt(cell.draft)}</span>
                        {diff !== 0 ? (
                          <span className="sec-matrix-diff" data-sign={diff > 0 ? "up" : "down"}>
                            {" "}
                            ({diff > 0 ? "+" : ""}
                            {fmt(diff)})
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SecondaryStatsCharts({
  target,
  bundle,
  rows,
  kMinPm,
  kMaxPm,
  config,
  locale,
  formulaTexts,
  onSelectStat,
}: {
  target: TargetEntry;
  bundle: SecondaryChartBundle;
  rows: readonly BalanceRowView[];
  kMinPm: number;
  kMaxPm: number;
  config: SimulationConfig;
  locale: string;
  formulaTexts: ReadonlyMap<string, FormulaText | null>;
  onSelectStat: (rowId: string) => void;
}) {
  const unitKind = targetUnitKind(target);
  const head: FormulaHead = {
    name: locale === "en" ? target.name.en : target.name.ko,
    text: formulaTexts.get(target.key) ?? null,
    unit: targetLineUnit(target),
    formulaId: target.kind === "combat" ? target.formulaId : null,
  };
  return (
    <div className="sec-charts-grid">
      <InfluenceChartCard bundle={bundle} unitKind={unitKind} config={config} locale={locale} head={head} />
      <KBandCard
        kBand={bundle.kBand}
        kMinPm={kMinPm}
        kMaxPm={kMaxPm}
        unitKind={unitKind}
        config={config}
        locale={locale}
      />
      <LevelCurvesChartCard
        curves={bundle.curves}
        unitKind={unitKind}
        config={config}
        locale={locale}
        head={head}
      />
      <ProbabilityCurveCard bundle={bundle} config={config} locale={locale} />
      <ComparisonMatrixCard
        bundle={bundle}
        rows={rows}
        selectedRowId={target.kind === "stat" ? target.row.id : ""}
        config={config}
        locale={locale}
        formulaTexts={formulaTexts}
        onSelectStat={onSelectStat}
      />
    </div>
  );
}
