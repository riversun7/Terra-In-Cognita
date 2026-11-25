// 크리처 편집기(/dev/creatures) — 크리처 카탈로그·원형 초상화 영역 선택기(얼굴 자동 인식)·특성 기반 6스탯 자동 배분·세트 스탯 분포 분석·
// 아이템식 고유 무기 성능 범위(min~max)·전리품(아이템 + 획득 확률).
// 화면 탭 둘(docs/adr/2026-11-25-creature-codex-groups.md 1절): [도감] = 전체를 빠르게 훑는 목록(첫 탭, 변종 그룹으로 묶음) → 줄을 고르면
// [상세·편집] = 옛 화면(왼쪽 목록 + 오른쪽 상세)의 "도감 정보" 탭으로 넘어간다. ?creature=<ID>로 열면 상세의 기본 탭이 바로 뜬다.
// 조각 이름 CreatureEditorScreen-*([Cc]reatureEditor). 입력 칸·최근 바꿈은 editor/content/ 공용 부품만 가져온다.
import {
  CREATURE_EDITOR_REASONS,
  type CreatureEditorChange,
  type CreatureEditorCheckResponse,
  type CreatureEditorHistoryRow,
  type CreatureEditorListResponse,
  type CreatureEditorReason,
  type CreatureJson,
} from "@terra/shared/creatureEditor";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { useEffect, useId, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { editKeyOf, useUndoShortcut, useUndoStack } from "../content/contentEditorUndo.ts";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { ContentHistory } from "../content/contentEditorHistory.tsx";
import {
  type ContentErrorInfo,
  contentErrorOf,
  sameJson,
  stableJson,
} from "../content/contentEditorModel.ts";
import { CreatureDetail, type CreatureDetailTab } from "./CreatureDetail.tsx";
import { CreatureDex } from "./CreatureDex.tsx";
import { CreatureList } from "./CreatureList.tsx";
import {
  type CreatureStage,
  EMPTY_CREATURE_STAGE,
  type StagedCreature,
  cleanCreature,
  combinedCreatures,
  createDefaultCreature,
  creatureChangesOf,
  creatureStageKeys,
  mergeCreature,
  stageCreature,
  stageCreatureDiscard,
} from "./creatureModel.ts";
import "./creatureEditor.css";

type ErrorInfo = ContentErrorInfo<CreatureEditorReason>;
type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: CreatureEditorListResponse }
  | { readonly status: "failed"; readonly message: string };

function errorText(key: string, ko: boolean): string {
  switch (key) {
    case "invalid_entry":
      return ko ? "항목 형식이 규칙에 맞지 않습니다." : "Entry does not match schema rules.";
    case "unknown_entry":
      return ko ? "알 수 없는 크리처 ID입니다." : "Unknown creature ID.";
    case "retired_id":
      return ko ? "은퇴한(삭제된) ID는 다시 쓸 수 없습니다." : "Retired ID cannot be reused.";
    case "duplicate_entry":
      return ko ? "같은 ID가 묶음에 두 번 들어 있습니다." : "Duplicate entry in batch.";
    case "invalid_note":
      return ko ? "메모 형식이 올바르지 않습니다(200자 이하)." : "Invalid note (max 200 chars).";
    case "entry_changed":
      return ko
        ? "그사이 다른 곳에서 바뀐 크리처가 있어 최신 값 위로 다시 얹었습니다."
        : "Creature changed elsewhere; rebased onto latest.";
    case "entry_too_large":
      return ko ? "항목 크기가 상한(32KB)을 넘었습니다." : "Entry exceeds size limit (32KB).";
    case "created_limit":
      return ko ? "생성 가능한 항목 상한을 넘었습니다." : "Created entry limit exceeded.";
    case "revision_conflict":
      return ko ? "세계 덮어쓰기 판이 바뀌어 목록을 다시 불러왔습니다." : "Revision changed; reloaded.";
    default:
      return ko ? `요청을 처리하지 못했습니다 (${key}).` : `Request failed (${key}).`;
  }
}

