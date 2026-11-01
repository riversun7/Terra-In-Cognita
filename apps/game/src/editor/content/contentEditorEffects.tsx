// 효과 줄 편집(스킬 특수 효과·아이템 사용 효과, 같은 모양 D-425) — 효과 사전에서 골라 확률·지속·세기. 줄마다 더하기·빼기.
// 범위는 팩 스키마와 같다(서버가 다시 본다). 꺼진 효과는 고르기 창에 "(꺼짐)"을 붙인다.
import { m } from "../../paraglide/messages.js";
import { NumberField, RemoveButton, SelectField } from "./contentEditorFields.tsx";

/** 효과 줄 하나(스킬 effects·아이템 use.effects) */
export interface EffectRowJson {
  readonly effect: string;
  readonly value: number;
  readonly chancePm: number;
  readonly durationMs?: number | undefined;
}

/** 효과 사전 한 줄(고르기 창) */
export interface EffectChoice {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly kind: "buff" | "debuff" | "dot" | "heal" | "status";
  readonly enabled: boolean;
}

/** 효과 줄 범위(팩 스키마와 같다) */
export const EFFECT_ROW_LIMITS = {
  chancePm: { min: 0, max: 1000 },
  durationMs: { min: 0, max: 3_600_000 },
  value: { min: -1_000_000, max: 1_000_000 },
} as const;

const KIND_TEXT: Readonly<Record<EffectChoice["kind"], () => string>> = {
  buff: m.dev_content_effect_kind_buff,
  debuff: m.dev_content_effect_kind_debuff,
  dot: m.dev_content_effect_kind_dot,
  heal: m.dev_content_effect_kind_heal,
  status: m.dev_content_effect_kind_status,
};

export function effectKindText(kind: EffectChoice["kind"]): string {
  return KIND_TEXT[kind]();
}

/** 효과 고르기 칸 목록(지금 값이 사전에 없으면 맨 앞에 그대로) */
export function effectOptions(effects: readonly EffectChoice[], locale: "ko" | "en", current: string) {
  const list = effects.map((effect) => ({
    value: effect.id,
    label: m.dev_content_effect_option({
      name: effect.enabled ? effect.name[locale] : `${effect.name[locale]} (${m.dev_content_disabled()})`,
      kind: effectKindText(effect.kind),
    }),
  }));
  return list.some((option) => option.value === current)
    ? list
    : [{ value: current, label: current }, ...list];
}

const replaceAt = <T,>(list: readonly T[], index: number, item: T): T[] =>
  list.map((entry, i) => (i === index ? item : entry));
const removeAt = <T,>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);

/**
 * 효과 줄 목록 편집. classes: 화면마다 칸 모양 이름(스킬 편집기는 sk-section 등, 시험이 고른다). legend = 칸 묶음 제목,
 * problemOf(줄 번호, 칸) = 그 칸의 서버 검사 문구
 */
export function EffectRows({
  legend,
  rows,
  onChange,
  effects,
  locale,
  max,
  classes = {
    section: "ce-section",
    title: "ce-section-title",
    rows: "ce-rows",
    row: "ce-effect-row",
    add: "ce-add",
  },
  problemOf,
}: {
  legend: string;
  rows: readonly EffectRowJson[];
  onChange: (rows: EffectRowJson[]) => void;
  effects: readonly EffectChoice[];
  locale: "ko" | "en";
  max: number;
  classes?: { section: string; title: string; rows: string; row: string; add: string };
  problemOf?: (index: number, field: "effect" | "value" | "chancePm" | "durationMs") => string | undefined;
}) {
  const firstEffect = effects.find((effect) => effect.enabled)?.id ?? effects[0]?.id ?? "burn";
  const L = EFFECT_ROW_LIMITS;
  return (
    <fieldset className={classes.section}>
      <legend className={classes.title}>{legend}</legend>
      <ul className={classes.rows}>
        {rows.map((part, index) => (
          <li key={index} className={classes.row}>
            <SelectField
              label={m.dev_content_field_effect()}
              value={part.effect}
              options={effectOptions(effects, locale, part.effect)}
              problem={problemOf?.(index, "effect")}
              onChange={(effect) => onChange(replaceAt(rows, index, { ...part, effect }))}
            />
            <NumberField
              label={m.dev_content_field_chance()}
              value={part.chancePm}
              min={L.chancePm.min}
              max={L.chancePm.max}
              problem={problemOf?.(index, "chancePm")}
              onChange={(chancePm) => onChange(replaceAt(rows, index, { ...part, chancePm: chancePm ?? 0 }))}
            />
            <NumberField
              label={m.dev_content_field_duration()}
              value={part.durationMs}
              min={L.durationMs.min}
              max={L.durationMs.max}
              optional
              problem={problemOf?.(index, "durationMs")}
              onChange={(durationMs) => {
                const { durationMs: _drop, ...rest } = part;
                onChange(replaceAt(rows, index, durationMs === undefined ? rest : { ...rest, durationMs }));
              }}
            />
            <NumberField
              label={m.dev_content_field_magnitude()}
              value={part.value}
              min={L.value.min}
              max={L.value.max}
              problem={problemOf?.(index, "value")}
              onChange={(value) => onChange(replaceAt(rows, index, { ...part, value: value ?? 0 }))}
            />
            <RemoveButton name={part.effect} onClick={() => onChange(removeAt(rows, index))} />
          </li>
        ))}
      </ul>
      {rows.length < max ? (
        <button
          type="button"
          className={`button-small ${classes.add}`}
          onClick={() => onChange([...rows, { effect: firstEffect, value: 0, chancePm: 1000 }])}
        >
          {m.dev_content_add_effect()}
        </button>
      ) : null}
    </fieldset>
  );
}
