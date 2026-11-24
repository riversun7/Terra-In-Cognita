// NPC 자율행동 · AI 에디터(/dev/npc-ai) — docs/adr/2026-11-20-npc-autonomous-ai.md.
// dev·admin, 틀 안, 개발 화면 층(촘촘). 조각 이름 NpcAiEditorScreen-*([Nn]pcAi).
// - 5탭: ① 성향 생성·합성·충성도 ② 유닛 일상·주기·스위치 ③ 국가·가문·도시 전략 ④ 전투·조우·작전 미리보기 ⑤ 서버 판단 실험실.
// - 모든 수치는 api.tuning.list / save / export를 통해 낙관적 잠금(expectedRevision)과 감사 로그로 반영된다.
import type { TuningExportResponse, TuningListResponse } from "@terra/shared/tuning";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { ScopeTarget } from "../../scope/ScopeBar.tsx";
import { AppLink } from "../../shell/AppLink.tsx";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { useUndoShortcut, useUndoStack } from "../content/contentEditorUndo.ts";
import { NpcAiBlendTab } from "./NpcAiBlendTab.tsx";
import { NpcAiCombatTab } from "./NpcAiCombatTab.tsx";
import { NpcAiLabTab } from "./NpcAiLabTab.tsx";
import { NpcAiMonitorTab } from "./NpcAiMonitorTab.tsx";
import { NpcAiStrategyTab } from "./NpcAiStrategyTab.tsx";
import { NpcAiUnitTab } from "./NpcAiUnitTab.tsx";
import {
  NPC_AI_TABS,
  type NpcAiErrorInfo,
  type NpcAiPending,
  type NpcAiTabId,
  indexEntries,
  npcAiErrorOf,
  pruneNpcAiPending,
  stagePatch,
} from "./npcAiModel.ts";
import "./npcAiEditor.css";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: TuningListResponse }
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

function formatErrorLines(info: NpcAiErrorInfo, ko: boolean): string[] {
  const head = (() => {
    switch (info.key) {
      case "revision_conflict":
        return ko
          ? "다른 곳에서 설정이 바뀌어 최신 값을 다시 불러왔습니다."
          : "Settings changed elsewhere; reloaded latest values.";
      case "session_expired":
        return ko ? "세션이 만료되었습니다. 다시 로그인하세요." : "Session expired. Please sign in again.";
      case "no_permission":
        return ko ? "이 작업을 수행할 권한이 없습니다." : "You do not have permission for this action.";
      case "rules_conflict":
        return ko ? "교차 규칙 검증을 통과하지 못했습니다." : "Cross-validation checks failed.";
      case "rate_limited":
        return ko
          ? "요청이 너무 빠릅니다. 잠시 뒤 다시 시도하세요."
          : "Too many requests. Try again shortly.";
      case "network":
        return ko ? "서버와 연결할 수 없습니다." : "Cannot reach server.";
      default:
        return ko ? `요청을 처리하지 못했습니다 (${info.key}).` : `Request failed (${info.key}).`;
    }
  })();
  const details = info.problems.map((p) => {
    if (p === "ai_range_order") return m.dev_tuning_problem_ai_range_order();
    if (p === "ai_blend_sum") return m.dev_tuning_problem_ai_blend_sum();
    return p;
  });
  return [head, ...details];
}

const TAB_LABELS: Readonly<Record<NpcAiTabId, () => string>> = {
  blend: m.dev_npc_ai_tab_blend,
  unit: m.dev_npc_ai_tab_unit,
  strategy: m.dev_npc_ai_tab_strategy,
  combat: m.dev_npc_ai_tab_combat,
  lab: m.dev_npc_ai_tab_lab,
  monitor: m.dev_npc_ai_tab_monitor,
};

