// 장비 수리 판 — 기획 D-512 323, 옛 프로젝트 공방 수리(enhancement_routes.js REPAIR_MAP 878~883): 시설마다 수리 줄(고치는 칸·무기 종류 +
// 기본 재료). 수리는 끝까지만, 재료 = max(1, ⌈기본 양 × 티어 × 잃은 ÷ 최대⌉), 수수료 없음(노동 = 장인 직무 시간), 장인 실력 = 제작 직무 점수 ÷
// 적정 점수(설정 칸 F11). 셈은 서버의 @terra/sim items/repair.ts 하나이고, 이 판은 시설 항목의 repair 칸만 고친다(검사는 서버).
import {
  type BuildingEditorItem,
  type BuildingEditorListResponse,
  FACILITY_REPAIR_LIMITS,
  type FacilityJson,
  type FacilityRepairJson,
} from "@terra/shared/buildingEditor";
import { EQUIP_SLOTS } from "@terra/shared/roster";
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { CheckField, NumberField, RemoveButton, SelectField } from "../content/contentEditorFields.tsx";
import { FormSection } from "../content/contentEditorLayout.tsx";
import { materialOptions } from "./BuildingLevels.tsx";
import { EQUIP_SLOT_TEXT } from "./buildingMessages.ts";
import { MATERIAL_CATEGORIES, newRepairRule, setRepair, toggleIn } from "./buildingModel.ts";

function RuleEditor({
  entry,
  index,
  rule,
  list,
  locale,
  onEdit,
}: {
  entry: FacilityJson;
  index: number;
  rule: FacilityRepairJson;
  list: BuildingEditorListResponse;
  locale: "ko" | "en";
  onEdit: (next: FacilityJson) => void;
}) {
  const headingId = useId();
  const rules = entry.repair ?? [];
  const put = (next: FacilityRepairJson): void =>
    onEdit(
      setRepair(
        entry,
        rules.map((current, at) => (at === index ? next : current)),
      ),
    );
  const items: readonly BuildingEditorItem[] = list.items;
  const nameOf = (id: string): string => items.find((item) => item.id === id)?.name[locale] ?? id;
  const pickable = items.filter((item) => MATERIAL_CATEGORIES.has(item.category));
  return (
    <section className="be-band be-repair-rule" aria-labelledby={headingId} data-repair={index}>
      <div className="be-band-head">
        <h4 id={headingId} className="be-subheading">
          {m.dev_buildings_repair_rule_title({ index: index + 1 })}
        </h4>
        <button
          type="button"
          className="be-remove-repair"
          onClick={() => {
            const rest = rules.filter((_, at) => at !== index);
            onEdit(setRepair(entry, rest.length === 0 ? undefined : rest));
          }}
        >
          {m.dev_buildings_remove_repair_rule()}
        </button>
      </div>
      <fieldset className="be-targets" data-targets="slots">
        <legend className="field-label">{m.dev_buildings_repair_slots()}</legend>
        {EQUIP_SLOTS.map((slot) => (
          <CheckField
            key={slot}
            label={EQUIP_SLOT_TEXT[slot]()}
            checked={rule.slots.includes(slot)}
            onChange={(on) => put({ ...rule, slots: toggleIn(rule.slots, slot, on, EQUIP_SLOTS) })}
          />
        ))}
      </fieldset>
      <fieldset className="be-targets" data-targets="weapon-types">
        <legend className="field-label">{m.dev_buildings_repair_weapon_types()}</legend>
        {list.weaponTypes.map((type) => (
          <CheckField
            key={type.id}
            label={type.name[locale]}
            checked={rule.weaponTypes.includes(type.id)}
            onChange={(on) =>
              put({
                ...rule,
                weaponTypes: toggleIn(
                  rule.weaponTypes,
                  type.id,
                  on,
                  list.weaponTypes.map((entryType) => entryType.id),
                ),
              })
            }
          />
        ))}
      </fieldset>
      <p className="field-label">{m.dev_buildings_repair_materials()}</p>
      <ul className="be-materials">
        {rule.materials.map((stack, line) => (
          <li key={`${stack.item}-${line}`} className="be-material" data-item={stack.item}>
            <SelectField
              label={m.dev_buildings_field_item()}
              path={`repair[${index}].materials[${line}].item`}
              hideLabel={line > 0}
              className="be-material-item"
              value={stack.item}
              options={materialOptions(items, locale, stack.item)}
              onChange={(item) =>
                put({
                  ...rule,
                  materials: rule.materials.map((current, at) =>
                    at === line ? { ...current, item } : current,
                  ),
                })
              }
            />
            <NumberField
              label={m.dev_buildings_field_base_qty()}
              path={`repair[${index}].materials[${line}].qty`}
              hideLabel={line > 0}
              className="be-material-qty"
              value={stack.qty}
              min={FACILITY_REPAIR_LIMITS.qty.min}
              max={FACILITY_REPAIR_LIMITS.qty.max}
              onChange={(qty) => {
                if (qty !== undefined)
                  put({
                    ...rule,
                    materials: rule.materials.map((current, at) =>
                      at === line ? { ...current, qty } : current,
                    ),
                  });
              }}
            />
            {rule.materials.length > 1 ? (
              <RemoveButton
                name={nameOf(stack.item)}
                onClick={() => put({ ...rule, materials: rule.materials.filter((_, at) => at !== line) })}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {rule.materials.length < FACILITY_REPAIR_LIMITS.materials && pickable[0] ? (
        <button
          type="button"
          className="be-add-material"
          onClick={() => {
            const unused = pickable.find((item) => !rule.materials.some((stack) => stack.item === item.id));
            const item = unused ?? pickable[0];
            if (item) put({ ...rule, materials: [...rule.materials, { item: item.id, qty: 1 }] });
          }}
        >
          {m.dev_buildings_add_material()}
        </button>
      ) : null}
    </section>
  );
}

export function BuildingRepair({
  list,
  entry,
  locale,
  onEdit,
}: {
  list: BuildingEditorListResponse;
  entry: FacilityJson;
  locale: "ko" | "en";
  onEdit: (next: FacilityJson) => void;
}) {
  const rules = entry.repair ?? [];
  const fresh = newRepairRule(list.items);
  return (
    <FormSection
      name="repair"
      className="be-section"
      title={m.dev_buildings_section_repair()}
      desc={m.dev_buildings_repair_hint()}
      source="D-512 323"
      paths={["repair"]}
    >
      {rules.length === 0 ? <p className="field-hint">{m.dev_buildings_no_repair()}</p> : null}
      <div className="be-bands">
        {rules.map((rule, index) => (
          <RuleEditor
            // 줄은 차례가 뜻이다(위에서부터 첫 맞는 줄)
            key={index}
            entry={entry}
            index={index}
            rule={rule}
            list={list}
            locale={locale}
            onEdit={onEdit}
          />
        ))}
      </div>
      {rules.length < FACILITY_REPAIR_LIMITS.rules && fresh ? (
        <button
          type="button"
          className="be-add-repair"
          onClick={() => onEdit(setRepair(entry, [...rules, fresh]))}
        >
          {m.dev_buildings_add_repair_rule()}
        </button>
      ) : null}
    </FormSection>
  );
}
