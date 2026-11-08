// 스킬 편집 판(2026-11-08 화면 개편) — 머리(이름·ID·표지·이전/다음·동작: [담기 취소]·[복제]·[팩 값으로]·[지우기], 주는 장비·덮어쓴 사람),
// 구역 바로 가기, 칸 견주기(CompareProvider: 팩 항목·지금 실효 항목·초안), 묻는 줄. docs/adr/2026-11-01-skill-editor.md
import type { SkillEditorEffect, SkillEditorSkill, SkillJson } from "@terra/shared/skillEditor";
import { m } from "../../paraglide/messages.js";
import { type CompareSource, CompareProvider } from "../content/contentEditorCompare.tsx";
import { Badge, ConfirmLine, EntryHead, SectionJump } from "../content/contentEditorLayout.tsx";
import { pathParts, joinPath } from "../content/contentEditorPaths.ts";
import { SKILL_SECTIONS, SkillForm } from "./SkillForm.tsx";
import { ORIGIN_TEXT } from "./skillMessages.ts";

export type SkillConfirm = { readonly kind: "revert" | "delete"; readonly id: string } | null;

const isSkillJson = (value: unknown): value is SkillJson =>
  typeof value === "object" && value !== null && typeof Reflect.get(value, "id") === "string";

/** 칸 경로를 같은 모양으로("effects.0.effect" = "effects[0].effect") */
export const normalPath = (path: string): string => joinPath(pathParts(path));

export function SkillEntry({
  id,
  draft,
  current,
  isNew,
  staged,
  effects,
  locale,
  problems,
  confirm,
  onChange,
  onConfirm,
  onRevert,
  onUnstage,
  onDuplicate,
  onBack,
  onPrev,
  onNext,
}: {
  id: string;
  draft: SkillJson;
  /** 지금 세계의 스킬(새 스킬이면 undefined) */
  current: SkillEditorSkill | undefined;
  isNew: boolean;
  staged: boolean;
  effects: readonly SkillEditorEffect[];
  locale: "ko" | "en";
  /** 저장 거절 때 서버가 본 칸 문제(같은 모양 경로 → 문구, "" = 칸 없음) */
  problems: ReadonlyMap<string, string> | null;
  confirm: SkillConfirm;
  onChange: (next: SkillJson) => void;
  onConfirm: (next: SkillConfirm) => void;
  onRevert: (kind: "revert" | "delete", id: string) => void;
  onUnstage: () => void;
  onDuplicate: () => void;
  onBack: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const source: CompareSource = {
    draft,
    current: current?.entry ?? null,
    pack: current?.pack ?? null,
    apply: (next) => {
      if (isSkillJson(next)) onChange(next);
    },
    problemOf: (path) => problems?.get(normalPath(path)),
  };
  const loose = problems?.get("");
  return (
    <article
      className="sk-editing"
      data-skill={id}
      data-dirty={staged ? "" : undefined}
      aria-labelledby="sk-entry-title"
    >
      <EntryHead
        headingId="sk-entry-title"
        name={draft.name[locale]}
        id={id}
        backClass="sk-back-list"
        onBack={onBack}
        onPrev={onPrev}
        onNext={onNext}
        badges={
          <>
            {staged ? <Badge tone="staged">{m.dev_content_badge_staged()}</Badge> : null}
            {current && current.origin !== "pack" ? (
              <Badge
                tone={current.origin === "created" ? "created" : "changed"}
                className={`sk-origin-${current.origin}`}
              >
                {ORIGIN_TEXT[current.origin]()}
              </Badge>
            ) : null}
            {isNew ? (
              <Badge tone="created" className="sk-origin-created">
                {m.dev_skills_origin_created()}
              </Badge>
            ) : null}
            {draft.enabled ? null : <Badge tone="off">{m.dev_skills_disabled()}</Badge>}
          </>
        }
        info={
          current ? (
            <p>
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
          ) : null
        }
        actions={
          <>
            {staged ? (
              <button type="button" className="sk-unstage" onClick={onUnstage}>
                {isNew ? m.dev_skills_discard_new() : m.dev_skills_discard()}
              </button>
            ) : null}
            <button type="button" className="sk-duplicate" onClick={onDuplicate}>
              {m.dev_skills_duplicate()}
            </button>
            {current && current.origin === "edited" ? (
              <button type="button" className="sk-revert" onClick={() => onConfirm({ kind: "revert", id })}>
                {m.dev_skills_revert()}
              </button>
            ) : null}
            {current && current.origin === "created" ? (
              <button type="button" className="sk-delete" onClick={() => onConfirm({ kind: "delete", id })}>
                {m.dev_skills_delete()}
              </button>
            ) : null}
          </>
        }
      />
      {confirm ? (
        <ConfirmLine
          className="sk-confirm"
          yesClass="sk-confirm-yes"
          text={
            confirm.kind === "delete"
              ? m.dev_skills_confirm_delete({ id: confirm.id })
              : m.dev_skills_confirm_revert({ id: confirm.id })
          }
          onYes={() => onRevert(confirm.kind, confirm.id)}
          onNo={() => onConfirm(null)}
        />
      ) : null}
      {loose ? (
        <p className="field-error sk-entry-problem" role="alert">
          {loose}
        </p>
      ) : null}
      <SectionJump
        sections={SKILL_SECTIONS.map((section) => ({ name: section.name, label: section.label() }))}
      />
      <CompareProvider source={source}>
        <SkillForm draft={draft} effects={effects} locale={locale} onChange={onChange} />
      </CompareProvider>
    </article>
  );
}
