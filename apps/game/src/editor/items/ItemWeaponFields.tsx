// 무기 칸(장비 칸이 weapon일 때, 설계안 2.4·3.4) — 공격력 칸 둘(물리·속성, D-465)과 기본 공격 칸, 1차 적정 스탯(D-496: 착용 제한
// 없음, 못 미치면 효율이 줄고 2차 적정치는 이것으로 셈한다 — WP-5부터 전투가 셈한 값을 쓴다, 셈한 값은 미리 보기 판에서 받는다), 직접
// 적은 2차 적정치(1차 적정 스탯이 없을 때 전투가 읽는 값), 명중‰·크리‰·공격 간격·사거리·곡사, 스태미나·MP 소모(행동별 소모 화면과 같은
// 값), 속성 계수 12칸, 양손(든 동안 보조 칸 장비를 쓰지 않음), 탄약 연결(보조 칸 탄약 종류, D-497).
import {
  ITEM_LIMITS,
  ITEM_PRIMARY_CODES,
  type ItemEditorListResponse,
  type ItemEditorPreviewResponse,
  type ItemPrimaryCode,
  type ItemWeaponJson,
} from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { CheckField, NumberField, SelectField } from "../content/contentEditorFields.tsx";
import { fieldHint } from "./ItemForm.tsx";
import { PRIMARY_TEXT, elementAt } from "./itemMessages.ts";

type Field = "physical" | "elemental";

/** 1차 적정 스탯 한 칸을 바꾼 무기(빈 칸은 빼고, 다 비면 묶음을 뺀다) */
function withAppropriate(
  weapon: ItemWeaponJson,
  code: ItemPrimaryCode,
  value: number | undefined,
): ItemWeaponJson {
  const next: Partial<Record<ItemPrimaryCode, number>> = {};
  for (const item of ITEM_PRIMARY_CODES) {
    const at = item === code ? value : weapon.appropriate?.[item];
    if (at !== undefined) next[item] = at;
  }
  const { appropriate: _drop, ...rest } = weapon;
  return Object.keys(next).length === 0 ? rest : { ...rest, appropriate: next };
}

