// 스킬 편집기 왼쪽 목록 — 찾기(ID·이름)·거르기(전체·고침·새로 만듦·꺼짐)·새 스킬(ID 입력). 줄마다 이름·ID·자원 소모·출처 칩.
import type { SkillEditorSkill } from "@terra/shared/skillEditor";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { FILTER_TEXT, ORIGIN_TEXT, RESOURCE_TEXT, SHAPE_TEXT } from "./skillMessages.ts";
import { SKILL_FILTERS, SKILL_ID_PATTERN, type SkillFilter, filterSkills } from "./skillModel.ts";

export function SkillList({
  skills,
  selected,
  taken,
  locale,
  onSelect,
  onCreate,
}: {
  skills: readonly SkillEditorSkill[];
  selected: string | null;
  taken: ReadonlySet<string>;
  locale: "ko" | "en";
  onSelect: (id: string) => void;
  onCreate: (id: string) => void;
}) {
  const searchId = useId();
  const newId = useId();
  const newHint = useId();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");
  const [creating, setCreating] = useState(false);
  const [candidate, setCandidate] = useState("");
  const shown = filterSkills(skills, { text, filter });
  const idProblem =
    candidate === ""
      ? null
      : !SKILL_ID_PATTERN.test(candidate)
        ? m.dev_skills_new_id_invalid()
        : taken.has(candidate)
          ? m.dev_skills_new_id_taken()
          : null;
  return (
    <aside className="sk-list-pane" aria-label={m.dev_skills_list_label()}>
      <div className="field sk-search">
        <label className="field-label" htmlFor={searchId}>
          {m.dev_skills_search_label()}
        </label>
        <input
          id={searchId}
          className="input"
          type="search"
          autoComplete="off"
          placeholder={m.dev_skills_search_placeholder()}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <fieldset className="sk-filters">
        <legend className="field-label">{m.dev_skills_filter_label()}</legend>
        {SKILL_FILTERS.map((option) => (
          <label key={option} className="sk-filter" data-active={option === filter ? "" : undefined}>
            <input
              type="radio"
              name="skill-filter"
              value={option}
              checked={option === filter}
              onChange={() => setFilter(option)}
            />
            {FILTER_TEXT[option]()}
          </label>
        ))}
      </fieldset>
      {creating ? (
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
          <div className="sk-inline-actions">
            <button
              type="submit"
              className="button-small button-primary sk-new-create"
              aria-disabled={candidate === "" || idProblem !== null}
            >
              {m.dev_skills_new_create()}
            </button>
            <button type="button" className="button-small" onClick={() => setCreating(false)}>
              {m.dev_skills_confirm_no()}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="button-small sk-new-button" onClick={() => setCreating(true)}>
          {m.dev_skills_new()}
        </button>
      )}
      {shown.length === 0 ? <p className="field-hint">{m.dev_skills_empty()}</p> : null}
      <ul className="sk-list">
        {shown.map((skill) => {
          const { entry } = skill;
          return (
            <li key={entry.id}>
              <button
                type="button"
                className="sk-item"
                aria-current={selected === entry.id ? "true" : undefined}
                data-skill={entry.id}
                data-off={entry.enabled ? undefined : ""}
                onClick={() => onSelect(entry.id)}
              >
                <span className="sk-item-name">{entry.name[locale]}</span>
                <span className="sk-item-meta">
                  {entry.id} · {SHAPE_TEXT[entry.shape]()} · {RESOURCE_TEXT[entry.resource]()} {entry.cost}
                </span>
                <span className="sk-chips">
                  {skill.origin === "pack" ? null : (
                    <span className={`sk-chip sk-origin-${skill.origin}`}>{ORIGIN_TEXT[skill.origin]()}</span>
                  )}
                  {entry.bareHand === true ? (
                    <span className="sk-chip">{m.dev_skills_field_bare_hand()}</span>
                  ) : null}
                  {entry.enabled ? null : <span className="sk-chip">{m.dev_skills_disabled()}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
