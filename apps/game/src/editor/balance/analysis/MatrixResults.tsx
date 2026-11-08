// 분포 상성 결과 — 총합마다 승률 열지도(행이 열을 상대로, 칸 = 승률 %·95% 구간), 고른 칸 풀이, 상성 요약(순위·고리·우세·열세),
// 분포별 사양 표. 열지도는 표 그대로라(칸마다 숫자) 색 없이도 읽힌다. 색은 이김 = 시장 파랑, 짐 = 위험 빨강, 반반 = 바탕(두 극 + 무채 가운데).
import {
  type AnalysisMatrixResult,
  rpsSummary,
  verdictOf,
  wilsonInterval,
} from "@terra/shared/balanceAnalysis";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { primaryCode } from "../balanceMessages.ts";
import { intText, pctText, secText } from "./analysisMessages.ts";
import { heatGrid, heatOf } from "./analysisModel.ts";

export function MatrixResults({ result, locale }: { result: AnalysisMatrixResult; locale: string }) {
  const [tableIndex, setTableIndex] = useState(0);
  const [picked, setPicked] = useState<{ i: number; j: number } | null>(null);
  const table = result.tables[tableIndex] ?? result.tables[0];
  if (!table) return null;
  const names = result.builds.map((build) => build.label);
  const count = names.length;
  const grid = heatGrid(table, count);
  const rps = rpsSummary(count, table.cells);
  const nameOf = (index: number | null) => (index === null ? "—" : (names[index] ?? String(index)));
  const pickedCell =
    picked === null
      ? null
      : table.cells.find(
          (cell) =>
            (cell.i === picked.i && cell.j === picked.j) || (cell.i === picked.j && cell.j === picked.i),
        );
  // 고른 칸을 고른 행 쪽에서 본다
  const flip = pickedCell && picked ? pickedCell.i !== picked.i : false;

  return (
    <section className="an-results" aria-labelledby="an-matrix-results">
      <h2 id="an-matrix-results" className="an-section-title">
        {m.dev_an_heat_title({ runs: result.runs, seed: result.seed })}
      </h2>
      {result.tables.length > 1 ? (
        <div className="an-chips" role="tablist" aria-label={m.dev_an_sums()}>
          {result.tables.map((entry, index) => (
            <button
              key={entry.sum}
              type="button"
              role="tab"
              className="an-chip"
              aria-selected={index === tableIndex}
              onClick={() => {
                setTableIndex(index);
                setPicked(null);
              }}
            >
              {m.dev_an_sum_tab({ sum: entry.sum })}
            </button>
          ))}
        </div>
      ) : null}
      <div className="an-heat-wrap">
        <table className="an-heat" data-sum={table.sum}>
          <caption className="an-caption">{m.dev_an_heat_caption({ sum: table.sum })}</caption>
          <thead>
            <tr>
              <th scope="col" className="an-heat-corner">
                {m.dev_an_heat_corner()}
              </th>
              {names.map((name, j) => (
                <th key={`c${String(j)}`} scope="col" className="an-heat-col" title={name}>
                  <span className="an-heat-col-text">{name}</span>
                </th>
              ))}
              <th scope="col" className="an-heat-mean">
                {m.dev_an_heat_mean()}
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={`r${String(i)}`} data-row={i}>
                <th scope="row" className="an-heat-row">
                  {names[i]}
                </th>
                {row.map((cell, j) => {
                  if (i === j)
                    return (
                      <td
                        key={`d${String(j)}`}
                        className="an-heat-cell an-heat-self"
                        aria-label={m.dev_an_heat_self()}
                      >
                        —
                      </td>
                    );
                  const heat = heatOf(cell.score);
                  const sure = cell.score === null ? 0 : verdictOf(cell.score, cell.runs);
                  const half = Math.round((cell.highPm - cell.lowPm) / 2);
                  const selected = picked?.i === i && picked.j === j;
                  return (
                    <td
                      key={`v${String(j)}`}
                      className="an-heat-cell"
                      data-side={heat.side}
                      data-sure={sure !== 0 || undefined}
                      data-col={j}
                      data-level={heat.level}
                    >
                      <button
                        type="button"
                        className="an-heat-button"
                        aria-pressed={selected}
                        aria-label={m.dev_an_heat_cell_label({
                          a: nameOf(i),
                          b: nameOf(j),
                          pct: cell.score === null ? "—" : pctText(cell.score, locale),
                          low: pctText(cell.lowPm, locale),
                          high: pctText(cell.highPm, locale),
                          n: cell.runs,
                        })}
                        title={m.dev_an_heat_cell_label({
                          a: nameOf(i),
                          b: nameOf(j),
                          pct: cell.score === null ? "—" : pctText(cell.score, locale),
                          low: pctText(cell.lowPm, locale),
                          high: pctText(cell.highPm, locale),
                          n: cell.runs,
                        })}
                        onClick={() => setPicked(selected ? null : { i, j })}
                      >
                        <span className="an-heat-value">
                          {cell.score === null ? "—" : Math.round(cell.score / 10)}
                        </span>
                        <span className="an-heat-ci">±{Math.round(half / 10)}</span>
                      </button>
                    </td>
                  );
                })}
                <td className="an-heat-mean-cell">{pctText(rps.builds[i]?.meanPm ?? 500, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="an-legend-heat" aria-hidden="true">
        <span>{m.dev_an_legend_loss()}</span>
        <span className="an-heat-scale">
          {[5, 3, 1, 0, 1, 3, 5].map((level, index) => (
            <span
              key={`s${String(index)}`}
              className="an-heat-swatch"
              data-side={index < 3 ? "loss" : index > 3 ? "win" : "even"}
              data-level={level}
            />
          ))}
        </span>
        <span>{m.dev_an_legend_win()}</span>
        <span className="an-hint">{m.dev_an_legend_sure()}</span>
      </div>

      {pickedCell && picked ? (
        <CellDetail
          a={nameOf(picked.i)}
          b={nameOf(picked.j)}
          sum={table.sum}
          cell={pickedCell}
          flip={flip}
          locale={locale}
        />
      ) : (
        <p className="an-hint">{m.dev_an_heat_pick()}</p>
      )}

      <section className="an-panel an-rps" aria-labelledby="an-rps-title">
        <h3 id="an-rps-title" className="an-panel-title">
          {m.dev_an_rps_title()}
        </h3>
        <ul className="an-rps-flags">
          {rps.dominant.length > 0 ? (
            <li className="an-flag" data-kind="dominant">
              {m.dev_an_rps_dominant({ names: rps.dominant.map(nameOf).join(" · ") })}
            </li>
          ) : null}
          {rps.dominated.length > 0 ? (
            <li className="an-flag" data-kind="dominated">
              {m.dev_an_rps_dominated({ names: rps.dominated.map(nameOf).join(" · ") })}
            </li>
          ) : null}
          {rps.cycles.length === 0 ? (
            <li className="an-flag" data-kind="none">
              {m.dev_an_rps_no_cycles()}
            </li>
          ) : (
            rps.cycles.map(([a, b, c]) => (
              <li key={`${String(a)}-${String(b)}-${String(c)}`} className="an-flag" data-kind="cycle">
                {m.dev_an_rps_cycle({ chain: [a, b, c, a].map(nameOf).join(" > ") })}
              </li>
            ))
          )}
        </ul>
        <div className="dev-table-wrap">
          <table className="dev-table an-rps-table">
            <thead>
              <tr>
                <th scope="col">{m.dev_an_rps_rank()}</th>
                <th scope="col">{m.dev_an_builds()}</th>
                <th scope="col">{m.dev_an_rps_mean()}</th>
                <th scope="col">{m.dev_an_rps_beats()}</th>
                <th scope="col">{m.dev_an_rps_loses()}</th>
                <th scope="col">{m.dev_an_rps_best()}</th>
                <th scope="col">{m.dev_an_rps_worst()}</th>
              </tr>
            </thead>
            <tbody>
              {rps.ranking.map((index, rank) => {
                const entry = rps.builds[index];
                if (!entry) return null;
                return (
                  <tr key={`k${String(index)}`} data-build={index}>
                    <td>{rank + 1}</td>
                    <th scope="row">{nameOf(index)}</th>
                    <td className="an-num">{pctText(entry.meanPm, locale)}%</td>
                    <td className="an-num">{entry.beats}</td>
                    <td className="an-num">{entry.losesTo}</td>
                    <td>{nameOf(entry.best)}</td>
                    <td>{nameOf(entry.worst)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="an-panel" aria-labelledby="an-specs-title">
        <h3 id="an-specs-title" className="an-panel-title">
          {m.dev_an_specs_title({ sum: table.sum })}
        </h3>
        <div className="dev-table-wrap">
          <table className="dev-table an-specs">
            <thead>
              <tr>
                <th scope="col">{m.dev_an_builds()}</th>
                {PRIMARY_STATS.map((stat) => (
                  <th key={stat} scope="col" className="an-num">
                    <span className="an-stat-code" data-stat={stat}>
                      {primaryCode(stat)}
                    </span>
                  </th>
                ))}
                <th scope="col" className="an-num">
                  {m.dev_an_spec_ehp()}
                </th>
                <th scope="col" className="an-num">
                  {m.dev_an_spec_attack()}
                </th>
                <th scope="col" className="an-num">
                  {m.dev_an_spec_hit()}
                </th>
                <th scope="col" className="an-num">
                  {m.dev_an_spec_crit()}
                </th>
                <th scope="col" className="an-num">
                  {m.dev_an_spec_interval()}
                </th>
                <th scope="col" className="an-num">
                  {m.dev_an_spec_dps()}
                </th>
              </tr>
            </thead>
            <tbody>
              {table.units.map((unit, index) => (
                <tr key={`u${String(index)}`}>
                  <th scope="row">{nameOf(index)}</th>
                  {PRIMARY_STATS.map((stat) => (
                    <td
                      key={stat}
                      className="an-num"
                      title={m.dev_an_spec_initial({ n: table.initial[index]?.[stat] ?? 0 })}
                    >
                      {intText(unit.primaries[stat], locale)}
                    </td>
                  ))}
                  <td className="an-num">{intText(unit.ehp, locale)}</td>
                  <td className="an-num">{intText(unit.realAttack, locale)}</td>
                  <td className="an-num">{pctText(unit.hitPm, locale)}%</td>
                  <td className="an-num">{pctText(unit.critPm, locale)}%</td>
                  <td className="an-num">{secText(unit.attackIntervalMs, locale)}</td>
                  <td className="an-num">{intText(unit.dpsIndex, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="an-hint">{m.dev_an_specs_hint()}</p>
      </section>
      {result.dropped.length > 0 ? (
        <p className="an-problem">
          {m.dev_an_dropped({ list: result.dropped.map((entry) => entry.id).join(", ") })}
        </p>
      ) : null}
    </section>
  );
}

function CellDetail({
  a,
  b,
  sum,
  cell,
  flip,
  locale,
}: {
  a: string;
  b: string;
  sum: number;
  cell: AnalysisMatrixResult["tables"][number]["cells"][number];
  flip: boolean;
  locale: string;
}) {
  // flip이면 칸은 상대 쪽에서 센 값이다 → 뒤집어 고른 행 쪽에서 보인다
  const score = flip ? 1000 - cell.scorePm : cell.scorePm;
  const interval = wilsonInterval(score, cell.runs);
  const wins = flip ? cell.losses : cell.wins;
  const losses = flip ? cell.wins : cell.losses;
  const timeoutWins = flip ? cell.timeoutLosses : cell.timeoutWins;
  const timeoutLosses = flip ? cell.timeoutWins : cell.timeoutLosses;
  return (
    <section className="an-panel an-detail" aria-live="polite">
      <h3 className="an-panel-title">{m.dev_an_detail_title({ a, b, sum })}</h3>
      <dl className="an-detail-list">
        <div>
          <dt>{m.dev_an_detail_score()}</dt>
          <dd>
            {m.dev_an_detail_score_value({
              pct: pctText(score, locale),
              low: pctText(interval.lowPm, locale),
              high: pctText(interval.highPm, locale),
              n: cell.runs,
            })}
          </dd>
        </div>
        <div>
          <dt>{m.dev_an_detail_record()}</dt>
          <dd>
            {m.dev_an_detail_record_value({
              w: wins,
              tw: timeoutWins,
              e: cell.even,
              tl: timeoutLosses,
              l: losses,
            })}
          </dd>
        </div>
        <div>
          <dt>{m.dev_an_detail_time()}</dt>
          <dd>
            {m.dev_an_detail_time_value({
              avg: secText(cell.avgMs, locale),
              median: secText(cell.medianMs, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{m.dev_an_detail_dps()}</dt>
          <dd>
            {intText(flip ? cell.dpsB : cell.dpsA, locale)} : {intText(flip ? cell.dpsA : cell.dpsB, locale)}
          </dd>
        </div>
        <div>
          <dt>{m.dev_an_detail_survival()}</dt>
          <dd>
            {pctText(flip ? cell.survivalB : cell.survivalA, locale)}% :{" "}
            {pctText(flip ? cell.survivalA : cell.survivalB, locale)}%
          </dd>
        </div>
      </dl>
    </section>
  );
}