function rebaseStaged(
  staged: StagedCreature,
  fresh: { readonly entry: CreatureJson; readonly hash: string },
): { next: StagedCreature | null; conflicts: readonly string[] } {
  if (staged.op === "revert")
    return { next: { ...staged, base: fresh.entry, baseHash: fresh.hash }, conflicts: [] };
  if (!staged.base) {
    return {
      next: { op: "put", entry: staged.entry, base: fresh.entry, baseHash: fresh.hash },
      conflicts: [],
    };
  }
  const merged = mergeCreature(staged.base, staged.entry, fresh.entry);
  if (sameJson(merged.entry, fresh.entry)) return { next: null, conflicts: merged.conflicts };
  return {
    next: { op: "put", entry: merged.entry, base: fresh.entry, baseHash: fresh.hash },
    conflicts: merged.conflicts,
  };
}

function DebouncedCheck({ delay, run }: { readonly delay: number; readonly run: () => void }) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    const timer = setTimeout(() => runRef.current(), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return null;
}

export default function CreatureEditorScreen({ initialId }: { initialId?: string | undefined }) {
  const locale = getLocale() === "en" ? "en" : "ko";
  const ko = locale !== "en";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const noteId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [view, setView] = useState<"list" | "detail">(initialId ? "detail" : "list");
  // 화면 탭(도감·상세)과 상세 안 탭. 주소로 크리쳐를 바로 열면 상세의 기본 탭(초상화)부터 보인다
  const [tab, setTab] = useState<"dex" | "detail">(initialId ? "detail" : "dex");
  const [subTab, setSubTab] = useState<CreatureDetailTab>(initialId ? "basic" : "overview");
  const [autoDetectId, setAutoDetectId] = useState<string | null>(null);
  const [stage, setStage] = useState<CreatureStage>(EMPTY_CREATURE_STAGE);
  const stageRef = useRef<CreatureStage>(EMPTY_CREATURE_STAGE);
  const [check, setCheck] = useState<{
    readonly key: string;
    readonly result: CreatureEditorCheckResponse | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly CreatureEditorHistoryRow[] | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const fail = (error: unknown): ErrorInfo => {
    const info = contentErrorOf(error, CREATURE_EDITOR_REASONS);
    if (info.sessionEnded) void refreshSession();
    problem.show([errorText(info.key, ko), ...info.details]);
    return info;
  };

  const reload = (): Promise<CreatureEditorListResponse | null> =>
    api.creatures.list.query().then(
      (list) => {
        setLoad({ status: "ready", list });
        return list;
      },
      (error: unknown) => {
        const info = contentErrorOf(error, CREATURE_EDITOR_REASONS);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: errorText(info.key, ko) });
        return null;
      },
    );

  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void api.creatures.list.query().then(
      (list) => {
        setLoad({ status: "ready", list });
        if (!selected && list.creatures[0]) setSelected(list.creatures[0].entry.id);
      },
      (error: unknown) => {
        const info = contentErrorOf(error, CREATURE_EDITOR_REASONS);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: errorText(info.key, ko) });
      },
    );
  }, [ko, selected]);

  // 담은 변경을 바꾸기 전의 모습을 쌓는다(Ctrl+Z = 마지막 고침 되돌리기. 같은 크리처를 잇달아 고치면 한 칸으로 묶는다)
  const undoStack = useUndoStack<CreatureStage>();
  const pushStage = (next: CreatureStage, editKey?: string): void => {
    undoStack.record(stageRef.current, editKey);
    stageRef.current = next;
    setStage(next);
  };
  useUndoShortcut(() => {
    const previous = undoStack.pop();
    if (previous === null) return;
    stageRef.current = previous;
    setStage(previous);
  });

  const list = load.status === "ready" ? load.list : null;
  const rows = list?.creatures ?? [];
  const row = selected ? rows.find((item) => item.entry.id === selected) : undefined;
  const staged = selected ? stage.creatures.get(selected) : undefined;
  const reverting = staged?.op === "revert";
  const draft: CreatureJson | null =
    staged?.op === "put"
      ? staged.entry
      : reverting
        ? (row?.pack ?? row?.entry ?? null)
        : (row?.entry ?? null);

  // 실효 크리쳐 전체(담은 바꿈과 아직 적용하지 않은 새 크리쳐 포함) — 분포 비교·그룹 묶기가 같이 쓴다
  const allCreatures: CreatureJson[] = list ? combinedCreatures(list, stage).map((item) => item.entry) : [];
  const usedIds = new Set(allCreatures.map((entry) => entry.id));

  const keys = creatureStageKeys(stage);
  const changes = creatureChangesOf(stage);
  const stageJson = stableJson(changes);
  const checked = check && check.key === stageJson ? check : null;
  const issues = checked?.result?.issues ?? [];
  const errors = issues.filter((issue) => issue.level === "error").length;
  const canApply = keys.length > 0 && checked !== null && checked.result !== null && errors === 0 && !busy;

  const select = (id: string): void => {
    setSelected(id);
    setView("detail");
    setAutoDetectId(null);
  };

  /** 도감에서 고르기: 상세 탭의 도감 정보로 넘어간다 */
  const openFromDex = (id: string): void => {
    select(id);
    setSubTab("overview");
    setTab("detail");
  };

  /** 크리쳐 하나의 바꿈을 담은 묶음에 얹는다(실효 값과 같아지면 뺀다) */
  const stagedWith = (current: CreatureStage, next: CreatureJson): CreatureStage => {
    const mine = current.creatures.get(next.id);
    const target = rows.find((item) => item.entry.id === next.id);
    const base = mine ? mine.base : (target?.entry ?? null);
    const baseHash = mine ? mine.baseHash : (target?.hash ?? null);
    const clean = cleanCreature(next);
    return stageCreature(
      current,
      next.id,
      base !== null && sameJson(clean, base) ? null : { op: "put", entry: clean, base, baseHash },
    );
  };

  /** 여러 크리쳐를 한 번에 담는다(그룹 넣기·대표 바꾸기 — 되돌리기 한 칸) */
  const editMany = (entries: readonly CreatureJson[]): void => {
    if (entries.length === 0) return;
    let next = stageRef.current;
    for (const entry of entries) next = stagedWith(next, entry);
    pushStage(next);
  };

  /** 변종 만들기: 새 크리쳐로 담고 그 변종의 도감 정보로 넘어간다 */
  const createVariant = (entry: CreatureJson): void => {
    pushStage(stagedWith(stageRef.current, entry));
    setSelected(entry.id);
    setView("detail");
    setAutoDetectId(null);
  };

  const createNew = (id: string, nameKo: string, nameEn: string, image?: string): void => {
    const initial = cleanCreature({
      ...createDefaultCreature(id, image),
      name: { ko: nameKo, en: nameEn },
    });
    pushStage(
      stageCreature(stageRef.current, id, {
        op: "put",
        entry: initial,
        base: null,
        baseHash: null,
      }),
    );
    setSelected(id);
    setView("detail");
    setSubTab("basic");
    setAutoDetectId(image ? id : null);
  };

  const edit = (next: CreatureJson): void => {
    if (!selected || next.id !== selected) return;
    const current = stageRef.current.creatures.get(selected);
    pushStage(
      stagedWith(stageRef.current, next),
      editKeyOf(selected, current?.op === "put" ? current.entry : (row?.entry ?? null), cleanCreature(next)),
    );
  };

  const revert = (): void => {
    if (!selected || !row) return;
    const current = stageRef.current.creatures.get(selected);
    pushStage(
      stageCreature(stageRef.current, selected, {
        op: "revert",
        base: current?.base ?? row.entry,
        baseHash: current?.baseHash ?? row.hash,
      }),
    );
  };

  const unstage = (): void => {
    if (selected) pushStage(stageCreature(stageRef.current, selected, null));
  };

  const runCheck = (key: string, batch: readonly CreatureEditorChange[]): void => {
    if (batch.length === 0) return;
    api.creatures.check.query({ changes: [...batch] }).then(
      (result) => setCheck({ key, result }),
      (error: unknown) => {
        if (contentErrorOf(error, CREATURE_EDITOR_REASONS).sessionEnded) void refreshSession();
        setCheck({ key, result: null });
      },
    );
  };

  const rebase = async (changedKeys: readonly string[]): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    let next = stageRef.current;
    for (const key of changedKeys) {
      const id = key.startsWith("creatures/") ? key.slice("creatures/".length) : key;
      const mine = next.creatures.get(id);
      const latest = fresh.creatures.find((item) => item.entry.id === id);
      if (!mine || !latest) continue;
      const result = rebaseStaged(mine, latest);
      next = stageCreature(next, id, result.next);
    }
    pushStage(next);
    problem.show([errorText("entry_changed", ko)]);
  };

  const apply = async (): Promise<void> => {
    if (!list || busy) return;
    const batch = creatureChangesOf(stageRef.current);
    if (batch.length === 0) return;
    setBusy(true);
    problem.clear();
    try {
      const next = await api.creatures.save.mutate({
        expectedRevision: list.revision,
        changes: batch,
        note: note.trim() === "" ? null : note,
      });
      setLoad({ status: "ready", list: next });
      stageRef.current = EMPTY_CREATURE_STAGE;
      setStage(EMPTY_CREATURE_STAGE);
      undoStack.clear();
      setNote("");
      setHistory(null);
      notice.show([
        ko
          ? `크리처 변경 ${batch.length}건을 반영했습니다 (판 #${next.revision}).`
          : `Applied ${batch.length} creature changes (rev #${next.revision}).`,
      ]);
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") await reload();
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
    api.creatures.history.query().then((result) => setHistory(result.rows), fail);
  };

  return (
    <section
      className="screen screen-wide be-screen ce-screen"
      aria-labelledby="creatures-title"
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id="creatures-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_creatures()}
        </h1>
        <BackButton />
      </div>
      <p className="lead be-lead">{m.dev_tool_creatures_desc()}</p>

      {load.status === "loading" ? (
        <p className="field-hint">{ko ? "크리처 도감을 불러오는 중…" : "Loading creatures…"}</p>
      ) : null}
      {load.status === "failed" ? (
        <div className="be-actions">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.retry()}
          </button>
        </div>
      ) : null}

      {list ? (
        <>
          <div className="be-summary">
            <span className="dev-badge">
              {ko
                ? `크리처 ${list.creatures.length}종 · 판 #${list.revision}`
                : `${list.creatures.length} Creatures · Rev #${list.revision}`}
            </span>
            <span className="dev-muted be-version">{list.contentVersion}</span>
            <div className="be-actions be-summary-tools">
              <button type="button" className="button-small" onClick={onExport}>
                {ko ? "팩 차이 내보내기" : "Export Diff"}
              </button>
              <button
                type="button"
                className="button-small"
                aria-pressed={history !== null}
                onClick={onHistory}
              >
                {ko ? "최근 바꿈" : "History"}
              </button>
            </div>
          </div>

          {list.sleeping.length > 0 ? (
            <section className="be-panel">
              <h2 className="be-heading">{ko ? "잠든 크리처 줄" : "Sleeping Creature Rows"}</h2>
              <ul className="be-plain-list">
                {list.sleeping.map((s) => (
                  <li key={s.id} className="be-actions">
                    <span>
                      {s.id} ({s.reason} · {s.contentVersion})
                    </span>
                    <button
                      type="button"
                      className="button-small"
                      aria-pressed={stage.discard.has(s.id)}
                      onClick={() =>
                        pushStage(stageCreatureDiscard(stageRef.current, s.id, !stage.discard.has(s.id)))
                      }
                    >
                      {ko ? "버리기 담기" : "Stage Discard"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {exported ? (
            <section className="be-panel">
              <h2 className="be-heading">{ko ? "팩 차이 내보내기 (tuning:apply)" : "Exported Pack Diff"}</h2>
              <textarea
                className="input be-export-text"
                readOnly
                rows={6}
                value={`${JSON.stringify(exported.diff, null, 2)}\n`}
              />
              <div className="be-actions">
                <button type="button" className="button-small" onClick={() => setExported(null)}>
                  {ko ? "닫기" : "Close"}
                </button>
              </div>
            </section>
          ) : null}

          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={ko ? "크리처 최근 바꿈" : "Creature Edit History"}
              className="be-panel be-history"
              headingId="ce-history-title"
            />
          ) : null}

          <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
          <LiveMessage tone="error" lines={problem.lines} version={problem.version} />

          {/* 화면 탭: 도감(빠른 목록) · 상세·편집(옛 화면) */}
          <div
            className="be-tabs ce-maintabs"
            role="tablist"
            aria-label={ko ? "크리쳐 편집기 탭" : "Creature editor tabs"}
          >
            <button
              type="button"
              role="tab"
              id="ce-tab-dex"
              aria-selected={tab === "dex"}
              aria-controls="ce-panel-dex"
              className="be-tab"
              data-active={tab === "dex" ? "true" : undefined}
              onClick={() => setTab("dex")}
            >
              {ko ? `도감 (${allCreatures.length})` : `Codex (${allCreatures.length})`}
            </button>
            <button
              type="button"
              role="tab"
              id="ce-tab-detail"
              aria-selected={tab === "detail"}
              aria-controls="ce-panel-detail"
              className="be-tab"
              data-active={tab === "detail" ? "true" : undefined}
              onClick={() => setTab("detail")}
            >
              {ko ? "상세 · 편집" : "Detail & Edit"}
              {draft ? <span className="dev-muted">{ko ? draft.name.ko : draft.name.en}</span> : null}
            </button>
          </div>

          {tab === "dex" ? (
            <div role="tabpanel" id="ce-panel-dex" aria-labelledby="ce-tab-dex">
              <CreatureDex
                list={list}
                stage={stage}
                selected={selected}
                locale={locale}
                onOpen={openFromDex}
              />
            </div>
          ) : null}

          {tab === "detail" ? (
            <div
              className="be-split ce-split"
              data-view={view}
              role="tabpanel"
              id="ce-panel-detail"
              aria-labelledby="ce-tab-detail"
            >
              <CreatureList
                list={list}
                stage={stage}
                selected={selected}
                locale={locale}
                onSelect={select}
                onCreateNew={createNew}
              />
              <div className="be-detail-pane ce-detail-pane">
                {selected && draft ? (
                  <CreatureDetail
                    key={selected}
                    list={list}
                    row={row}
                    draft={draft}
                    allCreatures={allCreatures}
                    usedIds={usedIds}
                    subTab={subTab}
                    onSubTab={setSubTab}
                    onOpen={select}
                    onEditMany={editMany}
                    onCreateVariant={createVariant}
                    locale={locale}
                    staged={staged !== undefined}
                    reverting={reverting}
                    isNewCreated={row === undefined}
                    autoDetectPortrait={autoDetectId === selected}
                    issues={issues.filter((issue) => issue.id === null || issue.id === selected)}
                    checking={staged !== undefined && checked === null}
                    onEdit={edit}
                    onRevert={revert}
                    onUnstage={unstage}
                    onBack={() => setView("list")}
                  />
                ) : (
                  <p className="field-hint be-pick">
                    {ko ? "왼쪽 목록에서 크리처를 고르거나 새로 등록하세요." : "Select or create a creature."}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {/* 하단 담은 변경 막대 */}
          <div
            className="be-stagebar"
            role="region"
            aria-label={ko ? "담은 크리처 변경" : "Staged creature changes"}
          >
            <div className="be-stage-top">
              <strong className="be-stage-count">
                {ko ? `담은 변경 ${keys.length}건` : `${keys.length} Staged`}
              </strong>
              <span className="be-stage-status" role="status">
                {keys.length === 0
                  ? ko
                    ? "고친 크리처가 여기에 담깁니다."
                    : "Edited creatures appear here."
                  : checked === null
                    ? ko
                      ? "검사 중…"
                      : "Checking…"
                    : checked.result === null
                      ? ko
                        ? "검사 실패"
                        : "Check failed"
                      : errors > 0
                        ? ko
                          ? `오류 ${errors}건 — 고친 뒤 적용할 수 있습니다`
                          : `${errors} errors blocking apply`
                        : ko
                          ? "검사 통과 — 바로 적용 가능"
                          : "Ready to apply"}
              </span>
            </div>
            {keys.length > 0 ? (
              <>
                <ul className="be-chips">
                  {keys.map((key) => (
                    <li key={key}>
                      <button
                        type="button"
                        className="be-chip"
                        onClick={() => {
                          if (key.startsWith("sleeping/")) return;
                          select(key);
                          setTab("detail");
                        }}
                      >
                        {key}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="be-stage-actions">
                  <label className="visually-hidden" htmlFor={noteId}>
                    {ko ? "변경 메모" : "Change note"}
                  </label>
                  <input
                    id={noteId}
                    className="input be-note"
                    placeholder={ko ? "변경 이유 메모 (선택, 200자 이하)" : "Change note (optional)"}
                    maxLength={200}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => runCheck(stageJson, changes)}
                  >
                    {ko ? "검사" : "Check"}
                  </button>
                  <button
                    type="button"
                    className="button-small button-primary be-apply"
                    disabled={!canApply}
                    onClick={() => void apply()}
                  >
                    {ko ? "즉시 반영 (Apply)" : "Apply Live"}
                  </button>
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => pushStage(EMPTY_CREATURE_STAGE)}
                  >
                    {ko ? "비우기" : "Clear"}
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {keys.length > 0 ? (
            <DebouncedCheck key={`check:${stageJson}`} delay={800} run={() => runCheck(stageJson, changes)} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
