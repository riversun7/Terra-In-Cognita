// 스탯 영향도 결과 — 지표(승률·공격 지수·버팀·실제 공격력·전투 시간)와 단계를 골라 1차 영향 순위 막대, 단계별 곡선,
// 2차 스탯 변화 표(행 = 2차, 열 = 1차, 값 차·비율)를 보인다. 대조 칸(기준 대 기준)이 50%에서 멀면 판 수가 모자란 것이다.
import type { AnalysisSensitivityResult } from "@terra/shared/balanceAnalysis";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { primaryCode } from "../balanceMessages.ts";
import { localized } from "../lab/labMessages.ts";
import type { LabData } from "../lab/useLabData.ts";
import { intText, metricText, pctText, secText, signedInt, signedPct } from "./analysisMessages.ts";
import {
  SENSITIVITY_METRICS,
  type SensitivityMetric,
  curves,
  heatOf,
  rankedBars,
  secondaryEffects,
} from "./analysisModel.ts";
import { CurveChart, RankedBars } from "./charts.tsx";

const stepText = (step: number): string => (step > 0 ? `+${step}` : String(step).replace("-", "−"));

export function SensitivityResults({
  result,
  data,
  locale,
}: {
  result: AnalysisSensitivityResult;
  data: LabData;
  locale: string;
}) {
  const withDuels = result.control !== null;
  const metrics = SENSITIVITY_METRICS.filter(
    (metric) => withDuels || (metric !== "score" && metric !== "time"),
  );
  const [metric, setMetric] = useState<SensitivityMetric>(metrics[0] ?? "dps");
  const positive = result.steps.filter((step) => step > 0);
  const [step, setStep] = useState<number>(positive[0] ?? result.steps[0] ?? 0);
  const bars = rankedBars(result, metric, step);
  const unit = metric === "score" ? m.dev_an_unit_pp() : m.dev_an_unit_pct();
  const format = (value: number) => signedPct(value, locale);
  const statRows = data.load.status === "ready" ? data.load.catalog.statRows : [];
  const rowName = (id: string) => localized(statRows.find((row) => row.id === id)?.name, locale, id);
  const effects = secondaryEffects(result, step);

  return (
    <section className="an-results" aria-labelledby="an-sens-results">
      <h2 id="an-sens-results" className="an-section-title">
        {m.dev_an_sens_title({
          mode: result.mode === "shift" ? m.dev_an_sens_shift() : m.dev_an_sens_plus(),
          sum: result.sum,
          runs: result.runs,
          seed: result.seed,
        })}
      </h2>
      {result.control ? (
        <p
          className="an-hint an-control"
          data-far={Math.abs(result.control.scorePm - 500) > 150 || undefined}
        >
          {m.dev_an_control({ pct: pctText(result.control.scorePm, locale), n: result.control.runs })}
        </p>
      ) : (
        <p className="an-hint">{m.dev_an_no_duels()}</p>
      )}
      <div className="an-fields an-result-controls">
        <label className="an-field" data-field="metric">
          <span className="an-field-label">{m.dev_an_metric()}</span>
          <select
            value={metric}
            onChange={(event) => {
              const next = metrics.find((entry) => entry === event.target.value);
              if (next) setMetric(next);
            }}
          >
            {metrics.map((entry) => (
              <option key={entry} value={entry}>
                {metricText(entry)}
              </option>
            ))}
          </select>
        </label>
        <div className="an-field an-field-wide">
          <span className="an-field-label" id="an-step-label">
            {m.dev_an_step_pick()}
          </span>
          <div className="an-chips" role="group" aria-labelledby="an-step-label">
            {result.steps.map((entry) => (
              <button
                key={entry}
                type="button"
                className="an-chip"
                aria-pressed={entry === step}
                onClick={() => setStep(entry)}
              >
                {stepText(entry)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="an-charts">
        <section className="an-panel" aria-labelledby="an-bars-title">
          <h3 id="an-bars-title" className="an-panel-title">
            {m.dev_an_bars_title({ metric: metricText(metric), step: stepText(step), unit })}
          </h3>
          <RankedBars
            label={m.dev_an_bars_title({ metric: metricText(metric), step: stepText(step), unit })}
            emptyText={m.dev_an_cannot()}
            rows={bars.map((bar) => ({
              stat: bar.stat,
              change: bar.change,
              low: bar.lowPm,
              high: bar.highPm,
              text: bar.change === null ? "" : `${format(bar.change)}${unit}`,
            }))}
          />
          {metric === "score" ? <p className="an-hint">{m.dev_an_bars_hint()}</p> : null}
        </section>
        <section className="an-panel" aria-labelledby="an-curve-title">
          <h3 id="an-curve-title" className="an-panel-title">
            {m.dev_an_curve_title({ metric: metricText(metric) })}
          </h3>
          <CurveChart
            series={curves(result, metric)}
            steps={result.steps}
            format={(value) => `${format(value)}${unit}`}
            xLabel={m.dev_an_curve_axis_x()}
            yLabel={m.dev_an_curve_axis_y({ unit })}
            label={m.dev_an_curve_title({ metric: metricText(metric) })}
          />
        </section>
      </div>

      <section className="an-panel" aria-labelledby="an-effects-title">
        <h3 id="an-effects-title" className="an-panel-title">
          {m.dev_an_effects_title({ step: stepText(step) })}
        </h3>
        <div className="dev-table-wrap">
          <table className="dev-table an-effects">
            <thead>
              <tr>
                <th scope="col">{m.dev_an_effects_row()}</th>
                <th scope="col" className="an-num">
                  {m.dev_an_effects_base()}
                </th>
                {PRIMARY_STATS.map((stat) => (
                  <th key={stat} scope="col" className="an-num">
                    <span className="an-stat-code" data-stat={stat}>
                      {primaryCode(stat)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {effects.map((row) => (
                <tr key={row.row} data-row={row.row}>
                  <th scope="row">{rowName(row.row)}</th>
                  <td className="an-num">{intText(row.base, locale)}</td>
                  {row.cells.map((cell) => {
                    // 비율 변화 ±20%를 끝 단계로(열지도와 같은 색: 오름 = 파랑, 내림 = 빨강)
                    const heat =
                      cell.pm === null
                        ? { side: "even", level: 0 }
                        : heatOf(500 + Math.max(-500, Math.min(500, cell.pm * 2.5)));
                    return (
                      <td
                        key={cell.stat}
                        className="an-num an-effect"
                        data-side={cell.delta === 0 ? "even" : heat.side}
                        data-level={cell.delta === 0 ? 0 : heat.level}
                        data-zero={cell.delta === 0 || undefined}
                        title={cell.pm === null ? undefined : `${signedPct(cell.pm, locale)}%`}
                      >
                        {cell.delta === null ? "—" : signedInt(cell.delta, locale)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="an-panel" aria-labelledby="an-points-title">
        <h3 id="an-points-title" className="an-panel-title">
          {m.dev_an_points_title()}
        </h3>
        <div className="dev-table-wrap">
          <table className="dev-table an-points">
            <thead>
              <tr>
                <th scope="col">{m.dev_an_points_variant()}</th>
                {PRIMARY_STATS.map((stat) => (
                  <th key={stat} scope="col" className="an-num">
                    <span className="an-stat-code" data-stat={stat}>
                      {primaryCode(stat)}
                    </span>
                  </th>
                ))}
                <th scope="col" className="an-num">
                  {m.dev_an_spec_dps()}
                </th>
                <th scope="col" className="an-num">
                  {m.dev_an_spec_ehp()}
                </th>
                {withDuels ? (
                  <>
                    <th scope="col" className="an-num">
                      {m.dev_an_points_score()}
                    </th>
                    <th scope="col" className="an-num">
                      {m.dev_an_points_time()}
                    </th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              <tr data-point="base">
                <th scope="row">{m.dev_an_effects_base()}</th>
                {PRIMARY_STATS.map((stat) => (
                  <td key={stat} className="an-num">
                    {result.base.initial[stat]}
                  </td>
                ))}
                <td className="an-num">{intText(result.base.unit.dpsIndex, locale)}</td>
                <td className="an-num">{intText(result.base.unit.ehp, locale)}</td>
                {withDuels && result.control ? (
                  <>
                    <td className="an-num">{pctText(result.control.scorePm, locale)}%</td>
                    <td className="an-num">{secText(result.control.avgMs, locale)}</td>
                  </>
                ) : null}
              </tr>
              {result.points.map((point) => (
                <tr
                  key={`${point.stat}${String(point.step)}`}
                  data-point={`${point.stat}${String(point.step)}`}
                >
                  <th scope="row">
                    {primaryCode(point.stat)} {stepText(point.step)}
                  </th>
                  {PRIMARY_STATS.map((stat) => (
                    <td key={stat} className="an-num">
                      {point.initial ? point.initial[stat] : "—"}
                    </td>
                  ))}
                  <td className="an-num">{point.unit ? intText(point.unit.dpsIndex, locale) : "—"}</td>
                  <td className="an-num">{point.unit ? intText(point.unit.ehp, locale) : "—"}</td>
                  {withDuels ? (
                    <>
                      <td className="an-num">
                        {point.duel ? `${pctText(point.duel.scorePm, locale)}%` : "—"}
                      </td>
                      <td className="an-num">{point.duel ? secText(point.duel.avgMs, locale) : "—"}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {result.dropped.length > 0 ? (
        <p className="an-problem">
          {m.dev_an_dropped({ list: result.dropped.map((entry) => entry.id).join(", ") })}
        </p>
      ) : null}
    </section>
  );
}
