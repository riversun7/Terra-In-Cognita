// 장비 칸(대분류 equipment) — 칸(그 칸을 가진 유닛 종류), 입을 수 있는 유닛 종류·크리쳐 보유(D-494), 무기 종류(무기·보조 칸), 스탯 줄
// (1차 칸은 1차만, 나머지 칸은 2차 행만, 공격력 두 행 제외 D-423·D-438), 속성값(D-450), 전투 직접 값(저항 12칸·고정 방어·관통 ‰, D-421),
// 최대 내구도, 장비 스킬(이 무기로 못 쓰면 알린다, D-490). 칸을 바꾸면 맞지 않는 칸을 맞춘다(itemModel withSlot).
import { ELEMENT_IDS } from "@terra/shared/cyborg";
import {
  ITEM_FORBIDDEN_ROWS,
  ITEM_LIMITS,
  ITEM_PRIMARY_CODES,
  ITEM_PRIMARY_SLOTS,
  type ItemEditorListResponse,
  type ItemEquipJson,
} from "@terra/shared/itemEditor";
import { EQUIP_SLOTS, type ElementCode, type EquipSlot } from "@terra/shared/roster";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { CheckField, NumberField, RemoveButton, SelectField } from "../content/contentEditorFields.tsx";
import { fieldHint } from "./ItemForm.tsx";
import { PRIMARY_TEXT, SLOT_TEXT, elementName } from "./itemMessages.ts";
import { withSlot } from "./itemModel.ts";

const replaceAt = <T,>(list: readonly T[], index: number, item: T): T[] =>
  list.map((entry, i) => (i === index ? item : entry));
const removeAt = <T,>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);

