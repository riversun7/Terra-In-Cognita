// 밸런스 화면(/dev/balance) — docs/adr/2026-11-01-balance-screen.md 7절. dev·admin, 틀 안, 촘촘.
// - 가중치 표(팩 stat_rows의 실효 값)를 고쳐 담고, 1차 스탯 +10의 2차 스탯 기여(balance.contribution, 담을 때마다 곧바로)와
//   시드 대결 승률(balance.duels, [승률 돌리기])을 지금 표·고친 표로 견준다. 계산은 모두 서버가 한다(기기는 판정 코드를 받지 않는다).
// - 기준 유닛 프리셋(팀이 함께 씀, "바뀜 (D-467)")을 고르면 기준 유닛 칸을 채운다(BalancePresets.tsx).
// - [적용]은 담은 칸을 설정 칸 패널과 같은 묶음(tuning.save)으로 보낸다: 서버가 검사하고 그 세계에 바로 넣는다(감사 기록·설정 판).
//   판 충돌이면 표를 다시 받고 담은 칸은 남긴다(바뀔 것이 없어진 칸은 뺀다). 받지 않을 묶음은 기여 조회가 미리 알린다.
// 조각 이름 BalancePanelScreen-*(미리 캐시 규칙 [Bb]alancePanel). 시험용 data-*: data-status(loading·ready·failed), data-revision.
import {
  BALANCE_LIMITS,
  BALANCE_PRIMARY_MAX,
  BALANCE_PRIMARY_MIN,
  BALANCE_UNARMED,
  type BalanceCellView,
  type BalanceContributionResponse,
  type BalanceDuelsResponse,
  type BalancePresetView,
  type BalanceRowView,
  type BalanceTableResponse,
  type BalanceWeaponView,
} from "@terra/shared/balance";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { statCellKey } from "@terra/shared/tuning";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { BalancePresets } from "./BalancePresets.tsx";
import { ContributionView, DuelsView } from "./BalanceResults.tsx";
import { BalanceTable } from "./BalanceTable.tsx";
import { errorText, primaryCode, primaryName, problemText } from "./balanceMessages.ts";
import {
  type BalanceErrorInfo,
  COUNT_OPTIONS,
  LIMIT_OPTIONS,
  type Pending,
  RUN_OPTIONS,
  balanceErrorOf,
  duelKey,
  editsOf,
  keyOfReason,
  parsePrimaries,
  primariesText,
  problemCodes,
  prunePending,
  settingsProblem,
  stageCell,
} from "./balanceModel.ts";
import { optionsWith } from "./balancePresetModel.ts";
import "./balancePanel.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly table: BalanceTableResponse }
  | { readonly status: "failed"; readonly message: string };

/** 담은 칸을 고친 뒤 기여를 다시 묻기까지(ms) — 칸을 잇달아 고칠 때 요청을 줄인다 */
const CONTRIBUTION_DELAY_MS = 250;

function errorLines(info: BalanceErrorInfo): string[] {
  return [errorText(info.key), ...info.problems.map(problemText)];
}

function weaponLabel(weapon: BalanceWeaponView, locale: string): string {
  const name =
    weapon.id === BALANCE_UNARMED
      ? m.dev_balance_unarmed()
      : locale === "en"
        ? weapon.name.en
        : weapon.name.ko;
  // 두 칸 무기(D-465)는 두 칸을 다 보인다
  const fields: string[] = [];
  if (weapon.physical) fields.push(m.dev_balance_weapon_physical({ attack: weapon.physical.attack }));
  if (weapon.elemental) fields.push(m.dev_balance_weapon_elemental({ attack: weapon.elemental.attack }));
  return `${name} (${fields.join(" · ")})`;
}

