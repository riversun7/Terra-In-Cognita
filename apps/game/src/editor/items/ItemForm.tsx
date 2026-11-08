// 아이템 편집 칸 — 기본(ID·이름·설명·켜기), 분류(대분류·중분류·태그), 값·무게·거래(티어·시작 시세와 그 옆 지금 세계 시세·무게·스택·
// 거래 가능·계정 귀속·보관 창고·거래 방식). 시작 시세(295)는 시장이 처음 열릴 때의 첫 가격으로만 쓰고, 그 뒤 값은 시장 시세다.
// 대분류별 묶음(장비·무기·소모품·신선도)은 ItemEquipFields·ItemWeaponFields·ItemUseFields. 구역은 접힌다(details).
// 칸마다 범위는 @terra/shared ITEM_LIMITS(서버가 다시 본다), 쓰는 곳 칩은 ITEM_FIELD_USES(설계안 3.4).
import {
  ITEM_CATEGORY_IDS,
  ITEM_FIELD_USES,
  ITEM_LIMITS,
  type ItemCategoryId,
  type ItemEditorListResponse,
  type ItemJson,
  type ItemMarketPrice,
  defaultStorageOf,
  marketKindOf,
} from "@terra/shared/itemEditor";
import type { ReactNode } from "react";
import { m } from "../../paraglide/messages.js";
import { CheckField, NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { FormSection } from "../content/contentEditorLayout.tsx";
import { CATEGORY_TEXT, MARKET_TEXT, STORAGE_TEXT } from "./itemMessages.ts";
import { weightText } from "./itemModel.ts";

const USE_TEXT = {
  combat: m.dev_items_use_combat,
  economy: m.dev_items_use_economy,
  screen: m.dev_items_use_screen,
  none: m.dev_items_use_none,
} as const;

/** 칸 도움말: 쓰는 곳(+ 덧붙일 말) */
export function fieldHint(path: string, extra?: string): string {
  const use = ITEM_FIELD_USES[path] ?? "none";
  const chip = m.dev_items_used_by_chip({ use: USE_TEXT[use]() });
  return extra ? `${chip} · ${extra}` : chip;
}

/** 거래 묶음 칸 풀이(302·D-506): 무게를 알면 묶음 하나의 무게, 아니면 단위 규칙 */
function lotHint(draft: ItemJson): string {
  const lot = draft.lotSize ?? 1;
  return draft.weight !== undefined && draft.weight > 0 && lot > 1
    ? m.dev_items_lot_hint_weight({ size: weightText(lot * draft.weight) })
    : m.dev_items_lot_hint();
}

/** 접히는 구역 하나(공용 FormSection: 제목·쉬운 풀이·출처·담은 칸 수·팩과 다른 칸 수, 2026-11-08 화면 개편) */
export function Section({
  title,
  open = true,
  children,
  name,
  desc,
  source,
  paths,
}: {
  title: string;
  open?: boolean;
  children: ReactNode;
  /** 시험이 고르는 구역 이름(data-section) */
  name: string;
  desc?: string | undefined;
  source?: string | undefined;
  /** 이 구역의 칸 경로 앞머리 */
  paths?: readonly string[] | undefined;
}) {
  return (
    <FormSection
      title={title}
      open={open}
      name={name}
      desc={desc}
      source={source}
      paths={paths}
      className="ie-section"
    >
      {children}
    </FormSection>
  );
}

/** 시세 값 하나(없으면 "없음") */
const priceText = (value: string | null): string => value ?? m.dev_items_world_price_no_value();

/** 지금 세계 시세(읽기만): 도시 시장마다 마지막 체결가·사는 값·파는 값. 서버 거래소가 없으면 "시세 없음" */
function MarketPrice({ markets }: { markets: readonly ItemMarketPrice[] | null }) {
  return (
    <div className="field" data-part="market-price">
      <span className="field-label">{m.dev_items_world_price_label()}</span>
      {markets && markets.length > 0 ? (
        <ul className="ie-plain">
          {markets.map((row) => (
            <li key={`${row.city}|${row.currency}`}>
              {m.dev_items_world_price_row({
                city: row.city,
                last: priceText(row.lastPrice),
                bid: priceText(row.bestBid),
                ask: priceText(row.bestAsk),
                currency: row.currency,
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ie-readonly">{m.dev_items_world_price_none()}</p>
      )}
    </div>
  );
}

export function ItemBasicSections({
  draft,
  onChange,
  onCategory,
  list,
  locale,
  categoryLocked,
  problem,
  markets,
}: {
  draft: ItemJson;
  onChange: (next: ItemJson) => void;
  /** 대분류 바꾸기(맞지 않는 묶음을 빼니 화면이 먼저 묻는다) */
  onCategory: (category: ItemCategoryId) => void;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  /** 팩 항목이면 대분류를 잠근다(팩 커밋으로 바꾼다) */
  categoryLocked: boolean;
  problem: (path: string) => string | undefined;
  /** 지금 세계의 시장 시세(서버 items.get, 빈 목록·null = 시세 없음) */
  markets: readonly ItemMarketPrice[] | null;
}) {
  const L = ITEM_LIMITS;
  const description = draft.description ?? { ko: "", en: "" };
  const subcategories = list.subcategories.filter((row) => row.entry.major === draft.category);
  const sub = subcategories.find((row) => row.entry.id === draft.subcategory)?.entry;
  const storage = sub?.storage ?? defaultStorageOf(draft.category, sub?.food === true);
  const tags = new Set(draft.tags ?? []);
  const equipment = draft.category === "equipment";
  return (
    <>
      <Section
        title={m.dev_items_section_basic()}
        name="basic"
        desc={m.dev_items_section_basic_desc()}
        paths={["name", "description", "enabled"]}
      >
        <div className="ie-grid">
          <TextField
            label={m.dev_items_field_name_ko()}
            value={draft.name.ko}
            maxLength={L.nameMax}
            path="name.ko"
            problem={problem("name.ko") ?? problem("name")}
            onChange={(ko) => onChange({ ...draft, name: { ...draft.name, ko } })}
          />
          <TextField
            label={m.dev_items_field_name_en()}
            value={draft.name.en}
            maxLength={L.nameMax}
            path="name.en"
            problem={problem("name.en")}
            onChange={(en) => onChange({ ...draft, name: { ...draft.name, en } })}
          />
          <TextField
            label={m.dev_items_field_desc_ko()}
            value={description.ko}
            maxLength={L.nameMax * 2}
            path="description.ko"
            problem={problem("description.ko") ?? problem("description")}
            onChange={(ko) => onChange({ ...draft, description: { ...description, ko } })}
          />
          <TextField
            label={m.dev_items_field_desc_en()}
            value={description.en}
            maxLength={L.nameMax * 2}
            path="description.en"
            problem={problem("description.en")}
            onChange={(en) => onChange({ ...draft, description: { ...description, en } })}
          />
        </div>
        <p className="field-hint ie-note">{m.dev_items_name_rules()}</p>
        <CheckField
          label={m.dev_items_field_enabled()}
          path="enabled"
          checked={draft.enabled}
          hint={fieldHint("enabled", m.dev_items_enabled_hint())}
          onChange={(enabled) => onChange({ ...draft, enabled })}
        />
      </Section>

      <Section
        title={m.dev_items_section_class()}
        name="class"
        desc={m.dev_items_section_class_desc()}
        source="D-487"
        paths={["category", "subcategory", "tags"]}
      >
        <div className="ie-grid">
          {categoryLocked ? (
            <div className="field">
              <span className="field-label">{m.dev_items_field_category()}</span>
              <p className="ie-readonly">
                {CATEGORY_TEXT[draft.category]()}{" "}
                <span className="ie-chip">{m.dev_items_category_locked()}</span>
              </p>
            </div>
          ) : (
            <SelectField
              label={m.dev_items_field_category()}
              value={draft.category}
              options={ITEM_CATEGORY_IDS.map((value) => ({ value, label: CATEGORY_TEXT[value]() }))}
              path="category"
              problem={problem("category")}
              onChange={onCategory}
            />
          )}
          <SelectField
            label={m.dev_items_field_subcategory()}
            value={draft.subcategory ?? ""}
            options={[
              { value: "", label: m.dev_items_none() },
              ...subcategories.map((row) => ({
                value: row.entry.id,
                label: row.entry.enabled
                  ? row.entry.name[locale]
                  : `${row.entry.name[locale]} (${m.dev_items_disabled()})`,
              })),
              ...(draft.subcategory !== undefined &&
              !subcategories.some((row) => row.entry.id === draft.subcategory)
                ? [{ value: draft.subcategory, label: draft.subcategory }]
                : []),
            ]}
            path="subcategory"
            problem={problem("subcategory")}
            onChange={(value) => {
              const { subcategory: _drop, ...rest } = draft;
              onChange(value === "" ? rest : { ...rest, subcategory: value });
            }}
          />
        </div>
        <fieldset className="ie-tags">
          <legend className="field-label">{m.dev_items_field_tags()}</legend>
          {list.tags.length === 0 ? <p className="field-hint">{m.dev_items_tags_empty()}</p> : null}
          {list.tags.map((row) => (
            <label key={row.entry.id} className="ie-tag">
              <input
                type="checkbox"
                checked={tags.has(row.entry.id)}
                onChange={(event) => {
                  const next = new Set(tags);
                  if (event.target.checked) next.add(row.entry.id);
                  else next.delete(row.entry.id);
                  onChange({ ...draft, tags: [...next] });
                }}
              />
              {row.entry.name[locale]}
            </label>
          ))}
          {problem("tags") ? <p className="field-error ce-problem">{problem("tags")}</p> : null}
        </fieldset>
      </Section>

      <Section
        title={m.dev_items_section_value()}
        name="value"
        desc={m.dev_items_section_value_desc()}
        source="295 · D-505 · D-506"
        paths={["tier", "startPrice", "weight", "lotSize", "stackMax", "tradable", "bound"]}
      >
        <div className="ie-grid">
          <NumberField
            label={m.dev_items_field_tier()}
            value={draft.tier}
            min={L.tier.min}
            max={L.tier.max}
            hint={fieldHint("tier")}
            path="tier"
            problem={problem("tier")}
            onChange={(tier) => onChange({ ...draft, tier: tier ?? 0 })}
          />
          <NumberField
            label={m.dev_items_field_start_price()}
            value={draft.startPrice}
            min={L.startPrice.min}
            max={L.startPrice.max}
            hint={fieldHint("startPrice", m.dev_items_start_price_hint())}
            path="startPrice"
            problem={problem("startPrice")}
            onChange={(startPrice) => onChange({ ...draft, startPrice: startPrice ?? 1 })}
          />
          <MarketPrice markets={markets} />
          <NumberField
            label={m.dev_items_field_weight()}
            value={draft.weight}
            min={L.weight.min}
            max={L.weight.max}
            optional
            hint={fieldHint("weight", draft.weight === undefined ? undefined : weightText(draft.weight))}
            path="weight"
            problem={problem("weight")}
            onChange={(weight) => {
              const { weight: _drop, ...rest } = draft;
              onChange(weight === undefined ? rest : { ...rest, weight });
            }}
          />
          <NumberField
            label={m.dev_items_field_lot_size()}
            value={draft.lotSize}
            min={L.lotSize.min}
            max={L.lotSize.max}
            optional
            hint={fieldHint("lotSize", lotHint(draft))}
            path="lotSize"
            problem={problem("lotSize")}
            onChange={(lotSize) => {
              const { lotSize: _drop, ...rest } = draft;
              onChange(lotSize === undefined ? rest : { ...rest, lotSize });
            }}
          />
          {equipment ? (
            <div className="field">
              <span className="field-label">{m.dev_items_field_stack()}</span>
              <p className="ie-readonly">{m.dev_items_stack_equipment()}</p>
            </div>
          ) : (
            <NumberField
              label={m.dev_items_field_stack()}
              value={draft.stackMax}
              min={L.stackMax.min}
              max={L.stackMax.max}
              optional
              hint={fieldHint("stackMax")}
              path="stackMax"
              problem={problem("stackMax")}
              onChange={(stackMax) => {
                const { stackMax: _drop, ...rest } = draft;
                onChange(stackMax === undefined ? rest : { ...rest, stackMax });
              }}
            />
          )}
        </div>
        <CheckField
          label={m.dev_items_field_tradable()}
          checked={draft.bound !== true && draft.tradable !== false}
          hint={fieldHint("tradable", draft.bound === true ? m.dev_items_bound_blocks_trade() : undefined)}
          path="tradable"
          problem={problem("tradable")}
          onChange={(tradable) => {
            if (draft.bound === true) return;
            const { tradable: _drop, ...rest } = draft;
            onChange(tradable ? rest : { ...rest, tradable: false });
          }}
        />
        <CheckField
          label={m.dev_items_field_bound()}
          path="bound"
          checked={draft.bound === true}
          hint={fieldHint("bound", m.dev_items_bound_hint())}
          onChange={(bound) => {
            const { bound: _drop, tradable: _tradable, ...rest } = draft;
            onChange(bound ? { ...rest, bound: true } : rest);
          }}
        />
        <dl className="ie-facts">
          <div>
            <dt>{m.dev_items_field_storage()}</dt>
            <dd>{STORAGE_TEXT[storage]()}</dd>
          </div>
          <div>
            <dt>{m.dev_items_field_market()}</dt>
            <dd>{MARKET_TEXT[marketKindOf(draft)]()}</dd>
          </div>
        </dl>
      </Section>
    </>
  );
}