export function ItemEquipFields({
  equip,
  onChange,
  list,
  locale,
  problem,
}: {
  equip: ItemEquipJson;
  onChange: (next: ItemEquipJson) => void;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  problem: (path: string) => string | undefined;
}) {
  const L = ITEM_LIMITS;
  const primary = ITEM_PRIMARY_SLOTS.includes(equip.slot);
  const wearers = list.unitKinds.filter((kind) => kind.slots.includes(equip.slot));
  const kinds = new Set(equip.kinds ?? []);
  const statOptions = primary
    ? ITEM_PRIMARY_CODES.map((code) => ({ value: code, label: PRIMARY_TEXT[code]() }))
    : list.statRows
        .filter((row) => !ITEM_FORBIDDEN_ROWS.includes(row.id))
        .map((row) => ({
          value: row.id,
          label: row.enabled ? row.name[locale] : `${row.name[locale]} (${m.dev_items_disabled()})`,
        }));
  const firstStat = statOptions[0]?.value ?? "str";
  const types = list.weaponTypes.filter((row) => row.entry.slot === equip.slot);
  const typed = equip.slot === "weapon" || equip.slot === "offhand";
  const elements = equip.elements ?? [];
  const resist = equip.combat?.resistPm ?? [];
  const skills = equip.skills ?? [];
  const weaponFields = new Set([
    ...(equip.weapon?.physical ? ["physical"] : []),
    ...(equip.weapon?.elemental ? ["elemental"] : []),
  ]);
  const setCombat = (patch: NonNullable<ItemEquipJson["combat"]>) => {
    const next = { ...equip.combat, ...patch };
    const combat = {
      ...(next.resistPm === undefined ? {} : { resistPm: next.resistPm }),
      ...(next.defenseFlat === undefined ? {} : { defenseFlat: next.defenseFlat }),
      ...(next.penetrationPm === undefined ? {} : { penetrationPm: next.penetrationPm }),
    };
    const { combat: _drop, ...rest } = equip;
    onChange(Object.keys(combat).length === 0 ? rest : { ...rest, combat });
  };
  return (
    <>
      <div className="ie-grid">
        <SelectField
          label={m.dev_items_field_slot()}
          value={equip.slot}
          options={EQUIP_SLOTS.map((slot) => ({ value: slot, label: SLOT_TEXT[slot]() }))}
          problem={problem("equip.slot")}
          onChange={(slot: EquipSlot) => onChange(withSlot(equip, slot))}
        />
        {typed ? (
          <SelectField
            label={m.dev_items_field_weapon_type()}
            value={equip.weaponType ?? ""}
            options={[
              { value: "", label: m.dev_items_none() },
              ...types.map((row) => ({ value: row.entry.id, label: row.entry.name[locale] })),
            ]}
            problem={problem("equip.weaponType")}
            onChange={(value) => {
              const { weaponType: _drop, ...rest } = equip;
              onChange(value === "" ? rest : { ...rest, weaponType: value });
            }}
          />
        ) : null}
        <NumberField
          label={m.dev_items_field_durability()}
          value={equip.maxDurability}
          min={L.maxDurability.min}
          max={L.maxDurability.max}
          optional
          hint={fieldHint("equip.maxDurability", m.dev_items_durability_hint())}
          problem={problem("equip.maxDurability")}
          onChange={(maxDurability) => {
            const { maxDurability: _drop, ...rest } = equip;
            onChange(maxDurability === undefined ? rest : { ...rest, maxDurability });
          }}
        />
      </div>
      <p className="field-hint">
        {wearers.length > 0
          ? m.dev_items_slot_wearers({
              kinds: wearers
                .map(
                  (kind) => `${kind.name[locale]} ${kind.slots.filter((slot) => slot === equip.slot).length}`,
                )
                .join(", "),
            })
          : m.dev_items_slot_no_wearer()}
      </p>

      <fieldset className="ie-sub">
        <legend className="field-label">{m.dev_items_field_kinds()}</legend>
        <p className="field-hint">{fieldHint("equip.kinds", m.dev_items_kinds_hint())}</p>
        <div className="ie-tags">
          {list.unitKinds.map((kind) => (
            <label key={kind.id} className="ie-tag">
              <input
                type="checkbox"
                checked={kinds.has(kind.id)}
                onChange={(event) => {
                  const next = new Set(kinds);
                  if (event.target.checked) next.add(kind.id);
                  else next.delete(kind.id);
                  const { kinds: _drop, ...rest } = equip;
                  onChange(next.size === 0 ? rest : { ...rest, kinds: [...next] });
                }}
              />
              {kind.name[locale]}
            </label>
          ))}
        </div>
        {problem("equip.kinds") ? <p className="field-error ce-problem">{problem("equip.kinds")}</p> : null}
        <CheckField
          label={m.dev_items_field_creature()}
          checked={equip.creature !== undefined}
          hint={fieldHint("equip.creature", m.dev_items_creature_hint())}
          onChange={(on) => {
            const { creature: _drop, ...rest } = equip;
            onChange(on ? { ...rest, creature: { weight: 10, stealPm: 0 } } : rest);
          }}
        />
        {equip.creature ? (
          <div className="ie-grid">
            <NumberField
              label={m.dev_items_field_creature_weight()}
              value={equip.creature.weight}
              min={L.creatureWeight.min}
              max={L.creatureWeight.max}
              problem={problem("equip.creature.weight")}
              onChange={(weight) =>
                equip.creature && onChange({ ...equip, creature: { ...equip.creature, weight: weight ?? 0 } })
              }
            />
            <NumberField
              label={m.dev_items_field_steal()}
              value={equip.creature.stealPm}
              min={L.stealPm.min}
              max={L.stealPm.max}
              problem={problem("equip.creature.stealPm")}
              onChange={(stealPm) =>
                equip.creature &&
                onChange({ ...equip, creature: { ...equip.creature, stealPm: stealPm ?? 0 } })
              }
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="ie-sub" data-part="stats">
        <legend className="field-label">
          {primary ? m.dev_items_stats_primary() : m.dev_items_stats_secondary()}
        </legend>
        <ul className="ie-rows">
          {equip.stats.map((range, index) => (
            <li key={index} className="ie-row">
              <SelectField
                label={m.dev_items_field_stat()}
                value={range.stat}
                options={
                  statOptions.some((option) => option.value === range.stat)
                    ? statOptions
                    : [{ value: range.stat, label: range.stat }, ...statOptions]
                }
                problem={problem(`equip.stats[${index}].stat`)}
                onChange={(stat) =>
                  onChange({ ...equip, stats: replaceAt(equip.stats, index, { ...range, stat }) })
                }
              />
              <NumberField
                label={m.dev_items_field_min()}
                value={range.min}
                min={L.statValue.min}
                max={L.statValue.max}
                problem={problem(`equip.stats[${index}]`) ?? problem(`equip.stats[${index}].min`)}
                onChange={(min) =>
                  onChange({ ...equip, stats: replaceAt(equip.stats, index, { ...range, min: min ?? 0 }) })
                }
              />
              <NumberField
                label={m.dev_items_field_max()}
                value={range.max}
                min={L.statValue.min}
                max={L.statValue.max}
                hint={m.dev_items_stat_mid({ value: Math.floor((range.min + range.max) / 2) })}
                problem={problem(`equip.stats[${index}].max`)}
                onChange={(max) =>
                  onChange({ ...equip, stats: replaceAt(equip.stats, index, { ...range, max: max ?? 0 }) })
                }
              />
              <RemoveButton
                name={range.stat}
                onClick={() => onChange({ ...equip, stats: removeAt(equip.stats, index) })}
              />
            </li>
          ))}
        </ul>
        {equip.stats.length < L.stats ? (
          <button
            type="button"
            className="button-small ie-add"
            onClick={() =>
              onChange({ ...equip, stats: [...equip.stats, { stat: firstStat, min: 0, max: 0 }] })
            }
          >
            {m.dev_items_add_stat()}
          </button>
        ) : null}
      </fieldset>

      <fieldset className="ie-sub" data-part="elements">
        <legend className="field-label">{m.dev_items_field_elements()}</legend>
        <p className="field-hint">{fieldHint("equip.elements", m.dev_items_elements_hint())}</p>
        <ul className="ie-rows">
          {elements.map((entry, index) => (
            <li key={entry.element} className="ie-row">
              <SelectField
                label={m.dev_items_field_element()}
                value={entry.element}
                options={ELEMENT_IDS.map((code: ElementCode) => ({ value: code, label: elementName(code) }))}
                problem={problem(`equip.elements[${index}].element`)}
                onChange={(element) =>
                  onChange({ ...equip, elements: replaceAt(elements, index, { ...entry, element }) })
                }
              />
              <NumberField
                label={m.dev_items_field_element_value()}
                value={entry.value}
                min={L.elementValue.min}
                max={L.elementValue.max}
                onChange={(value) =>
                  onChange({
                    ...equip,
                    elements: replaceAt(elements, index, { ...entry, value: value ?? 1 }),
                  })
                }
              />
              <RemoveButton
                name={elementName(entry.element)}
                onClick={() => {
                  const next = removeAt(elements, index);
                  const { elements: _drop, ...rest } = equip;
                  onChange(next.length === 0 ? rest : { ...rest, elements: next });
                }}
              />
            </li>
          ))}
        </ul>
        {elements.length < ELEMENT_IDS.length ? (
          <button
            type="button"
            className="button-small ie-add"
            onClick={() => {
              const free =
                ELEMENT_IDS.find((code) => !elements.some((entry) => entry.element === code)) ?? "fire";
              onChange({ ...equip, elements: [...elements, { element: free, value: 1 }] });
            }}
          >
            {m.dev_items_add_element()}
          </button>
        ) : null}
      </fieldset>

      <fieldset className="ie-sub" data-part="combat">
        <legend className="field-label">{m.dev_items_field_combat()}</legend>
        <p className="field-hint">{fieldHint("equip.combat", m.dev_items_combat_hint())}</p>
        <div className="ie-grid">
          <NumberField
            label={m.dev_items_field_defense_flat()}
            value={equip.combat?.defenseFlat}
            min={L.defenseFlat.min}
            max={L.defenseFlat.max}
            optional
            problem={problem("equip.combat.defenseFlat")}
            onChange={(defenseFlat) => setCombat({ defenseFlat })}
          />
          <NumberField
            label={m.dev_items_field_penetration()}
            value={equip.combat?.penetrationPm}
            min={L.penetrationPm.min}
            max={L.penetrationPm.max}
            optional
            problem={problem("equip.combat.penetrationPm")}
            onChange={(penetrationPm) => setCombat({ penetrationPm })}
          />
        </div>
        <CheckField
          label={m.dev_items_field_resist()}
          checked={resist.length === 12}
          onChange={(on) => setCombat({ resistPm: on ? Array.from({ length: 12 }, () => 0) : undefined })}
        />
        {resist.length === 12 ? (
          <div className="ie-grid ie-grid-tight">
            {resist.map((pm, index) => (
              <NumberField
                key={index}
                label={elementName(ELEMENT_IDS[index] ?? "water")}
                value={pm}
                min={L.resistPm.min}
                max={L.resistPm.max}
                problem={problem(`equip.combat.resistPm[${index}]`)}
                onChange={(value) => setCombat({ resistPm: replaceAt(resist, index, value ?? 0) })}
              />
            ))}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="ie-sub" data-part="skills">
        <legend className="field-label">{m.dev_items_field_skills()}</legend>
        <ul className="ie-rows">
          {skills.map((id, index) => {
            const skill = list.skills.find((entry) => entry.id === id);
            const need = skill?.weaponField ?? skill?.base;
            const usable =
              !equip.weapon ||
              !skill ||
              skill.bareHand ||
              (need === "any" ? weaponFields.size > 0 : weaponFields.has(need ?? ""));
            return (
              <li key={index} className="ie-row">
                <SelectField
                  label={m.dev_items_field_skill()}
                  value={id}
                  options={[
                    ...(skill ? [] : [{ value: id, label: id }]),
                    ...list.skills.map((entry) => ({
                      value: entry.id,
                      label: entry.enabled
                        ? entry.name[locale]
                        : `${entry.name[locale]} (${m.dev_items_disabled()})`,
                    })),
                  ]}
                  problem={
                    problem(`equip.skills[${index}]`) ??
                    (usable ? undefined : m.dev_items_skill_unusable_here())
                  }
                  onChange={(next) => onChange({ ...equip, skills: replaceAt(skills, index, next) })}
                />
                <AppLink className="ie-link" to={{ route: "dev_skills" }}>
                  {m.dev_items_open_skill_editor()}
                </AppLink>
                <RemoveButton
                  name={id}
                  onClick={() => {
                    const next = removeAt(skills, index);
                    const { skills: _drop, ...rest } = equip;
                    onChange(next.length === 0 ? rest : { ...rest, skills: next });
                  }}
                />
              </li>
            );
          })}
        </ul>
        {skills.length < L.skills && list.skills.length > 0 ? (
          <button
            type="button"
            className="button-small ie-add"
            onClick={() => onChange({ ...equip, skills: [...skills, list.skills[0]?.id ?? ""] })}
          >
            {m.dev_items_add_skill()}
          </button>
        ) : null}
      </fieldset>
    </>
  );
}
