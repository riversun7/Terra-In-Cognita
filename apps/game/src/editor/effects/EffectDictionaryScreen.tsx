// 효과 사전(/dev/effects) — docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)"(사용자 결정 B: 아이템·스킬 편집기 양쪽에서 잇는 따로 화면).
// 아이템 사용 효과와 스킬 효과 줄이 같이 쓰는 효과 사전(D-425)을 고치고 만든다. 아이템 편집기 [효과 사전] 탭(WP-6)에서 옮겼다.
// dev·admin, 틀 안, 촘촘. 설정 칸 패널·스킬·아이템 편집기와 한 가족인 공용 틀(editor/content/contentEditorShell.css).
// - 넓은 폭은 왼쪽 목록(EffectDictionaryList: 찾기·거르기·[새 효과]) + 오른쪽 편집 판(구역·칸마다 팩 값·지금 값 견주기·칸 되돌리기·쓰는 곳).
//   휴대폰은 목록 → 편집이 한 칸씩(data-view). 키: "/" 찾기, 목록 ↑↓·Enter, Alt+↑↓ 이전·다음 효과, Ctrl/⌘+S 적용.
// - 서버는 아이템 편집기와 같은 items.*(같은 덮어쓰기 층·판·권한·감사 기록). 고친 칸은 담은 변경에 들고 입력이 1초 멈추면 items.check,
//   막대의 [적용]이 items.save 묶음(분류 effects) 하나로 보낸다. [팩 값으로]·[지우기]도 담았다가 같은 묶음으로 간다. [내보내기]는
//   팩 차이(tuning.export, entries 칸 → pnpm tuning:apply).
// - 묶음에 고치기 시작할 때의 실효 항목 해시(baseHash)를 싣는다. 같은 효과를 누가 먼저 바꿨으면(entry_changed) 바뀐 칸만 새 항목 위에
//   다시 얹는다(3방향). 주소 ?effect=<ID>는 그 효과를, ?create=1은 새 효과 칸을 연다(아이템·스킬 편집기의 효과 고르기 옆 고리).
// 조각 이름 EffectDictionaryScreen-*(미리 캐시 규칙 [Ee]ffectDictionary). 시험용 data-*: data-status, data-revision.
// 아이템 편집기 폴더(editor/items)의 모듈은 가져오지 않는다(같이 쓰면 따로 조각이 되어 미리 캐시 규칙 밖 이름이 될 수 있다).
import type { ContentHistoryRow } from "@terra/shared/contentEdit";
import type {
  EffectJson,
  ItemEditorCheckResponse,
  ItemEditorListResponse,
  TaxonomyRow,
} from "@terra/shared/itemEditor";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useUndoShortcut, useUndoStack } from "../content/contentEditorUndo.ts";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { ContentHistory } from "../content/contentEditorHistory.tsx";
import { EditorSummary, ExportPanel, KeyHelp, useEditorKeys } from "../content/contentEditorLayout.tsx";
import { type ContentErrorInfo, contentErrorOf, stableJson } from "../content/contentEditorModel.ts";
import { leafDiff } from "../content/contentEditorPaths.ts";
import { PendingBar, type PendingEntry, type PendingStatus } from "../content/contentEditorPending.tsx";
import { EffectDictionaryList } from "./EffectDictionaryList.tsx";
import { EffectEntry } from "./EffectEntry.tsx";
import { EffectNewForm } from "./EffectNewForm.tsx";
import {
  EMPTY_EFFECT_QUERY,
  type EffectQuery,
  type EffectStage,
  changedKeysOf,
  effectChanges,
  filterEffects,
  isEffectJson,
  issuesOf,
  listEffects,
  looseIssues,
  rebaseEffects,
  stageCreate,
  stagePut,
  stageRevert,
  unstage,
} from "./effectDictionaryModel.ts";
import { EFFECT_REASONS, errorText } from "./effectDictionaryText.ts";
import "./effectDictionary.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: ItemEditorListResponse }
  | { readonly status: "failed"; readonly message: string };

type ErrorInfo = ContentErrorInfo<(typeof EFFECT_REASONS)[number]>;

type Check = { readonly key: string; readonly result: ItemEditorCheckResponse | null };

const EMPTY: EffectStage = new Map();

/** 입력이 멈춘 뒤 한 번 부르기: key가 바뀔 때마다 새로 붙어 delay 뒤에 run을 한 번 부른다(붙을 때의 run을 든다) */
function LaterTask({ delay, run }: { delay: number; run: () => void }) {
  const [task] = useState(() => run);
  useEffect(() => {
    const timer = setTimeout(task, delay);
    return () => clearTimeout(timer);
  }, [task, delay]);
  return null;
}

