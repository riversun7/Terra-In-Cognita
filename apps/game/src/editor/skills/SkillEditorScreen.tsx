// 스킬 편집기·행동별 소모(/dev/skills) — docs/adr/2026-11-01-skill-editor.md 5절. dev·admin, 틀 안, 촘촘.
// - [스킬] 칸: 왼쪽 목록(찾기·거르기·새 스킬), 오른쪽 한 스킬의 모든 칸(SkillForm). [저장]·[복제]·[끄기/켜기]·[팩 값으로]·[지우기].
//   고친 칸은 초안에만 들고 [저장]이 서버 묶음(skills.save) 하나로 보낸다. 서버가 팩 검사기로 본 뒤 그 세계에 바로 넣는다(D-461).
// - [행동별 소모] 칸: 행동·스킬마다 스태미나·MP(CostTable, D-491). 줄마다 [적용]이 바로 보낸다.
// - 저장 묶음에 고치기 시작할 때의 실효 항목 해시(baseHash)를 싣는다: 다른 스킬만 바뀐 판 충돌은 받고, 같은 스킬을 누가 먼저 바꿨으면
//   (entry_changed) 목록을 다시 받아 내가 바꾼 칸만 새 항목 위에 다시 얹는다(3방향, 같은 칸을 양쪽이 바꿨으면 알린다). [내보내기]는
//   팩 차이(tuning.export, entries 칸)다. 공용 부품(입력 칸·효과 줄·최근 바꿈)은 editor/content/(아이템 편집기와 같이 쓴다).
// 조각 이름 SkillEditorScreen-*(미리 캐시 규칙 [Ss]killEditor). 시험용 data-*: data-status(loading·ready·failed), data-revision.
import type {
  SkillEditorChange,
  SkillEditorHistoryRow,
  SkillEditorListResponse,
  SkillEditorSkill,
  SkillJson,
} from "@terra/shared/skillEditor";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { ContentHistory } from "../content/contentEditorHistory.tsx";
import { mergeThreeWay } from "../content/contentEditorModel.ts";
import { CostTable } from "./CostTable.tsx";
import { SkillForm } from "./SkillForm.tsx";
import { SkillList } from "./SkillList.tsx";
import { errorText } from "./skillMessages.ts";
import {
  type SkillErrorInfo,
  cleanSkill,
  freeSkillId,
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
 * 편집 중인 것: 고른 스킬 ID와 초안(새 스킬이면 목록에 아직 없다). base·baseHash = 고치기 시작할 때의 실효 항목과 해시(새 스킬 null,
 * 옛 서버면 해시 undefined)
 */
interface Editing {
  readonly id: string;
  readonly draft: SkillJson;
  readonly isNew: boolean;
  readonly base: SkillJson | null;
  readonly baseHash: string | null | undefined;
}

/** 실효 항목으로 편집을 시작한다 */
const editingOf = (skill: SkillEditorSkill): Editing => ({
  id: skill.entry.id,
  draft: skill.entry,
  isNew: false,
  base: skill.entry,
  baseHash: skill.hash,
});

const isSkillJson = (value: unknown): value is SkillJson =>
  typeof value === "object" && value !== null && typeof Reflect.get(value, "id") === "string";

type Confirm = { readonly kind: "revert" | "delete"; readonly id: string } | null;

const errorLines = (info: SkillErrorInfo): string[] => [errorText(info.key), ...info.details];

export default function SkillEditorScreen() {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const tabsId = useId();
  const noteId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("skills");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly SkillEditorHistoryRow[] | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();

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
  /** 저장 뒤 받은 목록의 스킬(저장한 스킬의 새 해시로 편집을 이어 간다) */
  const byIdAfter = useRef<Map<string, SkillEditorSkill> | null>(null);
  const taken = new Set([...byId.keys(), ...(list?.retiredSkillIds ?? [])]);
  const current = editing && !editing.isNew ? byId.get(editing.id) : undefined;
  const dirty = editing ? editing.isNew || !current || !sameSkill(editing.draft, current.entry) : false;
  const changedCount = skills.filter((skill) => skill.origin !== "pack").length;

  const select = (id: string): void => {
    const skill = byId.get(id);
    if (!skill) return;
    setEditing(editingOf(skill));
    setConfirm(null);
    problem.clear();
    setTab("skills");
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
      byIdAfter.current = new Map(
        next.skills.map((skill): [string, SkillEditorSkill] => [skill.entry.id, skill]),
      );
      setLoad({ status: "ready", list: next });
      setNote("");
      notice.show([done(next)]);
      return true;
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") {
        await reload();
        problem.show([m.dev_skills_reloaded()]);
      }
      if (info.key === "entry_changed") await rebase();
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * 같은 스킬을 누가 먼저 바꿨다(entry_changed): 목록을 다시 받아 내가 바꾼 칸만 새 항목 위에 다시 얹는다(3방향). 같은 칸을 양쪽이 바꿨으면
   * 내 값을 두고 그 칸을 알린다. 다시 [저장]하면 새 해시로 보낸다
   */
  const rebase = async (): Promise<void> => {
    const fresh = await reload();
    const theirs = fresh?.skills.find((skill) => skill.entry.id === editing?.id);
    if (!editing || !theirs) return;
    const merged = mergeThreeWay(editing.base, editing.draft, theirs.entry);
    const draft = isSkillJson(merged.merged) ? merged.merged : editing.draft;
    setEditing({ ...editingOf(theirs), draft });
    problem.show([
      m.dev_skills_rebased({ id: editing.id }),
      ...(merged.conflicts.length > 0
        ? [m.dev_skills_rebase_conflicts({ fields: merged.conflicts.join(", ") })]
        : []),
    ]);
  };

  /** 저장 묶음의 baseHash(옛 서버면 싣지 않는다) */
  const hashOf = (target: Editing): { baseHash?: string | null } =>
    target.isNew ? { baseHash: null } : target.baseHash === undefined ? {} : { baseHash: target.baseHash };

  const onSave = (): void => {
    if (!editing) return;
    const entry = cleanSkill(editing.draft);
    void send([{ op: "put_skill", entry, ...hashOf(editing) }], (next) =>
      m.dev_skills_saved({ id: entry.id, revision: next.revision }),
    ).then((ok) => {
      if (ok) {
        const saved = byIdAfter.current?.get(entry.id);
        setEditing(
          saved
            ? editingOf(saved)
            : { id: entry.id, draft: entry, isNew: false, base: entry, baseHash: undefined },
        );
      }
    });
  };

  const onToggle = (): void => {
    if (!editing || !current) return;
    const entry = cleanSkill({ ...current.entry, enabled: !current.entry.enabled });
    void send(
      [{ op: "put_skill", entry, ...(current.hash === undefined ? {} : { baseHash: current.hash }) }],
      (next) => m.dev_skills_saved({ id: entry.id, revision: next.revision }),
    ).then((ok) => {
      if (ok) {
        const saved = byIdAfter.current?.get(entry.id);
        setEditing(
          saved
            ? editingOf(saved)
            : { id: entry.id, draft: entry, isNew: false, base: entry, baseHash: undefined },
        );
      }
    });
  };

  const onDuplicate = (): void => {
    if (!editing) return;
    const id = freeSkillId(editing.draft.id, taken);
    setEditing({ id, draft: { ...editing.draft, id }, isNew: true, base: null, baseHash: null });
    setConfirm(null);
  };

  const onRevert = (kind: "revert" | "delete", id: string): void => {
    setConfirm(null);
    const hash = byId.get(id)?.hash;
    void send(
      [{ op: "revert", category: "skills", id, ...(hash === undefined ? {} : { baseHash: hash }) }],
      () => (kind === "delete" ? m.dev_skills_deleted({ id }) : m.dev_skills_reverted({ id })),
    ).then((ok) => {
      if (!ok) return;
      setEditing(null);
    });
  };

  const onCreate = (id: string): void => {
    setEditing({ id, draft: newSkillTemplate(id), isNew: true, base: null, baseHash: null });
    setConfirm(null);
    setTab("skills");
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
  const exportText = exported ? `${JSON.stringify(exported.diff, null, 2)}\n` : "";
  const download = (): void => {
    if (!exported) return;
    const url = URL.createObjectURL(new Blob([exportText], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exported.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className="screen screen-wide sk-screen"
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
      <p className="lead sk-lead">{m.dev_skills_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_skills_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="sk-failed">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.dev_skills_retry()}
          </button>
        </div>
      ) : null}
      {list ? (
        <>
          <ul className="sk-summary" aria-label={m.dev_skills_summary_label()}>
            <li>{m.dev_skills_pack({ version: list.contentVersion })}</li>
            <li className="sk-revision">{m.dev_skills_revision({ revision: list.revision })}</li>
            <li>{m.dev_skills_count({ count: skills.length })}</li>
            <li className="sk-changed" data-count={changedCount}>
              {m.dev_skills_changed({ count: changedCount })}
            </li>
            <li className="sk-summary-tools">
              <button type="button" className="button-small sk-export-button" onClick={onExport}>
                {m.dev_skills_export()}
              </button>
              <button
                type="button"
                className="button-small"
                aria-expanded={history !== null}
                onClick={onHistory}
              >
                {m.dev_skills_history()}
              </button>
            </li>
          </ul>
          {exported ? (
            <section className="sk-panel sk-export" aria-labelledby="sk-export-title">
              <h2 id="sk-export-title" className="sk-heading">
                {m.dev_skills_export_title()}
              </h2>
              <p className="field-hint">{m.dev_skills_export_hint()}</p>
              <textarea
                className="input sk-export-text"
                readOnly
                rows={6}
                value={exportText}
                aria-labelledby="sk-export-title"
              />
              <div className="sk-inline-actions">
                <button type="button" className="button-small button-primary" onClick={download}>
                  {m.dev_skills_export_download()}
                </button>
                <button type="button" className="button-small" onClick={() => setExported(null)}>
                  {m.dev_skills_close()}
                </button>
              </div>
            </section>
          ) : null}
          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={m.dev_skills_history()}
              className="sk-panel sk-history"
              headingId="sk-history-title"
            />
          ) : null}
          <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
          <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          <div className="sk-tabs" role="tablist" aria-label={m.dev_skills_tabs_label()} id={tabsId}>
            {(["skills", "costs"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`${tabsId}-${value}`}
                aria-selected={tab === value}
                aria-controls={`${tabsId}-${value}-panel`}
                className="sk-tab"
                onClick={() => setTab(value)}
              >
                {value === "skills" ? m.dev_skills_tab_skills() : m.dev_skills_tab_costs()}
              </button>
            ))}
          </div>
          {tab === "skills" ? (
            <div
              className="sk-split"
              role="tabpanel"
              id={`${tabsId}-skills-panel`}
              aria-labelledby={`${tabsId}-skills`}
            >
              <SkillList
                skills={skills}
                selected={editing?.id ?? null}
                taken={taken}
                locale={locale}
                onSelect={select}
                onCreate={onCreate}
              />
              <div className="sk-detail">
                {editing ? (
                  <article
                    className="sk-panel sk-editing"
                    data-skill={editing.id}
                    data-dirty={dirty ? "" : undefined}
                  >
                    <header className="sk-editing-head">
                      <h2 className="sk-heading">
                        {editing.draft.name[locale]} <span className="sk-cost-id">{editing.id}</span>
                      </h2>
                      <div className="sk-chips">
                        {current ? (
                          <span className={`sk-chip sk-origin-${current.origin}`}>
                            {originText(current.origin)}
                          </span>
                        ) : null}
                        {editing.isNew ? (
                          <span className="sk-chip sk-origin-created">{m.dev_skills_origin_created()}</span>
                        ) : null}
                        {dirty ? (
                          <span className="sk-chip sk-chip-dirty">{m.dev_skills_unsaved()}</span>
                        ) : null}
                        {editing.draft.enabled ? null : (
                          <span className="sk-chip">{m.dev_skills_disabled()}</span>
                        )}
                      </div>
                      {current ? (
                        <p className="field-hint">
                          {current.grantedBy.length > 0
                            ? m.dev_skills_granted_by({ items: current.grantedBy.join(", ") })
                            : m.dev_skills_granted_none()}
                          {current.override
                            ? ` · ${m.dev_skills_override_by({
                                who: current.override.updatedBy ?? m.dev_skills_history_system(),
                                when: new Date(current.override.updatedAt).toLocaleString(locale),
                              })}`
                            : ""}
                        </p>
                      ) : null}
                    </header>
                    <SkillForm
                      draft={editing.draft}
                      effects={list.effects}
                      locale={locale}
                      onChange={(draft) => setEditing({ ...editing, draft })}
                    />
                    {confirm ? (
                      <div className="sk-confirm" role="alertdialog" aria-labelledby="sk-confirm-text">
                        <p id="sk-confirm-text">
                          {confirm.kind === "delete"
                            ? m.dev_skills_confirm_delete({ id: confirm.id })
                            : m.dev_skills_confirm_revert({ id: confirm.id })}
                        </p>
                        <div className="sk-inline-actions">
                          <button
                            type="button"
                            className="button-small button-primary sk-confirm-yes"
                            onClick={() => onRevert(confirm.kind, confirm.id)}
                          >
                            {m.dev_skills_confirm_yes()}
                          </button>
                          <button type="button" className="button-small" onClick={() => setConfirm(null)}>
                            {m.dev_skills_confirm_no()}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="sk-actions" role="group" aria-label={editing.draft.name[locale]}>
                      <label className="visually-hidden" htmlFor={noteId}>
                        {m.dev_skills_note_label()}
                      </label>
                      <input
                        id={noteId}
                        className="input sk-note"
                        placeholder={m.dev_skills_note_label()}
                        maxLength={200}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <button
                        type="button"
                        className="button-small button-primary sk-save"
                        aria-disabled={busy || !dirty}
                        onClick={busy || !dirty ? undefined : onSave}
                      >
                        {m.dev_skills_save()}
                      </button>
                      {dirty && current ? (
                        <button
                          type="button"
                          className="button-small"
                          onClick={() => setEditing(editingOf(current))}
                        >
                          {m.dev_skills_discard()}
                        </button>
                      ) : null}
                      <button type="button" className="button-small sk-duplicate" onClick={onDuplicate}>
                        {m.dev_skills_duplicate()}
                      </button>
                      {current ? (
                        <button
                          type="button"
                          className="button-small sk-toggle"
                          aria-disabled={busy}
                          onClick={busy ? undefined : onToggle}
                        >
                          {current.entry.enabled ? m.dev_skills_disable() : m.dev_skills_enable()}
                        </button>
                      ) : null}
                      {current && current.origin === "edited" ? (
                        <button
                          type="button"
                          className="button-small sk-revert"
                          onClick={() => setConfirm({ kind: "revert", id: current.entry.id })}
                        >
                          {m.dev_skills_revert()}
                        </button>
                      ) : null}
                      {current && current.origin === "created" ? (
                        <button
                          type="button"
                          className="button-small sk-delete"
                          onClick={() => setConfirm({ kind: "delete", id: current.entry.id })}
                        >
                          {m.dev_skills_delete()}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ) : (
                  <p className="field-hint sk-pick">{m.dev_skills_pick()}</p>
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
        </>
      ) : null}
    </section>
  );
}

function originText(origin: SkillEditorSkill["origin"]): string {
  if (origin === "created") return m.dev_skills_origin_created();
  return origin === "edited" ? m.dev_skills_origin_edited() : m.dev_skills_origin_pack();
}
