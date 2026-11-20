// 유닛 공통 경험치 테이블 편집기(/dev/exp-table) — 사이보그·휴먼·크리쳐 Lv 1~60 경험치 표 편집·곡선 생성·수명 대비 시각화.
// 조각 이름 ExpTableEditorScreen-*([Ee]xpTable). 공용 이력 부품(ContentHistory)과 실행 취소(contentEditorUndo)만 가져온다.
import {
  EXP_TABLE_EDITOR_REASONS,
  EXP_TABLE_LIMITS,
  type ExpTableCheckResponse,
  type ExpTableEditorReason,
  type ExpTableHistoryRow,
  type ExpTableListResponse,
  expTableMilestones,
} from "@terra/shared/expTable";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { ContentHistory } from "../content/contentEditorHistory.tsx";
import { contentErrorOf } from "../content/contentEditorModel.ts";
import { useUndoShortcut, useUndoStack } from "../content/contentEditorUndo.ts";
import { ExpTableCharts } from "./ExpTableCharts.tsx";
import { ExpTableControls } from "./ExpTableControls.tsx";
import { type ExpTableFilter, ExpTableGrid } from "./ExpTableGrid.tsx";
import { fmtDecimal, fmtInt } from "./expTableFormat.ts";
import {
  ACTIVITY_PROFILES,
  type ActivityProfileId,
  DEFAULT_CURVE_PARAMS,
  EMPTY_EXP_STAGE,
  EXP_CURVE_PRESETS,
  type ExpCurveParams,
  type ExpCurvePresetId,
  type ExpStage,
  buildComputedExpRows,
  effectiveEntriesOf,
  expChangesOf,
  expStageCount,
  generateExpCurve,
  stageExpCurve,
  stageExpDiscardSleeping,
  stageExpRevertAll,
  stageExpRevertRow,
  stageExpSpan,
} from "./expTableModel.ts";
import "./expTable.css";

const MS_PER_DAY = 86_400_000;

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: ExpTableListResponse }
  | { readonly status: "failed"; readonly message: string };

