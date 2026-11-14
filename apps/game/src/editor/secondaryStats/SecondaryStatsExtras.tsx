// 2차 스탯 화면 아래 판 둘 — 밸런스 화면에서 옮긴 스탯 기능(docs/research/2026-11-14-dev-tools-overlap.md 5절, docs/adr/2026-11-14-battle-report.md):
// (가) 스태미나·적정치: 표본 유닛(이 화면 계열·초기 합·초점 레벨)이 무기마다 기본 공격을 할 때 한 번 소모·간격·초당 소모·회복과 이어지나(D-511),
//      무기 적정 STR·INT·DEX·AGI와 비율(D-502). 담은 식·가중치가 바로 든다(기기 계산, 같은 해석기).
// (나) 전투 승률 영향: 표본 1차에서 1차마다 "+10 vs 기준" 시드 대결(서버 balance.duels)을 지금 표와 담은 가중치 칸 표로 견준다.
// 이 판은 editor/balance를 가져오지 않는다(조각 분리). 좁은 화면(390px)은 표를 안에서만 가로로 민다.
import {
  BALANCE_LIMITS,
  BALANCE_WEAK_SCORE_PM,
  type BalanceDuelsResponse,
  type BalanceTableResponse,
  balanceSettingsProblem,
} from "@terra/shared/balance";
import type { FormulaListResponse } from "@terra/shared/formula";
import { useId, useMemo, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { field } from "../../net/json.ts";
import { m } from "../../paraglide/messages.js";
import {
  DUEL_COUNT_OPTIONS,
  DUEL_LIMIT_OPTIONS,
  DUEL_RUN_OPTIONS,
  duelEdits,
  ratioText,
  samplePrimaries,
  sustainTable,
} from "./secondaryExtrasModel.ts";
import { primaryCode, primaryName, saveErrorText } from "./secondaryStatsMessages.ts";
import { type SecondaryDraftState, type SimulationConfig, extractErrorKey } from "./secondaryStatsModel.ts";
import "./secondaryExtras.css";

/** 소수 한 자리(끝 0은 뺀다) */
const one = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
};
const pct = (pm: number): string => `${one(pm / 10)}%`;

function duelErrorText(error: unknown): string {
  const reason = field(field(error, "data"), "reason");
  if (reason === "busy" || reason === "rate_limited") return m.dev_sec_duel_busy();
  if (reason === "timeout" || reason === "failed") return m.dev_sec_duel_failed();
  if (reason === "invalid_settings" || reason === "unknown_weapon") return m.dev_sec_duel_invalid();
  const key = extractErrorKey(error);
  if (key === "unauthorized") void refreshSession();
  return saveErrorText(key);
}