export default function BalancePanelScreen() {
  const locale = getLocale();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const weaponId = useId();
  const countId = useId();
  const runsId = useId();
  const limitId = useId();
  const noteId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [primaries, setPrimaries] = useState<Record<PrimaryStat, string> | null>(null);
  const [weapon, setWeapon] = useState<string>(BALANCE_UNARMED);
  const [count, setCount] = useState(1);
  const [runs, setRuns] = useState(10);
  const [limitSec, setLimitSec] = useState(120);
  const [pending, setPending] = useState<Pending>(new Map());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [contribution, setContribution] = useState<BalanceContributionResponse | null>(null);
  const [contributionError, setContributionError] = useState<readonly string[] | null>(null);
  const [duels, setDuels] = useState<{ result: BalanceDuelsResponse; key: string } | null>(null);
  const [duelsBusy, setDuelsBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const duelProblem = useLiveLines();
  const contributionSeq = useRef(0);

  const fail = (target: typeof problem, error: unknown): BalanceErrorInfo => {
    const info = balanceErrorOf(error);
    if (info.sessionEnded) void refreshSession();
    target.show(errorLines(info));
    return info;
  };

  const reload = useCallback((): Promise<BalanceTableResponse | null> => {
    return api.balance.table.query().then(
      (table) => {
        setLoad({ status: "ready", table });
        // 기준 유닛은 처음 한 번만 기본값으로 채운다(사용자가 고친 값은 그대로)
        setPrimaries((previous) => previous ?? primariesText(table.defaults.primaries));
        return table;
      },
      (error: unknown) => {
        const info = balanceErrorOf(error);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: errorText(info.key) });
        return null;
      },
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const table = load.status === "ready" ? load.table : null;
  // 기준 1차 입력이 바뀔 때만 새 값(기여 조회의 다시 묻는 신호)
  const parsed = useMemo(() => (primaries ? parsePrimaries(primaries) : null), [primaries]);
  const settings = parsed ? { primaries: parsed, weapon, count, runs, seed: 1, limitSec } : null;
  const settingsIssue = settingsProblem({ runs, limitSec, count });
  const currentKey = settings ? duelKey(settings, pending) : "";
  const revision = table?.revision ?? -1;

  // 기여: 표(판)·기준 1차·담은 칸이 바뀌면 조금 기다렸다가 다시 묻는다(늦게 온 옛 응답은 버린다)
  useEffect(() => {
    if (revision < 0 || !parsed) return undefined;
    const seq = contributionSeq.current + 1;
    contributionSeq.current = seq;
    const timer = setTimeout(() => {
      api.balance.contribution.query({ primaries: parsed, edits: editsOf(pending) }).then(
        (result) => {
          if (contributionSeq.current !== seq) return;
          setContribution(result);
          setContributionError(null);
        },
        (error: unknown) => {
          if (contributionSeq.current !== seq) return;
          const info = balanceErrorOf(error);
          if (info.sessionEnded) void refreshSession();
          setContributionError(errorLines(info));
        },
      );
    }, CONTRIBUTION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [revision, parsed, pending]);

  /** 프리셋을 고르면 기준 유닛 칸을 채운다(대결 결과는 지문이 달라져 "옛 결과"로 보인다) */
  const pick = (preset: BalancePresetView): void => {
    setPrimaries(primariesText(preset.primaries));
    setWeapon(preset.weapon);
    setCount(preset.count);
    setRuns(preset.runs);
    setLimitSec(preset.limitSec);
  };

  const stage = (row: BalanceRowView, cell: BalanceCellView, value: number | null): void => {
    setPending((previous) => stageCell(previous, row, cell, value));
    problem.clear();
  };
  const unstage = (row: BalanceRowView, cell: BalanceCellView): void => {
    setPending((previous) => {
      const next = new Map(previous);
      next.delete(statCellKey(row.id, cell.field));
      return next;
    });
  };

  const runDuels = (): void => {
    if (!settings || settingsIssue !== null || duelsBusy) return;
    setDuelsBusy(true);
    duelProblem.clear();
    const key = currentKey;
    api.balance.duels
      .query({ ...settings, edits: editsOf(pending) })
      .then(
        (result) => setDuels({ result, key }),
        (error: unknown) => fail(duelProblem, error),
      )
      .finally(() => setDuelsBusy(false));
  };

  /** 담은 칸을 한 묶음(tuning.save)으로 보낸다. 판 충돌이면 표를 다시 받고 담은 칸은 남긴다 */
  const apply = async (): Promise<void> => {
    if (!table || busy || pending.size === 0) return;
    setBusy(true);
    problem.clear();
    try {
      const saved = await api.tuning.save.mutate({
        expectedRevision: table.revision,
        changes: editsOf(pending).map((edit) => ({ id: edit.key, value: edit.value })),
        note: note.trim() === "" ? null : note,
      });
      notice.show([m.dev_balance_applied({ count: pending.size, revision: saved.revision })]);
      setPending(new Map());
      setNote("");
      await reload();
    } catch (error: unknown) {
      const info = fail(problem, error);
      if (info.key === "revision_conflict") {
        const fresh = await reload();
        if (fresh) setPending((previous) => prunePending(previous, fresh.rows));
        problem.show([m.dev_balance_reloaded()]);
      }
    } finally {
      setBusy(false);
    }
  };

  const overrides = table
    ? table.rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.override).length, 0)
    : 0;
  const willReject = contribution?.problem ?? null;
  const stale = duels !== null && duels.key !== currentKey;

  return (
    <section
      className="screen screen-wide bp-screen"
      aria-labelledby="balance-title"
      data-density="compact"
      data-status={load.status}
      data-revision={table?.revision}
    >
      <div className="screen-header">
        <h1 id="balance-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_balance()}
        </h1>
        <BackButton />
      </div>
      <p className="lead bp-lead">{m.dev_balance_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_balance_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="bp-failed">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.dev_balance_retry()}
          </button>
        </div>
      ) : null}
      {table && primaries ? (
        <>
          <ul className="bp-summary" aria-label={m.dev_balance_summary_label()}>
            <li>{m.dev_balance_pack({ version: table.contentVersion })}</li>
            <li className="bp-revision">{m.dev_balance_revision({ revision: table.revision })}</li>
            <li className="bp-overrides" data-count={overrides}>
              {m.dev_balance_overrides({ count: overrides })}
            </li>
            <li className="bp-staged" data-count={pending.size}>
              {m.dev_balance_staged({ count: pending.size })}
            </li>
          </ul>
          <LiveMessage tone="success" lines={notice.lines} version={notice.version} />

          <section className="bp-panel" aria-labelledby="bp-fighter-title">
            <h2 id="bp-fighter-title" className="bp-title">
              {m.dev_balance_fighter_title()}
            </h2>
            <p className="field-hint">{m.dev_balance_fighter_hint()}</p>
            <BalancePresets
              presets={table.presets}
              writable={table.presetsWritable}
              locale={locale}
              form={{ primaries: parsed, weapon, count, runs, limitSec }}
              onPick={pick}
              onChanged={(response) =>
                setLoad((previous) =>
                  previous.status === "ready"
                    ? { status: "ready", table: { ...previous.table, ...response } }
                    : previous,
                )
              }
              onConflict={reload}
            />
            <div className="bp-primaries">
              {PRIMARY_STATS.map((stat) => (
                <label key={stat} className="bp-primary" data-field={stat}>
                  <span className="bp-primary-code">{primaryCode(stat)}</span>
                  <span className="visually-hidden">{primaryName(stat)}</span>
                  <input
                    className="input bp-primary-input"
                    inputMode="numeric"
                    autoComplete="off"
                    value={primaries[stat]}
                    aria-invalid={parsed === null || undefined}
                    onChange={(event) => setPrimaries({ ...primaries, [stat]: event.target.value })}
                  />
                </label>
              ))}
            </div>
            {parsed === null ? (
              <p className="field-error" role="alert">
                {m.dev_balance_primary_invalid({ min: BALANCE_PRIMARY_MIN, max: BALANCE_PRIMARY_MAX })}
              </p>
            ) : null}
            <div className="bp-settings">
              <div className="field">
                <label className="field-label" htmlFor={weaponId}>
                  {m.dev_balance_weapon()}
                </label>
                <select id={weaponId} value={weapon} onChange={(event) => setWeapon(event.target.value)}>
                  {table.weapons.map((option) => (
                    <option key={option.id} value={option.id}>
                      {weaponLabel(option, locale)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={countId}>
                  {m.dev_balance_count()}
                </label>
                <select id={countId} value={count} onChange={(event) => setCount(Number(event.target.value))}>
                  {COUNT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={runsId}>
                  {m.dev_balance_runs()}
                </label>
                <select id={runsId} value={runs} onChange={(event) => setRuns(Number(event.target.value))}>
                  {optionsWith(RUN_OPTIONS, runs).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={limitId}>
                  {m.dev_balance_limit()}
                </label>
                <select
                  id={limitId}
                  value={limitSec}
                  onChange={(event) => setLimitSec(Number(event.target.value))}
                >
                  {optionsWith(LIMIT_OPTIONS, limitSec).map((value) => (
                    <option key={value} value={value}>
                      {m.dev_balance_seconds({ seconds: value })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {settingsIssue === "budget" ? (
              <p className="field-error">
                {m.dev_balance_budget({ max: BALANCE_LIMITS.runSecondsMax, value: runs * limitSec })}
              </p>
            ) : null}
          </section>

          <section className="bp-panel" aria-labelledby="bp-table-title">
            <div className="bp-panel-head">
              <h2 id="bp-table-title" className="bp-title">
                {m.dev_balance_table_title()}
              </h2>
              {pending.size > 0 ? (
                <button type="button" className="button-small" onClick={() => setPending(new Map())}>
                  {m.dev_balance_clear_all()}
                </button>
              ) : null}
            </div>
            <p className="field-hint">{m.dev_balance_table_hint()}</p>
            <ul className="bp-legend">
              <li data-state="staged">{m.dev_balance_legend_staged()}</li>
              <li data-state="override">{m.dev_balance_legend_override()}</li>
            </ul>
            <BalanceTable
              rows={table.rows}
              pending={pending}
              locale={locale}
              onStage={stage}
              onUnstage={unstage}
            />
          </section>

          <section className="bp-panel" aria-labelledby="bp-contrib-title">
            <h2 id="bp-contrib-title" className="bp-title">
              {m.dev_balance_contrib_title()}
            </h2>
            <p className="field-hint">{m.dev_balance_contrib_hint()}</p>
            {contributionError ? <LiveMessage tone="error" lines={contributionError} /> : null}
            {contribution ? (
              <ContributionView result={contribution} rows={table.rows} locale={locale} />
            ) : (
              <p className="field-hint">{m.dev_balance_loading()}</p>
            )}
          </section>

          <section className="bp-panel" aria-labelledby="bp-duels-title">
            <div className="bp-panel-head">
              <h2 id="bp-duels-title" className="bp-title">
                {m.dev_balance_duels_title()}
              </h2>
              <button
                type="button"
                className="button-primary button-small bp-run"
                aria-disabled={duelsBusy || settings === null || settingsIssue !== null}
                onClick={runDuels}
              >
                {duelsBusy ? m.dev_balance_duels_running() : m.dev_balance_duels_run()}
              </button>
            </div>
            <p className="field-hint">{m.dev_balance_duels_hint()}</p>
            <LiveMessage tone="error" lines={duelProblem.lines} version={duelProblem.version} />
            {stale ? <p className="field-hint bp-stale">{m.dev_balance_duels_stale()}</p> : null}
            {duels ? (
              <div className="bp-duels-wrap" data-stale={stale ? "" : undefined}>
                <DuelsView result={duels.result} locale={locale} />
              </div>
            ) : (
              <p className="field-hint">{m.dev_balance_duels_empty()}</p>
            )}
          </section>

          <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          {pending.size > 0 ? (
            <div
              className="bp-pending"
              role="region"
              aria-label={m.dev_balance_pending_count({ count: pending.size })}
            >
              <p className="bp-pending-count">{m.dev_balance_pending_count({ count: pending.size })}</p>
              {willReject ? (
                <p className="bp-pending-reject" role="status">
                  {m.dev_balance_will_reject({
                    reason: [
                      errorText(keyOfReason(willReject.reason)),
                      ...problemCodes(willReject.problems).map(problemText),
                    ].join(" "),
                  })}
                </p>
              ) : null}
              <label className="visually-hidden" htmlFor={noteId}>
                {m.dev_balance_pending_note()}
              </label>
              <input
                id={noteId}
                className="input bp-note-input"
                maxLength={200}
                placeholder={m.dev_balance_pending_note()}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="bp-pending-actions">
                <button type="button" className="button-small" onClick={() => setPending(new Map())}>
                  {m.dev_balance_clear()}
                </button>
                <button
                  type="button"
                  className="button-primary button-small bp-apply"
                  aria-disabled={busy}
                  onClick={busy ? undefined : () => void apply()}
                >
                  {m.dev_balance_apply()}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
