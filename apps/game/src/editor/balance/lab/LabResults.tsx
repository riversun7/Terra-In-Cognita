// 전투 결과 — 한 판(이긴 팀·까닭·끝 시각·남은 몫, 유닛 요약 표, 사건 기록)과 몬테카를로(팀 승률·편 바꿈·시간 초과·평균·중앙 시간,
// 유닛 통계). 수는 모두 서버 판정 결과다. 유닛은 A1·B3처럼 짧게, 표에는 제목도 함께.
import type {
  LabBattleEvent,
  LabBattleResponse,
  LabCatalogResponse,
  LabMonteCarloResponse,
  LabTeam,
} from "@terra/shared/battleLab";
import { m } from "../../../paraglide/messages.js";
import { type Teams, clockText, numberText, percentText } from "./labModel.ts";
import { itemName, skillName, statName, teamText, unitShort, unitTitle } from "./labMessages.ts";

function titleOf(teams: Teams, key: string, catalog: LabCatalogResponse, locale: string): string {
  const team: LabTeam = key.startsWith("b") ? "b" : "a";
  const unit = teams[team].units[Number(key.slice(1))];
  return unit ? unitTitle(unit, catalog, locale) : key;
}

function eventText(event: LabBattleEvent, catalog: LabCatalogResponse, locale: string): string {
  const n = (value: number) => numberText(value, locale);
  switch (event.kind) {
    case "attack": {
      const who = { unit: unitShort(event.unit), target: unitShort(event.target) };
      if (event.outcome === "miss") return m.dev_lab_ev_miss(who);
      if (event.outcome === "evaded") return m.dev_lab_ev_evaded(who);
      const text = m.dev_lab_ev_hit({ ...who, damage: n(event.damage) });
      return `${text}${event.crit ? ` ${m.dev_lab_ev_crit()}` : ""}${event.down ? ` ${m.dev_lab_ev_down()}` : ""}`;
    }
    case "skill": {
      const hits = event.hits
        .map((hit) =>
          hit.damage < 0
            ? m.dev_lab_ev_heal_part({ target: unitShort(hit.target), amount: n(-hit.damage) })
            : `${unitShort(hit.target)} ${n(hit.damage)}${hit.down ? ` ${m.dev_lab_ev_down()}` : ""}`,
        )
        .join(", ");
      return m.dev_lab_ev_skill({
        unit: unitShort(event.unit),
        skill: skillName(catalog, event.skill, locale),
        hits: hits || m.dev_lab_ev_no_effect(),
      });
    }
    default:
      return event.damage < 0
        ? m.dev_lab_ev_regen({ target: unitShort(event.target), amount: n(-event.damage) })
        : `${m.dev_lab_ev_dot({ target: unitShort(event.target), damage: n(event.damage) })}${event.down ? ` ${m.dev_lab_ev_down()}` : ""}`;
  }
}

