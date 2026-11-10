// 스킬 편집기 부품 칸 — 공식 부품(피해·회복·쉴드·속성 계수)·조건·특수 효과(효과 사전에서 골라 확률·지속·세기)·등급 배율.
// 줄마다 더하기·빼기. 개수 상한은 팩 스키마와 같다(SKILL_LIMITS).
import {
  SKILL_CONDITION_PARTS,
  SKILL_FORMULA_PARTS,
  SKILL_LIMITS,
  type SkillConditionJson,
  type SkillConditionPartKind,
  type SkillEditorEffect,
  type SkillFormulaPartJson,
  type SkillFormulaPartKind,
  type SkillJson,
} from "@terra/shared/skillEditor";
import { m } from "../../paraglide/messages.js";
import { EffectRows, effectOptions } from "../content/contentEditorEffects.tsx";
import { EffectDictionaryFooter, EffectDictionaryOpenLink } from "../effects/EffectDictionaryLinks.tsx";
import { NumberField, RemoveButton, SelectField } from "../content/contentEditorFields.tsx";
import { LadderEditor } from "../content/contentEditorLadder.tsx";
import { FormSection } from "../content/contentEditorLayout.tsx";
import { CONDITION_TEXT, PART_TEXT, elementText } from "./skillMessages.ts";

type Update = (next: SkillJson) => void;

const ELEMENT_OPTIONS = Array.from({ length: 12 }, (_, index) => index);

/** 부품 종류의 처음 값 */
const NEW_PART: Readonly<Record<SkillFormulaPartKind, SkillFormulaPartJson>> = {
  attack_mul: { part: "attack_mul", pm: 1500 },
  weapon_add: { part: "weapon_add", value: 0 },
  element: { part: "element", element: 0, pm: 100 },
  penetration: { part: "penetration", pm: 100 },
  flat: { part: "flat", value: 0 },
  heal: { part: "heal", pm: 250 },
  shield: { part: "shield", pm: 300 },
};
const newPart = (kind: SkillFormulaPartKind): SkillFormulaPartJson => NEW_PART[kind];

function newCondition(kind: SkillConditionPartKind, effect: string): SkillConditionJson {
  if (kind === "target_has") return { part: kind, effect };
  if (kind === "appropriate_met") return { part: kind };
  return { part: kind, pct: 50 };
}

const replaceAt = <T,>(list: readonly T[], index: number, item: T): T[] =>
  list.map((entry, i) => (i === index ? item : entry));
const removeAt = <T,>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);

function PartFields({
  part,
  onChange,
  at,
}: {
  part: SkillFormulaPartJson;
  onChange: (next: SkillFormulaPartJson) => void;
  /** 이 부품의 경로(formula[i]) */
  at: string;
}) {
  const unitPm = m.dev_content_unit_pm();
  switch (part.part) {
    case "attack_mul":
      return (
        <NumberField
          label={m.dev_skills_field_pm()}
          path={`${at}.pm`}
          unit={unitPm}
          value={part.pm}
          min={0}
          max={100_000}
          onChange={(pm) => onChange({ ...part, pm: pm ?? 0 })}
        />
      );
    case "penetration":
      return (
        <NumberField
          label={m.dev_skills_field_pm()}
          path={`${at}.pm`}
          unit={unitPm}
          value={part.pm}
          min={-1000}
          max={1000}
          onChange={(pm) => onChange({ ...part, pm: pm ?? 0 })}
        />
      );
    case "heal":
    case "shield":
      return (
        <NumberField
          label={m.dev_skills_field_pm()}
          path={`${at}.pm`}
          unit={unitPm}
          value={part.pm}
          min={0}
          max={10_000}
          onChange={(pm) => onChange({ ...part, pm: pm ?? 0 })}
        />
      );
    case "weapon_add":
      return (
        <NumberField
          label={m.dev_skills_field_value()}
          path={`${at}.value`}
          value={part.value}
          min={-1_000_000}
          max={1_000_000}
          onChange={(value) => onChange({ ...part, value: value ?? 0 })}
        />
      );
    case "flat":
      return (
        <NumberField
          label={m.dev_skills_field_value()}
          path={`${at}.value`}
          value={part.value}
          min={0}
          max={1_000_000}
          onChange={(value) => onChange({ ...part, value: value ?? 0 })}
        />
      );
    default:
      // 남은 종류는 속성 계수(element)
      return (
        <>
          <SelectField
            label={m.dev_skills_field_element()}
            path={`${at}.element`}
            value={String(part.element)}
            options={ELEMENT_OPTIONS.map((index) => ({ value: String(index), label: elementText(index) }))}
            onChange={(value) => onChange({ ...part, element: Number(value) })}
          />
          <NumberField
            label={m.dev_skills_field_pm()}
            path={`${at}.pm`}
            unit={unitPm}
            value={part.pm}
            min={-100_000}
            max={100_000}
            onChange={(pm) => onChange({ ...part, pm: pm ?? 0 })}
          />
        </>
      );
  }
}

