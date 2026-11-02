// 소모품·신선도 칸(설계안 2.5·3.4) — 사용 효과 줄(효과 사전에서 골라 값·확률‰·지속, 스킬 효과와 같은 모양 D-425), 줄마다 효과량 칸
// (D-496 286·D-501: 비례 스탯·적정 스탯·±오차, WP-6), 줄마다 효과 사전 정보 한 문장(종류·대상 수치·값 방식·실효 지속·중첩, 설계안 3.5),
// 신선도(유통기한 일·시간과 0이 되면 바뀌는 아이템, D-496 288: 아이템마다 고른다). 실제로 먹고·쓰고·썩는 실행은 보유 물건 뒤 소비 줄기다.
import {
  ITEM_LIMITS,
  ITEM_PRIMARY_CODES,
  type ItemEditorListResponse,
  type ItemEffectJson,
  type ItemJson,
  type ItemPrimaryCode,
} from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { EffectRows } from "../content/contentEditorEffects.tsx";
import { CheckField, NumberField, SelectField } from "../content/contentEditorFields.tsx";
import { fieldHint } from "./ItemForm.tsx";
import { PRIMARY_TEXT, effectSentence } from "./itemMessages.ts";
import { shelfMs, shelfParts } from "./itemModel.ts";
import "./itemEditorTabs.css";

type Problem = (path: string) => string | undefined;

/** 기본 유통기한(7일, 처음 켤 때) */
const DEFAULT_SHELF_MS = 7 * 24 * 3_600_000;

/** 비례 스탯을 처음 고를 때 적정 스탯(입력 시작값: 기준 유닛 1차 10이면 1000‰. 값은 아이템마다 편집기에서 정한다) */
const DEFAULT_APPROPRIATE = 10;

/** 효과 줄 하나의 효과량 칸을 바꾼다(빈 칸은 뺀다) */
function withScale(row: ItemEffectJson, stat: ItemPrimaryCode | null, appropriate: number): ItemEffectJson {
  const { scale: _drop, ...rest } = row;
  return stat === null ? rest : { ...rest, scale: { stat, appropriate } };
}

/**
 * 효과 줄마다 효과량 칸(D-496 286, D-501): 비례 스탯·적정 스탯·±오차‰(250~500, 비우면 설정 칸 d496_use_variance). 셈한 범위는
 * 미리 보기 판이 보인다.
 * 공용 효과 줄 편집(contentEditorEffects)은 스킬과 같이 쓰므로 그대로 두고 여기 따로 둔다
 */
