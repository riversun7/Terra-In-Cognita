// 스킬 편집기 한 스킬의 칸 전부 — 구역(FormSection: 제목·쉬운 풀이·출처·담은 칸 수·팩과 다른 칸 수): 기본(이름·설명·켜기), 무기·피해
// (기반 = 계열·피해 종류 = 피해 방식, 둘은 따로 고른다 D-568, 필요한 무기 칸·맨손 스킬 D-490), 모양·대상(모양·발동·대상·사거리·반지름·연쇄), 소모·시간(자원·소모·시전·쿨), 공식 부품·
// 조건·특수 효과·등급(SkillParts). 칸마다 path로 팩 값·지금 값과 견주고 칸마다 되돌린다(CompareProvider는 편집 판이 준다).
// 고친 칸은 초안에만 들고 담은 변경 막대의 [적용]이 서버 묶음(skills.save) 하나로 보낸다. docs/adr/2026-11-01-skill-editor.md
import {
  SKILL_BASES,
  SKILL_DAMAGES,
  SKILL_LIMITS,
  SKILL_RESOURCES,
  SKILL_SHAPE_IDS,
  SKILL_TARGETS,
  SKILL_TRIGGERS,
  type SkillEditorEffect,
  type SkillJson,
  type SkillWeaponFieldId,
} from "@terra/shared/skillEditor";
import { m } from "../../paraglide/messages.js";
import { CheckField, NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { FormSection } from "../content/contentEditorLayout.tsx";
import { ConditionSection, EffectSection, FormulaSection, GradeSection } from "./SkillParts.tsx";
import {
  BASE_TEXT,
  DAMAGE_TEXT,
  RESOURCE_TEXT,
  SHAPE_TEXT,
  TARGET_TEXT,
  TRIGGER_TEXT,
} from "./skillMessages.ts";
import { isAttackSkill, rangeIntervalOn, withRangeInterval, withShape } from "./skillModel.ts";

type WeaponChoice = "base" | SkillWeaponFieldId;

const WEAPON_TEXT: Readonly<Record<WeaponChoice, () => string>> = {
  base: m.dev_skills_same_as_base,
  physical: m.dev_skills_base_physical,
  elemental: m.dev_skills_base_elemental,
  any: m.dev_skills_field_any,
};
const WEAPON_CHOICES: readonly WeaponChoice[] = ["base", "physical", "elemental", "any"];

/** 구역 이름(바로 가기·시험 data-section) */
export const SKILL_SECTIONS = [
  { name: "basic", label: m.dev_skills_section_basic },
  { name: "weapon", label: m.dev_skills_section_weapon },
  { name: "target", label: m.dev_skills_section_target },
  { name: "cost", label: m.dev_skills_section_cost },
  { name: "formula", label: m.dev_skills_section_formula },
  { name: "conditions", label: m.dev_skills_section_conditions },
  { name: "effects", label: m.dev_skills_section_effects },
  { name: "grades", label: m.dev_skills_section_grades },
] as const;

export function SkillForm({
  draft,
  onChange,
  effects,
  locale,
}: {
  draft: SkillJson;
  onChange: (next: SkillJson) => void;
  effects: readonly SkillEditorEffect[];
  locale: "ko" | "en";
}) {
  const L = SKILL_LIMITS;
  const update = onChange;
  const description = draft.description ?? { ko: "", en: "" };
  const weaponChoice: WeaponChoice = draft.weaponField ?? "base";
  return (
    <div className="sk-form">
      <FormSection
        name="basic"
        className="sk-section"
        title={m.dev_skills_section_basic()}
        desc={m.dev_skills_section_basic_desc()}
        paths={["name", "description", "enabled"]}
      >
        <div className="sk-grid">
          <TextField
            label={m.dev_skills_field_name_ko()}
            path="name.ko"
            value={draft.name.ko}
            maxLength={L.nameMax}
            onChange={(ko) => update({ ...draft, name: { ...draft.name, ko } })}
          />
          <TextField
            label={m.dev_skills_field_name_en()}
            path="name.en"
            value={draft.name.en}
            maxLength={L.nameMax}
            onChange={(en) => update({ ...draft, name: { ...draft.name, en } })}
          />
          <TextField
            label={m.dev_skills_field_desc_ko()}
            path="description.ko"
            value={description.ko}
            onChange={(ko) => update({ ...draft, description: { ...description, ko } })}
          />
          <TextField
            label={m.dev_skills_field_desc_en()}
            path="description.en"
            value={description.en}
            onChange={(en) => update({ ...draft, description: { ...description, en } })}
          />
        </div>
        <CheckField
          label={m.dev_skills_field_enabled()}
          path="enabled"
          desc={m.dev_skills_enabled_desc()}
          checked={draft.enabled}
          onChange={(enabled) => update({ ...draft, enabled })}
        />
      </FormSection>

      <FormSection
        name="weapon"
        className="sk-section"
        title={m.dev_skills_section_weapon()}
        desc={m.dev_skills_section_weapon_desc()}
        source="D-490 · D-568"
        paths={["base", "damage", "weaponField", "bareHand"]}
      >
        <div className="sk-grid">
          <SelectField
            label={m.dev_skills_field_base()}
            path="base"
            desc={m.dev_skills_base_desc()}
            value={draft.base}
            options={SKILL_BASES.map((value) => ({ value, label: BASE_TEXT[value]() }))}
            onChange={(base) => update({ ...draft, base })}
          />
          <SelectField
            label={m.dev_skills_field_damage()}
            path="damage"
            desc={m.dev_skills_damage_desc()}
            value={draft.damage}
            options={SKILL_DAMAGES.map((value) => ({ value, label: DAMAGE_TEXT[value]() }))}
            onChange={(damage) => update({ ...draft, damage })}
          />
          {draft.bareHand === true ? null : (
            <SelectField
              label={m.dev_skills_field_weapon_field()}
              path="weaponField"
              desc={m.dev_skills_weapon_field_hint()}
              value={weaponChoice}
              options={WEAPON_CHOICES.map((value) => ({ value, label: WEAPON_TEXT[value]() }))}
              onChange={(choice) => {
                const { weaponField: _drop, ...rest } = draft;
                update(choice === "base" ? rest : { ...rest, weaponField: choice });
              }}
            />
          )}
        </div>
        <CheckField
          label={m.dev_skills_field_bare_hand()}
          path="bareHand"
          checked={draft.bareHand === true}
          desc={m.dev_skills_bare_hand_hint()}
          onChange={(bareHand) => {
            const { bareHand: _was, weaponField: _field, ...rest } = draft;
            update(bareHand ? { ...rest, bareHand: true } : rest);
          }}
        />
      </FormSection>

      <FormSection
        name="target"
        className="sk-section"
        title={m.dev_skills_section_target()}
        desc={m.dev_skills_section_target_desc()}
        paths={["shape", "trigger", "target", "range", "radius", "chain"]}
      >
        <div className="sk-grid">
          <SelectField
            label={m.dev_skills_field_shape()}
            path="shape"
            desc={m.dev_skills_shape_desc()}
            value={draft.shape}
            options={SKILL_SHAPE_IDS.map((value) => ({ value, label: SHAPE_TEXT[value]() }))}
            onChange={(shape) => update(withShape(draft, shape))}
          />
          <SelectField
            label={m.dev_skills_field_trigger()}
            path="trigger"
            desc={m.dev_skills_trigger_desc()}
            value={draft.trigger}
            options={SKILL_TRIGGERS.map((value) => ({ value, label: TRIGGER_TEXT[value]() }))}
            onChange={(trigger) => update({ ...draft, trigger })}
          />
          <SelectField
            label={m.dev_skills_field_target()}
            path="target"
            value={draft.target}
            options={SKILL_TARGETS.map((value) => ({ value, label: TARGET_TEXT[value]() }))}
            onChange={(target) => update({ ...draft, target })}
          />
          <NumberField
            label={m.dev_skills_field_range()}
            path="range"
            desc={m.dev_skills_range_desc()}
            value={draft.range}
            min={L.range.min}
            max={L.range.max}
            onChange={(range) => update({ ...draft, range: range ?? 0 })}
          />
          <NumberField
            label={m.dev_skills_field_radius()}
            path="radius"
            desc={m.dev_skills_radius_desc()}
            value={draft.radius}
            min={L.radius.min}
            max={L.radius.max}
            onChange={(radius) => update({ ...draft, radius: radius ?? 0 })}
          />
        </div>
        {isAttackSkill(draft) ? (
          <CheckField
            label={m.dev_skills_field_range_interval()}
            path="curves"
            checked={rangeIntervalOn(draft)}
            hint={m.dev_skills_range_interval_hint()}
            onChange={(on) => update(withRangeInterval(draft, on))}
          />
        ) : null}
        {draft.chain ? (
          <div className="sk-grid">
            <NumberField
              label={m.dev_skills_field_chain_targets()}
              path="chain.targets"
              value={draft.chain.targets}
              min={L.chainTargets.min}
              max={L.chainTargets.max}
              onChange={(targets) =>
                draft.chain && update({ ...draft, chain: { ...draft.chain, targets: targets ?? 2 } })
              }
            />
            <NumberField
              label={m.dev_skills_field_chain_jump()}
              path="chain.jump"
              value={draft.chain.jump}
              min={L.chainJump.min}
              max={L.chainJump.max}
              onChange={(jump) =>
                draft.chain && update({ ...draft, chain: { ...draft.chain, jump: jump ?? 1 } })
              }
            />
            <NumberField
              label={m.dev_skills_field_chain_falloff()}
              path="chain.falloffPm"
              desc={m.dev_skills_falloff_desc()}
              value={draft.chain.falloffPm}
              min={L.falloffPm.min}
              max={L.falloffPm.max}
              onChange={(falloffPm) =>
                draft.chain && update({ ...draft, chain: { ...draft.chain, falloffPm: falloffPm ?? 0 } })
              }
            />
          </div>
        ) : null}
      </FormSection>

      <FormSection
        name="cost"
        className="sk-section"
        title={m.dev_skills_section_cost()}
        desc={m.dev_skills_section_cost_desc()}
        source="D-491 · N13"
        paths={["resource", "cost", "castMs", "cooldownMs"]}
      >
        <div className="sk-grid">
          <SelectField
            label={m.dev_skills_field_resource()}
            path="resource"
            value={draft.resource}
            options={SKILL_RESOURCES.map((value) => ({ value, label: RESOURCE_TEXT[value]() }))}
            onChange={(resource) => update({ ...draft, resource })}
          />
          <NumberField
            label={m.dev_skills_field_cost()}
            path="cost"
            desc={m.dev_skills_cost_desc()}
            value={draft.cost}
            min={L.cost.min}
            max={L.cost.max}
            onChange={(cost) => update({ ...draft, cost: cost ?? 0 })}
          />
          <NumberField
            label={m.dev_skills_field_cast()}
            path="castMs"
            value={draft.castMs}
            min={L.castMs.min}
            max={L.castMs.max}
            onChange={(castMs) => update({ ...draft, castMs: castMs ?? 0 })}
          />
          <NumberField
            label={m.dev_skills_field_cooldown()}
            path="cooldownMs"
            value={draft.cooldownMs}
            min={L.cooldownMs.min}
            max={L.cooldownMs.max}
            onChange={(cooldownMs) => update({ ...draft, cooldownMs: cooldownMs ?? 0 })}
          />
        </div>
      </FormSection>

      <FormulaSection draft={draft} update={update} />
      <ConditionSection draft={draft} update={update} effects={effects} locale={locale} />
      <EffectSection draft={draft} update={update} effects={effects} locale={locale} />
      <GradeSection draft={draft} update={update} />
    </div>
  );
}