export function FormulaSection({ draft, update }: { draft: SkillJson; update: Update }) {
  return (
    <FormSection
      name="formula"
      className="sk-section"
      title={m.dev_skills_section_formula()}
      desc={m.dev_skills_section_formula_desc()}
      paths={["formula"]}
    >
      <ul className="sk-rows">
        {draft.formula.map((part, index) => (
          <li key={index} className="sk-row" data-part={part.part}>
            <SelectField
              label={m.dev_skills_part_kind()}
              value={part.part}
              options={SKILL_FORMULA_PARTS.map((kind) => ({ value: kind, label: PART_TEXT[kind]() }))}
              onChange={(kind) =>
                update({ ...draft, formula: replaceAt(draft.formula, index, newPart(kind)) })
              }
            />
            <PartFields
              at={`formula[${index}]`}
              part={part}
              onChange={(next) => update({ ...draft, formula: replaceAt(draft.formula, index, next) })}
            />
            <RemoveButton
              name={PART_TEXT[part.part]()}
              onClick={() => update({ ...draft, formula: removeAt(draft.formula, index) })}
            />
          </li>
        ))}
      </ul>
      {draft.formula.length < SKILL_LIMITS.formula ? (
        <button
          type="button"
          className="button-small sk-add"
          onClick={() => update({ ...draft, formula: [...draft.formula, newPart("attack_mul")] })}
        >
          {m.dev_skills_add_part()}
        </button>
      ) : null}
    </FormSection>
  );
}

export function ConditionSection({
  draft,
  update,
  effects,
  locale,
}: {
  draft: SkillJson;
  update: Update;
  effects: readonly SkillEditorEffect[];
  locale: "ko" | "en";
}) {
  const firstEffect = effects[0]?.id ?? "burn";
  return (
    <FormSection
      name="conditions"
      className="sk-section"
      title={m.dev_skills_section_conditions()}
      desc={m.dev_skills_section_conditions_desc()}
      paths={["conditions"]}
    >
      <ul className="sk-rows">
        {draft.conditions.map((condition, index) => (
          <li key={index} className="sk-row">
            <SelectField
              label={m.dev_skills_part_kind()}
              value={condition.part}
              options={SKILL_CONDITION_PARTS.map((kind) => ({ value: kind, label: CONDITION_TEXT[kind]() }))}
              onChange={(kind) =>
                update({
                  ...draft,
                  conditions: replaceAt(draft.conditions, index, newCondition(kind, firstEffect)),
                })
              }
            />
            {condition.part === "self_hp_below" || condition.part === "target_hp_below" ? (
              <NumberField
                label={m.dev_skills_field_pct()}
                path={`conditions[${index}].pct`}
                value={condition.pct}
                min={1}
                max={100}
                onChange={(pct) =>
                  update({
                    ...draft,
                    conditions: replaceAt(draft.conditions, index, { ...condition, pct: pct ?? 1 }),
                  })
                }
              />
            ) : null}
            {condition.part === "target_has" ? (
              <SelectField
                label={m.dev_skills_field_effect()}
                value={condition.effect}
                options={effectOptions(effects, locale, condition.effect)}
                onChange={(effect) =>
                  update({
                    ...draft,
                    conditions: replaceAt(draft.conditions, index, { ...condition, effect }),
                  })
                }
              />
            ) : null}
            <RemoveButton
              name={CONDITION_TEXT[condition.part]()}
              onClick={() => update({ ...draft, conditions: removeAt(draft.conditions, index) })}
            />
          </li>
        ))}
      </ul>
      {draft.conditions.length < SKILL_LIMITS.conditions ? (
        <button
          type="button"
          className="button-small sk-add"
          onClick={() =>
            update({
              ...draft,
              conditions: [...draft.conditions, newCondition("appropriate_met", firstEffect)],
            })
          }
        >
          {m.dev_skills_add_condition()}
        </button>
      ) : null}
    </FormSection>
  );
}

