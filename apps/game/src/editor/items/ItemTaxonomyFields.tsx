// 분류 자료 칸 부품 — 중분류 칸(대분류·차례·보관 창고·식품·식재료 계열)·무기 종류 칸(칸·차례·탄약 종류), 새 항목 칸, 태그 판(줄무늬 목록).
// 칸은 path를 달아 편집 판 견주기(CompareProvider)에 든다. 고친 것은 아이템과 같은 담은 변경 묶음에 들어가 [적용] 한 번에 간다.
// 팩 항목은 [팩 값으로], 만든 항목은 [지우기](ID 은퇴). 나무·고른 마디는 ItemTaxonomy(2026-11-09 분류 나무).
import {
  FOOD_FAMILY_IDS,
  ITEM_CATEGORY_IDS,
  ITEM_LIMITS,
  STORAGE_KIND_IDS,
  type ItemCategoryId,
  type ItemTagJson,
  type SubcategoryJson,
  type TaxonomyRow,
  type WeaponTypeJson,
} from "@terra/shared/itemEditor";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { CheckField, NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { CONTENT_ID_PATTERN, sameJson, suggestId } from "../content/contentEditorModel.ts";
import { CATEGORY_TEXT, FAMILY_TEXT, ORIGIN_TEXT, STORAGE_TEXT } from "./itemMessages.ts";
import type { Staged, TaxonomyCategory, TaxonomyJson } from "./itemModel.ts";
import "./itemList.css";

type Entry = TaxonomyJson;
type Named = TaxonomyJson;

/**
 * 새 항목 틀(켠 채로: 분류 자료는 그 자체로 세계에 나오지 않는다). 나무의 자리에서 만들면 그 자리 값이 들어간다:
 * 대분류 마디의 새 중분류 = 그 대분류(major), 중분류 마디의 새 무기 종류 = 그 중분류의 칸(slot)
 */
export function templateOf(
  category: TaxonomyCategory,
  id: string,
  name: { ko: string; en: string },
  at?: { readonly major?: ItemCategoryId | undefined; readonly slot?: WeaponTypeJson["slot"] | undefined },
): Named {
  if (category === "item_subcategories")
    return { id, name, major: at?.major ?? "raw", enabled: true } satisfies SubcategoryJson;
  if (category === "weapon_types")
    return { id, name, slot: at?.slot ?? "weapon", enabled: true } satisfies WeaponTypeJson;
  return { id, name, enabled: true } satisfies ItemTagJson;
}

/** 새 항목 칸(이름 ko·en, 영어 이름에서 ID 제안). 효과 사전 탭도 쓴다 */
export function NewEntryForm({
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

export function SubcategoryFields({
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
        path="major"
        value={draft.major}
        options={ITEM_CATEGORY_IDS.map((value) => ({ value, label: CATEGORY_TEXT[value]() }))}
        onChange={(major) => onChange({ ...draft, major })}
      />
      <NumberField
        label={m.dev_items_field_order()}
        path="order"
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
        path="storage"
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
        path="food"
        checked={draft.food === true}
        onChange={(food) => {
          const { food: _drop, foodFamily: _f, ...rest } = draft;
          onChange(food ? { ...rest, food: true } : rest);
        }}
      />
      {draft.food === true ? (
        <SelectField
          label={m.dev_items_field_food_family()}
          path="foodFamily"
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

export function WeaponTypeFields({
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
        path="slot"
        value={draft.slot}
        options={[
          { value: "weapon", label: m.roster_slot_weapon() },
          { value: "offhand", label: m.roster_slot_offhand() },
        ]}
        onChange={(slot) => {
          // 탄약 종류는 보조 칸만(D-497): 무기 칸으로 바꾸면 뺀다
          const { ammo: _drop, ...rest } = draft;
          onChange(slot === "offhand" ? { ...draft, slot } : { ...rest, slot });
        }}
      />
      <NumberField
        label={m.dev_items_field_order()}
        path="order"
        value={draft.order}
        min={ITEM_LIMITS.order.min}
        max={ITEM_LIMITS.order.max}
        optional
        onChange={(order) => {
          const { order: _drop, ...rest } = draft;
          onChange(order === undefined ? rest : { ...rest, order });
        }}
      />
      {draft.slot === "offhand" ? (
        <CheckField
          label={m.dev_items_field_ammo_type()}
          path="ammo"
          checked={draft.ammo === true}
          hint={m.dev_items_ammo_type_hint()}
          onChange={(on) => {
            const { ammo: _drop, ...rest } = draft;
            onChange(on ? { ...rest, ammo: true } : rest);
          }}
        />
      ) : null}
    </div>
  );
}

/** 줄무늬 목록 + 펼치면 이름·켬 칸 + [새로 만들기](태그 판이 쓴다: 태그는 나무의 단계가 아니다) */
export function TaxonomySection({
  title,
  hint,
  category,
  rows,
  staged,
  taken,
  locale,
  onStage,
}: {
  title: string;
  hint?: string | undefined;
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
  return (
    <section className="ie-panel ie-tax" aria-labelledby={headingId} data-category={category}>
      <h2 id={headingId} className="ie-heading">
        {title} <span className="ie-dim">{all.length}</span>
      </h2>
      {hint ? <p className="field-hint">{hint}</p> : null}
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
