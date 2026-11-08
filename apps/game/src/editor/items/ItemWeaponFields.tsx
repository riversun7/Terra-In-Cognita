// 무기 칸(장비 칸이 weapon일 때, 설계안 2.4·3.4) — 공격력 칸 둘(물리·속성, D-465)과 기본 공격 칸, 1차 적정 스탯(D-502, 사용자 답
// 296~298: 착용 제한 없음, 몫마다 하나 — 물리 칸 STR·속성 칸 INT·명중과 크리 DEX·공격 간격 AGI, 못 미치면 그 몫이 비율대로 줄고 넘는
// 보너스는 없다, 비우면 100%. 기준 유닛의 비율은 미리 보기 판에서 받아 칸 아래에 보인다), 명중‰·크리‰·공격 간격·사거리·곡사,
// 스태미나·MP 소모(행동별 소모 화면과 같은 값), 속성 계수 12칸, 양손(든 동안 보조 칸 장비를 쓰지 않음), 탄약 연결(보조 칸 탄약 종류, D-497).
import {
  ITEM_LIMITS,
  type ItemEditorListResponse,
  type ItemWeaponJson,
  WEAPON_APPROPRIATE_CODES,
  type WeaponAppropriateCode,
  type WeaponPartRatio,
} from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { CheckField, NumberField, SelectField } from "../content/contentEditorFields.tsx";
import { fieldHint } from "./ItemForm.tsx";
import { pctText } from "./ItemPreviewParts.tsx";
import { PRIMARY_TEXT, elementAt } from "./itemMessages.ts";

type Field = "physical" | "elemental";

/** 공격력 칸 → 그 칸의 적정 1차(D-502: 물리 STR, 속성 INT) */
const FIELD_STAT: Readonly<Record<Field, "str" | "int">> = { physical: "str", elemental: "int" };

