// 소모품·신선도 칸(설계안 2.5·3.4) — 사용 효과 줄(효과 사전에서 골라 값·확률‰·지속, 스킬 효과와 같은 모양 D-425. 실행은 WP-6),
// 줄마다 효과 사전 정보 한 문장(종류·대상 수치·값 방식·실효 지속·중첩, 설계안 3.5), 신선도(유통기한 일·시간과 0이 되면 바뀌는 아이템,
// D-496 288: 아이템마다 고른다).
import { ITEM_LIMITS, type ItemEditorListResponse, type ItemJson } from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { EffectRows } from "../content/contentEditorEffects.tsx";
import { CheckField, NumberField, SelectField } from "../content/contentEditorFields.tsx";
import { fieldHint } from "./ItemForm.tsx";
import { effectSentence } from "./itemMessages.ts";
import { shelfMs, shelfParts } from "./itemModel.ts";

type Problem = (path: string) => string | undefined;

/** 기본 유통기한(7일, 처음 켤 때) */
const DEFAULT_SHELF_MS = 7 * 24 * 3_600_000;

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
