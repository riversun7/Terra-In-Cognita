// 설정 칸 한 줄 — 코드·이름·구조 값·범위 칩, ID·단위·범위, 지금 값·팩 값·차이·범위 막대, 덮어쓰기 정보, [바꾸기]·[되돌리기].
// [바꾸기]는 줄 안에서 값 칸을 펼치고 [담기]로 담은 변경에 넣는다(적용은 화면 아래 막대의 [적용], 한 묶음).
// 시험·측정용 data-*: data-id, data-changed(덮어쓰기 있음), data-staged(담음), data-scope.
import type { TuningEntryView } from "@terra/shared/tuning";
import { type FormEvent, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { SCOPE_TEXT, unitText } from "./tuningMessages.ts";
import {
  type Pending,
  deltaOf,
  formatGloss,
  formatNumber,
  inRange,
  parseValueInput,
  rangePositions,
  stagedValue,
} from "./tuningModel.ts";

export interface TuningRowProps {
  entry: TuningEntryView;
  pending: Pending;
  editing: boolean;
  locale: string;
  onEdit: (id: string | null) => void;
  /** 담기: 새 값(null = 팩 값으로 되돌리기) */
  onStage: (id: string, value: number | null) => void;
  onUnstage: (id: string) => void;
}

function rangeText(entry: TuningEntryView, locale: string): string {
  const n = (value: number) => formatNumber(value, locale);
  if (entry.min !== null && entry.max !== null)
    return m.dev_tuning_range({ min: n(entry.min), max: n(entry.max) });
  if (entry.min !== null) return m.dev_tuning_range_min({ min: n(entry.min) });
  if (entry.max !== null) return m.dev_tuning_range_max({ max: n(entry.max) });
  return m.dev_tuning_no_range();
}

/** 값 + 풀이(예: 600,000 · 10분) */
function ValueText({ value, entry, locale }: { value: number; entry: TuningEntryView; locale: string }) {
  const gloss = formatGloss(value, entry.unit, locale);
  return (
    <>
      <strong className="tp-number">{formatNumber(value, locale)}</strong>
      {gloss ? <span className="tp-gloss">{gloss}</span> : null}
    </>
  );
}

interface EditorProps {
  entry: TuningEntryView;
  start: number;
  locale: string;
  onStage: (value: number) => void;
  onCancel: () => void;
}

function RowEditor({ entry, start, locale, onStage, onCancel }: EditorProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [text, setText] = useState(String(start));
  const [problem, setProblem] = useState<string | null>(null);
  const value = parseValueInput(text);
  const preview = value === null ? null : formatGloss(value, entry.unit, locale);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (value === null) return setProblem(m.dev_tuning_value_invalid());
    if (!inRange(entry, value)) return setProblem(m.dev_tuning_value_out_of_range());
    onStage(value);
  };
  return (
    <form className="tp-editor" onSubmit={submit} noValidate>
      <label className="field-label" htmlFor={inputId}>
        {m.dev_tuning_value_label()}
      </label>
      <div className="tp-editor-line">
        <input
          id={inputId}
          className="input tp-input"
          inputMode="numeric"
          autoComplete="off"
          // 바꾸기를 누른 사람이 바로 값을 넣게(줄 안에서 펼친 칸)
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- 누른 [바꾸기] 바로 아래에 펼친 칸이라 초점을 옮긴다
          autoFocus
          value={text}
          aria-invalid={problem !== null}
          aria-describedby={problem ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
        />
        <button type="submit" className="button-primary button-small tp-stage">
          {m.dev_tuning_stage()}
        </button>
        <button type="button" className="button-small" onClick={onCancel}>
          {m.dev_tuning_cancel()}
        </button>
      </div>
      <p id={hintId} className="field-hint">
        {m.dev_tuning_value_hint({ unit: unitText(entry.unit) })} · {rangeText(entry, locale)}
        {preview ? ` · ${preview}` : ""}
      </p>
      {problem ? (
        <p id={errorId} className="field-error" role="alert">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

export function TuningRow({ entry, pending, editing, locale, onEdit, onStage, onUnstage }: TuningRowProps) {
  const staged = pending.has(entry.id);
  const target = stagedValue(entry, pending);
  const delta = deltaOf(entry.value, entry.packValue);
  const positions = rangePositions(entry, entry.value);
  const scope = SCOPE_TEXT[entry.scope];
  const override = entry.override;
  const changed = override !== null;
  const when = (ms: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(ms);
  const sign = delta.diff > 0 ? "up" : delta.diff < 0 ? "down" : "same";
  return (
    <li
      className="tp-row"
      data-id={entry.id}
      data-changed={changed ? "" : undefined}
      data-staged={staged ? "" : undefined}
      data-scope={entry.scope}
    >
      <div className="tp-row-head">
        <span className="tp-code">{entry.code === "" ? "—" : entry.code}</span>
        <span className="tp-name">{locale === "en" ? entry.name.en : entry.name.ko}</span>
        {entry.structural ? (
          <span className="tp-chip tp-chip-structural">{m.dev_tuning_structural()}</span>
        ) : null}
        <span className="tp-chip tp-scope" data-scope={entry.scope} title={scope.hint()}>
          {scope.label()}
        </span>
      </div>
      <p className="tp-row-meta">
        <code className="tp-id">{entry.id}</code>
        <span>{unitText(entry.unit)}</span>
        <span>{rangeText(entry, locale)}</span>
      </p>
      <div className="tp-values">
        <span className="tp-value tp-value-now">
          <span className="tp-label">{m.dev_tuning_now()}</span>
          <ValueText value={entry.value} entry={entry} locale={locale} />
        </span>
        <span className="tp-value tp-value-pack">
          <span className="tp-label">{m.dev_tuning_pack_value()}</span>
          <ValueText value={entry.packValue} entry={entry} locale={locale} />
        </span>
        {changed ? (
          <span className="tp-delta" data-sign={sign}>
            {delta.diff > 0 ? "+" : ""}
            {formatNumber(delta.diff, locale)}
            {delta.percent === null ? "" : ` (${delta.percent > 0 ? "+" : ""}${delta.percent}%)`}
          </span>
        ) : null}
        {staged ? (
          <span className="tp-value tp-value-staged">
            <span className="tp-label">{m.dev_tuning_staged_value()}</span>
            <ValueText value={target} entry={entry} locale={locale} />
          </span>
        ) : null}
      </div>
      {positions ? (
        <div className="tp-range" aria-hidden="true">
          <span className="tp-range-mark tp-range-pack" style={{ insetInlineStart: `${positions.pack}%` }} />
          <span className="tp-range-mark tp-range-now" style={{ insetInlineStart: `${positions.now}%` }} />
        </div>
      ) : null}
      {override ? (
        <p className="tp-override">
          {m.dev_tuning_changed_by({
            who: override.updatedBy ?? m.dev_tuning_someone(),
            when: when(override.updatedAt),
          })}
          {override.note ? <span className="tp-note"> · {override.note}</span> : null}
        </p>
      ) : null}
      <div className="tp-actions">
        {editing ? null : (
          <button type="button" className="button-small tp-edit" onClick={() => onEdit(entry.id)}>
            {m.dev_tuning_edit()}
          </button>
        )}
        {staged ? (
          <button type="button" className="button-small tp-unstage" onClick={() => onUnstage(entry.id)}>
            {m.dev_tuning_unstage()}
          </button>
        ) : changed ? (
          <button type="button" className="button-small tp-revert" onClick={() => onStage(entry.id, null)}>
            {m.dev_tuning_stage_revert()}
          </button>
        ) : null}
      </div>
      {editing ? (
        <RowEditor
          entry={entry}
          start={target}
          locale={locale}
          onStage={(value) => {
            onStage(entry.id, value);
            onEdit(null);
          }}
          onCancel={() => onEdit(null)}
        />
      ) : null}
    </li>
  );
}