export function EffectSection({
  draft,
  update,
  effects,
  locale,
}: {
  draft: SkillJson;
  update: Update;
  effects: readonly SkillEditorEffect[];
  locale: "ko" | "en";
}) {
  // 효과 줄 편집은 아이템 사용 효과와 같은 부품(contentEditorEffects)이다. 구역 겉은 FormSection(시험이 sk-section을 고른다).
  // 줄마다 [효과 사전에서 열기], 아래 [새 효과 만들기](효과 사전 화면 /dev/effects, docs/adr/2026-11-01-skill-editor.md "바뀜 (2026-11-09)")
  const names = new Map(effects.map((effect) => [effect.id, effect.name[locale]]));
  return (
    <FormSection
      name="effects"
      className="sk-section"
      title={m.dev_skills_section_effects()}
      desc={m.dev_skills_section_effects_desc()}
      source="D-425"
      paths={["effects"]}
    >
      <EffectRows
        legend={m.dev_skills_section_effects()}
        legendHidden
        rows={draft.effects}
        onChange={(rows) => update({ ...draft, effects: rows })}
        effects={effects}
        locale={locale}
        max={SKILL_LIMITS.effects}
        pathPrefix="effects"
        classes={{
          section: "ce-plain-fieldset",
          title: "visually-hidden",
          rows: "sk-rows",
          row: "sk-row sk-effect-row",
          add: "sk-add",
        }}
        renderRowExtra={(row) => (
          <EffectDictionaryOpenLink effect={row.effect} name={names.get(row.effect) ?? row.effect} />
        )}
        footer={<EffectDictionaryFooter />}
      />
    </FormSection>
  );
}

export function GradeSection({ draft, update }: { draft: SkillJson; update: Update }) {
  const L = SKILL_LIMITS;
  return (
    <FormSection
      name="grades"
      className="sk-section"
      title={m.dev_skills_section_grades()}
      desc={m.dev_skills_section_grades_desc()}
      paths={["gradePm"]}
    >
      {/* 등급마다 한 줄: 값 칸 + 막대(나란히 서서 곡선이 보인다), 여러 줄을 골라 묶음 바꾸기·채우기 */}
      <LadderEditor
        className="sk-grades"
        name={m.dev_skills_section_grades()}
        values={draft.gradePm}
        limits={L.gradePm}
        unit="‰"
        rowLabel={(index) => m.dev_skills_grade({ grade: index + 1 })}
        pathOf={(index) => `gradePm[${index}]`}
        onChange={(gradePm) => update({ ...draft, gradePm })}
      />
      <div className="ce-inline-actions">
        {draft.gradePm.length < L.grades ? (
          <button
            type="button"
            className="button-small sk-add"
            onClick={() => update({ ...draft, gradePm: [...draft.gradePm, draft.gradePm.at(-1) ?? 1000] })}
          >
            {m.dev_skills_add_grade()}
          </button>
        ) : null}
        {draft.gradePm.length > 1 ? (
          <RemoveButton
            name={m.dev_skills_grade({ grade: draft.gradePm.length })}
            onClick={() => update({ ...draft, gradePm: draft.gradePm.slice(0, -1) })}
          />
        ) : null}
      </div>
    </FormSection>
  );
}