export function SecondaryStatsExtras(props: {
  readonly table: BalanceTableResponse;
  readonly formulas: FormulaListResponse;
  readonly drafts: SecondaryDraftState;
  readonly config: SimulationConfig;
  readonly locale: string;
}) {
  const { table, formulas, drafts, config, locale } = props;
  const id = useId();
  const primaries = useMemo(() => samplePrimaries(config), [config]);
  const sustain = useMemo(
    () => sustainTable(table, formulas, drafts, primaries, config.focusLevel),
    [table, formulas, drafts, primaries, config.focusLevel],
  );
  const [weapon, setWeapon] = useState(table.defaults.weapon);
  const [count, setCount] = useState(1);
  const [runs, setRuns] = useState(10);
  const [limitSec, setLimitSec] = useState(120);
  const [duels, setDuels] = useState<{ result: BalanceDuelsResponse; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edits = duelEdits(drafts);
  const duelKey = JSON.stringify([primaries, edits, weapon, count, runs, limitSec]);
  const settingsIssue = balanceSettingsProblem({ runs, limitSec, count });
  const cap = formulas.coefficients.capPm;
  const at = (index: number): number => sustain.primaries[index] ?? 0;
  const weaponName = (w: { name: { ko: string; en: string } }) => (locale === "en" ? w.name.en : w.name.ko);

  const runDuels = (): void => {
    if (busy || settingsIssue !== null) return;
    setBusy(true);
    setError(null);
    const key = duelKey;
    api.balance.duels
      .query({ primaries, edits, weapon, count, runs, seed: 1, limitSec })
      .then(
        (result) => setDuels({ result, key }),
        (cause: unknown) => setError(duelErrorText(cause)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="sec-extras">
      <section
        className="sec-chart-card sec-extra"
        aria-labelledby={`${id}-sustain`}
        data-testid="sec-sustain"
      >
        <h2 id={`${id}-sustain`} className="sec-extra-title">
          {m.dev_sec_sustain_title()}
        </h2>
        <p className="field-hint">
          {m.dev_sec_sustain_unit({
            level: config.focusLevel,
            primaries: (["str", "vit", "int", "wis", "dex", "agi"] as const)
              .map((stat) => `${primaryCode(stat)} ${primaries[stat]}`)
              .join(" · "),
            appropriate: one(sustain.appropriateMilli / 1000),
            score: sustain.score,
            max: sustain.max,
          })}
        </p>
        <div className="sec-extra-scroll" tabIndex={0} role="region" aria-label={m.dev_sec_sustain_title()}>
          <table className="dev-table sec-extra-table">
            <thead>
              <tr>
                <th scope="col">{m.dev_sec_col_weapon()}</th>
                <th scope="col">{m.dev_sec_col_cost()}</th>
                <th scope="col">{m.dev_sec_col_interval()}</th>
                <th scope="col">{m.dev_sec_col_per_second()}</th>
                <th scope="col">{m.dev_sec_col_regen()}</th>
                <th scope="col">{m.dev_sec_col_sustain()}</th>
                <th scope="col">{m.dev_sec_col_attack_appropriate()}</th>
                <th scope="col">{m.dev_sec_col_hit_appropriate()}</th>
                <th scope="col">{m.dev_sec_col_speed_appropriate()}</th>
              </tr>
            </thead>
            <tbody>
              {sustain.rows.map((row) => {
                const w = row.weapon;
                const bare = one(sustain.bareAppropriate);
                return (
                  <tr key={w.id} data-weapon={w.id} data-sustain={row.sustained ? "ok" : "drains"}>
                    <th scope="row">{weaponName(w)}</th>
                    <td>{one(row.costMilli / 1000)}</td>
                    <td>{row.intervalMs}</td>
                    <td>{one(row.costMilli / row.intervalMs)}</td>
                    <td>{one(row.regenPerMinute / 60)}</td>
                    <td>
                      <span className={row.sustained ? "sec-sustain-ok" : "sec-sustain-drains"}>
                        {row.sustained ? m.dev_sec_sustain_ok() : m.dev_sec_sustain_drains()}
                      </span>
                    </td>
                    <td translate="no">
                      {w.unarmed
                        ? m.dev_sec_bare_rule()
                        : w.kind === "physical"
                          ? `STR ${w.appropriate.str ?? "—"} · ${ratioText(at(0), w.appropriate.str, cap)}`
                          : `INT ${w.appropriate.int ?? "—"} · ${ratioText(at(4), w.appropriate.int, cap)}`}
                    </td>
                    <td translate="no">
                      {w.unarmed
                        ? `${bare} · ${ratioText(at(1), sustain.bareAppropriate, cap)}`
                        : `${w.appropriate.dex ?? "—"} · ${ratioText(at(1), w.appropriate.dex, cap)}`}
                    </td>
                    <td translate="no">
                      {w.unarmed
                        ? `${bare} · ${ratioText(at(2), sustain.bareAppropriate, cap)}`
                        : `${w.appropriate.agi ?? "—"} · ${ratioText(at(2), w.appropriate.agi, cap)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec-chart-card sec-extra" aria-labelledby={`${id}-duel`} data-testid="sec-duels">
        <h2 id={`${id}-duel`} className="sec-extra-title">
          {m.dev_sec_duel_title()}
        </h2>
        <p className="field-hint">{m.dev_sec_duel_hint({ edits: edits.length })}</p>
        <div className="sec-extra-fields">
          <label className="sec-param-field">
            <span>{m.dev_sec_weapon_label()}</span>
            <select
              className="input sec-select"
              value={weapon}
              onChange={(event) => setWeapon(event.target.value)}
            >
              {table.weapons.map((w) => (
                <option key={w.id} value={w.id}>
                  {weaponName(w)}
                </option>
              ))}
            </select>
          </label>
          <label className="sec-param-field">
            <span>{m.dev_sec_duel_count()}</span>
            <select
              className="input sec-select"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            >
              {DUEL_COUNT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="sec-param-field">
            <span>{m.dev_sec_duel_runs()}</span>
            <select
              className="input sec-select sec-duel-runs"
              value={runs}
              onChange={(event) => setRuns(Number(event.target.value))}
            >
              {DUEL_RUN_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="sec-param-field">
            <span>{m.dev_sec_duel_limit()}</span>
            <select
              className="input sec-select"
              value={limitSec}
              onChange={(event) => setLimitSec(Number(event.target.value))}
            >
              {DUEL_LIMIT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {m.dev_sec_seconds({ seconds: value })}
                </option>
              ))}
            </select>
          </label>
        </div>
        {settingsIssue !== null ? (
          <p className="field-error">{m.dev_sec_duel_budget({ max: BALANCE_LIMITS.runSecondsMax })}</p>
        ) : null}
        <button
          type="button"
          className="button-primary button-small sec-duel-run"
          aria-disabled={busy || settingsIssue !== null}
          onClick={busy || settingsIssue !== null ? undefined : runDuels}
        >
          {busy ? m.dev_sec_duel_running() : m.dev_sec_duel_run()}
        </button>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {duels ? (
          <div className="sec-extra-scroll" tabIndex={0} role="region" aria-label={m.dev_sec_duel_title()}>
            {duels.key !== duelKey ? <p className="field-hint">{m.dev_sec_duel_stale()}</p> : null}
            <table className="dev-table sec-extra-table sec-duel-table">
              <thead>
                <tr>
                  <th scope="col">{m.dev_sec_col_primary()}</th>
                  <th scope="col">{m.dev_sec_col_score_now()}</th>
                  <th scope="col">{m.dev_sec_col_score_edited()}</th>
                  <th scope="col">{m.dev_sec_col_delta()}</th>
                  <th scope="col">{m.dev_sec_col_avg_time()}</th>
                </tr>
              </thead>
              <tbody>
                {duels.result.current.map((row) => {
                  const edited = duels.result.edited?.find((entry) => entry.primary === row.primary);
                  const delta = edited ? edited.scorePm - row.scorePm : null;
                  const weak = (edited ?? row).scorePm <= BALANCE_WEAK_SCORE_PM;
                  return (
                    <tr key={row.primary} data-primary={row.primary} data-weak={weak ? "" : undefined}>
                      <th scope="row">{`${primaryCode(row.primary)} ${primaryName(row.primary)}`}</th>
                      <td>{pct(row.scorePm)}</td>
                      <td>{edited ? pct(edited.scorePm) : "—"}</td>
                      <td>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${pct(delta)}`}</td>
                      <td>{m.dev_sec_seconds({ seconds: one(row.avgMs / 1000) })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