/** 효과 사전만 다룬 바꿈(최근 바꿈 판: 아이템 편집기 감사 기록 중 효과 줄만) */
const effectHistory = (rows: readonly ContentHistoryRow[]): ContentHistoryRow[] =>
  rows.flatMap((row) => {
    const changes = row.changes.filter((change) => change.category === "effects");
    return changes.length === 0 ? [] : [{ ...row, changes }];
  });

export default function EffectDictionaryScreen({
  initialId,
  create = false,
}: {
  initialId?: string | undefined;
  create?: boolean;
}) {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(create ? null : (initialId ?? null));
  const [creating, setCreating] = useState(create);
  const [view, setView] = useState<"list" | "detail">(create || initialId ? "detail" : "list");
  const [stage, setStageState] = useState<EffectStage>(EMPTY);
  const [query, setQueryState] = useState<EffectQuery>(EMPTY_EFFECT_QUERY);
  const [check, setCheck] = useState<Check | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly ContentHistoryRow[] | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const text = useDeferredValue(query.text);
  // 비동기 흐름(다시 얹기)이 기다린 뒤에도 마지막 담은 변경에서 고치도록(그릴 때는 state만 읽는다)
  const stageRef = useRef(stage);
  // 담은 변경을 바꾸기 전의 모습을 쌓는다(Ctrl+Z = 마지막 고침 되돌리기. 같은 효과를 잇달아 고치면 한 칸으로 묶는다)
  const undoStack = useUndoStack<EffectStage>();
  const setStage = (next: EffectStage, editKey?: string): void => {
    undoStack.record(stageRef.current, editKey);
    stageRef.current = next;
    setStageState(next);
  };
  const undo = (): void => {
    const previous = undoStack.pop();
    if (previous === null) return;
    stageRef.current = previous;
    setStageState(previous);
    notice.show([m.dev_input_undo_done()]);
  };
  useUndoShortcut(undo);

  const fail = (error: unknown): ErrorInfo => {
    const info = contentErrorOf(error, EFFECT_REASONS);
    if (info.sessionEnded) void refreshSession();
    problem.show([errorText(info.key), ...info.details]);
    return info;
  };

  const reload = useCallback(
    (): Promise<ItemEditorListResponse | null> =>
      api.items.list.query().then(
        (list) => {
          setLoad({ status: "ready", list });
          return list;
        },
        (error: unknown) => {
          const info = contentErrorOf(error, EFFECT_REASONS);
          if (info.sessionEnded) void refreshSession();
          setLoad({ status: "failed", message: errorText(info.key) });
          return null;
        },
      ),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const list = load.status === "ready" ? load.list : null;
  const rows: readonly TaxonomyRow<EffectJson>[] = list?.effectRows ?? [];
  const usage = list?.effectUsage ?? {};
  const byId = new Map(rows.map((row) => [row.entry.id, row]));
  const listed = listEffects(rows, stage);
  const stagedIds = new Set(stage.keys());
  const shown = filterEffects(listed, { ...query, text }, usage, stagedIds);
  const shownIds = shown.map((item) => item.id);
  const at = selected ? shownIds.indexOf(selected) : -1;
  const taken = new Set([...listed.map((item) => item.id), ...(list?.retired.effects ?? [])]);
  const changedCount = rows.filter((row) => row.origin !== "pack").length;

  const changes = effectChanges(stage);
  const stageJson = stableJson(changes);
  const checked = check && check.key === stageJson ? check : null;
  const issues = checked?.result?.issues ?? [];
  const status: PendingStatus | null =
    stage.size === 0
      ? null
      : checked === null
        ? { text: m.dev_items_checking(), tone: "busy", data: "checking" }
        : checked.result === null
          ? { text: m.dev_items_check_failed(), tone: "failed", data: "failed" }
          : issues.length > 0
            ? { text: m.dev_items_check_blocked({ count: issues.length }), tone: "blocked", data: "blocked" }
            : { text: m.dev_items_check_ok({ advice: 0 }), tone: "ok", data: "ok" };
  const canApply = stage.size > 0 && status?.data === "ok" && !busy;

  const setQuery = (patch: Partial<EffectQuery>): void =>
    setQueryState((previous) => ({ ...previous, ...patch }));

  const select = (id: string): void => {
    setSelected(id);
    setCreating(false);
    setView("detail");
  };

  /** 보이는 차례로 이전·다음 효과 */
  const step = (by: -1 | 1): void => {
    if (shownIds.length === 0) return;
    const next = shownIds[at < 0 ? 0 : Math.max(0, Math.min(shownIds.length - 1, at + by))];
    if (next && next !== selected) select(next);
  };

  /** 같은 효과를 누가 먼저 바꿨다(entry_changed): 목록을 다시 받아 바뀐 칸만 새 항목 위에 다시 얹는다 */
  const rebase = async (keys: readonly string[]): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    const done = rebaseEffects(stageRef.current, keys, fresh.effectRows ?? []);
    setStage(done.stage);
    problem.show([
      errorText("entry_changed"),
      ...done.rebased.flatMap(({ id, conflicts }) => [
        m.dev_effects_rebased({ id }),
        ...(conflicts.length > 0 ? [m.dev_effects_rebase_conflicts({ fields: conflicts.join(", ") })] : []),
      ]),
    ]);
  };

  /** 서버 검사(입력이 1초 멈추면, [검사]로 바로). entry_changed면 바로 다시 얹는다(새 해시로 다시 검사된다) */
  const runCheck = (key: string, batch: ReturnType<typeof effectChanges>): void => {
    if (batch.length === 0) return;
    api.items.check.query({ changes: batch }).then(
      (result) => {
        setCheck({ key, result });
        const changed = changedKeysOf(result.issues);
        if (changed.length > 0) void rebase(changed);
      },
      (error: unknown) => {
        if (contentErrorOf(error, EFFECT_REASONS).sessionEnded) void refreshSession();
        setCheck({ key, result: null });
      },
    );
  };

  const apply = async (): Promise<void> => {
    if (!list || !canApply) return;
    const batch = effectChanges(stageRef.current);
    setBusy(true);
    problem.clear();
    try {
      const next = await api.items.save.mutate({
        expectedRevision: list.revision,
        changes: batch,
        note: note.trim() === "" ? null : note,
      });
      setLoad({ status: "ready", list: next });
      stageRef.current = EMPTY;
      setStageState(EMPTY);
      undoStack.clear();
      setNote("");
      setHistory(null);
      notice.show([m.dev_effects_applied({ count: batch.length, revision: next.revision })]);
      if (selected && !(next.effectRows ?? []).some((row) => row.entry.id === selected)) {
        setSelected(null);
        setView("list");
      }
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") {
        await reload();
        problem.show([m.dev_effects_reloaded()]);
      }
      if (info.key === "entry_changed") await rebase(info.details);
    } finally {
      setBusy(false);
    }
  };

  const onExport = (): void => {
    api.tuning.export.query().then(setExported, fail);
  };
  const onHistory = (): void => {
    if (history) {
      setHistory(null);
      return;
    }
    api.items.history.query().then((result) => setHistory(effectHistory(result.rows)), fail);
  };

  /** 최근 바꿈의 효과 한 줄을 그 판 값으로 다시 담는다(감사 줄 ID로 그 항목만 받는다) */
  const restage = (line: ContentHistoryRow, change: ContentHistoryRow["changes"][number]): void => {
    const auditId = line.auditId;
    if (auditId === null || change.category !== "effects") return;
    const id = change.id;
    api.items.historyEntry.query({ auditId, category: "effects", id }).then(({ entry }) => {
      if (!isEffectJson(entry)) {
        problem.show([m.dev_items_restage_missing({ id })]);
        return;
      }
      setStage(stagePut(stageRef.current, byId.get(id) ?? null, entry));
      select(id);
      notice.show([m.dev_items_restaged({ id })]);
    }, fail);
  };

  useEditorKeys({
    searchRef,
    dirty: stage.size > 0,
    onSave: () => void apply(),
    onStep: step,
  });

  const current = selected ? listed.find((item) => item.id === selected) : undefined;
  const currentStaged = selected ? stage.get(selected) : undefined;
  const row = selected ? (byId.get(selected) ?? null) : null;

  const pendingEntries: PendingEntry[] = [...stage].map(([id, staged]) => ({
    key: `effects/${id}`,
    id,
    name: staged.entry?.name[locale] ?? byId.get(id)?.entry.name[locale] ?? id,
    kind: staged.op === "revert" ? "revert" : staged.base === null ? "create" : "put",
    fields: staged.entry && staged.base ? leafDiff(staged.base, staged.entry).length : null,
    onOpen: () => select(id),
    onRemove: () => setStage(unstage(stageRef.current, id)),
  }));
  const loose = looseIssues(issues, new Set(listed.map((item) => item.id)));

  return (
    <section
      className="screen screen-wide ce-screen fx-screen"
      aria-labelledby="effects-title"
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id="effects-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_effects()}
        </h1>
        <BackButton />
      </div>
      <p className="lead">{m.dev_effects_page_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_effects_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="ce-inline-actions">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" onClick={() => void reload()}>
            {m.dev_effects_retry()}
          </button>
        </div>
      ) : null}
      {list ? (
        <>
          <EditorSummary
            label={m.dev_effects_summary_label()}
            chips={[
              { key: "pack", text: m.dev_effects_pack({ version: list.contentVersion }) },
              {
                key: "revision",
                text: m.dev_effects_revision({ revision: list.revision }),
                className: "fx-revision",
              },
              { key: "count", text: m.dev_effects_count({ count: rows.length }) },
              {
                key: "changed",
                text: m.dev_effects_changed({ count: changedCount }),
                className: "fx-changed",
                count: changedCount,
                warn: changedCount > 0,
              },
            ]}
            tools={
              <>
                <button type="button" className="fx-export-button" onClick={onExport}>
                  {m.dev_items_export()}
                </button>
                <button type="button" aria-expanded={history !== null} onClick={onHistory}>
                  {m.dev_items_history()}
                </button>
              </>
            }
          />
          {exported ? (
            <ExportPanel exported={exported} textClass="fx-export-text" onClose={() => setExported(null)} />
          ) : null}
          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={m.dev_items_history()}
              className="ce-panel fx-history"
              headingId="fx-history-title"
              onRestage={restage}
            />
          ) : null}
          <div className="ce-messages">
            <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
            <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
            {loose.length > 0 ? (
              <div className="fx-issues" role="status">
                <p className="field-label">{m.dev_effects_issues_title()}</p>
                <ul>
                  {loose.map((issue, index) => (
                    <li key={index} className="field-error">
                      {[issue.file, issue.id, issue.path].filter(Boolean).join(" · ")} {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="ce-layout fx-split" data-view={view}>
            <aside className="ce-side">
              <EffectDictionaryList
                shown={shown}
                total={listed.length}
                selected={selected}
                staged={stagedIds}
                usage={usage}
                locale={locale}
                query={query}
                onQuery={setQuery}
                searchRef={searchRef}
                onSelect={select}
                onNew={() => {
                  setCreating(true);
                  setView("detail");
                }}
              />
              <KeyHelp />
            </aside>
            <div className="ce-detail fx-detail">
              {creating ? (
                <EffectNewForm
                  taken={taken}
                  onCreate={(id, name) => {
                    setStage(stageCreate(stageRef.current, id, name));
                    select(id);
                  }}
                  onCancel={() => {
                    setCreating(false);
                    if (!selected) setView("list");
                  }}
                />
              ) : selected && current ? (
                <EffectEntry
                  key={selected}
                  id={selected}
                  draft={current.entry}
                  row={row}
                  pack={list.effectPack?.[selected] ?? (row?.origin === "pack" ? row.entry : null)}
                  staged={currentStaged}
                  rows={rows}
                  usage={usage[selected] ?? { items: [], skills: [] }}
                  itemNames={new Map(list.items.map((item) => [item.id, item.name[locale]]))}
                  skillNames={new Map(list.skills.map((skill) => [skill.id, skill.name[locale]]))}
                  issues={issuesOf(issues, selected)}
                  locale={locale}
                  onPut={(next) => setStage(stagePut(stageRef.current, row, next), `edit:${selected}`)}
                  onRevert={() => {
                    if (row) setStage(stageRevert(stageRef.current, row));
                  }}
                  onUnstage={() => {
                    setStage(unstage(stageRef.current, selected));
                    if (row === null) {
                      setSelected(null);
                      setView("list");
                    }
                  }}
                  onBack={() => setView("list")}
                  onPrev={at > 0 ? () => step(-1) : null}
                  onNext={at >= 0 && at < shownIds.length - 1 ? () => step(1) : null}
                />
              ) : (
                <p className="ce-pick fx-pick">{m.dev_effects_pick_hint()}</p>
              )}
            </div>
          </div>
          <PendingBar
            label={m.dev_effects_stage_label()}
            entries={pendingEntries}
            status={status}
            note={note}
            onNote={setNote}
            busy={busy}
            canApply={canApply}
            onApply={() => void apply()}
            onDiscard={() => {
              setStage(EMPTY);
              if (selected && !byId.has(selected)) {
                setSelected(null);
                setView("list");
              }
            }}
            onCheck={() => runCheck(stageJson, changes)}
            classes={{
              bar: "fx-stagebar",
              note: "fx-note",
              apply: "fx-apply",
              discard: "fx-clear",
              check: "fx-check-button",
            }}
          />
          {stage.size > 0 ? (
            <LaterTask key={`check:${stageJson}`} delay={1000} run={() => runCheck(stageJson, changes)} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
