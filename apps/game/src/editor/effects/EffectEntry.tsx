// 효과 사전 편집 판 — 머리(이름·ID·표지·이전/다음·동작: [담기 취소]·[팩 값으로]·[지우기]), 저장을 막는 문제, 구역 바로 가기,
// 칸 견주기(CompareProvider: 팩 항목·지금 실효 항목·초안). [팩 값으로]·[지우기]는 담은 변경에 들고 [적용]이 같은 묶음으로 보낸다.
// docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)"
import type { ContentIssueView } from "@terra/shared/contentEdit";
import type { EffectJson, EffectUsage, TaxonomyRow } from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { type CompareSource, CompareProvider } from "../content/contentEditorCompare.tsx";
import { Badge, EntryHead, SectionJump } from "../content/contentEditorLayout.tsx";
import { EFFECT_SECTIONS, EffectForm } from "./EffectForm.tsx";
import { type StagedEffect, isEffectJson } from "./effectDictionaryModel.ts";
import { ORIGIN_TEXT } from "./effectDictionaryText.ts";

export function EffectEntry({
  id,
  draft,
  row,
  pack,
  staged,
  rows,
  usage,
  itemNames,
  skillNames,
  issues,
  locale,
  onPut,
  onRevert,
  onUnstage,
  onBack,
  onPrev,
  onNext,
}: {
  id: string;
  /** 보이는 항목(담은 값 먼저) */
  draft: EffectJson;
  /** 그 세계의 행(새 효과면 null) */
  row: TaxonomyRow<EffectJson> | null;
  /** 팩 항목(만든 효과면 null) */
  pack: EffectJson | null;
  staged: StagedEffect | undefined;
  /** 그 세계의 효과 전부(같은 배타 묶음 찾기) */
  rows: readonly TaxonomyRow<EffectJson>[];
  usage: EffectUsage;
  itemNames: ReadonlyMap<string, string>;
  skillNames: ReadonlyMap<string, string>;
  issues: readonly ContentIssueView[];
  locale: "ko" | "en";
  onPut: (next: EffectJson) => void;
  onRevert: () => void;
  onUnstage: () => void;
  onBack: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const reverting = staged?.op === "revert";
  const origin = row?.origin ?? "created";
  const source: CompareSource = {
    draft,
    current: row?.entry ?? null,
    pack,
    apply: (next) => {
      if (isEffectJson(next)) onPut(next);
    },
  };
  const peers = rows
    .filter((other) => draft.exclusive && other.entry.exclusive === draft.exclusive && other.entry.id !== id)
    .map((other) => other.entry.name[locale]);
  const sections = EFFECT_SECTIONS.filter((section) => section.name !== "status" || draft.kind === "status");
  return (
    <article
      className="fx-editing"
      data-effect-entry={id}
      data-dirty={staged ? "" : undefined}
      aria-labelledby="fx-entry-title"
    >
      <EntryHead
        headingId="fx-entry-title"
        name={draft.name[locale]}
        id={id}
        backClass="fx-back-list"
        onBack={onBack}
        onPrev={onPrev}
        onNext={onNext}
        badges={
          <>
            {staged ? <Badge tone="staged">{m.dev_content_badge_staged()}</Badge> : null}
            {origin !== "pack" ? (
              <Badge tone={origin === "created" ? "created" : "changed"} className={`fx-origin-${origin}`}>
                {ORIGIN_TEXT[origin]()}
              </Badge>
            ) : null}
            {draft.enabled ? null : <Badge tone="off">{m.dev_items_disabled()}</Badge>}
          </>
        }
        info={<p>{m.dev_effects_used({ items: usage.items.length, skills: usage.skills.length })}</p>}
        actions={
          <>
            {staged ? (
              <button type="button" className="fx-unstage" onClick={onUnstage}>
                {row === null ? m.dev_effects_discard_new() : m.dev_effects_unstage()}
              </button>
            ) : null}
            {row && row.origin !== "pack" && !reverting ? (
              <button type="button" className="fx-revert" onClick={onRevert}>
                {row.origin === "created" ? m.dev_items_delete() : m.dev_items_revert()}
              </button>
            ) : null}
          </>
        }
      />
      {/* 되돌리기를 담으면 칸을 숨긴다([담기 취소]로 다시 고친다) */}
      {reverting ? <p className="field-hint fx-revert-note">{m.dev_effects_revert_staged_note()}</p> : null}
      {issues.length > 0 ? (
        <div className="fx-issues" role="status">
          <p className="field-label">{m.dev_effects_issues_title()}</p>
          <ul>
            {issues.map((issue, index) => (
              <li key={index} className="field-error">
                {issue.path ? <code className="dev-code">{issue.path}</code> : null} {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {reverting ? null : (
        <>
          <SectionJump
            sections={sections.map((section) => ({ name: section.name, label: section.label() }))}
          />
          <CompareProvider source={source}>
            <EffectForm
              draft={draft}
              peers={peers}
              usage={usage}
              itemNames={itemNames}
              skillNames={skillNames}
              onPut={onPut}
            />
          </CompareProvider>
        </>
      )}
    </article>
  );
}
