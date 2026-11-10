// 스킬 편집기·행동별 소모(/dev/skills) — docs/adr/2026-11-01-skill-editor.md 5절·"바뀜 (2026-11-08 화면 개편)". dev·admin, 틀 안, 촘촘.
// - [스킬] 칸: 설정 칸 패널(/dev/tuning)과 한 가족인 틀 — 넓은 폭은 왼쪽 목록(찾기·거르기·새 스킬, SkillList) + 오른쪽 편집 판(SkillEntry:
//   구역·칸마다 팩 값·지금 값 견주기·칸 되돌리기), 휴대폰은 목록 → 편집 판이 한 칸씩(data-view).
//   고친 스킬은 담은 변경(스킬 ID → 초안)에 모였다가 막대의 [적용]이 서버 묶음(skills.save, put_skill 여럿) 하나로 보낸다. 서버가 팩
//   검사기로 본 뒤 그 세계에 바로 넣는다(D-461). 거절(invalid_entry)이면 팩 검사 줄을 스킬·칸으로 나눠 그 칸 옆에 적는다.
//   [팩 값으로]·[지우기]는 묻고 바로 보낸다(revert).
// - [행동별 소모] 칸: 행동·스킬마다 스태미나·MP(CostTable, D-491). 줄마다 [적용]이 바로 보낸다.
// - 묶음에 고치기 시작할 때의 실효 항목 해시(baseHash)를 싣는다: 다른 스킬만 바뀐 판 충돌은 받고, 같은 스킬을 누가 먼저 바꿨으면
//   (entry_changed) 목록을 다시 받아 내가 바꾼 칸만 새 항목 위에 다시 얹는다(3방향, 같은 칸을 양쪽이 바꿨으면 알린다). [내보내기]는
//   팩 차이(tuning.export, entries 칸)다. 주소 ?skill=<ID>는 그 스킬을 바로 연다. 키: "/" 찾기, 목록 ↑↓·Enter, Alt+↑↓ 이전·다음 스킬, Ctrl/⌘+S 적용.
// 조각 이름 SkillEditorScreen-*(미리 캐시 규칙 [Ss]killEditor). 시험용 data-*: data-status(loading·ready·failed), data-revision.
import type {
  SkillEditorChange,
  SkillEditorHistoryRow,
  SkillEditorListResponse,
  SkillEditorSkill,
  SkillJson,
} from "@terra/shared/skillEditor";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { useCallback, useDeferredValue, useEffect, useId, useRef, useState } from "react";
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
  EditorSummary,
  EditorTabs,
  ExportPanel,
  KeyHelp,
  useEditorKeys,
} from "../content/contentEditorLayout.tsx";
import { mergeThreeWay } from "../content/contentEditorModel.ts";
import { getAt, leafDiff } from "../content/contentEditorPaths.ts";
import { PendingBar, type PendingEntry } from "../content/contentEditorPending.tsx";
import { CostTable } from "./CostTable.tsx";
import { SkillEntry, type SkillConfirm, normalPath } from "./SkillEntry.tsx";
import { EMPTY_SKILL_QUERY, SkillList, type SkillListQuery } from "./SkillList.tsx";
import { errorText } from "./skillMessages.ts";
import {
  type SkillErrorInfo,
  cleanSkill,
  filterSkills,
  freeSkillId,
  issueLinesById,
  newSkillTemplate,
  sameSkill,
  skillErrorOf,
} from "./skillModel.ts";
import "./skillEditor.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: SkillEditorListResponse }
  | { readonly status: "failed"; readonly message: string };

type Tab = "skills" | "costs";

/**
 * 담은 스킬 하나: 초안(새 스킬이면 목록에 아직 없다). base·baseHash = 고치기 시작할 때의 실효 항목과 해시(새 스킬 null,
 * 옛 서버면 해시 undefined)
 */
interface Draft {
  readonly draft: SkillJson;
  readonly isNew: boolean;
  readonly base: SkillJson | null;
  readonly baseHash: string | null | undefined;
}

