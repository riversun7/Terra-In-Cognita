// 유닛 편집 — 무기(타고난·팩 무기·직접 값, D-465 물리·속성 칸 + basic)·장비 칸(팩 장비, 유닛 종류 칸 배치)·장비 직접 값
// (2차 행 더하기·고정 방어·관통·속성별 저항·1차 보너스, 장비 모델 그대로). 공격력 두 행은 장비가 올리지 않는다(D-438, 목록이 gear: false).
import {
  LAB_LIMITS,
  type LabCatalogResponse,
  type LabCustomWeapon,
  type LabUnit,
  type LabWeaponField,
} from "@terra/shared/battleLab";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useId } from "react";
import { m } from "../../../paraglide/messages.js";
import { primaryCode } from "../balanceMessages.ts";
import { NumberField } from "./fields.tsx";
import { gearRowValue, weaponChoice, weaponOfChoice, withEquip, withGearRow } from "./labModel.ts";
import { ELEMENT_TEXT, itemName, localized, slotText, statName } from "./labMessages.ts";

const L = LAB_LIMITS;

/** 공격력 칸 하나만 바꾼 값 */
const fieldPatch = (
  kind: "physical" | "elemental",
  value: LabWeaponField | null,
): Partial<LabCustomWeapon> => (kind === "physical" ? { physical: value } : { elemental: value });

function CustomWeapon(props: {
  readonly spec: LabCustomWeapon;
  readonly onChange: (spec: LabCustomWeapon) => void;
}) {
  const { spec } = props;
  const id = useId();
  const set = (patch: Partial<LabCustomWeapon>) => props.onChange({ ...spec, ...patch });
  const fieldEditor = (kind: "physical" | "elemental", label: string) => {
    const value: LabWeaponField | null = spec[kind];
    return (
      <fieldset className="bl-weapon-field" data-field={kind}>
        <legend>
          <label className="bl-check">
            <input
              type="checkbox"
              checked={value !== null}
              onChange={(event) => {
                const next = event.target.checked ? { attack: 10, appropriate: 20 } : null;
                // 칸이 하나도 없는 무기는 만들지 않는다(D-465)
                const other = kind === "physical" ? spec.elemental : spec.physical;
                if (!next && !other) return;
                set({
                  ...fieldPatch(kind, next),
                  basic: next ? spec.basic : kind === "physical" ? "elemental" : "physical",
                });
              }}
            />
            {label}
          </label>
        </legend>
        {value ? (
          <div className="bl-grid2">
            <NumberField
              label={m.dev_lab_weapon_attack()}
              value={value.attack}
              min={0}
              max={L.valueMax}
              onChange={(attack) => set(fieldPatch(kind, { ...value, attack }))}
            />
            <NumberField
              label={m.dev_lab_weapon_appropriate()}
              value={value.appropriate}
              min={0}
              max={L.valueMax}
              onChange={(appropriate) => set(fieldPatch(kind, { ...value, appropriate }))}
            />
          </div>
        ) : null}
      </fieldset>
    );
  };
  return (
    <div className="bl-custom-weapon">
      {fieldEditor("physical", m.dev_lab_weapon_physical())}
      {fieldEditor("elemental", m.dev_lab_weapon_elemental())}
      <div className="field">
        <label className="field-label" htmlFor={`${id}-basic`}>
          {m.dev_lab_weapon_basic()}
        </label>
        <select
          id={`${id}-basic`}
          value={spec.basic}
          onChange={(event) => set({ basic: event.target.value === "elemental" ? "elemental" : "physical" })}
        >
          {spec.physical ? <option value="physical">{m.dev_lab_weapon_physical()}</option> : null}
          {spec.elemental ? <option value="elemental">{m.dev_lab_weapon_elemental()}</option> : null}
        </select>
      </div>
      <div className="bl-grid3">
        <NumberField
          label={m.dev_lab_weapon_hit()}
          value={spec.hitPm}
          min={0}
          max={L.valueMax}
          onChange={(v) => set({ hitPm: v })}
        />
        <NumberField
          label={m.dev_lab_weapon_hit_appropriate()}
          value={spec.hitAppropriate}
          min={0}
          max={L.valueMax}
          onChange={(v) => set({ hitAppropriate: v })}
        />
        <NumberField
          label={m.dev_lab_weapon_crit()}
          value={spec.critPm}
          min={0}
          max={L.valueMax}
          onChange={(v) => set({ critPm: v })}
        />
        <NumberField
          label={m.dev_lab_weapon_crit_appropriate()}
          value={spec.critAppropriate}
          min={0}
          max={L.valueMax}
          onChange={(v) => set({ critAppropriate: v })}
        />
        <NumberField
          label={m.dev_lab_weapon_interval()}
          value={spec.intervalMs}
          min={100}
          max={60_000}
          onChange={(v) => set({ intervalMs: v })}
        />
        <NumberField
          label={m.dev_lab_weapon_speed()}
          value={spec.speedAppropriate}
          min={1}
          max={L.valueMax}
          onChange={(v) => set({ speedAppropriate: v })}
        />
        <NumberField
          label={m.dev_lab_weapon_range()}
          value={spec.range}
          min={1}
          max={32}
          onChange={(v) => set({ range: v })}
        />
        <NumberField
          label={m.dev_lab_weapon_stamina()}
          value={spec.staminaCost}
          min={0}
          max={L.valueMax}
          onChange={(v) => set({ staminaCost: v })}
        />
        <NumberField
          label={m.dev_lab_weapon_mp()}
          value={spec.mpCost}
          min={0}
          max={L.valueMax}
          onChange={(v) => set({ mpCost: v })}
        />
      </div>
      <label className="bl-check">
        <input type="checkbox" checked={spec.arc} onChange={(event) => set({ arc: event.target.checked })} />
        {m.dev_lab_weapon_arc()}
      </label>
      <details className="bl-details">
        <summary>{m.dev_lab_weapon_elements()}</summary>
        <p className="field-hint">{m.dev_lab_weapon_elements_hint()}</p>
        <div className="bl-grid4">
          {ELEMENT_TEXT.map((text, index) => (
            <NumberField
              // oxlint-disable-next-line react/no-array-index-key -- 속성 칸 차례가 열쇠다(12칸 고정)
              key={index}
              label={text()}
              value={spec.elementsPm[index] ?? 0}
              min={0}
              max={L.valueMax}
              onChange={(value) =>
                set({ elementsPm: spec.elementsPm.map((entry, at) => (at === index ? value : entry)) })
              }
            />
          ))}
        </div>
      </details>
    </div>
  );
}