function ScaleRows({
  rows,
  names,
  problem,
  onChange,
}: {
  rows: readonly ItemEffectJson[];
  names: ReadonlyMap<string, string>;
  problem: Problem;
  onChange: (next: ItemEffectJson[]) => void;
}) {
  const L = ITEM_LIMITS;
  const replace = (index: number, next: ItemEffectJson) =>
    onChange(rows.map((row, at) => (at === index ? next : row)));
  return (
    <fieldset className="ie-sub" data-part="use-scale">
      <legend className="field-label">{m.dev_items_use_scale_title()}</legend>
      <p className="field-hint">{fieldHint("use", m.dev_items_use_scale_hint())}</p>
      <ul className="ie-scale-rows">
        {rows.map((row, index) => (
          <li key={`${index}-${row.effect}`} className="ie-scale-row">
            <span className="field-label">
              {m.dev_items_use_scale_row({ effect: names.get(row.effect) ?? row.effect })}
            </span>
            <SelectField
              label={m.dev_items_field_scale_stat()}
              value={row.scale?.stat ?? ""}
              options={[
                { value: "", label: m.dev_items_scale_none() },
                ...ITEM_PRIMARY_CODES.map((code) => ({ value: code, label: PRIMARY_TEXT[code]() })),
              ]}
              problem={problem(`use.effects[${index}].scale`)}
              onChange={(value) => {
                const stat = ITEM_PRIMARY_CODES.find((code) => code === value) ?? null;
                replace(index, withScale(row, stat, row.scale?.appropriate ?? DEFAULT_APPROPRIATE));
              }}
            />
            {row.scale ? (
              <NumberField
                label={m.dev_items_field_scale_appropriate()}
                value={row.scale.appropriate}
                min={L.useAppropriate.min}
                max={L.useAppropriate.max}
                problem={problem(`use.effects[${index}].scale.appropriate`)}
                onChange={(value) =>
                  replace(index, withScale(row, row.scale?.stat ?? null, value ?? L.useAppropriate.min))
                }
              />
            ) : (
              <span />
            )}
            <NumberField
              label={m.dev_items_field_variance()}
              value={row.variancePm}
              min={L.variancePm.min}
              max={L.variancePm.max}
              optional
              problem={problem(`use.effects[${index}].variancePm`)}
              onChange={(value) => {
                const { variancePm: _drop, ...rest } = row;
                replace(index, value === undefined ? rest : { ...rest, variancePm: value });
              }}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function ItemUseFields({
  draft,
  onChange,
  list,
  locale,
  problem,
}: {
  draft: ItemJson;
  onChange: (next: ItemJson) => void;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  problem: Problem;
}) {
  const rows = draft.use?.effects ?? [];
  const effects = new Map(list.effects.map((effect) => [effect.id, effect]));
  const statNames = new Map(list.statRows.map((row) => [row.id, row.name[locale]]));
  return (
    <>
      <p className="field-hint">{fieldHint("use", m.dev_items_use_hint())}</p>
      <EffectRows
        legend={m.dev_items_field_use_effects()}
        rows={rows}
        effects={list.effects}
        locale={locale}
        max={ITEM_LIMITS.effectsMax}
        classes={{
          section: "ie-sub",
          title: "field-label",
          rows: "ie-rows",
          row: "ce-effect-row",
          add: "ie-add",
        }}
        problemOf={(index, field) =>
          problem(`use.effects[${index}].${field}`) ??
          (field === "effect" ? problem(`use.effects[${index}]`) : undefined)
        }
        onChange={(next) => {
          const { use: _drop, ...rest } = draft;
          onChange(next.length === 0 ? rest : { ...rest, use: { effects: next } });
        }}
      />
      {problem("use.effects") ? <p className="field-error ce-problem">{problem("use.effects")}</p> : null}
      {rows.length > 0 ? (
        <ScaleRows
          rows={rows}
          names={new Map(list.effects.map((effect) => [effect.id, effect.name[locale]]))}
          problem={problem}
          onChange={(next) => onChange({ ...draft, use: { effects: next } })}
        />
      ) : null}
      {rows.length > 0 ? (
        <ul className="ie-sentences" aria-label={m.dev_items_use_sentences()}>
          {rows.map((row, index) => {
            const effect = effects.get(row.effect);
            return (
              <li key={`${index}-${row.effect}`}>
                {effectSentence(
                  {
                    effect: row.effect,
                    kind: effect?.kind ?? null,
                    stat: effect?.stat ?? null,
                    valueMode: effect?.valueMode ?? null,
                    value: row.value,
                    chancePm: row.chancePm,
                    durationMs: row.durationMs ?? effect?.durationMs ?? null,
                    stacking: effect?.stacking ?? null,
                  },
                  effect?.name[locale] ?? row.effect,
                  statNames,
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

export function ItemPerishFields({
  draft,
  onChange,
  list,
  locale,
  problem,
}: {
  draft: ItemJson;
  onChange: (next: ItemJson) => void;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  problem: Problem;
}) {
  const L = ITEM_LIMITS;
  const perish = draft.perish;
  const targets = list.items.filter((row) => row.id !== draft.id);
  const parts = perish ? shelfParts(perish.shelfLifeMs) : { days: 0, hours: 0 };
  const setShelf = (days: number, hours: number) => {
    if (perish) onChange({ ...draft, perish: { ...perish, shelfLifeMs: shelfMs(days, hours) } });
  };
  return (
    <>
      <CheckField
        label={m.dev_items_field_perish()}
        checked={perish !== undefined}
        hint={fieldHint("perish", m.dev_items_perish_hint())}
        onChange={(on) => {
          const { perish: _drop, ...rest } = draft;
          const spoilsTo = targets[0]?.id;
          onChange(on && spoilsTo ? { ...rest, perish: { shelfLifeMs: DEFAULT_SHELF_MS, spoilsTo } } : rest);
        }}
      />
      {perish ? (
        <div className="ie-grid">
          <NumberField
            label={m.dev_items_field_shelf_days()}
            value={parts.days}
            min={0}
            max={Math.floor(L.shelfLifeMs.max / 86_400_000)}
            problem={problem("perish.shelfLifeMs")}
            onChange={(days) => setShelf(days ?? 0, parts.hours)}
          />
          <NumberField
            label={m.dev_items_field_shelf_hours()}
            value={parts.hours}
            min={0}
            max={23}
            hint={m.dev_items_shelf_range()}
            onChange={(hours) => setShelf(parts.days, hours ?? 0)}
          />
          <SelectField
            label={m.dev_items_field_spoils_to()}
            value={perish.spoilsTo}
            options={[
              ...(targets.some((row) => row.id === perish.spoilsTo)
                ? []
                : [{ value: perish.spoilsTo, label: perish.spoilsTo }]),
              ...targets.map((row) => ({ value: row.id, label: `${row.name[locale]} · ${row.id}` })),
            ]}
            problem={problem("perish.spoilsTo") ?? problem("perish")}
            onChange={(spoilsTo) => onChange({ ...draft, perish: { ...perish, spoilsTo } })}
          />
        </div>
      ) : null}
    </>
  );
}