/** 저장 거절 때 서버가 본 칸 문제와 그때의 초안(그 칸을 고치면 문구가 사라진다) */
interface SaveProblems {
  readonly byId: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly drafts: ReadonlyMap<string, SkillJson>;
}

const isSkillJson = (value: unknown): value is SkillJson =>
  typeof value === "object" && value !== null && typeof Reflect.get(value, "id") === "string";

const errorLines = (info: SkillErrorInfo): string[] => [errorText(info.key), ...info.details];

/** 저장 묶음의 baseHash(옛 서버면 싣지 않는다) */
const hashOf = (target: Draft): { baseHash?: string | null } =>
  target.isNew ? { baseHash: null } : target.baseHash === undefined ? {} : { baseHash: target.baseHash };

export default function SkillEditorScreen({ initialId }: { initialId?: string | undefined } = {}) {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabsId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("skills");
  // ?skill=<ID>(효과 사전 쓰는 곳·아이템 편집기 주는 스킬에서 온다): 목록을 받으면 그 스킬을 연다
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [view, setView] = useState<"list" | "detail">(initialId ? "detail" : "list");
  const [drafts, setDrafts] = useState<ReadonlyMap<string, Draft>>(new Map());
  const [query, setQueryState] = useState<SkillListQuery>(EMPTY_SKILL_QUERY);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<SkillConfirm>(null);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly SkillEditorHistoryRow[] | null>(null);
  const [saveProblems, setSaveProblems] = useState<SaveProblems | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const text = useDeferredValue(query.text);
  // 비동기 다시 얹기가 읽는 마지막 담은 변경
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const fail = (error: unknown): SkillErrorInfo => {
    const info = skillErrorOf(error);
    if (info.sessionEnded) void refreshSession();
    problem.show(errorLines(info));
    return info;
  };

  const reload = useCallback((): Promise<SkillEditorListResponse | null> => {
    return api.skills.list.query().then(
      (list) => {
        setLoad({ status: "ready", list });
        return list;
      },
      (error: unknown) => {
        const info = skillErrorOf(error);
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
  const skills = list?.skills ?? [];
  const byId = new Map(skills.map((skill): [string, SkillEditorSkill] => [skill.entry.id, skill]));
  const taken = new Set([...byId.keys(), ...(list?.retiredSkillIds ?? []), ...drafts.keys()]);
  const stagedIds = new Set(drafts.keys());
  // 목록에 보일 스킬: 세계의 스킬 + 아직 보내지 않은 새 스킬(담은 초안으로 보인다)
  const newOnes: SkillEditorSkill[] = [...drafts]
    .filter(([id, item]) => item.isNew && !byId.has(id))
    .map(([, item]) => ({ entry: item.draft, origin: "created", pack: null, override: null, grantedBy: [] }));
  const listed = [...skills, ...newOnes].map((skill) => {
    const staged = drafts.get(skill.entry.id);
    return staged ? { ...skill, entry: staged.draft } : skill;
  });
  const shown = filterSkills(listed, { ...query, text, staged: query.stagedOnly ? stagedIds : null });
  const shownIds = shown.map((skill) => skill.entry.id);
  const current = selected ? byId.get(selected) : undefined;
  const staged = selected ? drafts.get(selected) : undefined;
  const draft = staged?.draft ?? current?.entry ?? null;
  const changedCount = skills.filter((skill) => skill.origin !== "pack").length;

  const setQuery = (patch: Partial<SkillListQuery>): void =>
    setQueryState((previous) => ({ ...previous, ...patch }));

  const select = (id: string): void => {
    setSelected(id);
    setView("detail");
    setConfirm(null);
    setTab("skills");
  };

  /** 보이는 차례로 이전·다음 스킬 */
  const step = (by: -1 | 1): void => {
    if (tab !== "skills" || shownIds.length === 0) return;
    const index = selected ? shownIds.indexOf(selected) : -1;
    const next = shownIds[index < 0 ? 0 : Math.max(0, Math.min(shownIds.length - 1, index + by))];
    if (next && next !== selected) select(next);
  };

  // 초안 묶음을 바꾸기 전의 모습을 쌓는다(Ctrl+Z = 마지막 고침 되돌리기. 같은 스킬을 잇달아 고치면 한 칸으로 묶는다)
  const undoStack = useUndoStack<ReadonlyMap<string, Draft>>();
  useUndoShortcut(() => {
    const previous = undoStack.pop();
    if (previous === null) return;
    setDrafts(previous);
    notice.show([m.dev_input_undo_done()]);
  });

  /** 초안을 담는다(지금 실효 항목과 같아지면 뺀다) */
  const stageDraft = (id: string, next: SkillJson): void => {
    undoStack.record(drafts, editKeyOf(id, drafts.get(id)?.draft ?? byId.get(id)?.entry ?? null, next));
    setDrafts((previous) => {
      const out = new Map(previous);
      const was = previous.get(id);
      const live = byId.get(id);
      if (was?.isNew) out.set(id, { ...was, draft: next });
      else if (live && sameSkill(next, live.entry)) out.delete(id);
      else if (live)
        out.set(id, {
          draft: next,
          isNew: false,
          base: was?.base ?? live.entry,
          baseHash: was ? was.baseHash : live.hash,
        });
      return out;
    });
  };

  const unstage = (id: string): void => {
    const was = drafts.get(id);
    setDrafts((previous) => {
      const out = new Map(previous);
      out.delete(id);
      return out;
    });
    if (was?.isNew && selected === id) {
      setSelected(null);
      setView("list");
    }
  };

  /** 한 묶음을 보낸다. 판 충돌이면 목록을 다시 받고 초안은 남긴다 */
  const send = async (
    changes: SkillEditorChange[],
    done: (next: SkillEditorListResponse) => string,
  ): Promise<boolean> => {
    if (!list || busy) return false;
    setBusy(true);
    problem.clear();
    try {
      const next = await api.skills.save.mutate({
        expectedRevision: list.revision,
        changes,
        note: note.trim() === "" ? null : note,
      });
      setLoad({ status: "ready", list: next });
      setNote("");
      setSaveProblems(null);
      notice.show([done(next)]);
      return true;
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "invalid_entry")
        setSaveProblems({
          byId: issueLinesById(info.details),
          drafts: new Map([...drafts].map(([id, item]) => [id, item.draft])),
        });
      if (info.key === "revision_conflict") {
        await reload();
        problem.show([m.dev_skills_reloaded()]);
      }
      if (info.key === "entry_changed") await rebase(info.details);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * 같은 스킬을 누가 먼저 바꿨다(entry_changed): 목록을 다시 받아 바뀐 스킬마다 내가 바꾼 칸만 새 항목 위에 다시 얹는다(3방향). 같은 칸을
   * 양쪽이 바꿨으면 내 값을 두고 그 칸을 알린다. 다시 [적용]하면 새 해시로 보낸다
   */
  const rebase = async (keys: readonly string[]): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    const ids = keys.map((key) => (key.includes("/") ? key.slice(key.indexOf("/") + 1) : key));
    const lines: string[] = [];
    const out = new Map(draftsRef.current);
    for (const id of ids) {
      const mine = out.get(id);
      const theirs = fresh.skills.find((skill) => skill.entry.id === id);
      if (!mine || !theirs) continue;
      const merged = mergeThreeWay(mine.base, mine.draft, theirs.entry);
      const next = isSkillJson(merged.merged) ? merged.merged : mine.draft;
      if (sameSkill(next, theirs.entry)) out.delete(id);
      else out.set(id, { draft: next, isNew: false, base: theirs.entry, baseHash: theirs.hash });
      lines.push(m.dev_skills_rebased({ id }));
      if (merged.conflicts.length > 0)
        lines.push(m.dev_skills_rebase_conflicts({ fields: merged.conflicts.join(", ") }));
    }
    setDrafts(out);
    problem.show(lines.length > 0 ? lines : [m.dev_skills_reloaded()]);
  };

  const onApply = (): void => {
    if (drafts.size === 0 || busy) return;
    const changes: SkillEditorChange[] = [...drafts.values()].map((item) => ({
      op: "put_skill",
      entry: cleanSkill(item.draft),
      ...hashOf(item),
    }));
    const count = changes.length;
    void send(changes, (next) => m.dev_skills_applied({ count, revision: next.revision })).then((ok) => {
      if (ok) {
        setDrafts(new Map());
        undoStack.clear();
      }
    });
  };

  const onDuplicate = (): void => {
    if (!draft) return;
    const id = freeSkillId(draft.id, taken);
    setDrafts((previous) =>
      new Map(previous).set(id, { draft: { ...draft, id }, isNew: true, base: null, baseHash: null }),
    );
    select(id);
    notice.show([m.dev_skills_duplicated({ id })]);
  };

  const onRevert = (kind: "revert" | "delete", id: string): void => {
    setConfirm(null);
    const hash = byId.get(id)?.hash;
    void send(
      [{ op: "revert", category: "skills", id, ...(hash === undefined ? {} : { baseHash: hash }) }],
      () => (kind === "delete" ? m.dev_skills_deleted({ id }) : m.dev_skills_reverted({ id })),
    ).then((ok) => {
      if (!ok) return;
      setDrafts((previous) => {
        const out = new Map(previous);
        out.delete(id);
        return out;
      });
      if (kind === "delete") {
        setSelected(null);
        setView("list");
      }
    });
  };

  const onCreate = (id: string): void => {
    setDrafts((previous) =>
      new Map(previous).set(id, { draft: newSkillTemplate(id), isNew: true, base: null, baseHash: null }),
    );
    select(id);
  };

  const onCost = (change: SkillEditorChange, name: string): void => {
    void send([change], (next) => m.dev_skills_cost_applied({ name, revision: next.revision }));
  };

  const onExport = (): void => {
    api.tuning.export.query().then(setExported, fail);
  };
  const onHistory = (): void => {
    if (history) {
      setHistory(null);
      return;
    }
    api.skills.history.query().then((result) => setHistory(result.rows), fail);
  };

  useEditorKeys({ searchRef, dirty: drafts.size > 0, onSave: onApply, onStep: step });

  /** 이 스킬의 서버 칸 문제 중 그 뒤 고치지 않은 칸만 */
  const problemsOf = (id: string, now: SkillJson): Map<string, string> | null => {
    const found = saveProblems?.byId.get(id);
    const then = saveProblems?.drafts.get(id);
    if (!found) return null;
    const out = new Map<string, string>();
    for (const [path, message] of found)
      if (path === "" || !then || JSON.stringify(getAt(then, path)) === JSON.stringify(getAt(now, path)))
        out.set(normalPath(path), message);
    return out;
  };

  const pendingEntries: PendingEntry[] = [...drafts].map(([id, item]) => ({
    key: `skills/${id}`,
    id,
    name: item.draft.name[locale],
    kind: item.isNew ? "create" : "put",
    fields: item.base ? leafDiff(cleanSkill(item.base), cleanSkill(item.draft)).length : null,
    onOpen: () => select(id),
    onRemove: () => unstage(id),
  }));

  return (
    <section
      className="screen screen-wide ce-screen sk-screen"
      aria-labelledby="skills-title"
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id="skills-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_skills()}
        </h1>
        <BackButton />
      </div>
      <p className="lead">{m.dev_skills_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_skills_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="ce-inline-actions">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" onClick={() => void reload()}>
            {m.dev_skills_retry()}
          </button>
        </div>
      ) : null}
      {list ? (
        <>
          <EditorSummary
            label={m.dev_skills_summary_label()}
            chips={[
              { key: "pack", text: m.dev_skills_pack({ version: list.contentVersion }) },
              {
                key: "revision",
                text: m.dev_skills_revision({ revision: list.revision }),
                className: "sk-revision",
              },
              { key: "count", text: m.dev_skills_count({ count: skills.length }) },
              {
                key: "changed",
                text: m.dev_skills_changed({ count: changedCount }),
                className: "sk-changed",
                count: changedCount,
                warn: changedCount > 0,
              },
            ]}
            tools={
              <>
                <button type="button" className="sk-export-button" onClick={onExport}>
                  {m.dev_skills_export()}
                </button>
                <button type="button" aria-expanded={history !== null} onClick={onHistory}>
                  {m.dev_skills_history()}
                </button>
              </>
            }
          />
          {exported ? (
            <ExportPanel exported={exported} textClass="sk-export-text" onClose={() => setExported(null)} />
          ) : null}
          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={m.dev_skills_history()}
              className="ce-panel sk-history"
              headingId="sk-history-title"
            />
          ) : null}
          <div className="ce-messages">
            <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
            <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          </div>
          <EditorTabs
            id={tabsId}
            label={m.dev_skills_tabs_label()}
            className="sk-tab"
            selected={tab}
            onSelect={setTab}
            tabs={[
              { value: "skills", label: m.dev_skills_tab_skills(), staged: drafts.size },
              { value: "costs", label: m.dev_skills_tab_costs() },
            ]}
          />
          {tab === "skills" ? (
            <div
              className="ce-layout sk-split"
              data-view={view}
              role="tabpanel"
              id={`${tabsId}-skills-panel`}
              aria-labelledby={`${tabsId}-skills`}
            >
              <aside className="ce-side">
                <SkillList
                  shown={shown}
                  total={listed.length}
                  selected={selected}
                  staged={stagedIds}
                  taken={taken}
                  locale={locale}
                  query={query}
                  onQuery={setQuery}
                  searchRef={searchRef}
                  onSelect={select}
                  onCreate={onCreate}
                />
                <KeyHelp />
              </aside>
              <div className="ce-detail sk-detail">
                {selected && draft ? (
                  <SkillEntry
                    key={selected}
                    id={selected}
                    draft={draft}
                    current={current}
                    isNew={staged?.isNew === true}
                    staged={staged !== undefined}
                    effects={list.effects}
                    locale={locale}
                    problems={problemsOf(selected, draft)}
                    confirm={confirm}
                    onChange={(next) => stageDraft(selected, next)}
                    onConfirm={setConfirm}
                    onRevert={onRevert}
                    onUnstage={() => unstage(selected)}
                    onDuplicate={onDuplicate}
                    onBack={() => setView("list")}
                    onPrev={shownIds.indexOf(selected) > 0 ? () => step(-1) : null}
                    onNext={
                      shownIds.indexOf(selected) >= 0 && shownIds.indexOf(selected) < shownIds.length - 1
                        ? () => step(1)
                        : null
                    }
                  />
                ) : (
                  <p className="ce-pick sk-pick">{m.dev_skills_pick()}</p>
                )}
              </div>
            </div>
          ) : (
            <div role="tabpanel" id={`${tabsId}-costs-panel`} aria-labelledby={`${tabsId}-costs`}>
              <CostTable
                rows={list.actions}
                stamina={list.stamina ?? null}
                skills={new Map(skills.map((skill): [string, SkillJson] => [skill.entry.id, skill.entry]))}
                revision={list.revision}
                locale={locale}
                busy={busy}
                onApply={onCost}
                onOpenSkill={select}
              />
            </div>
          )}
          {drafts.size > 0 ? (
            <PendingBar
              label={m.dev_skills_stage_label()}
              entries={pendingEntries}
              note={note}
              onNote={setNote}
              busy={busy}
              canApply={!busy}
              onApply={onApply}
              onDiscard={() => {
                setDrafts(new Map());
                setSaveProblems(null);
                if (selected && !byId.has(selected)) {
                  setSelected(null);
                  setView("list");
                }
              }}
              classes={{ bar: "sk-stagebar", note: "sk-note", apply: "sk-save", discard: "sk-clear" }}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