function downloadDiffFile(exported: TuningExportResponse): void {
  const json = `${JSON.stringify(exported.diff, null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `terra-tuning-diff-${exported.diff.packId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function errorText(reason: string, ko: boolean): string {
  switch (reason) {
    case "invalid_entry":
      return ko ? "경험치 표 항목 형식이 규칙에 맞지 않습니다." : "Entry does not match schema rules.";
    case "invalid_note":
      return ko ? "메모는 200자 이하로 적으세요." : "Note must be 200 characters or fewer.";
    case "stale_revision":
    case "conflict":
      return ko
        ? "다른 곳에서 표가 바뀌어 최신 목록을 다시 불러왔습니다."
        : "Table changed elsewhere; reloaded latest.";
    case "validation_failed":
      return ko ? "서버 팩 검증을 통과하지 못했습니다." : "Server pack validation failed.";
    case "rate_limited":
      return ko ? "요청이 너무 빠릅니다. 잠시 뒤 다시 시도하세요." : "Too many requests. Try again shortly.";
    default:
      return ko ? `요청을 처리하지 못했습니다 (${reason}).` : `Request failed (${reason}).`;
  }
}

function DebouncedCheck({ delay, run }: { readonly delay: number; readonly run: () => void }) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    const timer = window.setTimeout(() => runRef.current(), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return null;
}

export default function ExpTableEditorScreen() {
  const locale = getLocale();
  const ko = locale !== "en";
  const titleId = useId();
  const historyId = useId();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [history, setHistory] = useState<readonly ExpTableHistoryRow[]>([]);
  const [stage, setStage] = useState<ExpStage>(EMPTY_EXP_STAGE);
  const undo = useUndoStack<ExpStage>();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<{
    readonly status: "idle" | "checking" | "done";
    readonly result?: ExpTableCheckResponse;
  }>({ status: "idle" });
  const [filter, setFilter] = useState<ExpTableFilter>("all");
  const [focusLevel, setFocusLevel] = useState(50);

  const [curveParams, setCurveParams] = useState<ExpCurveParams>(DEFAULT_CURVE_PARAMS);
  const [activePreset, setActivePreset] = useState<ExpCurvePresetId | null>("balanced");
  const [activityId, setActivityId] = useState<ActivityProfileId | null>("gather_npc");
  const [xpPerHour, setXpPerHour] = useState(1500);
  const [hoursPerDay, setHoursPerDay] = useState(15);

  const statusLive = useLiveLines();
  const errorLive = useLiveLines();

  const commitStage = (next: ExpStage, editKey?: string) => {
    undo.record(stage, editKey);
    setStage(next);
  };
  const resetStage = () => {
    undo.clear();
    setStage(EMPTY_EXP_STAGE);
  };
  const handleUndo = () => {
    const previous = undo.pop();
    if (previous !== null) setStage(previous);
  };

  useUndoShortcut(handleUndo);

  useEffect(() => {
    let active = true;
    Promise.all([api.expTable.list.query(), api.expTable.history.query()])
      .then(([list, hist]) => {
        if (!active) return;
        setLoad({ status: "ready", list });
        setHistory(hist.rows);
        setCurveParams((prev) => ({
          ...prev,
          baseCapLevel: list.baseMaxLevel,
          maxLevel: Math.max(list.baseMaxLevel + 1, list.entries.length + 1),
        }));
      })
      .catch((error: unknown) => {
        if (!active) return;
        const info = contentErrorOf<ExpTableEditorReason>(error, EXP_TABLE_EDITOR_REASONS);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: m.dev_exp_load_failed() });
      });
    return () => {
      active = false;
    };
  }, []);

  const serverRows = useMemo(() => (load.status === "ready" ? load.list.entries : []), [load]);
  const baseCapLevel =
    load.status === "ready" ? load.list.baseMaxLevel : EXP_TABLE_LIMITS.defaultBaseCapLevel;
  const lifespanMinDays = load.status === "ready" ? load.list.lifespanMinMs / MS_PER_DAY : 60;
  const lifespanMaxDays = load.status === "ready" ? load.list.lifespanMaxMs / MS_PER_DAY : 90;
  const dailyXp = Math.max(100, xpPerHour * hoursPerDay);

  const effectiveEntries = useMemo(() => effectiveEntriesOf(serverRows, stage), [serverRows, stage]);
  const milestones = useMemo(
    () => expTableMilestones(effectiveEntries, baseCapLevel),
    [effectiveEntries, baseCapLevel],
  );
  const computedRows = useMemo(
    () => buildComputedExpRows(serverRows, stage, baseCapLevel, dailyXp),
    [serverRows, stage, baseCapLevel, dailyXp],
  );

  const curvePreview = useMemo(() => generateExpCurve(curveParams), [curveParams]);
  const stagedChanges = useMemo(() => expChangesOf(stage), [stage]);
  const stagedCount = expStageCount(stage);
  const checkKey = useMemo(() => JSON.stringify(stagedChanges), [stagedChanges]);

  const runServerCheck = () => {
    if (stagedChanges.length === 0) {
      setCheck({ status: "idle" });
      return;
    }
    setCheck({ status: "checking" });
    api.expTable.check
      .query({ changes: stagedChanges })
      .then((result) => setCheck({ status: "done", result }))
      .catch(() => setCheck({ status: "idle" }));
  };

  const handleApplyPreset = (id: ExpCurvePresetId) => {
    setActivePreset(id);
    setCurveParams({
      ...EXP_CURVE_PRESETS[id],
      baseCapLevel,
      maxLevel: milestones.maxLevel,
    });
  };

  const handleChangeCurve = (patch: Partial<ExpCurveParams>) => {
    setActivePreset(null);
    setCurveParams((prev) => ({ ...prev, ...patch }));
  };

  const handleSelectActivity = (id: ActivityProfileId) => {
    const profile = ACTIVITY_PROFILES.find((item) => item.id === id);
    if (!profile) return;
    setActivityId(id);
    setXpPerHour(profile.xpPerHour);
    setHoursPerDay(profile.hoursPerDay);
  };

  const handleSave = async () => {
    if (load.status !== "ready" || stagedChanges.length === 0 || saving) return;
    setSaving(true);
    errorLive.clear();
    statusLive.clear();
    try {
      const updated = await api.expTable.save.mutate({
        expectedRevision: load.list.revision,
        changes: stagedChanges,
        note: note.trim() === "" ? null : note.trim(),
      });
      const hist = await api.expTable.history.query();
      setLoad({ status: "ready", list: updated });
      setHistory(hist.rows);
      resetStage();
      setNote("");
      setCheck({ status: "idle" });
      statusLive.show([m.dev_exp_applied_ok({ count: stagedChanges.length, revision: updated.revision })]);
    } catch (error: unknown) {
      const info = contentErrorOf<ExpTableEditorReason>(error, EXP_TABLE_EDITOR_REASONS);
      if (info.sessionEnded) void refreshSession();
      if (info.key === "revision_conflict" || info.key === "stale_revision" || info.key === "conflict") {
        const fresh = await api.expTable.list.query().catch(() => null);
        if (fresh) setLoad({ status: "ready", list: fresh });
      }
      errorLive.show([errorText(info.key, ko)]);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    errorLive.clear();
    try {
      const exported = await api.tuning.export.query();
      downloadDiffFile(exported);
      statusLive.show([m.dev_exp_exported_ok()]);
    } catch (error: unknown) {
      const info = contentErrorOf<ExpTableEditorReason>(error, EXP_TABLE_EDITOR_REASONS);
      errorLive.show([errorText(info.key, ko)]);
    }
  };

  const visibleRows = useMemo(() => {
    if (filter === "base") return computedRows.filter((row) => !row.isPrestige);
    if (filter === "prestige") return computedRows.filter((row) => row.isPrestige);
    if (filter === "changed") return computedRows.filter((row) => row.staged || row.overridden);
    return computedRows;
  }, [computedRows, filter]);

  const daysToCap = milestones.expToBaseCap / dailyXp;
  const daysToMax = milestones.totalExp / dailyXp;
  const capTone: "ok" | "warn" = daysToCap >= 30 && daysToCap <= 60 ? "ok" : "warn";
  const capStatusText =
    daysToCap < 30
      ? m.dev_exp_kpi_lifespan_fast()
      : daysToCap > 60
        ? m.dev_exp_kpi_lifespan_slow()
        : m.dev_exp_kpi_lifespan_ok();
  const lifespanMidDays = (lifespanMinDays + lifespanMaxDays) / 2;
  const maxLifespanPct = lifespanMidDays > 0 ? Math.round((daysToMax / lifespanMidDays) * 100) : 0;

  const hasAnyOverride = serverRows.some((row) => row.origin !== "pack");
  const checkErrors =
    check.status === "done" && check.result ? check.result.issues.filter((i) => i.level === "error") : [];
  const checkWarnings =
    check.status === "done" && check.result ? check.result.issues.filter((i) => i.level === "warning") : [];

  return (
    <section className="screen exp-screen" aria-labelledby={titleId}>
      <header className="exp-header">
        <div className="exp-header-row">
          <h1 id={titleId} ref={headingRef} className="screen-title" tabIndex={-1}>
            {m.shell_route_dev_exp_table()}
          </h1>
          <div className="exp-header-actions">
            {load.status === "ready" ? (
              <>
                <button type="button" className="button-secondary" onClick={() => void handleExport()}>
                  {m.dev_exp_btn_export()}
                </button>
                {hasAnyOverride ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => commitStage(stageExpRevertAll(serverRows))}
                  >
                    {m.dev_exp_btn_revert_pack()}
                  </button>
                ) : null}
              </>
            ) : null}
            <BackButton />
          </div>
        </div>
        <p className="lead exp-lead">{m.dev_exp_lead()}</p>
        {load.status === "ready" ? (
          <p className="exp-meta">
            {m.dev_exp_meta({
              version: load.list.contentVersion,
              revision: load.list.revision,
              minDays: Math.round(lifespanMinDays),
              maxDays: Math.round(lifespanMaxDays),
            })}
          </p>
        ) : null}
      </header>

      <LiveMessage tone="success" lines={statusLive.lines} version={statusLive.version} />
      <LiveMessage tone="error" lines={errorLive.lines} version={errorLive.version} />
      {load.status === "loading" ? <p className="status">{m.dev_exp_loading()}</p> : null}
      {load.status === "failed" ? <LiveMessage tone="error" lines={[load.message]} /> : null}

      {load.status === "ready" ? (
        <>
          {load.list.sleeping.length > 0 ? (
            <div className="exp-sleeping" role="alert">
              <span>{m.dev_exp_sleeping_banner({ count: load.list.sleeping.length })}</span>
              <div className="exp-pending-actions">
                {load.list.sleeping.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="button-secondary"
                    onClick={() => commitStage(stageExpDiscardSleeping(stage, row.id))}
                  >
                    {m.dev_exp_sleeping_discard()} ({row.id})
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <section className="exp-kpi-grid" aria-label={m.shell_route_dev_exp_table()}>
            <article className="exp-kpi-card">
              <span className="exp-kpi-label">{m.dev_exp_kpi_to_cap({ cap: baseCapLevel })}</span>
              <span className="exp-kpi-value">{fmtInt(milestones.expToBaseCap, locale)} XP</span>
              <span className="exp-kpi-sub">
                {m.dev_exp_kpi_days({
                  days: fmtDecimal(daysToCap, locale, 1),
                  months: fmtDecimal(daysToCap / 30, locale, 2),
                })}
              </span>
              <span className="exp-badge" data-tone={capTone}>
                {capStatusText}
              </span>
            </article>

            <article className="exp-kpi-card">
              <span className="exp-kpi-label">
                {m.dev_exp_kpi_after_cap({ cap: baseCapLevel, max: milestones.maxLevel })}
              </span>
              <span className="exp-kpi-value">{fmtInt(milestones.expAfterBaseCap, locale)} XP</span>
              <span className="exp-kpi-sub">
                {m.dev_exp_kpi_ratio({
                  cap: baseCapLevel,
                  pct: fmtDecimal(milestones.prestigeRatioPm / 10, locale, 1),
                  mul: fmtDecimal(milestones.prestigeRatioPm / 1000, locale, 2),
                })}
              </span>
              <span
                className="exp-badge"
                data-tone={
                  milestones.prestigeRatioPm >= 800 && milestones.prestigeRatioPm <= 1250 ? "ok" : "warn"
                }
              >
                ×{fmtDecimal(milestones.prestigeRatioPm / 1000, locale, 2)}
              </span>
            </article>

            <article className="exp-kpi-card">
              <span className="exp-kpi-label">{m.dev_exp_kpi_total({ max: milestones.maxLevel })}</span>
              <span className="exp-kpi-value">{fmtInt(milestones.totalExp, locale)} XP</span>
              <span className="exp-kpi-sub">
                {m.dev_exp_kpi_days({
                  days: fmtDecimal(daysToMax, locale, 1),
                  months: fmtDecimal(daysToMax / 30, locale, 2),
                })}
              </span>
              <span className="exp-badge" data-tone={daysToMax <= lifespanMaxDays * 1.05 ? "ok" : "warn"}>
                {m.dev_exp_kpi_lifespan_band({
                  min: Math.round(lifespanMinDays),
                  max: Math.round(lifespanMaxDays),
                  pct: maxLifespanPct,
                })}
              </span>
            </article>

            <article className="exp-kpi-card">
              <span className="exp-kpi-label">{m.dev_exp_kpi_status()}</span>
              <span className="exp-kpi-value">
                {stagedCount > 0 ? m.dev_exp_kpi_staged({ count: stagedCount }) : m.dev_exp_kpi_clean()}
              </span>
              <span className="exp-kpi-sub">
                Lv 1→2: {fmtInt(milestones.minSpan, locale)} · Lv {milestones.maxLevel - 1}→
                {milestones.maxLevel}: {fmtInt(milestones.maxSpan, locale)}
              </span>
              {milestones.nonMonotoneLevels.length > 0 ? (
                <span className="exp-badge" data-tone="danger">
                  {m.dev_exp_kpi_warn_mono({ count: milestones.nonMonotoneLevels.length })}
                </span>
              ) : (
                <span className="exp-badge" data-tone="ok">
                  {m.dev_exp_check_ok()}
                </span>
              )}
            </article>
          </section>

          <ExpTableControls
            baseCapLevel={baseCapLevel}
            maxLevel={milestones.maxLevel}
            curveParams={curveParams}
            activePreset={activePreset}
            curvePreview={curvePreview}
            onPreset={handleApplyPreset}
            onChangeCurve={handleChangeCurve}
            onStageCurve={() => commitStage(stageExpCurve(stage, serverRows, curvePreview))}
            activityId={activityId}
            xpPerHour={xpPerHour}
            hoursPerDay={hoursPerDay}
            dailyXp={dailyXp}
            focusLevel={focusLevel}
            onSelectActivity={handleSelectActivity}
            onChangeXpPerHour={(value) => {
              setActivityId(null);
              setXpPerHour(value);
            }}
            onChangeHoursPerDay={(value) => {
              setActivityId(null);
              setHoursPerDay(value);
            }}
            onFocusLevel={setFocusLevel}
            locale={locale}
          />

          <ExpTableCharts
            rows={computedRows}
            baseCapLevel={baseCapLevel}
            maxLevel={milestones.maxLevel}
            dailyXp={dailyXp}
            lifespanMinDays={lifespanMinDays}
            lifespanMaxDays={lifespanMaxDays}
            focusLevel={focusLevel}
            onFocusLevel={setFocusLevel}
            locale={locale}
          />

          <ExpTableGrid
            allRows={computedRows}
            visibleRows={visibleRows}
            serverRows={serverRows}
            filter={filter}
            baseCapLevel={baseCapLevel}
            maxLevel={milestones.maxLevel}
            focusLevel={focusLevel}
            locale={locale}
            ko={ko}
            onFilter={setFilter}
            onFocusLevel={setFocusLevel}
            onEditSpan={(level, requiredExp) =>
              commitStage(stageExpSpan(stage, serverRows, level, requiredExp), `lv:${level}`)
            }
            onRevertRow={(serverRow) => commitStage(stageExpRevertRow(stage, serverRow))}
          />

          <ContentHistory
            rows={history}
            locale={ko ? "ko" : "en"}
            title={m.dev_exp_history_title()}
            className="exp-panel"
            headingId={historyId}
          />

          {stagedCount > 0 ? (
            <>
              <DebouncedCheck key={checkKey} delay={350} run={runServerCheck} />
              <div
                className="exp-pending-bar"
                role="region"
                aria-label={m.dev_exp_pending_count({ count: stagedCount })}
              >
                <div className="exp-pending-row">
                  <strong>{m.dev_exp_pending_count({ count: stagedCount })}</strong>
                  <span className="exp-meta">
                    {check.status === "checking"
                      ? m.dev_exp_check_checking()
                      : checkErrors.length > 0
                        ? m.dev_exp_check_fail({ count: checkErrors.length })
                        : checkWarnings.length > 0
                          ? m.dev_exp_check_warn({ count: checkWarnings.length })
                          : check.status === "done"
                            ? m.dev_exp_check_ok()
                            : ""}
                  </span>
                  <input
                    type="text"
                    className="input exp-note-input"
                    maxLength={200}
                    placeholder={m.dev_exp_note_placeholder()}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="exp-pending-actions">
                    {undo.canUndo ? (
                      <button type="button" className="button-secondary" onClick={handleUndo}>
                        {m.dev_exp_btn_undo()}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        resetStage();
                        setCheck({ status: "idle" });
                      }}
                    >
                      {m.dev_exp_btn_clear()}
                    </button>
                    <button
                      type="button"
                      className="button-primary"
                      disabled={saving || checkErrors.length > 0}
                      onClick={() => void handleSave()}
                    >
                      {saving ? m.dev_exp_btn_applying() : m.dev_exp_btn_apply()}
                    </button>
                  </div>
                </div>
                {check.status === "done" && check.result && check.result.issues.length > 0 ? (
                  <ul className="exp-issues">
                    {check.result.issues.slice(0, 8).map((issue, idx) => (
                      <li key={`${issue.id ?? "x"}-${idx}`} data-level={issue.level}>
                        {issue.id ? `[${issue.id}] ` : ""}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
