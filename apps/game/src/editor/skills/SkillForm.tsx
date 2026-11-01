// 스킬 편집기 한 스킬의 칸 전부 — 이름·켜기, 기반·필요한 무기 칸·맨손 스킬(D-490), 모양·대상·사거리·반지름·연쇄, 시전·쿨·자원·소모,
// 공식 부품·조건·특수 효과·등급(SkillParts). 고친 칸은 초안(draft)에만 들고 [저장]이 서버 묶음(skills.save) 하나로 보낸다.
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
import { ConditionSection, EffectSection, FormulaSection, GradeSection } from "./SkillParts.tsx";
import { DAMAGE_TEXT, RESOURCE_TEXT, SHAPE_TEXT, TARGET_TEXT, TRIGGER_TEXT } from "./skillMessages.ts";
import { withShape } from "./skillModel.ts";

type WeaponChoice = "base" | SkillWeaponFieldId;

const WEAPON_TEXT: Readonly<Record<WeaponChoice, () => string>> = {
  base: m.dev_skills_same_as_base,
  physical: m.dev_skills_damage_physical,
  elemental: m.dev_skills_damage_elemental,
  any: m.dev_skills_field_any,
};
const WEAPON_CHOICES: readonly WeaponChoice[] = ["base", "physical", "elemental", "any"];

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
      <fieldset className="sk-section">
        <legend className="sk-section-title">{m.dev_skills_section_basic()}</legend>
        <div className="sk-grid">
          <TextField
            label={m.dev_skills_field_name_ko()}
            value={draft.name.ko}
            maxLength={L.nameMax}
            onChange={(ko) => update({ ...draft, name: { ...draft.name, ko } })}
          />
          <TextField
            label={m.dev_skills_field_name_en()}
            value={draft.name.en}
            maxLength={L.nameMax}
            onChange={(en) => update({ ...draft, name: { ...draft.name, en } })}
          />
          <TextField
            label={m.dev_skills_field_desc_ko()}
            value={description.ko}
            onChange={(ko) => update({ ...draft, description: { ...description, ko } })}
          />
          <TextField
            label={m.dev_skills_field_desc_en()}
            value={description.en}
            onChange={(en) => update({ ...draft, description: { ...description, en } })}
          />
        </div>
        <CheckField
          label={m.dev_skills_field_enabled()}
          checked={draft.enabled}
          onChange={(enabled) => update({ ...draft, enabled })}
        />
      </fieldset>

      <fieldset className="sk-section">
        <legend className="sk-section-title">{m.dev_skills_section_weapon()}</legend>
        <div className="sk-grid">
          <SelectField
            label={m.dev_skills_field_base()}
            value={draft.base}
            options={SKILL_BASES.map((value) => ({ value, label: DAMAGE_TEXT[value]() }))}
            onChange={(base) => update({ ...draft, base, damage: draft.damage === "none" ? "none" : base })}
          />
          <SelectField
            label={m.dev_skills_field_damage()}
            value={draft.damage}
            options={SKILL_DAMAGES.map((value) => ({ value, label: DAMAGE_TEXT[value]() }))}
            onChange={(damage) => update({ ...draft, damage, base: damage === "none" ? draft.base : damage })}
          />
          {draft.bareHand === true ? null : (
            <SelectField
              label={m.dev_skills_field_weapon_field()}
              value={weaponChoice}
              options={WEAPON_CHOICES.map((value) => ({ value, label: WEAPON_TEXT[value]() }))}
              onChange={(choice) => {
                const { weaponField: _drop, ...rest } = draft;
                update(choice === "base" ? rest : { ...rest, weaponField: choice });
              }}
            />
          )}
        </div>
        {draft.bareHand === true ? null : <p className="field-hint">{m.dev_skills_weapon_field_hint()}</p>}
        <CheckField
          label={m.dev_skills_field_bare_hand()}
          checked={draft.bareHand === true}
          hint={m.dev_skills_bare_hand_hint()}
          onChange={(bareHand) => {
            const { bareHand: _was, weaponField: _field, ...rest } = draft;
            update(bareHand ? { ...rest, bareHand: true } : rest);
          }}
        />
      </fieldset>

      <fieldset className="sk-section">
        <legend className="sk-section-title">{m.dev_skills_section_target()}</legend>
        <div className="sk-grid">
          <SelectField
            label={m.dev_skills_field_shape()}
            value={draft.shape}
            options={SKILL_SHAPE_IDS.map((value) => ({ value, label: SHAPE_TEXT[value]() }))}
            onChange={(shape) => update(withShape(draft, shape))}
          />
          <SelectField
            label={m.dev_skills_field_trigger()}
            value={draft.trigger}
            options={SKILL_TRIGGERS.map((value) => ({ value, label: TRIGGER_TEXT[value]() }))}
            onChange={(trigger) => update({ ...draft, trigger })}
          />
          <SelectField
            label={m.dev_skills_field_target()}
            value={draft.target}
            options={SKILL_TARGETS.map((value) => ({ value, label: TARGET_TEXT[value]() }))}
            onChange={(target) => update({ ...draft, target })}
          />
          <NumberField
            label={m.dev_skills_field_range()}
            value={draft.range}
            min={L.range.min}
            max={L.range.max}
            onChange={(range) => update({ ...draft, range: range ?? 0 })}
          />
          <NumberField
            label={m.dev_skills_field_radius()}
            value={draft.radius}
            min={L.radius.min}
            max={L.radius.max}
            onChange={(radius) => update({ ...draft, radius: radius ?? 0 })}
          />
        </div>
        {draft.chain ? (
          <div className="sk-grid">
            <NumberField
              label={m.dev_skills_field_chain_targets()}
              value={draft.chain.targets}
              min={L.chainTargets.min}
              max={L.chainTargets.max}
              onChange={(targets) =>
                draft.chain && update({ ...draft, chain: { ...draft.chain, targets: targets ?? 2 } })
              }
            />
            <NumberField
              label={m.dev_skills_field_chain_jump()}
              value={draft.chain.jump}
              min={L.chainJump.min}
              max={L.chainJump.max}
              onChange={(jump) =>
                draft.chain && update({ ...draft, chain: { ...draft.chain, jump: jump ?? 1 } })
              }
            />
            <NumberField
              label={m.dev_skills_field_chain_falloff()}
              value={draft.chain.falloffPm}
              min={L.falloffPm.min}
              max={L.falloffPm.max}
              onChange={(falloffPm) =>
                draft.chain && update({ ...draft, chain: { ...draft.chain, falloffPm: falloffPm ?? 0 } })
              }
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="sk-section">
        <legend className="sk-section-title">{m.dev_skills_section_cost()}</legend>
        <div className="sk-grid">
          <SelectField
            label={m.dev_skills_field_resource()}
            value={draft.resource}
            options={SKILL_RESOURCES.map((value) => ({ value, label: RESOURCE_TEXT[value]() }))}
            onChange={(resource) => update({ ...draft, resource })}
          />
          <NumberField
            label={m.dev_skills_field_cost()}
            value={draft.cost}
            min={L.cost.min}
            max={L.cost.max}
            onChange={(cost) => update({ ...draft, cost: cost ?? 0 })}
          />
          <NumberField
            label={m.dev_skills_field_cast()}
            value={draft.castMs}
            min={L.castMs.min}
            max={L.castMs.max}
            onChange={(castMs) => update({ ...draft, castMs: castMs ?? 0 })}
          />
          <NumberField
            label={m.dev_skills_field_cooldown()}
            value={draft.cooldownMs}
            min={L.cooldownMs.min}
            max={L.cooldownMs.max}
            onChange={(cooldownMs) => update({ ...draft, cooldownMs: cooldownMs ?? 0 })}
          />
        </div>
      </fieldset>

      <FormulaSection draft={draft} update={update} />
      <ConditionSection draft={draft} update={update} effects={effects} locale={locale} />
      <EffectSection draft={draft} update={update} effects={effects} locale={locale} />
      <GradeSection draft={draft} update={update} />
    </div>
  );
}