export function UnitGear(props: {
  readonly unit: LabUnit;
  readonly catalog: LabCatalogResponse;
  readonly locale: string;
  readonly onChange: (change: (unit: LabUnit) => LabUnit) => void;
}) {
  const { unit, catalog, locale, onChange } = props;
  const id = useId();
  const kind = catalog.unitKinds.find((entry) => entry.id === unit.kind);
  const slots = kind?.slots ?? [];
  const weaponSlot = slots.indexOf("weapon");
  const natural = kind?.natural;
  return (
    <>
      <details className="bl-details" open>
        <summary>{m.dev_lab_section_weapon()}</summary>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-weapon`}>
            {m.dev_lab_weapon()}
          </label>
          <select
            id={`${id}-weapon`}
            className="bl-weapon-select"
            value={weaponChoice(unit.weapon)}
            onChange={(event) => {
              const choice = event.target.value;
              if (natural)
                onChange((current) => ({
                  ...current,
                  weapon: weaponOfChoice(choice, current.weapon, natural),
                }));
            }}
          >
            <option value="natural">{m.dev_lab_weapon_natural()}</option>
            {weaponSlot >= 0
              ? catalog.weapons.map((weapon) => (
                  <option key={weapon.id} value={`item:${weapon.id}`}>
                    {localized(weapon.name, locale, weapon.id)}
                  </option>
                ))
              : null}
            <option value="custom">{m.dev_lab_weapon_custom()}</option>
          </select>
        </div>
        {unit.weapon.kind === "item" ? (
          <NumberField
            label={m.dev_lab_roll()}
            hint={m.dev_lab_roll_hint()}
            value={unit.weapon.pm}
            min={0}
            max={1000}
            onChange={(pm) =>
              onChange((current) =>
                current.weapon.kind === "item" ? { ...current, weapon: { ...current.weapon, pm } } : current,
              )
            }
          />
        ) : null}
        {unit.weapon.kind === "custom" ? (
          <CustomWeapon
            spec={unit.weapon.spec}
            onChange={(spec) => onChange((current) => ({ ...current, weapon: { kind: "custom", spec } }))}
          />
        ) : null}
      </details>

      <details className="bl-details">
        <summary>{m.dev_lab_section_equipment()}</summary>
        {slots.length <= (weaponSlot >= 0 ? 1 : 0) ? (
          <p className="field-hint">{m.dev_lab_no_slots()}</p>
        ) : null}
        <div className="bl-slots">
          {slots.map((slot, index) => {
            if (index === weaponSlot) return null;
            const equipped = unit.equipment.find((entry) => entry.slot === index);
            const options = catalog.equipment.filter((item) => item.slot === slot && !item.weapon);
            return (
              // oxlint-disable-next-line react/no-array-index-key -- 유닛 종류의 칸 번호가 열쇠다
              <div key={index} className="bl-slot" data-slot={slot}>
                <label className="field-label" htmlFor={`${id}-slot-${index}`}>
                  {slotText(slot)}
                </label>
                <select
                  id={`${id}-slot-${index}`}
                  value={equipped?.item ?? ""}
                  onChange={(event) =>
                    onChange((current) =>
                      withEquip(current, index, event.target.value === "" ? null : event.target.value),
                    )
                  }
                >
                  <option value="">{m.roster_slot_empty()}</option>
                  {options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {itemName(catalog, item.id, locale)}
                    </option>
                  ))}
                </select>
                {equipped ? (
                  <NumberField
                    label={m.dev_lab_roll()}
                    hint={m.dev_lab_roll_hint()}
                    value={equipped.pm}
                    min={0}
                    max={1000}
                    hideLabel
                    onChange={(pm) => onChange((current) => withEquip(current, index, equipped.item, pm))}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </details>

      <details className="bl-details">
        <summary>{m.dev_lab_section_gear()}</summary>
        <p className="field-hint">{m.dev_lab_gear_hint()}</p>
        <div className="bl-grid3">
          {catalog.statRows
            .filter((row) => row.gear)
            .map((row) => (
              <NumberField
                key={row.id}
                field={row.id}
                label={statName(catalog, row.id, locale)}
                value={gearRowValue(unit, row.id)}
                min={-L.valueMax}
                max={L.valueMax}
                onChange={(value) => onChange((current) => withGearRow(current, row.id, value))}
              />
            ))}
          <NumberField
            label={m.dev_lab_defense_flat()}
            value={unit.gear.defenseFlat}
            min={0}
            max={L.valueMax}
            onChange={(value) =>
              onChange((current) => ({ ...current, gear: { ...current.gear, defenseFlat: value } }))
            }
          />
          <NumberField
            label={m.dev_lab_penetration()}
            value={unit.gear.penetrationPm}
            min={0}
            max={L.pmMax}
            onChange={(value) =>
              onChange((current) => ({ ...current, gear: { ...current.gear, penetrationPm: value } }))
            }
          />
        </div>
        <h4 className="bl-subtitle">{m.dev_lab_primary_bonus()}</h4>
        <div className="bl-grid3">
          {PRIMARY_STATS.map((stat) => (
            <NumberField
              key={stat}
              field={stat}
              label={primaryCode(stat)}
              value={unit.gear.primaries[stat]}
              min={-L.primaryMax}
              max={L.primaryMax}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  gear: { ...current.gear, primaries: { ...current.gear.primaries, [stat]: value } },
                }))
              }
            />
          ))}
        </div>
        <h4 className="bl-subtitle">{m.dev_lab_resist()}</h4>
        <div className="bl-grid4">
          {ELEMENT_TEXT.map((text, index) => (
            <NumberField
              // oxlint-disable-next-line react/no-array-index-key -- 속성 칸 차례가 열쇠다(12칸 고정)
              key={index}
              label={text()}
              value={unit.gear.resistPm[index] ?? 0}
              min={-L.pmMax}
              max={L.pmMax}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  gear: {
                    ...current.gear,
                    resistPm: current.gear.resistPm.map((entry, at) => (at === index ? value : entry)),
                  },
                }))
              }
            />
          ))}
        </div>
      </details>
    </>
  );
}