/** 1차 적정 스탯 한 칸을 바꾼 무기(빈 칸은 빼고, 다 비면 묶음을 뺀다) */
function withAppropriate(
  weapon: ItemWeaponJson,
  code: WeaponAppropriateCode,
  value: number | undefined,
): ItemWeaponJson {
  const next: Partial<Record<WeaponAppropriateCode, number>> = {};
  for (const item of WEAPON_APPROPRIATE_CODES) {
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
  parts,
}: {
  weapon: ItemWeaponJson;
  onChange: (next: ItemWeaponJson) => void;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  problem: (path: string) => string | undefined;
  /** 미리 보기가 셈한 기준 유닛의 몫마다 비율(D-502) */
  parts?: readonly WeaponPartRatio[] | undefined;
}) {
  const L = ITEM_LIMITS;
  const at = (key: string) => problem(`equip.weapon.${key}`);
  const toggle = (field: Field, on: boolean) => {
    const { [field]: _drop, basic: _basic, ...rest } = weapon;
    // 칸을 끄면 그 칸의 적정(STR·INT)도 뺀다(쓰지 않는 값을 남기지 않게)
    const base: ItemWeaponJson = on
      ? { ...rest, [field]: { attack: 10 } }
      : withAppropriate(rest, FIELD_STAT[field], undefined);
    // 두 칸이면 기본 공격 칸을 꼭 적는다(질문 235 가), 한 칸이면 뺀다
    const both = base.physical !== undefined && base.elemental !== undefined;
    onChange(both ? { ...base, basic: weapon.basic ?? "physical" } : base);
  };
  const setAttack = (field: Field, attack: number) => {
    if (weapon[field]) onChange({ ...weapon, [field]: { attack } });
  };
  const appropriate = weapon.appropriate ?? {};
  /** 적정 칸 아래 글: 기준 유닛 1차 → 비율(미리 보기 값, 없으면 일반 도움말) */
  const ratioHint = (part: WeaponPartRatio["part"]): string | undefined => {
    const found = parts?.find((row) => row.part === part);
    return found
      ? m.dev_items_part_ratio_hint({
          stat: PRIMARY_TEXT[found.stat](),
          value: found.value,
          ratio: pctText(found.ratioPm),
        })
      : undefined;
  };
  // 탄약 종류(D-497)를 먼저, 그 밖의 보조 칸 종류는 뒤에(팩 검사는 보조 칸 종류면 받고 탄약 종류가 아니면 권고만)
  const ammoTypes = list.weaponTypes
    .filter((row) => row.entry.slot === "offhand")
    .toSorted((a, b) => Number(b.entry.ammo === true) - Number(a.entry.ammo === true));
  const elements = weapon.skillElementsPm;
  /** 적정 1차 칸 하나(빈칸 = 그 몫 100%) */
  const appropriateField = (code: WeaponAppropriateCode, label: string, hint: string | undefined) => (
    <NumberField
      key={code}
      label={label}
      value={appropriate[code]}
      min={L.appropriatePrimary.min}
      max={L.appropriatePrimary.max}
      optional
      hint={hint}
      path={`equip.weapon.appropriate.${code}`}
      problem={at(`appropriate.${code}`)}
      onChange={(value) => onChange(withAppropriate(weapon, code, value))}
    />
  );
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
                    path={`equip.weapon.${field}.attack`}
                    problem={at(`${field}.attack`)}
                    onChange={(attack) => setAttack(field, attack ?? 0)}
                  />
                  {field === "physical"
                    ? appropriateField("str", m.dev_items_field_appropriate_str(), ratioHint("physical"))
                    : appropriateField("int", m.dev_items_field_appropriate_int(), ratioHint("elemental"))}
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
          path="equip.weapon.basic"
          problem={at("basic")}
          onChange={(basic) => onChange({ ...weapon, basic })}
        />
      ) : null}

      <fieldset className="ie-sub" data-part="appropriate">
        <legend className="field-label">{m.dev_items_field_appropriate()}</legend>
        <p className="field-hint">{fieldHint("equip.weapon.appropriate", m.dev_items_appropriate_hint())}</p>
        <div className="ie-grid ie-grid-tight">
          {appropriateField("dex", m.dev_items_field_appropriate_dex(), ratioHint("hit"))}
          {appropriateField("agi", m.dev_items_field_appropriate_agi(), ratioHint("speed"))}
        </div>
        {at("appropriate") ? <p className="field-error ce-problem">{at("appropriate")}</p> : null}
      </fieldset>

      <div className="ie-grid">
        <NumberField
          label={m.dev_items_field_hit()}
          value={weapon.hitPm}
          min={L.pm.min}
          max={L.pm.max}
          path="equip.weapon.hitPm"
          problem={at("hitPm")}
          onChange={(hitPm) => onChange({ ...weapon, hitPm: hitPm ?? 0 })}
        />
        <NumberField
          label={m.dev_items_field_crit()}
          value={weapon.critPm}
          min={L.pm.min}
          max={L.pm.max}
          path="equip.weapon.critPm"
          problem={at("critPm")}
          onChange={(critPm) => onChange({ ...weapon, critPm: critPm ?? 0 })}
        />
        <NumberField
          label={m.dev_items_field_interval()}
          value={weapon.intervalMs}
          min={L.intervalMs.min}
          max={L.intervalMs.max}
          path="equip.weapon.intervalMs"
          problem={at("intervalMs")}
          onChange={(intervalMs) => onChange({ ...weapon, intervalMs: intervalMs ?? 1000 })}
        />
        <NumberField
          label={m.dev_items_field_range()}
          value={weapon.range}
          min={L.range.min}
          max={L.range.max}
          path="equip.weapon.range"
          problem={at("range")}
          onChange={(range) => onChange({ ...weapon, range: range ?? 1 })}
        />
        <NumberField
          label={m.dev_items_field_stamina()}
          value={weapon.staminaCost}
          min={L.cost.min}
          max={L.cost.max}
          hint={m.dev_items_cost_shared()}
          path="equip.weapon.staminaCost"
          problem={at("staminaCost")}
          onChange={(staminaCost) => onChange({ ...weapon, staminaCost: staminaCost ?? 0 })}
        />
        <NumberField
          label={m.dev_items_field_mp()}
          value={weapon.mpCost}
          min={L.cost.min}
          max={L.cost.max}
          path="equip.weapon.mpCost"
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
        path="equip.weapon.ammo"
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
              path={`equip.weapon.skillElementsPm[${index}]`}
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
