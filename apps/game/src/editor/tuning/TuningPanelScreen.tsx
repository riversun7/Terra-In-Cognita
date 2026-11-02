// 설정 칸 패널(/dev/tuning) — docs/adr/2026-11-01-dev-settings-panel.md 12절·"바뀜: D-462". dev·admin, 틀 안, 촘촘.
// - 팩 tuning의 칸을 49 코드 무리로 보이고(찾기·거르기·무리), 바꾼 값은 담은 변경에 모았다가 [적용] 한 번에 서버 묶음(tuning.save)으로
//   보낸다(서버가 바꾼 뒤 전체 값으로 검사하고 그 세계에 바로 넣는다). 구조 값(D-5054)이 들면 확인 창.
// - 판 충돌(다른 사람이 먼저 바꿈)이면 목록을 다시 받고 담은 변경은 남긴다(바뀔 것이 없어진 칸은 뺀다).
// - [내보내기]: 팩 차이 JSON(pnpm tuning:apply). [모두 되돌리기]: 확인 창 뒤 모든 덮어쓰기를 지운다.
// - 최근 바꿈(감사 기록)·"49 칸 중 N개 연결"(49 문서에서 만든 읽기 전용 목록)은 펼쳐 본다.
// 조각 이름 TuningPanelScreen-*(미리 캐시 규칙 [Tt]uningPanel). 시험용 data-*: data-status(loading·ready·failed), data-revision.
import type { TuningExportResponse, TuningListResponse } from "@terra/shared/tuning";
import { useCallback, useEffect, useId, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import {
  type ConfirmRequest,
  TuningCells,
  TuningConfirm,
  TuningExport,
  TuningHistory,
} from "./TuningExtras.tsx";
import { TuningRow } from "./TuningRow.tsx";
import { FILTER_TEXT, errorText, familyText, problemText } from "./tuningMessages.ts";
import {
  ALL_FAMILIES,
  TUNING_FILTERS,
  type TuningErrorInfo,
  type TuningFilter,
  familiesOf,
  filterEntries,
  groupEntries,
  pendingChanges,
  prunePending,
  tuningErrorOf,
} from "./tuningModel.ts";
import "./tuningPanel.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: TuningListResponse }
  | { readonly status: "failed"; readonly message: string };

/** 오류 → 알림 줄(규칙 문제면 문제마다 한 줄 더) */
function errorLines(info: TuningErrorInfo): string[] {
  return [errorText(info.key), ...info.problems.map(problemText)];
}

export default function TuningPanelScreen() {
  const locale = getLocale();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const searchId = useId();
  const familyId = useId();
  const noteId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<TuningFilter>("all");
  const [family, setFamily] = useState(ALL_FAMILIES);
  const [pending, setPending] = useState<ReadonlyMap<string, number | null>>(new Map());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const fail = (error: unknown): TuningErrorInfo => {
    const info = tuningErrorOf(error);
    if (info.sessionEnded) void refreshSession();
    problem.show(errorLines(info));
    return info;
  };

  const reload = useCallback((): Promise<TuningListResponse | null> => {
    return api.tuning.list.query().then(
      (list) => {
        setLoad({ status: "ready", list });
        return list;
      },
      (error: unknown) => {
        const info = tuningErrorOf(error);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: errorText(info.key) });
        return null;
      },
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const list = load.status === "ready" ? load.list : null;
  const entries = list?.entries ?? [];
  // 칸은 백몇십 개라 그릴 때마다 다시 거른다
  const families = familiesOf(entries);
  const shown = filterEntries(entries, { text, filter, family }, pending);
  const groups = groupEntries(shown);
  const changedCount = entries.filter((entry) => entry.override !== null).length;
  const liveCount = entries.filter((entry) => entry.scope === "live").length;

  const stage = (id: string, value: number | null): void => {
    setPending((previous) => new Map(previous).set(id, value));
    problem.clear();
  };
  const unstage = (id: string): void => {
    setPending((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  };

  /** 담은 변경을 한 묶음으로 보낸다. 판 충돌이면 목록을 다시 받고 담은 것은 남긴다 */
  const send = async (confirmStructural: boolean): Promise<void> => {
    if (!list || busy || pending.size === 0) return;
    setBusy(true);
    problem.clear();
    try {
      const next = await api.tuning.save.mutate({
        expectedRevision: list.revision,
        changes: pendingChanges(pending),
        note: note.trim() === "" ? null : note,
        confirmStructural,
      });
      notice.show([m.dev_tuning_applied({ count: pending.size, revision: next.revision })]);
      setLoad({ status: "ready", list: next });
      setPending(new Map());
      setNote("");
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") {
        const fresh = await reload();
        if (fresh) setPending((previous) => prunePending(previous, fresh.entries));
        problem.show([m.dev_tuning_reloaded()]);
      }
    } finally {
      setBusy(false);
    }
  };

  const onApply = (): void => {
    const structural = entries.filter((entry) => entry.structural && pending.has(entry.id)).length;
    if (structural === 0) {
      void send(false);
      return;
    }
    setConfirm({
      title: m.dev_tuning_confirm_structural_title(),
      body: m.dev_tuning_confirm_structural_body({ count: structural }),
      confirmLabel: m.dev_tuning_confirm(),
      onConfirm: () => void send(true),
    });
  };

  const onRevertAll = (): void => {
    if (!list) return;
    const revision = list.revision;
    setConfirm({
      title: m.dev_tuning_confirm_revert_all_title(),
      // 가중치 표 칸 덮어쓰기도 함께 지운다
      body: m.dev_tuning_confirm_revert_all_body({ count: changedCount + list.statOverrides }),
      confirmLabel: m.dev_tuning_revert_all(),
      onConfirm: () => {
        setBusy(true);
        api.tuning.revertAll
          .mutate({ expectedRevision: revision })
          .then(
            (next) => {
              setLoad({ status: "ready", list: next });
              setPending((previous) => prunePending(previous, next.entries));
              notice.show([m.dev_tuning_reverted_all()]);
            },
            (error: unknown) => {
              if (fail(error).key === "revision_conflict") void reload();
            },
          )
          .finally(() => setBusy(false));
      },
    });
  };

  const onExport = (): void => {
    api.tuning.export.query().then(setExported, fail);
  };

  return (
    <section
      className="screen screen-wide tp-screen"
      aria-labelledby="tuning-title"
      data-density="compact"
      data-status={load.status === "failed" ? "failed" : load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id="tuning-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_tuning()}
        </h1>
        <BackButton />
      </div>
      <p className="lead tp-lead">{m.dev_tuning_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_tuning_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="tp-failed">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.dev_tuning_retry()}
          </button>
        </div>
      ) : null}
      {list ? (
        <>
          <ul className="tp-summary" aria-label={m.dev_tuning_summary_label()}>
            <li>{m.dev_tuning_pack({ version: list.contentVersion })}</li>
            <li className="tp-revision">{m.dev_tuning_revision({ revision: list.revision })}</li>
            <li>{m.dev_tuning_count({ count: entries.length })}</li>
            <li className="tp-changed-count" data-count={changedCount}>
              {m.dev_tuning_changed_count({ count: changedCount })}
            </li>
            <li>{m.dev_tuning_live_count({ count: liveCount })}</li>
            {/* 가중치 표 칸 덮어쓰기는 밸런스 화면에서 본다(docs/adr/2026-11-01-balance-screen.md 1절) */}
            <li className="tp-stat-overrides" data-count={list.statOverrides}>
              <AppLink to={{ route: "dev_balance" }}>
                {m.dev_tuning_stat_overrides({ count: list.statOverrides })}
              </AppLink>
            </li>
          </ul>
          <div className="tp-toolbar">
            <div className="field tp-search">
              <label className="field-label" htmlFor={searchId}>
                {m.dev_tuning_search_label()}
              </label>
              <input
                id={searchId}
                className="input"
                type="search"
                autoComplete="off"
                placeholder={m.dev_tuning_search_placeholder()}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div className="field tp-family">
              <label className="field-label" htmlFor={familyId}>
                {m.dev_tuning_family_label()}
              </label>
              <select id={familyId} value={family} onChange={(event) => setFamily(event.target.value)}>
                <option value={ALL_FAMILIES}>{m.dev_tuning_family_all()}</option>
                {families.map((letter) => (
                  <option key={letter} value={letter}>
                    {familyText(letter)}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="tp-filters">
              <legend className="field-label">{m.dev_tuning_filter_label()}</legend>
              {TUNING_FILTERS.map((option) => (
                <label key={option} className="tp-filter" data-active={option === filter ? "" : undefined}>
                  <input
                    type="radio"
                    name="tuning-filter"
                    value={option}
                    checked={option === filter}
                    onChange={() => setFilter(option)}
                  />
                  {FILTER_TEXT[option]()}
                </label>
              ))}
            </fieldset>
            <div className="tp-tools">
              <button type="button" className="button-small tp-export-button" onClick={onExport}>
                {m.dev_tuning_export()}
              </button>
              {changedCount + list.statOverrides > 0 ? (
                <button
                  type="button"
                  className="button-small tp-revert-all"
                  aria-disabled={busy}
                  onClick={busy ? undefined : onRevertAll}
                >
                  {m.dev_tuning_revert_all()}
                </button>
              ) : null}
            </div>
          </div>
          <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
          <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          <p className="tp-shown" aria-live="polite">
            {m.dev_tuning_shown({ shown: shown.length, total: entries.length })}
          </p>
          {groups.length === 0 ? <p className="field-hint">{m.dev_tuning_empty_filter()}</p> : null}
          {groups.length > 0 ? (
            // 넓은 폭: 표 머리가 위 띠 아래에 붙는다. 좁은 폭: 표만 이 상자 안에서 가로로 민다(화면은 밀리지 않는다)
            <div className="tp-table-wrap">
              <table className="dev-table tp-table">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_tuning_col_code()}</th>
                    <th scope="col">{m.dev_tuning_col_name()}</th>
                    <th scope="col">{m.dev_tuning_col_flags()}</th>
                    <th scope="col" className="tp-th-num">
                      {m.dev_tuning_now()}
                    </th>
                    <th scope="col" className="tp-th-num">
                      {m.dev_tuning_pack_value()}
                    </th>
                    <th scope="col">{m.dev_tuning_col_range()}</th>
                    <th scope="col">{m.dev_tuning_value_label()}</th>
                    <th scope="col">
                      <span className="visually-hidden">{m.dev_tuning_col_actions()}</span>
                    </th>
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.family || "none"} className="tp-group" data-family={group.family}>
                    <tr className="tp-group-row">
                      <th scope="colgroup" colSpan={8}>
                        <h2 className="tp-group-title">{familyText(group.family)}</h2>
                      </th>
                    </tr>
                    {group.entries.map((entry) => (
                      <TuningRow
                        key={entry.id}
                        entry={entry}
                        pending={pending}
                        locale={locale}
                        onStage={stage}
                        onUnstage={unstage}
                      />
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          ) : null}
          <TuningHistory revision={list.revision} locale={locale} />
          <TuningCells entries={entries} />
          {pending.size > 0 ? (
            <div
              className="tp-pending"
              role="region"
              aria-label={m.dev_tuning_pending_count({ count: pending.size })}
            >
              <p className="tp-pending-count">{m.dev_tuning_pending_count({ count: pending.size })}</p>
              <label className="visually-hidden" htmlFor={noteId}>
                {m.dev_tuning_pending_note()}
              </label>
              <input
                id={noteId}
                className="input tp-note-input"
                maxLength={200}
                placeholder={m.dev_tuning_pending_note()}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="tp-pending-actions">
                <button type="button" className="button-small" onClick={() => setPending(new Map())}>
                  {m.dev_tuning_clear()}
                </button>
                <button
                  type="button"
                  className="button-primary button-small tp-apply"
                  aria-disabled={busy}
                  onClick={busy ? undefined : onApply}
                >
                  {m.dev_tuning_apply()}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <TuningConfirm request={confirm} onClose={() => setConfirm(null)} />
      <TuningExport result={exported} onClose={() => setExported(null)} />
    </section>
  );
}
