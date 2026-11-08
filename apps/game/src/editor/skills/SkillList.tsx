// 스킬 편집기 왼쪽 목록(공용 EntryList, 2026-11-08 화면 개편) — 찾기(ID·이름)·거르기(출처 칩 · 모양 · 자원 · 담은 것만)·[새 스킬](ID 입력).
// 줄마다 모양 표지·이름·ID·한 줄 요약(자원 소모·시전·쿨)·표지(담음·고침·새로 만듦·맨손·꺼짐). docs/adr/2026-11-01-skill-editor.md
import {
  SKILL_RESOURCES,
  SKILL_SHAPE_IDS,
  type SkillEditorSkill,
  type SkillJson,
  type SkillShapeId,
} from "@terra/shared/skillEditor";
import { type Ref, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { type EntryBadge, EntryList, FilterChip, FilterSelect } from "../content/contentEditorList.tsx";
import { FILTER_TEXT, ORIGIN_TEXT, RESOURCE_TEXT, SHAPE_TEXT } from "./skillMessages.ts";
import { SKILL_FILTERS, SKILL_ID_PATTERN, type SkillQuery } from "./skillModel.ts";

/** 목록 찾기·거르기 상태(담은 것만은 화면이 ID 모음으로 바꾼다) */
export interface SkillListQuery {
  readonly text: string;
  readonly filter: SkillQuery["filter"];
  readonly shape: SkillShapeId | "all";
  readonly resource: SkillJson["resource"] | "all";
  readonly stagedOnly: boolean;
}

export const EMPTY_SKILL_QUERY: SkillListQuery = {
  text: "",
  filter: "all",
  shape: "all",
  resource: "all",
  stagedOnly: false,
};

/** 한 줄 요약: 자원 소모 · 시전 · 쿨 */
function summaryOf(entry: SkillJson): string {
  return m.dev_skills_row_summary({
    resource: RESOURCE_TEXT[entry.resource](),
    cost: entry.cost,
    cast: entry.castMs,
    cooldown: entry.cooldownMs,
  });
}

function NewSkillForm({ taken, onCreate }: { taken: ReadonlySet<string>; onCreate: (id: string) => void }) {
  const newId = useId();
  const newHint = useId();
  const [creating, setCreating] = useState(false);
  const [candidate, setCandidate] = useState("");
  const idProblem =
    candidate === ""
      ? null
      : !SKILL_ID_PATTERN.test(candidate)
        ? m.dev_skills_new_id_invalid()
        : taken.has(candidate)
          ? m.dev_skills_new_id_taken()
          : null;
  if (!creating)
    return (
      <button type="button" className="sk-new-button" onClick={() => setCreating(true)}>
        {m.dev_skills_new()}
      </button>
    );
  return (
    <form
      className="sk-new"
      onSubmit={(event) => {
        event.preventDefault();
        if (candidate === "" || idProblem) return;
        onCreate(candidate);
        setCreating(false);
        setCandidate("");
      }}
    >
      <label className="field-label" htmlFor={newId}>
        {m.dev_skills_new_id_label()}
      </label>
      <input
        id={newId}
        className="input"
        autoComplete="off"
        spellCheck={false}
        maxLength={48}
        value={candidate}
        aria-invalid={idProblem ? true : undefined}
        aria-describedby={idProblem ? newHint : undefined}
        onChange={(event) => setCandidate(event.target.value)}
      />
      {idProblem ? (
        <p id={newHint} className="field-error">
          {idProblem}
        </p>
      ) : null}
      <div className="ce-inline-actions">
        <button
          type="submit"
          className="button-primary sk-new-create"
          aria-disabled={candidate === "" || idProblem !== null}
        >
          {m.dev_skills_new_create()}
        </button>
        <button type="button" onClick={() => setCreating(false)}>
          {m.dev_skills_confirm_no()}
        </button>
      </div>
    </form>
  );
}

export function SkillList({
  shown,
  total,
  selected,
  staged,
  taken,
  locale,
  query,
  onQuery,
  searchRef,
  onSelect,
  onCreate,
}: {
  /** 찾기·거르기를 거친 스킬(화면이 거른다: Alt+↑↓ 이전·다음과 같은 차례) */
  shown: readonly SkillEditorSkill[];
  total: number;
  selected: string | null;
  /** 담은 변경이 있는 스킬 ID(새 스킬 포함) */
  staged: ReadonlySet<string>;
  taken: ReadonlySet<string>;
  locale: "ko" | "en";
  query: SkillListQuery;
  onQuery: (patch: Partial<SkillListQuery>) => void;
  searchRef: Ref<HTMLInputElement>;
  onSelect: (id: string) => void;
  onCreate: (id: string) => void;
}) {
  const active = [
    query.filter !== "all",
    query.shape !== "all",
    query.resource !== "all",
    query.stagedOnly,
  ].filter(Boolean).length;
  const rows = shown.map((skill) => {
    const { entry } = skill;
    const badges: EntryBadge[] = [];
    if (staged.has(entry.id))
      badges.push({ key: "staged", label: m.dev_content_badge_staged(), tone: "staged" });
    if (skill.origin !== "pack")
      badges.push({
        key: "origin",
        label: ORIGIN_TEXT[skill.origin](),
        tone: skill.origin === "created" ? "created" : "changed",
        className: `sk-origin-${skill.origin}`,
      });
    if (entry.bareHand === true)
      badges.push({ key: "bare", label: m.dev_skills_field_bare_hand(), tone: "plain" });
    if (!entry.enabled) badges.push({ key: "off", label: m.dev_skills_disabled(), tone: "off" });
    return {
      id: entry.id,
      name: entry.name[locale],
      tag: { label: SHAPE_TEXT[entry.shape](), value: entry.shape },
      summary: summaryOf(entry),
      badges,
      staged: staged.has(entry.id),
      changed: skill.origin !== "pack",
      off: !entry.enabled,
    };
  });
  return (
    <EntryList
      label={m.dev_skills_list_label()}
      rows={rows}
      total={total}
      selected={selected}
      onSelect={onSelect}
      search={query.text}
      onSearch={(text) => onQuery({ text })}
      searchPlaceholder={m.dev_skills_search_placeholder()}
      searchRef={searchRef}
      activeFilters={active}
      onReset={() => onQuery(EMPTY_SKILL_QUERY)}
      itemClass="sk-item"
      dataKey="skill"
      emptyText={m.dev_skills_empty()}
      actions={<NewSkillForm taken={taken} onCreate={onCreate} />}
      filters={
        <>
          {SKILL_FILTERS.filter((option) => option !== "all").map((option) => (
            <FilterChip
              key={option}
              className="sk-filter"
              label={FILTER_TEXT[option]()}
              pressed={query.filter === option}
              onToggle={(on) => onQuery({ filter: on ? option : "all" })}
            />
          ))}
          <FilterChip
            label={m.dev_content_filter_staged()}
            pressed={query.stagedOnly}
            onToggle={(stagedOnly) => onQuery({ stagedOnly })}
          />
          <FilterSelect
            label={m.dev_skills_field_shape()}
            value={query.shape}
            options={[
              { value: "all" as const, label: m.dev_skills_filter_shape_all() },
              ...SKILL_SHAPE_IDS.map((value) => ({ value, label: SHAPE_TEXT[value]() })),
            ]}
            onChange={(shape) => onQuery({ shape })}
          />
          <FilterSelect
            label={m.dev_skills_field_resource()}
            value={query.resource}
            options={[
              { value: "all" as const, label: m.dev_skills_filter_resource_all() },
              ...SKILL_RESOURCES.map((value) => ({ value, label: RESOURCE_TEXT[value]() })),
            ]}
            onChange={(resource) => onQuery({ resource })}
          />
        </>
      }
    />
  );
}
