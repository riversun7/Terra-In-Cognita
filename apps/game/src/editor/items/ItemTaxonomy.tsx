// 분류 자료 칸(설계안 2.6·3.5) — 중분류(대분류·차례·보관 창고·식품·식재료 계열)·태그·무기 종류(칸·차례)를 고치고 새로 만든다. 고친 것은
// 아이템과 같은 담은 변경 묶음에 들어가 [적용] 한 번에 간다(같은 덮어쓰기 층·판). 팩 항목은 [팩 값으로], 만든 항목은 [지우기](ID 은퇴).
import {
  FOOD_FAMILY_IDS,
  ITEM_CATEGORY_IDS,
  ITEM_LIMITS,
  STORAGE_KIND_IDS,
  type ItemEditorListResponse,
  type ItemTagJson,
  type SubcategoryJson,
  type TaxonomyRow,
  type WeaponTypeJson,
} from "@terra/shared/itemEditor";
import { type ReactNode, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { CheckField, NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { CONTENT_ID_PATTERN, sameJson, suggestId } from "../content/contentEditorModel.ts";
import { CATEGORY_TEXT, FAMILY_TEXT, ORIGIN_TEXT, STORAGE_TEXT } from "./itemMessages.ts";
import type { Stage, Staged, TaxonomyCategory, TaxonomyJson } from "./itemModel.ts";
import "./itemList.css";

type Entry = TaxonomyJson;
type Named = TaxonomyJson;

const TITLE: Readonly<Record<TaxonomyCategory, () => string>> = {
  item_subcategories: m.dev_items_tax_subcategories,
  item_tags: m.dev_items_tax_tags,
  weapon_types: m.dev_items_tax_weapon_types,
};

/** 새 항목 틀(켠 채로: 분류 자료는 그 자체로 세계에 나오지 않는다) */
function templateOf(category: TaxonomyCategory, id: string, name: { ko: string; en: string }): Named {
  if (category === "item_subcategories")
    return { id, name, major: "raw", enabled: true } satisfies SubcategoryJson;
  if (category === "weapon_types")
    return { id, name, slot: "weapon", enabled: true } satisfies WeaponTypeJson;
  return { id, name, enabled: true } satisfies ItemTagJson;
}

function NewEntryForm({
  taken,
  onCreate,
}: {
  taken: ReadonlySet<string>;
  onCreate: (id: string, name: { ko: string; en: string }) => void;
}) {
  const [ko, setKo] = useState("");
  const [en, setEn] = useState("");
  const [typedId, setTypedId] = useState<string | null>(null);
  const id = typedId ?? suggestId(en, taken);
  const idProblem =
    id === ""
      ? undefined
      : !CONTENT_ID_PATTERN.test(id)
        ? m.dev_items_new_id_invalid()
        : taken.has(id)
          ? m.dev_items_new_id_taken()
          : undefined;
  const ok = id !== "" && idProblem === undefined && ko.trim() !== "" && en.trim() !== "";
  return (
    <div className="ie-new-row">
      <TextField
        label={m.dev_items_field_name_ko()}
        value={ko}
        maxLength={ITEM_LIMITS.nameMax}
        onChange={setKo}
      />
      <TextField
        label={m.dev_items_field_name_en()}
        value={en}
        maxLength={ITEM_LIMITS.nameMax}
        onChange={setEn}
      />
      <TextField
        label={m.dev_items_field_id()}
        value={id}
        maxLength={48}
        problem={idProblem}
        onChange={setTypedId}
      />
      <button
        type="button"
        className="button-small button-primary"
        aria-disabled={!ok}
        onClick={
          ok
            ? () => {
                onCreate(id, { ko: ko.trim(), en: en.trim() });
                setKo("");
                setEn("");
                setTypedId(null);
              }
            : undefined
        }
      >
        {m.dev_items_create()}
      </button>
    </div>
  );
}

function SubcategoryFields({
  draft,
  onChange,
}: {
  draft: SubcategoryJson;
  onChange: (next: SubcategoryJson) => void;
}) {
  return (
    <div className="ie-grid">
      <SelectField
        label={m.dev_items_field_category()}
        value={draft.major}
        options={ITEM_CATEGORY_IDS.map((value) => ({ value, label: CATEGORY_TEXT[value]() }))}
        onChange={(major) => onChange({ ...draft, major })}
      />
      <NumberField
        label={m.dev_items_field_order()}
        value={draft.order}
        min={ITEM_LIMITS.order.min}
        max={ITEM_LIMITS.order.max}
        optional
        onChange={(order) => {
          const { order: _drop, ...rest } = draft;
          onChange(order === undefined ? rest : { ...rest, order });
        }}
      />
      <SelectField
        label={m.dev_items_field_storage()}
        value={draft.storage ?? ""}
        options={[
          { value: "", label: m.dev_items_storage_default() },
          ...STORAGE_KIND_IDS.map((value) => ({ value, label: STORAGE_TEXT[value]() })),
        ]}
        onChange={(value) => {
          const storage = STORAGE_KIND_IDS.find((item) => item === value);
          const { storage: _drop, ...rest } = draft;
          onChange(storage ? { ...rest, storage } : rest);
        }}
      />
      <CheckField
        label={m.dev_items_field_food()}
        checked={draft.food === true}
        onChange={(food) => {
          const { food: _drop, foodFamily: _f, ...rest } = draft;
          onChange(food ? { ...rest, food: true } : rest);
        }}
      />
      {draft.food === true ? (
        <SelectField
          label={m.dev_items_field_food_family()}
          value={draft.foodFamily ?? ""}
          options={[
            { value: "", label: m.dev_items_none() },
            ...FOOD_FAMILY_IDS.map((value) => ({ value, label: FAMILY_TEXT[value]() })),
          ]}
          onChange={(value) => {
            const foodFamily = FOOD_FAMILY_IDS.find((item) => item === value);
            const { foodFamily: _drop, ...rest } = draft;
            onChange(foodFamily ? { ...rest, foodFamily } : rest);
          }}
        />
      ) : null}
    </div>
  );
}

function WeaponTypeFields({
  draft,
  onChange,
}: {
  draft: WeaponTypeJson;
  onChange: (next: WeaponTypeJson) => void;
}) {
  return (
    <div className="ie-grid">
      <SelectField
        label={m.dev_items_field_slot()}
        value={draft.slot}
        options={[
          { value: "weapon", label: m.roster_slot_weapon() },
          { value: "offhand", label: m.roster_slot_offhand() },
        ]}
        onChange={(slot) => onChange({ ...draft, slot })}
      />
      <NumberField
        label={m.dev_items_field_order()}
        value={draft.order}
        min={ITEM_LIMITS.order.min}
        max={ITEM_LIMITS.order.max}
        optional
        onChange={(order) => {
          const { order: _drop, ...rest } = draft;
          onChange(order === undefined ? rest : { ...rest, order });
        }}
      />
    </div>
  );
}

const isSubcategory = (value: Named): value is SubcategoryJson => "major" in value;
const isWeaponType = (value: Named): value is WeaponTypeJson => "slot" in value;

function Section({
  category,
  rows,
  staged,
  taken,
  locale,
  onStage,
}: {
  category: TaxonomyCategory;
  rows: readonly TaxonomyRow<Entry>[];
  staged: ReadonlyMap<string, Staged<Named>>;
  taken: ReadonlySet<string>;
  locale: "ko" | "en";
  onStage: (category: TaxonomyCategory, id: string, next: Staged<Named> | null) => void;
}) {
  const headingId = useId();
  const created = [...staged].filter(
    ([id, item]) => item.base === null && !rows.some((row) => row.entry.id === id),
  );
  const all: { id: string; row: TaxonomyRow<Entry> | null }[] = [
    ...rows.map((row) => ({ id: row.entry.id, row })),
    ...created.map(([id]) => ({ id, row: null })),
  ];
  const put = (row: TaxonomyRow<Entry> | null, next: Named) => {
    const base = row?.entry ?? null;
    onStage(
      category,
      next.id,
      base !== null && sameJson(next, base)
        ? null
        : { op: "put", entry: next, base, baseHash: row?.hash ?? null },
    );
  };
  const fields = (draft: Named, onChange: (next: Named) => void): ReactNode => {
    if (isSubcategory(draft)) return <SubcategoryFields draft={draft} onChange={onChange} />;
    if (isWeaponType(draft)) return <WeaponTypeFields draft={draft} onChange={onChange} />;
    return null;
  };
  return (
    <section className="ie-panel ie-tax" aria-labelledby={headingId} data-category={category}>
      <h2 id={headingId} className="ie-heading">
        {TITLE[category]()} <span className="ie-dim">{all.length}</span>
      </h2>
      {all.length === 0 ? <p className="field-hint">{m.dev_items_tax_empty()}</p> : null}
      <ul className="ie-tax-list">
        {all.map(({ id, row }) => {
          const stagedRow = staged.get(id);
          const reverting = stagedRow?.op === "revert";
          const draft = stagedRow?.entry ?? row?.entry;
          if (!draft) return null;
          return (
            <li key={id}>
              <details className="ie-tax-row" data-entry={id} data-staged={stagedRow ? "" : undefined}>
                <summary>
                  <span>{draft.name[locale]}</span> <span className="ie-dim">{id}</span>
                  {row && row.origin !== "pack" ? (
                    <span className={`ie-chip ie-origin-${row.origin}`}>{ORIGIN_TEXT[row.origin]()}</span>
                  ) : null}
                  {row ? null : <span className="ie-chip ie-origin-created">{ORIGIN_TEXT.created()}</span>}
                  {stagedRow ? (
                    <span className="ie-chip ie-chip-staged">
                      {reverting ? m.dev_items_revert_staged() : m.dev_items_staged_chip()}
                    </span>
                  ) : null}
                  {draft.enabled ? null : <span className="ie-chip">{m.dev_items_disabled()}</span>}
                </summary>
                {reverting ? (
                  <button type="button" className="button-small" onClick={() => onStage(category, id, null)}>
                    {m.dev_items_unstage()}
                  </button>
                ) : (
                  <div className="ie-tax-body">
                    <div className="ie-grid">
                      <TextField
                        label={m.dev_items_field_name_ko()}
                        value={draft.name.ko}
                        maxLength={ITEM_LIMITS.nameMax}
                        onChange={(ko) => put(row, { ...draft, name: { ...draft.name, ko } })}
                      />
                      <TextField
                        label={m.dev_items_field_name_en()}
                        value={draft.name.en}
                        maxLength={ITEM_LIMITS.nameMax}
                        onChange={(en) => put(row, { ...draft, name: { ...draft.name, en } })}
                      />
                    </div>
                    <CheckField
                      label={m.dev_items_field_enabled()}
                      checked={draft.enabled}
                      onChange={(enabled) => put(row, { ...draft, enabled })}
                    />
                    {fields(draft, (next) => put(row, next))}
                    <div className="ie-inline-actions">
                      {stagedRow ? (
                        <button
                          type="button"
                          className="button-small"
                          onClick={() => onStage(category, id, null)}
                        >
                          {m.dev_items_unstage()}
                        </button>
                      ) : null}
                      {row && row.origin !== "pack" ? (
                        <button
                          type="button"
                          className="button-small"
                          onClick={() =>
                            onStage(category, id, {
                              op: "revert",
                              entry: null,
                              base: row.entry,
                              baseHash: row.hash,
                            })
                          }
                        >
                          {row.origin === "created" ? m.dev_items_delete() : m.dev_items_revert()}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </details>
            </li>
          );
        })}
      </ul>
      <details className="ie-tax-new">
        <summary>{m.dev_items_tax_new()}</summary>
        <NewEntryForm
          taken={taken}
          onCreate={(id, name) =>
            onStage(category, id, {
              op: "put",
              entry: templateOf(category, id, name),
              base: null,
              baseHash: null,
            })
          }
        />
      </details>
    </section>
  );
}

export function ItemTaxonomy({
  list,
  stage,
  locale,
  onStage,
}: {
  list: ItemEditorListResponse;
  stage: Stage;
  locale: "ko" | "en";
  onStage: (category: TaxonomyCategory, id: string, next: Staged<Named> | null) => void;
}) {
  const takenOf = (category: TaxonomyCategory, rows: readonly TaxonomyRow<Entry>[]) =>
    new Set([...rows.map((row) => row.entry.id), ...list.retired[category], ...stage[category].keys()]);
  return (
    <div className="ie-tax-grid">
      <Section
        category="item_subcategories"
        rows={list.subcategories}
        staged={stage.item_subcategories}
        taken={takenOf("item_subcategories", list.subcategories)}
        locale={locale}
        onStage={onStage}
      />
      <Section
        category="weapon_types"
        rows={list.weaponTypes}
        staged={stage.weapon_types}
        taken={takenOf("weapon_types", list.weaponTypes)}
        locale={locale}
        onStage={onStage}
      />
      <Section
        category="item_tags"
        rows={list.tags}
        staged={stage.item_tags}
        taken={takenOf("item_tags", list.tags)}
        locale={locale}
        onStage={onStage}
      />
    </div>
  );
}