export function ItemWeaponFields({
  weapon,
  onChange,
  list,
  locale,
  problem,
  derived,
}: {
  weapon: ItemWeaponJson;
  onChange: (next: ItemWeaponJson) => void;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  problem: (path: string) => string | undefined;
  /** 미리 보기가 셈한 2차 적정치(1차 적정 스탯이 있을 때, 전투가 쓰는 값) */
  derived?: NonNullable<ItemEditorPreviewResponse["weapon"]>["derived"] | undefined;
}) {
  const L = ITEM_LIMITS;
  const at = (key: string) => problem(`equip.weapon.${key}`);
  const toggle = (field: Field, on: boolean) => {
    const { [field]: _drop, basic: _basic, ...rest } = weapon;
    const next: ItemWeaponJson = on ? { ...rest, [field]: { attack: 10, attackAppropriate: 20 } } : rest;
    // 두 칸이면 기본 공격 칸을 꼭 적는다(질문 235 가), 한 칸이면 뺀다
    const both = next.physical !== undefined && next.elemental !== undefined;
    onChange(both ? { ...next, basic: weapon.basic ?? "physical" } : next);
  };
  const setField = (field: Field, patch: Partial<{ attack: number; attackAppropriate: number }>) => {
    const current = weapon[field];
    if (current) onChange({ ...weapon, [field]: { ...current, ...patch } });
  };
  const appropriate = weapon.appropriate ?? {};
  // 탄약 종류(D-497)를 먼저, 그 밖의 보조 칸 종류는 뒤에(팩 검사는 보조 칸 종류면 받고 탄약 종류가 아니면 권고만)
  const ammoTypes = list.weaponTypes
    .filter((row) => row.entry.slot === "offhand")
    .toSorted((a, b) => Number(b.entry.ammo === true) - Number(a.entry.ammo === true));
  const elements = weapon.skillElementsPm;
  const fromPrimary = weapon.appropriate !== undefined;
  // 1차 적정 스탯이 있으면 직접 적은 2차 적정치는 전투가 쓰지 않는다(셈한 값을 쓴다)
  const directHint = fromPrimary ? m.dev_items_direct_appropriate_unused() : undefined;
  return (
    <>
      <div className="ie-fields-2">
        {(["physical", "elemental"] as const).map((field) => {
          const value = weapon[field];
          return (
            <fieldset key={field} className="ie-sub" data-part={`weapon-${field}`}>
              <legend className="field-label">
                {field === "physical" ? m.dev_items_attack_physical() : m.dev_items_attack_elemental()}
              </legend>
              <CheckField
                label={m.dev_items_attack_field_on()}
                checked={value !== undefined}
                problem={field === "physical" ? problem("equip.weapon") : undefined}
                onChange={(on) => toggle(field, on)}
              />
              {value ? (
                <div className="ie-grid">
                  <NumberField
                    label={m.dev_items_field_attack()}
                    value={value.attack}
                    min={L.weaponAttack.min}
                    max={L.weaponAttack.max}
                    problem={at(`${field}.attack`)}
                    onChange={(attack) => setField(field, { attack: attack ?? 0 })}
                  />
                  <NumberField
                    label={m.dev_items_field_attack_appropriate()}
                    value={value.attackAppropriate}
                    min={L.weaponAppropriate.min}
                    max={L.weaponAppropriate.max}
                    hint={directHint}
                    problem={at(`${field}.attackAppropriate`)}
                    onChange={(attackAppropriate) =>
                      setField(field, { attackAppropriate: attackAppropriate ?? 0 })
                    }
                  />
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      {weapon.physical && weapon.elemental ? (
        <SelectField
          label={m.dev_items_field_basic()}
          value={weapon.basic ?? "physical"}
          options={[
            { value: "physical", label: m.dev_items_attack_physical() },
            { value: "elemental", label: m.dev_items_attack_elemental() },
          ]}
          problem={at("basic")}
          onChange={(basic) => onChange({ ...weapon, basic })}
        />
      ) : null}

      <fieldset className="ie-sub" data-part="appropriate">
        <legend className="field-label">{m.dev_items_field_appropriate()}</legend>
        <p className="field-hint">{fieldHint("equip.weapon.appropriate", m.dev_items_appropriate_hint())}</p>
        <div className="ie-grid ie-grid-tight">
          {ITEM_PRIMARY_CODES.map((code) => (
            <NumberField
              key={code}
              label={PRIMARY_TEXT[code]()}
              value={appropriate[code]}
              min={L.appropriatePrimary.min}
              max={L.appropriatePrimary.max}
              optional
              problem={at(`appropriate.${code}`)}
              onChange={(value) => onChange(withAppropriate(weapon, code, value))}
            />
          ))}
        </div>
        {at("appropriate") ? <p className="field-error ce-problem">{at("appropriate")}</p> : null}
        {fromPrimary && derived ? (
          <p className="field-hint" data-part="derived-inline">
            {m.dev_items_preview_derived({
              physical: derived.physicalAttack,
              elemental: derived.elementalAttack,
              hit: derived.hit,
              crit: derived.crit,
              speed: derived.speed,
            })}
          </p>
        ) : null}
      </fieldset>

      <div className="ie-grid">
        <NumberField
          label={m.dev_items_field_hit()}
          value={weapon.hitPm}
          min={L.pm.min}
          max={L.pm.max}
          problem={at("hitPm")}
          onChange={(hitPm) => onChange({ ...weapon, hitPm: hitPm ?? 0 })}
        />
        <NumberField
          label={m.dev_items_field_hit_appropriate()}
          value={weapon.hitAppropriate}
          min={L.weaponAppropriate.min}
          max={L.weaponAppropriate.max}
          hint={directHint}
          problem={at("hitAppropriate")}
          onChange={(hitAppropriate) => onChange({ ...weapon, hitAppropriate: hitAppropriate ?? 0 })}
        />
        <NumberField
          label={m.dev_items_field_crit()}
          value={weapon.critPm}
          min={L.pm.min}
          max={L.pm.max}
          problem={at("critPm")}
          onChange={(critPm) => onChange({ ...weapon, critPm: critPm ?? 0 })}
        />
        <NumberField
          label={m.dev_items_field_crit_appropriate()}
          value={weapon.critAppropriate}
          min={L.weaponAppropriate.min}
          max={L.weaponAppropriate.max}
          hint={directHint}
          problem={at("critAppropriate")}
          onChange={(critAppropriate) => onChange({ ...weapon, critAppropriate: critAppropriate ?? 0 })}
        />
        <NumberField
          label={m.dev_items_field_interval()}
          value={weapon.intervalMs}
          min={L.intervalMs.min}
          max={L.intervalMs.max}
          problem={at("intervalMs")}
          onChange={(intervalMs) => onChange({ ...weapon, intervalMs: intervalMs ?? 1000 })}
        />
        <NumberField
          label={m.dev_items_field_speed_appropriate()}
          value={weapon.speedAppropriate}
          min={L.speedAppropriate.min}
          max={L.speedAppropriate.max}
          hint={directHint}
          problem={at("speedAppropriate")}
          onChange={(speedAppropriate) => onChange({ ...weapon, speedAppropriate: speedAppropriate ?? 1 })}
        />
        <NumberField
          label={m.dev_items_field_range()}
          value={weapon.range}
          min={L.range.min}
          max={L.range.max}
          problem={at("range")}
          onChange={(range) => onChange({ ...weapon, range: range ?? 1 })}
        />
        <NumberField
          label={m.dev_items_field_stamina()}
          value={weapon.staminaCost}
          min={L.cost.min}
          max={L.cost.max}
          hint={m.dev_items_cost_shared()}
          problem={at("staminaCost")}
          onChange={(staminaCost) => onChange({ ...weapon, staminaCost: staminaCost ?? 0 })}
        />
        <NumberField
          label={m.dev_items_field_mp()}
          value={weapon.mpCost}
          min={L.cost.min}
          max={L.cost.max}
          problem={at("mpCost")}
          onChange={(mpCost) => onChange({ ...weapon, mpCost: mpCost ?? 0 })}
        />
      </div>
      <CheckField
        label={m.dev_items_field_arc()}
        checked={weapon.arc}
        onChange={(arc) => onChange({ ...weapon, arc })}
      />
      <CheckField
        label={m.dev_items_field_two_handed()}
        checked={weapon.twoHanded === true}
        hint={fieldHint("equip.weapon.twoHanded", m.dev_items_two_handed_hint())}
        onChange={(on) => {
          const { twoHanded: _drop, ...rest } = weapon;
          onChange(on ? { ...rest, twoHanded: true } : rest);
        }}
      />
      <SelectField
        label={m.dev_items_field_ammo()}
        value={weapon.ammo ?? ""}
        options={[
          { value: "", label: m.dev_items_ammo_none() },
          ...ammoTypes.map((row) => ({
            value: row.entry.id,
            label:
              row.entry.ammo === true
                ? m.dev_items_ammo_type_option({ name: row.entry.name[locale] })
                : row.entry.name[locale],
          })),
        ]}
        problem={at("ammo")}
        onChange={(value) => {
          const { ammo: _drop, ...rest } = weapon;
          onChange(value === "" ? rest : { ...rest, ammo: value });
        }}
      />
      <p className="field-hint">{fieldHint("equip.weapon.ammo", m.dev_items_ammo_hint())}</p>
      <CheckField
        label={m.dev_items_field_element_coeffs()}
        checked={elements !== undefined}
        onChange={(on) => {
          const { skillElementsPm: _drop, ...rest } = weapon;
          onChange(on ? { ...rest, skillElementsPm: Array.from({ length: 12 }, () => 0) } : rest);
        }}
      />
      {elements ? (
        <div className="ie-grid ie-grid-tight">
          {elements.map((pm, index) => (
            <NumberField
              key={index}
              label={elementAt(index)}
              value={pm}
              min={L.elementPm.min}
              max={L.elementPm.max}
              problem={at(`skillElementsPm[${index}]`)}
              onChange={(value) =>
                onChange({
                  ...weapon,
                  skillElementsPm: elements.map((item, i) => (i === index ? (value ?? 0) : item)),
                })
              }
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