export function BattleResult(props: {
  readonly result: LabBattleResponse;
  readonly teams: Teams;
  readonly catalog: LabCatalogResponse;
  readonly locale: string;
}) {
  const { result, teams, catalog, locale } = props;
  const n = (value: number) => numberText(value, locale);
  const headline =
    result.winner === null
      ? m.dev_lab_result_even()
      : m.dev_lab_result_winner({ team: teamText(result.winner) });
  const reason = result.reason === "timeout" ? m.dev_lab_reason_timeout() : m.dev_lab_reason_wipe();
  return (
    <div className="bl-result" data-winner={result.winner ?? "even"}>
      <p className="bl-headline">
        <strong>{headline}</strong>
        <span>
          {m.dev_lab_result_line({
            reason,
            time: clockText(result.endMs),
            a: percentText(result.remainingPm.a, locale),
            b: percentText(result.remainingPm.b, locale),
          })}
        </span>
      </p>
      {result.dropped.length > 0 ? (
        <p className="field-hint bl-warn-text">
          {m.dev_lab_dropped({
            list: result.dropped
              .map((entry) =>
                entry.kind === "skill"
                  ? skillName(catalog, entry.id, locale)
                  : entry.kind === "gear_row"
                    ? statName(catalog, entry.id, locale)
                    : itemName(catalog, entry.id, locale),
              )
              .join(", "),
          })}
        </p>
      ) : null}
      <div className="bl-scroll">
        <table className="bl-table bl-summary-table">
          <caption className="visually-hidden">{m.dev_lab_units_caption()}</caption>
          <thead>
            <tr>
              <th scope="col">{m.dev_lab_col_unit()}</th>
              <th scope="col">{m.dev_lab_col_dealt()}</th>
              <th scope="col">{m.dev_lab_col_taken()}</th>
              <th scope="col">{m.dev_lab_col_healed()}</th>
              <th scope="col">{m.dev_lab_col_kills()}</th>
              <th scope="col">{m.dev_lab_col_actions()}</th>
              <th scope="col">{m.dev_lab_col_hp()}</th>
            </tr>
          </thead>
          <tbody>
            {result.units.map((unit) => (
              <tr key={unit.key} data-team={unit.team} data-status={unit.status}>
                <th scope="row">
                  <span className="bl-unit-key">{unitShort(unit.key)}</span>{" "}
                  {titleOf(teams, unit.key, catalog, locale)}
                </th>
                <td>{n(unit.dealt)}</td>
                <td>{n(unit.taken)}</td>
                <td>{n(unit.healed)}</td>
                <td>{n(unit.kills)}</td>
                <td>{`${n(unit.attacks)} · ${n(unit.skills)}`}</td>
                <td>
                  {unit.status === "down" ? m.dev_lab_status_down() : `${n(unit.hp)} / ${n(unit.maxHp)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="bl-details bl-log-wrap" open>
        <summary>
          {m.dev_lab_log_title({ count: result.events.length })}
          {result.eventsDropped > 0 ? ` ${m.dev_lab_log_more({ count: result.eventsDropped })}` : ""}
        </summary>
        <ol className="bl-log">
          {result.events.map((event, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- 사건 기록은 차례 그대로 바뀌지 않는다
            <li key={index} data-kind={event.kind}>
              <time className="bl-log-time">{clockText(event.ms)}</time> {eventText(event, catalog, locale)}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

export function MonteResult(props: {
  readonly result: LabMonteCarloResponse;
  readonly teams: Teams;
  readonly catalog: LabCatalogResponse;
  readonly locale: string;
}) {
  const { result, teams, catalog, locale } = props;
  const n = (value: number) => numberText(value, locale);
  const bar = (team: LabTeam) => {
    const score = result.teams[team].scorePm;
    return (
      <div className="bl-score" data-team={team}>
        <span className="bl-score-label">{teamText(team)}</span>
        <span className="bl-bar" aria-hidden="true">
          <span className="bl-bar-fill" style={{ inlineSize: `${score / 10}%` }} />
        </span>
        <span className="bl-score-value">{`${percentText(score, locale)}%`}</span>
      </div>
    );
  };
  return (
    <div className="bl-monte">
      {bar("a")}
      {bar("b")}
      <ul className="bp-summary bl-monte-facts">
        <li>{m.dev_lab_monte_runs({ runs: result.runs })}</li>
        <li>
          {m.dev_lab_monte_wins({
            a: result.teams.a.wins,
            aJudge: result.teams.a.timeoutWins,
            b: result.teams.b.wins,
            bJudge: result.teams.b.timeoutWins,
          })}
        </li>
        <li>
          {m.dev_lab_monte_sides({
            west: percentText(result.sides.normal.aScorePm, locale),
            east: percentText(result.sides.swapped.aScorePm, locale),
          })}
        </li>
        <li>{m.dev_lab_monte_timeouts({ count: result.timeouts, even: result.timeoutEven })}</li>
        <li>{m.dev_lab_monte_time({ avg: clockText(result.avgMs), median: clockText(result.medianMs) })}</li>
      </ul>
      <div className="bl-scroll">
        <table className="bl-table bl-summary-table">
          <caption className="visually-hidden">{m.dev_lab_units_caption()}</caption>
          <thead>
            <tr>
              <th scope="col">{m.dev_lab_col_unit()}</th>
              <th scope="col">{m.dev_lab_col_dealt_avg()}</th>
              <th scope="col">{m.dev_lab_col_taken_avg()}</th>
              <th scope="col">{m.dev_lab_col_kills_avg()}</th>
              <th scope="col">{m.dev_lab_col_survival()}</th>
            </tr>
          </thead>
          <tbody>
            {result.units.map((unit) => (
              <tr key={unit.key} data-team={unit.team}>
                <th scope="row">
                  <span className="bl-unit-key">{unitShort(unit.key)}</span>{" "}
                  {titleOf(teams, unit.key, catalog, locale)}
                </th>
                <td>{n(unit.dealtAvg)}</td>
                <td>{n(unit.takenAvg)}</td>
                <td>{n(unit.killsAvg)}</td>
                <td>{`${percentText(unit.survivalPm, locale)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
