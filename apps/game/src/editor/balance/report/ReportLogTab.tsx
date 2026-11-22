// [보고서 기록] 탭 — 저장된 전투 보고서 목록(새것부터, 날짜·이름·종류로 거름, 더 보기), 열기(보고서 보기), 같은 설정으로 다시 돌리기
// ([전투 보고서] 탭에 설정을 싣고 바로 돌린다), 둘 골라 견주기(설정 A 머리 수치, 팩·SIM·설정 판이 다르면 알림). 기록은 팀이 같이 본다(dev·admin).
// 시험용 data-*: .rp-log data-status(loading·ready·failed), 줄 data-report.
import type { BattleReportMeta, BattleReportRecord, ReportMode } from "@terra/shared/battleReport";
import { useCallback, useEffect, useId, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { modeText, reasonText } from "./reportMessages.ts";
import { type ReportErrorKey, reportErrorOf } from "./reportModel.ts";
import { CompareTable, ReportView } from "./ReportView.tsx";

const pctText = (pm: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pm / 10)}%`;

/** "2026-11-14" → 그날 0시(이 기기 시간대, ms). 빈 글이면 undefined */
function dayStart(text: string, plusDays = 0): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const [y = 0, mo = 1, d = 1] = text.split("-").map(Number);
  return new Date(y, mo - 1, d + plusDays).getTime();
}

interface Filters {
  readonly from: string;
  readonly to: string;
  readonly name: string;
  readonly mode: ReportMode | "";
}

export function ReportLogTab(props: {
  readonly locale: string;
  /** 같은 설정으로 다시 돌리기(보고서 탭으로 옮긴다) */
  readonly onRerun: (record: BattleReportRecord) => void;
  /** 파티 대 파티 보고서를 3D 전투 · 리플레이 탭으로 바로 재생 */
  readonly onWatch3D?: (record: BattleReportRecord) => void;
}) {
  const { locale } = props;
  const id = useId();
  const [filters, setFilters] = useState<Filters>({ from: "", to: "", name: "", mode: "" });
  const [list, setList] = useState<{ reports: readonly BattleReportMeta[]; next: string | null } | null>(
    null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<ReportErrorKey | null>(null);
  const [open, setOpen] = useState<BattleReportRecord | null>(null);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [compare, setCompare] = useState<readonly [BattleReportRecord, BattleReportRecord] | null>(null);

  const fail = useCallback((cause: unknown) => {
    const info = reportErrorOf(cause);
    if (info.sessionEnded) void refreshSession();
    setError(info.key);
  }, []);

  const query = useCallback(
    (before?: string) => {
      const input = {
        fromMs: dayStart(filters.from),
        toMs: dayStart(filters.to, 1),
        name: filters.name.trim() || undefined,
        mode: filters.mode || undefined,
        before,
      };
      return api.battleReport.list.query(input);
    },
    [filters],
  );

  useEffect(() => {
    let alive = true;
    query().then(
      (response) => {
        if (!alive) return;
        setList(response);
        setStatus("ready");
        setError(null);
      },
      (cause: unknown) => {
        if (!alive) return;
        setStatus("failed");
        fail(cause);
      },
    );
    return () => {
      alive = false;
    };
  }, [query, fail]);

  const more = (): void => {
    if (!list?.next) return;
    query(list.next).then(
      (response) => setList({ reports: [...list.reports, ...response.reports], next: response.next }),
      fail,
    );
  };

  const openReport = (reportId: string): void => {
    setCompare(null);
    api.battleReport.get.query({ id: reportId }).then(setOpen, fail);
  };

  const togglePick = (reportId: string): void =>
    setPicked((current) =>
      current.includes(reportId)
        ? current.filter((entry) => entry !== reportId)
        : [...current, reportId].slice(-2),
    );

  const runCompare = (): void => {
    const [left, right] = picked;
    if (!left || !right) return;
    setOpen(null);
    Promise.all([api.battleReport.get.query({ id: left }), api.battleReport.get.query({ id: right })]).then(
      ([l, r]) => setCompare([l, r]),
      fail,
    );
  };

  const rerun = (reportId: string): void => {
    api.battleReport.get.query({ id: reportId }).then(props.onRerun, fail);
  };

  const watch3D = (reportId: string): void => {
    const handler = props.onWatch3D;
    if (!handler) return;
    api.battleReport.get.query({ id: reportId }).then(handler, fail);
  };

  return (
    <div className="rp-log" data-status={status}>
      <p className="lead bp-lead">{m.dev_report_log_lead()}</p>
      <form
        className="rp-filters"
        aria-label={m.dev_report_log_filters()}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="field">
          <label className="field-label" htmlFor={`${id}-from`}>
            {m.dev_report_log_from()}
          </label>
          <input
            id={`${id}-from`}
            type="date"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-to`}>
            {m.dev_report_log_to()}
          </label>
          <input
            id={`${id}-to`}
            type="date"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-name`}>
            {m.dev_report_log_name()}
          </label>
          <input
            id={`${id}-name`}
            type="search"
            className="rp-log-name"
            value={filters.name}
            onChange={(event) => setFilters({ ...filters, name: event.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-mode`}>
            {m.dev_report_mode()}
          </label>
          <select
            id={`${id}-mode`}
            value={filters.mode}
            onChange={(event) => {
              const value = event.target.value;
              setFilters({
                ...filters,
                mode: value === "arena" || value === "siege" || value === "wave" ? value : "",
              });
            }}
          >
            <option value="">{m.dev_report_log_all()}</option>
            {(["arena", "siege", "wave"] as const).map((mode) => (
              <option key={mode} value={mode}>
                {modeText(mode)}
              </option>
            ))}
          </select>
        </div>
      </form>
      {error ? (
        <p role="alert" className="field-error">
          {reasonText(error)}
        </p>
      ) : null}
      {status === "loading" ? <p className="field-hint">{m.dev_balance_loading()}</p> : null}
      {list && list.reports.length === 0 ? (
        <p className="field-hint rp-log-empty">{m.dev_report_log_empty()}</p>
      ) : null}
      {list && list.reports.length > 0 ? (
        <>
          <div className="rp-log-actions">
            <button
              type="button"
              className="button-small rp-compare-run"
              aria-disabled={picked.length !== 2}
              onClick={picked.length === 2 ? runCompare : undefined}
            >
              {m.dev_report_log_compare({ count: picked.length })}
            </button>
          </div>
          <ul className="rp-log-list" aria-label={m.dev_report_log_title()}>
            {list.reports.map((report) => (
              <li
                key={report.id}
                className="rp-log-item"
                data-report={report.id}
                aria-current={open?.id === report.id || undefined}
              >
                <label className="rp-check rp-log-pick">
                  <input
                    type="checkbox"
                    checked={picked.includes(report.id)}
                    onChange={() => togglePick(report.id)}
                    aria-label={m.dev_report_log_pick({ name: report.name })}
                  />
                </label>
                <div className="rp-log-main">
                  <strong className="rp-log-title">{report.name}</strong>
                  <span className="rp-log-sub">
                    {`${modeText(report.mode)} · ${m.dev_report_meta_runs({ runs: report.runs, seed: report.seed })} · ${new Date(report.createdAtMs).toLocaleString(locale)}`}
                  </span>
                  <span className="rp-log-sub">
                    {`${m.dev_report_log_score({ a: pctText(report.scorePm, locale) })}${report.scoreBPm === null ? "" : ` · B ${pctText(report.scoreBPm, locale)}`} · ${report.contentVersion} · SIM ${report.simVersion}${report.createdBy ? ` · ${report.createdBy}` : ""}`}
                  </span>
                </div>
                <div className="rp-log-buttons">
                  <button
                    type="button"
                    className="button-small rp-log-open"
                    onClick={() => openReport(report.id)}
                  >
                    {m.dev_report_log_open()}
                  </button>
                  {report.mode === "arena" && props.onWatch3D ? (
                    <button
                      type="button"
                      className="button-small rp-log-watch"
                      onClick={() => watch3D(report.id)}
                    >
                      {m.dev_report_log_watch_3d()}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button-small rp-log-rerun"
                    onClick={() => rerun(report.id)}
                  >
                    {m.dev_report_log_rerun()}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {list.next ? (
            <button type="button" className="button-small" onClick={more}>
              {m.dev_report_log_more()}
            </button>
          ) : null}
        </>
      ) : null}
      {compare ? (
        <section className="rp-section rp-compare-view" aria-label={m.dev_report_compare_title()}>
          <h3 className="bl-subtitle">{m.dev_report_compare_title()}</h3>
          {compare[0].contentHash !== compare[1].contentHash ||
          compare[0].simVersion !== compare[1].simVersion ||
          compare[0].tuningRevision !== compare[1].tuningRevision ? (
            <p className="field-hint bp-stale">{m.dev_report_compare_mismatch()}</p>
          ) : null}
          <CompareTable
            left={compare[0].report.a}
            right={compare[1].report.a}
            leftLabel={compare[0].name}
            rightLabel={compare[1].name}
            locale={locale}
          />
        </section>
      ) : null}
      {open ? <ReportView key={open.id} record={open} locale={locale} /> : null}
    </div>
  );
}