export default function NpcAiEditorScreen() {
  const locale = getLocale();
  const ko = locale !== "en";
  const titleId = useId();
  const noteId = useId();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [tab, setTab] = useState<NpcAiTabId>("blend");
  const [pending, setPending] = useState<NpcAiPending>(new Map());
  const pendingRef = useRef<NpcAiPending>(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const undoStack = useUndoStack<NpcAiPending>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const fail = useCallback(
    (error: unknown): NpcAiErrorInfo => {
      const info = npcAiErrorOf(error);
      if (info.sessionEnded) void refreshSession();
      problem.show(formatErrorLines(info, ko));
      return info;
    },
    [ko, problem],
  );

  const reload = useCallback((): Promise<TuningListResponse | null> => {
    return api.tuning.list.query().then(
      (list) => {
        setLoad({ status: "ready", list });
        return list;
      },
      (error: unknown) => {
        const info = npcAiErrorOf(error);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: formatErrorLines(info, ko)[0] ?? "" });
        return null;
      },
    );
  }, [ko]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const list = load.status === "ready" ? load.list : null;
  const entries = useMemo(() => list?.entries ?? [], [list]);
  const byId = useMemo(() => indexEntries(entries), [entries]);

  const onStage = useCallback(
    (patch: Readonly<Record<string, number | null>>, editKey?: string): void => {
      undoStack.record(pendingRef.current, editKey);
      setPending((prev) => stagePatch(prev, byId, patch));
      problem.clear();
    },
    [byId, problem, undoStack],
  );

  const onUnstage = (id: string): void => {
    undoStack.record(pendingRef.current);
    setPending((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const onDiscard = (): void => {
    undoStack.record(pendingRef.current);
    setPending(new Map());
    problem.clear();
  };

  const onUndo = useCallback((): void => {
    const prev = undoStack.pop();
    if (prev === null) return;
    setPending(prev);
    notice.show([m.dev_input_undo_done()]);
  }, [notice, undoStack]);

  useUndoShortcut(onUndo);

  const onApply = useCallback(async (): Promise<void> => {
    if (!list || busy || pending.size === 0) return;
    setBusy(true);
    problem.clear();
    try {
      const changes = [...pending.entries()].map(([id, value]) => ({ id, value }));
      const next = await api.tuning.save.mutate({
        expectedRevision: list.revision,
        changes,
        note: note.trim() === "" ? null : note.trim(),
        confirmStructural: false,
      });
      notice.show([m.dev_tuning_applied({ count: changes.length, revision: next.revision })]);
      setLoad({ status: "ready", list: next });
      setPending(new Map());
      undoStack.clear();
      setNote("");
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") {
        const fresh = await reload();
        if (fresh) setPending((prev) => pruneNpcAiPending(prev, fresh.entries));
      }
    } finally {
      setBusy(false);
    }
  }, [busy, fail, list, note, notice, pending, problem, reload, undoStack]);

  const onExport = (): void => {
    api.tuning.export.query().then((exported) => {
      downloadDiffFile(exported);
      notice.show([m.dev_npc_ai_exported()]);
    }, fail);
  };

  // Ctrl/⌘+S 즉시 적용 단축키
  const applyRef = useRef(onApply);
  useLayoutEffect(() => {
    applyRef.current = onApply;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault();
        if (document.querySelector("dialog[open]")) return;
        void applyRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const overrideCount = useMemo(
    () => entries.filter((e) => e.id.startsWith("npc_ai_") && e.override !== null).length,
    [entries],
  );

  return (
    <section
      className="screen screen-wide na-screen"
      aria-labelledby={titleId}
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id={titleId} className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_npc_ai()}
        </h1>
        <BackButton />
      </div>
      <p className="lead">{m.dev_npc_ai_lead()}</p>

      <div className="na-toolbar">
        <div className="na-toolbar-meta">
          {list ? (
            <span className="na-meta-pill">
              rev #{list.revision} · {ko ? `AI 덮어쓰기 ${overrideCount}건` : `${overrideCount} AI overrides`}
            </span>
          ) : null}
        </div>
        <div className="na-toolbar-actions">
          <button type="button" className="button-small" disabled={!undoStack.canUndo} onClick={onUndo}>
            {m.dev_npc_ai_undo()}
          </button>
          <button type="button" className="button-small" disabled={!list} onClick={onExport}>
            {m.dev_npc_ai_export()}
          </button>
          <AppLink to={{ route: "dev_tuning" }} className="button-small">
            {m.shell_route_dev_tuning()}
          </AppLink>
        </div>
      </div>

      <LiveMessage tone="success" lines={notice.lines} />
      <LiveMessage tone="error" lines={problem.lines} />

      {load.status === "loading" ? (
        <p className="status" role="status">
          {m.shell_loading()}
        </p>
      ) : null}

      {load.status === "failed" ? (
        <div className="panel na-card">
          <p className="na-error">{load.message}</p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.retry()}
          </button>
        </div>
      ) : null}

      {load.status === "ready" ? (
        <>
          <nav className="na-tabs" role="tablist" aria-label={m.shell_route_dev_npc_ai()}>
            {NPC_AI_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="na-tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {TAB_LABELS[id]()}
              </button>
            ))}
          </nav>

          {tab === "blend" ? <NpcAiBlendTab byId={byId} pending={pending} ko={ko} onStage={onStage} /> : null}
          {tab === "unit" ? (
            <NpcAiUnitTab entries={entries} byId={byId} pending={pending} ko={ko} onStage={onStage} />
          ) : null}
          {tab === "strategy" ? (
            <NpcAiStrategyTab byId={byId} pending={pending} ko={ko} onStage={onStage} />
          ) : null}
          {tab === "combat" ? (
            <NpcAiCombatTab entries={entries} byId={byId} pending={pending} ko={ko} onStage={onStage} />
          ) : null}
          {tab === "lab" ? <NpcAiLabTab entries={entries} pending={pending} ko={ko} /> : null}
          {tab === "monitor" ? <NpcAiMonitorTab /> : null}

          {pending.size > 0 ? (
            <div
              className="na-pending"
              role="region"
              aria-label={m.dev_tuning_pending_count({ count: pending.size })}
            >
              <details className="na-pending-details">
                <summary className="na-pending-count">
                  {m.dev_tuning_pending_count({ count: pending.size })}
                </summary>
                <ul className="na-pending-list">
                  {[...pending.entries()].map(([id, value]) => {
                    const entry = byId.get(id);
                    const label = entry ? (ko ? entry.name.ko : entry.name.en) : id;
                    return (
                      <li key={id} className="na-pending-item">
                        <span>
                          <code>{id}</code> {label}
                        </span>
                        <span>
                          {entry?.value ?? "?"} →{" "}
                          <strong>{value === null ? `pack(${entry?.packValue ?? "?"})` : value}</strong>
                        </span>
                        <button
                          type="button"
                          className="button-small"
                          aria-label={m.dev_tuning_pending_remove({ name: label })}
                          onClick={() => onUnstage(id)}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
              <ScopeTarget />
              <label className="visually-hidden" htmlFor={noteId}>
                {m.dev_tuning_pending_note()}
              </label>
              <input
                id={noteId}
                className="input na-note-input"
                maxLength={200}
                placeholder={m.dev_tuning_pending_note()}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="na-pending-actions">
                <button type="button" className="button-small" onClick={onDiscard}>
                  {m.dev_tuning_clear()}
                </button>
                <button
                  type="button"
                  className="button-primary"
                  disabled={busy}
                  aria-keyshortcuts="Control+S Meta+S"
                  onClick={() => void onApply()}
                >
                  {m.dev_tuning_apply()}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
