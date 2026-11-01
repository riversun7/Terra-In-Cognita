// 밸런스 화면 결과 — 1차 +10 기여 표, 승률 막대. docs/adr/2026-11-01-balance-screen.md 7절.
// 기여: 2차 스탯마다 지금 값과 1차 +10 차이 6열, 고친 표가 다르면 "지금 → 고침". 차이 0은 흐리게, 가치 없는 1차 칩.
// 승률: 1차마다 지금·고친 표 막대(50% 눈금), 승·패·시간 초과(앞섬·뒤짐), 평균 시간. 약한 1차 칩. 계산은 서버가 했다.
import {
  BALANCE_WEAK_SCORE_PM,
  type BalanceContributionResponse,
  type BalanceContributionTable,
  type BalanceDuelRow,
  type BalanceDuelsResponse,
  type BalanceRowView,
} from "@terra/shared/balance";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { m } from "../../paraglide/messages.js";
import { primaryCode, primaryList, primaryName } from "./balanceMessages.ts";
import {
  formatDelta,
  formatNumber,
  marginText,
  minutesSeconds,
  percentText,
  weakPrimaries,
} from "./balanceModel.ts";

function statName(rows: readonly BalanceRowView[], id: string, locale: string): string {
  const row = rows.find((entry) => entry.id === id);
  if (!row) return id;
  return locale === "en" ? row.name.en : row.name.ko;
}

function WorthlessChips({ result }: { result: BalanceContributionResponse }) {
  const now = result.current.worthless;
  const edited = result.edited?.worthless ?? null;
  const ok = now.length === 0 && (edited === null || edited.length === 0);
  return (
    <ul className="bp-flags" aria-live="polite">
      {ok ? (
        <li className="bp-flag" data-tone="ok">
          {m.dev_balance_worthless_none()}
        </li>
      ) : null}
      {now.length > 0 ? (
        <li className="bp-flag" data-tone="bad">
          {m.dev_balance_worthless({ stats: primaryList(now) })}
        </li>
      ) : null}
      {edited && edited.length > 0 ? (
        <li className="bp-flag" data-tone="bad">
          {m.dev_balance_worthless_edited({ stats: primaryList(edited) })}
        </li>
      ) : null}
    </ul>
  );
}

function deltaCell(
  stat: PrimaryStat,
  id: string,
  current: BalanceContributionTable,
  edited: BalanceContributionTable | null,
  locale: string,
) {
  const now = current.stats.find((row) => row.id === id)?.plus[stat] ?? 0;
  const next = edited?.stats.find((row) => row.id === id)?.plus[stat];
  const changed = next !== undefined && next !== now;
  return (
    <td
      key={stat}
      className="bp-num"
      data-zero={(changed ? next : now) === 0 ? "" : undefined}
      data-changed={changed ? "" : undefined}
    >
      {changed ? `${formatDelta(now, locale)} → ${formatDelta(next, locale)}` : formatDelta(now, locale)}
    </td>
  );
}

export function ContributionView(props: {
  readonly result: BalanceContributionResponse;
  readonly rows: readonly BalanceRowView[];
  readonly locale: string;
}) {
  const { result, rows, locale } = props;
  return (
    <>
      <WorthlessChips result={result} />
      <div className="bp-scroll" role="region" aria-label={m.dev_balance_contrib_title()} tabIndex={0}>
        <table className="bp-table bp-contrib">
          <thead>
            <tr>
              <th scope="col" className="bp-th-stat">
                {m.dev_balance_col_stat()}
              </th>
              <th scope="col">{m.dev_balance_col_value()}</th>
              {PRIMARY_STATS.map((stat) => (
                <th key={stat} scope="col" data-field={stat} title={primaryName(stat)}>
                  +10 {primaryCode(stat)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.current.stats.map((row) => {
              const editedValue = result.edited?.stats.find((entry) => entry.id === row.id)?.value;
              const valueChanged = editedValue !== undefined && editedValue !== row.value;
              return (
                <tr key={row.id}>
                  <th scope="row" className="bp-row-name">
                    <span className="bp-row-label">{statName(rows, row.id, locale)}</span>
                  </th>
                  <td className="bp-num" data-changed={valueChanged ? "" : undefined}>
                    {valueChanged
                      ? `${formatNumber(row.value, locale)} → ${formatNumber(editedValue, locale)}`
                      : formatNumber(row.value, locale)}
                  </td>
                  {PRIMARY_STATS.map((stat) =>
                    deltaCell(stat, row.id, result.current, result.edited, locale),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ScoreBar({ row, label, locale }: { row: BalanceDuelRow; label: string; locale: string }) {
  const percent = percentText(row.scorePm, locale);
  const timeouts = row.timeoutWins + row.timeoutLosses + row.timeoutEven;
  const avg = minutesSeconds(row.avgMs);
  return (
    <div className="bp-score" data-weak={row.scorePm <= BALANCE_WEAK_SCORE_PM ? "" : undefined}>
      <span className="bp-score-label">{label}</span>
      <span className="bp-bar" aria-hidden="true">
        <span
          className="bp-bar-fill"
          style={{ inlineSize: `${Math.min(100, Math.max(0, row.scorePm / 10))}%` }}
        />
        <span className="bp-bar-mid" />
      </span>
      <span className="bp-score-value">
        {m.dev_balance_duels_score({ percent })}
        <span className="bp-margin" data-sign={Math.sign(row.marginPm)}>
          {m.dev_balance_duels_margin({ margin: marginText(row.marginPm, locale) })}
        </span>
      </span>
      <span className="bp-score-detail">
        {m.dev_balance_duels_detail({
          wins: row.wins,
          losses: row.losses,
          timeouts,
          leads: row.timeoutWins,
          trails: row.timeoutLosses,
        })}
        {" · "}
        {m.dev_balance_duels_avg({
          time: m.dev_balance_minutes({ minutes: avg.minutes, seconds: avg.seconds }),
        })}
      </span>
    </div>
  );
}

export function DuelsView(props: { readonly result: BalanceDuelsResponse; readonly locale: string }) {
  const { result, locale } = props;
  const weakNow = weakPrimaries(result.current);
  const weakEdited = result.edited ? weakPrimaries(result.edited) : [];
  const weak = [...new Set([...weakNow, ...weakEdited])];
  return (
    <>
      <ul className="bp-flags" aria-live="polite">
        <li className="bp-flag" data-tone={weak.length > 0 ? "bad" : "ok"}>
          {weak.length > 0 ? m.dev_balance_weak({ stats: primaryList(weak) }) : m.dev_balance_weak_none()}
        </li>
      </ul>
      <ul className="bp-duels">
        {result.current.map((row) => {
          const edited = result.edited?.find((entry) => entry.primary === row.primary);
          return (
            <li key={row.primary} className="bp-duel" data-primary={row.primary}>
              <span className="bp-duel-name" data-field={row.primary}>
                +10 {primaryCode(row.primary)}{" "}
                <span className="bp-duel-full">{primaryName(row.primary)}</span>
              </span>
              <ScoreBar row={row} label={m.dev_balance_duels_current()} locale={locale} />
              {edited ? <ScoreBar row={edited} label={m.dev_balance_duels_edited()} locale={locale} /> : null}
            </li>
          );
        })}
      </ul>
      <p className="field-hint bp-ms">
        {m.dev_balance_duels_ms({
          seconds: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(result.ms / 1000),
          runs: result.settings.runs,
        })}
      </p>
    </>
  );
}
