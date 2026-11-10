// 설정 칸 패널(/dev/tuning) — docs/adr/2026-11-01-dev-settings-panel.md 12절·"바뀜: D-462"·"바뀜 (2026-11-08 분야별 페이지)"·
// "바뀜 (2026-11-08 화면 개편)". dev·admin, 틀 안, 개발 화면 층(촘촘).
// - 배치: 머리(제목·요약·서버 덮어쓰기 도구) → 넓은 폭은 왼쪽 분야 목록 + 오른쪽 칸 목록, 좁은 폭은 분야 고르기 상자 + 칸 목록.
//   칸 목록 위에 찾기·거르기 띠(붙음), 칸은 49 코드 무리로 나눈 줄 목록(TuningRow). 화면 아래에 담은 변경 막대(TuningPendingBar).
// - 값을 고치면 담은 변경에 모았다가 [적용] 한 번에 서버 묶음(tuning.save)으로 보낸다(서버가 바꾼 뒤 전체 값으로 검사하고 그 세계에
//   바로 넣는다). 구조 값(D-5054)이 들면 확인 창. 판 충돌이면 목록을 다시 받고 담은 변경은 남긴다(바뀔 것이 없어진 칸은 뺀다).
// - [내보내기]: 팩 차이 JSON(pnpm tuning:apply). [덮어쓰기 모두 지우기]: 확인 창 뒤 서버의 모든 덮어쓰기를 지운다.
// - 키: "/" 찾기, 값 칸에서 ↑↓ 줄 옮기기·Enter 담기·Esc 되돌림, Ctrl/⌘+S 적용(값 칸에 친 글자도 먼저 담는다).
// 조각 이름 TuningPanelScreen-*(미리 캐시 규칙 [Tt]uningPanel). 시험용 data-*: data-status(loading·ready·failed), data-revision.
import type { TuningEntryView, TuningExportResponse, TuningListResponse } from "@terra/shared/tuning";
import { useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { useUndoShortcut, useUndoStack } from "../content/contentEditorUndo.ts";
import {
  type ConfirmRequest,
  TuningCells,
  TuningConfirm,
  TuningExport,
  TuningHistory,
} from "./TuningExtras.tsx";
import { TuningPageNav } from "./TuningPageNav.tsx";
import { TuningPendingBar } from "./TuningPendingBar.tsx";
import { type MoveRow, TuningRow } from "./TuningRow.tsx";
import { CLEAR_FILTERS, type ToolbarQuery, TuningToolbar, isFiltered } from "./TuningToolbar.tsx";
import { PAGE_TEXT, errorText, familyText, problemText } from "./tuningMessages.ts";
import {
  ALL_PAGES,
  type Pending,
  type TuningErrorInfo,
  type TuningPageTab,
  familiesOf,
  filterEntries,
  groupEntries,
  pageChangedCounts,
  pageCounts,
  pendingChanges,
  prunePending,
  tuningErrorOf,
  unitsOf,
} from "./tuningModel.ts";
import { storePageTab, storeShowDesc, storedPageTab, storedShowDesc } from "./tuningStorage.ts";
import "./tuningPanel.css";
import "./tuningRows.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: TuningListResponse }
  | { readonly status: "failed"; readonly message: string };

/** 오류 → 알림 줄(규칙 문제면 문제마다 한 줄 더) */
function errorLines(info: TuningErrorInfo): string[] {
  return [errorText(info.key), ...info.problems.map(problemText)];
}

/** 글을 쓰는 칸(찾기 "/" 키를 가로채지 않을 곳) */
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** 값 칸에서 위·아래 줄 값 칸으로(보이는 차례). 옮긴 칸은 글을 골라 둔다(바로 덮어 쓰게) */
const moveRow: MoveRow = (from, step) => {
  const list = from.closest(".tp-page-panel");
  if (!list) return;
  const inputs = [...list.querySelectorAll<HTMLInputElement>(".tp-row .tp-input")];
  const next = inputs[inputs.indexOf(from) + step];
  next?.focus();
};

/** 담기: 지금 값과 같아지면 담지 않는다(되돌리기 = null은 늘 담는다) */
function stagedNext(previous: Pending, entry: TuningEntryView, value: number | null): Pending {
  const next = new Map(previous);
  if (value !== null && value === entry.value) next.delete(entry.id);
  else next.set(entry.id, value);
  return next;
}

export default function TuningPanelScreen() {
  const locale = getLocale();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [query, setQueryState] = useState<ToolbarQuery>(CLEAR_FILTERS);
  const [page, setPage] = useState<TuningPageTab>(storedPageTab);
  const [showDesc, setShowDesc] = useState(storedShowDesc);
  const [pending, setPending] = useState<Pending>(new Map());
  const pendingRef = useRef<Pending>(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const undoStack = useUndoStack<Pending>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();
  // 찾는 글은 늦춰 거른다(줄 몇백 개를 다시 그리는 동안 글자 입력이 막히지 않게)
  const text = useDeferredValue(query.text);

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
  const pageEntries = page === ALL_PAGES ? entries : entries.filter((entry) => entry.page === page);
  const counts = pageCounts(entries);
  const changedByPage = pageChangedCounts(entries, pending);
  const families = familiesOf(pageEntries);
  const units = unitsOf(pageEntries);
  const shown = filterEntries(entries, { ...query, text, page }, pending);
  const groups = groupEntries(shown);
  const changedCount = entries.filter((entry) => entry.override !== null).length;
  const liveCount = entries.filter((entry) => entry.scope === "live").length;

  const setQuery = (patch: Partial<ToolbarQuery>): void =>
    setQueryState((previous) => ({ ...previous, ...patch }));

  /** 분야를 바꾸면 무리·단위 고르기는 전체로(그 분야에 없는 값이 남지 않게). 찾는 글·바꾼 것만은 남긴다 */
  const choosePage = (tab: TuningPageTab): void => {
    setPage(tab);
    setQuery({ family: CLEAR_FILTERS.family, unit: CLEAR_FILTERS.unit });
    storePageTab(tab);
  };

  const chooseShowDesc = (show: boolean): void => {
    setShowDesc(show);
    storeShowDesc(show);
  };

  // 담은 변경을 바꾸기 전의 모습을 쌓는다(Ctrl+Z = 마지막 고침 되돌리기, 같은 칸을 잇달아 고치면 한 칸)
  const stage = (id: string, value: number | null): void => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;
    undoStack.record(pendingRef.current, id);
    setPending((previous) => stagedNext(previous, entry, value));
    problem.clear();
  };
  const unstage = (id: string): void => {
    undoStack.record(pendingRef.current);
    setPending((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  };
  const undo = (): void => {
    const previous = undoStack.pop();
    if (previous === null) return;
    setPending(previous);
    notice.show([m.dev_input_undo_done()]);
  };
  useUndoShortcut(undo);

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
      undoStack.clear();
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
    if (busy || pending.size === 0) return;
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

  // 화면 전체 키("/" 찾기, Ctrl/⌘+S 적용). 듣는 함수는 한 번만 달고 마지막으로 그린 동작을 부른다
  const applyRef = useRef(onApply);
  useLayoutEffect(() => {
    applyRef.current = onApply;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !isTypingTarget(event.target)) {
        if (document.querySelector("dialog[open]")) return;
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault();
        if (document.querySelector("dialog[open]")) return;
        // 값 칸에 친 맞는 값은 칸을 떠나며 담긴다 → 담긴 뒤(다음 그림) 보낸다
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && active.classList.contains("tp-input")) active.blur();
        requestAnimationFrame(() => applyRef.current());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section
      className="screen screen-wide tp-screen"
      aria-labelledby="tuning-title"
      data-density="compact"
      data-status={load.status}
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
          <button type="button" onClick={() => void reload()}>
            {m.dev_tuning_retry()}
          </button>
        </div>
      ) : null}
      {list ? (
        <>
          <div className="tp-head">
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
            <div className="tp-tools" role="group" aria-label={m.dev_tuning_tools_label()}>
              <button type="button" className="tp-export-button" onClick={onExport}>
                {m.dev_tuning_export()}
              </button>
              {changedCount + list.statOverrides > 0 ? (
                <button
                  type="button"
                  className="tp-revert-all"
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
          <div className="tp-layout">
            <aside className="tp-side">
              <TuningPageNav
                page={page}
                counts={counts}
                changed={changedByPage}
                panelId={panelId}
                onChange={choosePage}
              />
              <dl className="tp-keys" aria-label={m.dev_tuning_keys_label()}>
                <div>
                  <dt>
                    <kbd>/</kbd>
                  </dt>
                  <dd>{m.dev_tuning_key_search()}</dd>
                </div>
                <div>
                  <dt>
                    <kbd>↑</kbd> <kbd>↓</kbd>
                  </dt>
                  <dd>{m.dev_tuning_key_move()}</dd>
                </div>
                <div>
                  <dt>
                    <kbd>Enter</kbd>
                  </dt>
                  <dd>{m.dev_tuning_key_stage()}</dd>
                </div>
                <div>
                  <dt>
                    <kbd>Esc</kbd>
                  </dt>
                  <dd>{m.dev_tuning_key_reset()}</dd>
                </div>
                <div>
                  <dt>
                    <kbd>Ctrl</kbd>+<kbd>S</kbd>
                  </dt>
                  <dd>{m.dev_tuning_key_save()}</dd>
                </div>
                <div>
                  <dt>
                    <kbd>Ctrl</kbd>+<kbd>Z</kbd>
                  </dt>
                  <dd>{m.dev_tuning_key_undo()}</dd>
                </div>
              </dl>
            </aside>
            <div
              id={panelId}
              className="tp-page-panel"
              role="region"
              aria-label={PAGE_TEXT[page].label()}
              data-page={page}
            >
              <p className="tp-page-lead">
                <strong className="tp-page-name">{PAGE_TEXT[page].label()}</strong> {PAGE_TEXT[page].lead()}
              </p>
              <TuningToolbar
                query={query}
                onQuery={setQuery}
                families={families}
                units={units}
                showDesc={showDesc}
                onShowDesc={chooseShowDesc}
                searchRef={searchRef}
                shown={shown.length}
                total={counts[page]}
              />
              {groups.length === 0 ? (
                <div className="tp-empty">
                  <p>{m.dev_tuning_empty_filter()}</p>
                  {isFiltered(query) ? (
                    <button type="button" onClick={() => setQuery(CLEAR_FILTERS)}>
                      {m.dev_tuning_reset_filters()}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {groups.map((group) => (
                <section
                  key={group.family || "none"}
                  className="tp-group"
                  data-family={group.family}
                  aria-labelledby={`tp-group-${group.family || "none"}`}
                >
                  <h2 id={`tp-group-${group.family || "none"}`} className="tp-group-title">
                    {familyText(group.family)}
                    <span className="tp-group-count">{group.entries.length}</span>
                  </h2>
                  <ul className="tp-rows">
                    {group.entries.map((entry) => (
                      <TuningRow
                        key={entry.id}
                        entry={entry}
                        pending={pending}
                        locale={locale}
                        showDesc={showDesc}
                        onStage={stage}
                        onUnstage={unstage}
                        onMove={moveRow}
                      />
                    ))}
                  </ul>
                </section>
              ))}
              <TuningHistory revision={list.revision} locale={locale} />
              <TuningCells entries={entries} />
            </div>
          </div>
          {pending.size > 0 ? (
            <TuningPendingBar
              pending={pending}
              entries={entries}
              locale={locale}
              note={note}
              busy={busy}
              onNote={setNote}
              onUnstage={unstage}
              onDiscard={() => setPending(new Map())}
              onApply={onApply}
            />
          ) : null}
        </>
      ) : null}
      <TuningConfirm request={confirm} onClose={() => setConfirm(null)} />
      <TuningExport result={exported} onClose={() => setExported(null)} />
    </section>
  );
}
