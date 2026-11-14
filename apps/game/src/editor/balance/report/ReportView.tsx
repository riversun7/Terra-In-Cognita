// 전투 보고서 보기 — 기록 하나(설정·결과)를 보고서 꼴로: 머리(팩 판·해시·SIM·설정 판·시드·판 수), 승패(신뢰 구간), 전투 시간 분포,
// 쓰러뜨리기까지, 편·유닛 표(물리·속성·지속 피해, 명중·빗나감·회피·크리, 크리 몫, 초당 공격, 스태미나로 늦은 공격, 쓰러짐), 공성, 피해 흐름,
// A/B면 B 결과와 머리 수치 견주기. 수는 판마다 평균(합 ÷ 판 수), 비율은 판 전체 합의 비율이다.
import type { BattleReportRecord, ReportCounters, ReportResult } from "@terra/shared/battleReport";
import { useId, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { CityNote } from "./CityNote.tsx";
import { FlowView } from "./FlowView.tsx";
import { compareText, endText, modeText, rowLabel } from "./reportMessages.ts";
import { compareRows, counterView, perRun } from "./reportModel.ts";

const pctText = (pm: number | null, locale: string): string =>
  pm === null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pm / 10)}%`;
const numText = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
const secText = (ms: number, locale: string): string =>
  m.dev_report_seconds({
    value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000),
  });

function CounterRow({
  label,
  counters,
  runs,
  locale,
  keyName,
}: {
  readonly label: string;
  readonly counters: ReportCounters;
  readonly runs: number;
  readonly locale: string;
  readonly keyName: string;
}) {
  const v = counterView(counters, runs);
  const n = (value: number) => numText(value, locale);
  const p = (value: number | null) => pctText(value, locale);
  return (
    <tr data-row={keyName}>
      <th scope="row" className="rp-row-name">
        {label}
      </th>
      <td>{n(v.dealtPhysical)}</td>
      <td>{n(v.dealtElemental)}</td>
      <td>{n(v.dealtDot)}</td>
      <td>{n(v.takenPhysical)}</td>
      <td>{n(v.takenElemental)}</td>
      <td>{n(v.attacks)}</td>
      <td data-col="hit">{p(v.hitPm)}</td>
      <td data-col="miss">{p(v.missPm)}</td>
      <td data-col="evade">{p(v.evadePm)}</td>
      <td data-col="crit">{p(v.critPm)}</td>
      <td>{p(v.critSharePm)}</td>
      <td>{n(v.aps)}</td>
      <td>{`${n(v.staminaWaits)} · ${p(v.staminaWaitPm)}`}</td>
      <td>{n(v.skills)}</td>
      <td>{n(v.kills)}</td>
      <td>{n(v.deaths)}</td>
    </tr>
  );
}

function CounterHead() {
  return (
    <thead>
      <tr>
        <th scope="col">{m.dev_report_col_unit()}</th>
        <th scope="col">{m.dev_report_col_dealt_physical()}</th>
        <th scope="col">{m.dev_report_col_dealt_elemental()}</th>
        <th scope="col">{m.dev_report_col_dealt_dot()}</th>
        <th scope="col">{m.dev_report_col_taken_physical()}</th>
        <th scope="col">{m.dev_report_col_taken_elemental()}</th>
        <th scope="col">{m.dev_report_col_attacks()}</th>
        <th scope="col">{m.dev_report_col_hit()}</th>
        <th scope="col">{m.dev_report_col_miss()}</th>
        <th scope="col">{m.dev_report_col_evade()}</th>
        <th scope="col">{m.dev_report_col_crit()}</th>
        <th scope="col">{m.dev_report_col_crit_share()}</th>
        <th scope="col">{m.dev_report_col_aps()}</th>
        <th scope="col">{m.dev_report_col_stamina()}</th>
        <th scope="col">{m.dev_report_col_skills()}</th>
        <th scope="col">{m.dev_report_col_kills()}</th>
        <th scope="col">{m.dev_report_col_deaths()}</th>
      </tr>
    </thead>
  );
}

function ResultView(props: {
  readonly result: ReportResult;
  readonly reportId: string;
  readonly which: "a" | "b";
  readonly locale: string;
}) {
  const { result, locale } = props;
  const id = useId();
  const { outcome } = result;
  const runs = outcome.runs;
  const n = (value: number) => numText(value, locale);
  const maxBin = Math.max(1, ...outcome.durations.histogram.map((bin) => bin.count));
  return (
    <div className="rp-result" data-which={props.which}>
      <section className="rp-section" aria-labelledby={`${id}-outcome`}>
        <h3 id={`${id}-outcome`} className="bl-subtitle">
          {m.dev_report_outcome_title()}
        </h3>
        <div className="rp-score">
          <strong className="rp-score-value" data-testid="report-score">
            {pctText(outcome.scorePm, locale)}
          </strong>
          <span className="rp-score-ci">
            {m.dev_report_ci({
              low: pctText(outcome.ciLowPm, locale),
              high: pctText(outcome.ciHighPm, locale),
            })}
          </span>
        </div>
        <div
          className="rp-ci-bar"
          role="img"
          aria-label={m.dev_report_ci({
            low: pctText(outcome.ciLowPm, locale),
            high: pctText(outcome.ciHighPm, locale),
          })}
        >
          <span
            className="rp-ci-range"
            style={{
              insetInlineStart: `${outcome.ciLowPm / 10}%`,
              inlineSize: `${(outcome.ciHighPm - outcome.ciLowPm) / 10}%`,
            }}
          />
          <span className="rp-ci-point" style={{ insetInlineStart: `${outcome.scorePm / 10}%` }} />
        </div>
        <ul className="rp-chips">
          <li>
            {m.dev_report_wins({
              a: n(outcome.winsA),
              b: n(outcome.winsB),
              draws: n(outcome.draws),
              runs: n(runs),
            })}
          </li>
          <li>{m.dev_report_timeout_wins({ a: n(outcome.timeoutWinsA), b: n(outcome.timeoutWinsB) })}</li>
          {(["wipe", "nexus", "timeout", "spent"] as const)
            .filter((end) => outcome.ends[end] > 0)
            .map((end) => (
              <li key={end} data-end={end}>{`${endText(end)} ${n(outcome.ends[end])}`}</li>
            ))}
        </ul>
      </section>

      <section className="rp-section" aria-labelledby={`${id}-time`}>
        <h3 id={`${id}-time`} className="bl-subtitle">
          {m.dev_report_time_title()}
        </h3>
        <ul className="rp-chips">
          <li>{m.dev_report_time_avg({ value: secText(outcome.durations.avgMs, locale) })}</li>
          <li>
            {m.dev_report_time_quantiles({
              p10: secText(outcome.durations.p10Ms, locale),
              p50: secText(outcome.durations.p50Ms, locale),
              p90: secText(outcome.durations.p90Ms, locale),
            })}
          </li>
          <li>
            {m.dev_report_ttk({
              team: "A",
              value: secText(outcome.timeToKill.a.avgMs, locale),
              runs: n(outcome.timeToKill.a.runs),
            })}
          </li>
          <li>
            {m.dev_report_ttk({
              team: "B",
              value: secText(outcome.timeToKill.b.avgMs, locale),
              runs: n(outcome.timeToKill.b.runs),
            })}
          </li>
        </ul>
        <ol className="rp-hist" aria-label={m.dev_report_time_title()}>
          {outcome.durations.histogram.map((bin, index) => (
            <li key={index} className="rp-hist-bin">
              <span className="rp-hist-label">{`${Math.round(bin.fromMs / 1000)}–${Math.round(bin.toMs / 1000)}s`}</span>
              <span className="rp-hist-track">
                <span className="rp-hist-fill" style={{ inlineSize: `${(bin.count * 100) / maxBin}%` }} />
              </span>
              <span className="rp-hist-count">{n(bin.count)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rp-section" aria-labelledby={`${id}-sides`}>
        <h3 id={`${id}-sides`} className="bl-subtitle">
          {m.dev_report_sides_title()}
        </h3>
        <p className="field-hint">{m.dev_report_table_hint()}</p>
        <div className="rp-scroll" tabIndex={0} role="region" aria-label={m.dev_report_sides_title()}>
          <table className="dev-table rp-table rp-sides">
            <CounterHead />
            <tbody>
              <CounterRow
                label={m.dev_lab_team_a()}
                keyName="a"
                counters={result.sides.a}
                runs={runs}
                locale={locale}
              />
              <CounterRow
                label={m.dev_lab_team_b()}
                keyName="b"
                counters={result.sides.b}
                runs={runs}
                locale={locale}
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="rp-section" aria-labelledby={`${id}-units`}>
        <h3 id={`${id}-units`} className="bl-subtitle">
          {m.dev_report_units_title()}
        </h3>
        <div className="rp-scroll" tabIndex={0} role="region" aria-label={m.dev_report_units_title()}>
          <table className="dev-table rp-table rp-units">
            <CounterHead />
            <tbody>
              {result.units.map((row) => (
                <CounterRow
                  key={row.key}
                  keyName={row.key}
                  label={`${rowLabel(row.key, row.label)}${row.members > 1 ? ` ×${row.members}` : ""}`}
                  counters={row.counters}
                  runs={runs}
                  locale={locale}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {result.siege ? (
        <section className="rp-section rp-siege" aria-labelledby={`${id}-siege`}>
          <h3 id={`${id}-siege`} className="bl-subtitle">
            {m.dev_report_siege_title()}
          </h3>
          <ul className="rp-chips">
            <li>
              {m.dev_report_siege_nexus({
                destroyed: n(result.siege.nexusDestroyed),
                runs: n(runs),
                max: n(result.siege.nexusMax),
              })}
            </li>
            <li>
              {m.dev_report_siege_left({
                value: pctText(runs <= 0 ? 0 : Math.round(result.siege.nexusLeftPmSum / runs), locale),
              })}
            </li>
            <li>
              {m.dev_report_siege_damage({
                nexus: n(perRun(result.siege.nexusDamage, runs)),
                wall: n(perRun(result.siege.wallDamage, runs)),
                other: n(perRun(result.siege.otherBuildingDamage, runs)),
              })}
            </li>
            <li>{m.dev_report_siege_walls({ count: n(result.siege.walls) })}</li>
          </ul>
        </section>
      ) : null}

      <CityNote result={result} locale={locale} />
      <FlowView result={result} reportId={props.reportId} which={props.which} runs={runs} locale={locale} />
      <p className="field-hint rp-cpu">{m.dev_report_cpu({ ms: n(result.cpuMs) })}</p>
    </div>
  );
}

export function ReportView({
  record,
  locale,
}: {
  readonly record: BattleReportRecord;
  readonly locale: string;
}) {
  const [shown, setShown] = useState<"a" | "b">("a");
  const b = record.report.b;
  const result = shown === "b" && b ? b : record.report.a;
  return (
    <article className="rp-report" data-report={record.id || "unsaved"} aria-label={record.name}>
      <header className="rp-report-head">
        <h3 className="bp-title">{record.name}</h3>
        <ul className="rp-chips rp-meta">
          <li>{modeText(record.mode)}</li>
          <li>{m.dev_report_meta_runs({ runs: record.runs, seed: record.seed })}</li>
          <li>{m.dev_balance_pack({ version: record.contentVersion })}</li>
          <li title={record.contentHash}>
            {m.dev_report_meta_hash({ hash: record.contentHash.slice(0, 8) })}
          </li>
          <li>{m.dev_report_meta_sim({ version: record.simVersion })}</li>
          <li>{m.dev_balance_revision({ revision: record.tuningRevision })}</li>
          <li>{m.dev_report_meta_time({ seconds: Math.round(record.durationMs / 1000) })}</li>
          {record.createdBy ? <li>{record.createdBy}</li> : null}
        </ul>
        {record.note ? <p className="field-hint">{record.note}</p> : null}
        {record.id === "" ? <p className="field-error">{m.dev_report_unsaved()}</p> : null}
      </header>
      {b ? (
        <>
          <div className="rp-modes" role="radiogroup" aria-label={m.dev_report_variant_title()}>
            {(["a", "b"] as const).map((which) => (
              <button
                key={which}
                type="button"
                role="radio"
                aria-checked={shown === which}
                className="rp-mode rp-show"
                data-which={which}
                onClick={() => setShown(which)}
              >
                {which === "a"
                  ? m.dev_report_setup_a()
                  : m.dev_report_setup_b({ label: record.input.variant?.label ?? "B" })}
              </button>
            ))}
          </div>
          <CompareTable
            left={record.report.a}
            right={b}
            leftLabel={m.dev_report_setup_a()}
            rightLabel={record.input.variant?.label ?? "B"}
            locale={locale}
          />
        </>
      ) : null}
      <ResultView key={shown} result={result} reportId={record.id} which={shown} locale={locale} />
    </article>
  );
}

/** 두 결과의 머리 수치(B − A) */
export function CompareTable(props: {
  readonly left: ReportResult;
  readonly right: ReportResult;
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly locale: string;
}) {
  const rows = compareRows(props.left, props.right);
  const { locale } = props;
  const show = (value: number | null, pm: boolean, ms: boolean) =>
    value === null ? "—" : pm ? pctText(value, locale) : ms ? secText(value, locale) : numText(value, locale);
  return (
    <div className="rp-scroll" tabIndex={0} role="region" aria-label={m.dev_report_compare_title()}>
      <table className="dev-table rp-table rp-compare">
        <thead>
          <tr>
            <th scope="col">{m.dev_report_compare_metric()}</th>
            <th scope="col">{props.leftLabel}</th>
            <th scope="col">{props.rightLabel}</th>
            <th scope="col">{m.dev_report_compare_delta()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ms = row.id === "avgMs" || row.id === "p50Ms";
            return (
              <tr key={row.id} data-metric={row.id}>
                <th scope="row">{compareText(row)}</th>
                <td>{show(row.left, row.pm, ms)}</td>
                <td>{show(row.right, row.pm, ms)}</td>
                <td
                  data-sign={
                    row.delta === null ? undefined : row.delta > 0 ? "plus" : row.delta < 0 ? "minus" : "zero"
                  }
                >
                  {row.delta === null ? "—" : `${row.delta > 0 ? "+" : ""}${show(row.delta, row.pm, ms)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
