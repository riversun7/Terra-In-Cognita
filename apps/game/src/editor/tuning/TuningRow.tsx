// 설정 칸 한 줄(표의 tr, ADR 2026-11-02-dev-ui) — 코드 · 이름(+ID, 쉬운 풀이·단위·출처, 덮어쓰기 정보) · 표지(구조 값·범위) · 지금 값(차이, 담은 값) ·
// 팩 값 · 범위(글 + 작은 막대) · 새 값 칸 + [담기] · [되돌리기]/[담기 취소].
// 새 값 칸은 늘 보인다(처음 값 = 담은 값 또는 지금 값). 값을 바꾸고 [담기](또는 Enter)로 담은 변경에 넣는다(적용은 화면 아래 막대의
// [적용], 한 묶음). 시험·측정용 data-*: data-id, data-changed(덮어쓰기 있음), data-staged(담음), data-scope.
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
  locale: string;
  /** 담기: 새 값(null = 팩 값으로 되돌리기) */
  onStage: (id: string, value: number | null) => void;
  onUnstage: (id: string) => void;
}

/** 범위 글(입력 안내용, "범위 0 ~ 10") */
function rangeText(entry: TuningEntryView, locale: string): string {
  const n = (value: number) => formatNumber(value, locale);
  if (entry.min !== null && entry.max !== null)
    return m.dev_tuning_range({ min: n(entry.min), max: n(entry.max) });
  if (entry.min !== null) return m.dev_tuning_range_min({ min: n(entry.min) });
  if (entry.max !== null) return m.dev_tuning_range_max({ max: n(entry.max) });
  return m.dev_tuning_no_range();
}

/** 범위 칸의 짧은 글("0 ~ 10", 한쪽만이면 "0 이상") */
function rangeShort(entry: TuningEntryView, locale: string): string {
  const n = (value: number) => formatNumber(value, locale);
  if (entry.min !== null && entry.max !== null)
    return m.dev_tuning_range_short({ min: n(entry.min), max: n(entry.max) });
  return rangeText(entry, locale);
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
}

/** 새 값 칸 + [담기]. 처음 값과 같으면 [담기]는 누를 수 없다(aria-disabled: 초점은 남는다) */
function RowEditor({ entry, start, locale, onStage }: EditorProps) {
  const hintId = useId();
  const errorId = useId();
  const [text, setText] = useState(String(start));
  const [problem, setProblem] = useState<string | null>(null);
  const value = parseValueInput(text);
  const preview = value === null ? null : formatGloss(value, entry.unit, locale);
  const same = value === start;
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (value === null) return setProblem(m.dev_tuning_value_invalid());
    if (same) return undefined;
    if (!inRange(entry, value)) return setProblem(m.dev_tuning_value_out_of_range());
    onStage(value);
  };
  const name = locale === "en" ? entry.name.en : entry.name.ko;
  return (
    <form className="tp-editor" onSubmit={submit} noValidate>
      <input
        className="input tp-input"
        inputMode="numeric"
        autoComplete="off"
        aria-label={m.dev_tuning_value_for({ name })}
        value={text}
        aria-invalid={problem !== null}
        aria-describedby={problem ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => {
          setText(event.target.value);
          setProblem(null);
        }}
      />
      <button
        type="submit"
        className={same ? "button-small tp-stage" : "button-primary button-small tp-stage"}
        aria-disabled={same}
      >
        {m.dev_tuning_stage()}
      </button>
      <span id={hintId} className="visually-hidden">
        {m.dev_tuning_value_hint({ unit: unitText(entry.unit) })} · {rangeText(entry, locale)}
        {preview ? ` · ${preview}` : ""}
      </span>
      {problem ? (
        <p id={errorId} className="field-error tp-error" role="alert">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

export function TuningRow({ entry, pending, locale, onStage, onUnstage }: TuningRowProps) {
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
    <tr
      className="tp-row"
      data-id={entry.id}
      data-changed={changed ? "" : undefined}
      data-staged={staged ? "" : undefined}
      data-scope={entry.scope}
    >
      <td className="tp-c-code">
        <span className="tp-code">{entry.code === "" ? "—" : entry.code}</span>
      </td>
      <td className="tp-c-name">
        <span className="tp-name">{locale === "en" ? entry.name.en : entry.name.ko}</span>
        <code className="tp-id">{entry.id}</code>
        {/* 쉬운 풀이·단위·출처(팩 항목 desc·unit·source, 2026-11-08 분야별 페이지) */}
        {entry.desc ? (
          <span className="tp-desc">{locale === "en" ? entry.desc.en : entry.desc.ko}</span>
        ) : null}
        <span className="tp-meta">
          {/* 단위가 없는 칸은 범위 칸의 "단위 없음"으로 충분하다 */}
          {entry.unit === null ? null : (
            <span className="tp-meta-item">
              <span className="tp-meta-label">{m.dev_tuning_unit_label()}</span> {unitText(entry.unit)}
            </span>
          )}
          {entry.source ? (
            <span className="tp-meta-item tp-source">
              <span className="tp-meta-label">{m.dev_tuning_source_label()}</span> {entry.source}
            </span>
          ) : null}
        </span>
        {override ? (
          <span className="tp-override">
            {m.dev_tuning_changed_by({
              who: override.updatedBy ?? m.dev_tuning_someone(),
              when: when(override.updatedAt),
            })}
            {override.note ? <span className="tp-note"> · {override.note}</span> : null}
          </span>
        ) : null}
      </td>
      <td className="tp-c-flags">
        {entry.structural ? (
          <span className="tp-chip tp-chip-structural">{m.dev_tuning_structural()}</span>
        ) : null}
        <span className="tp-chip tp-scope" data-scope={entry.scope} title={scope.hint()}>
          {scope.label()}
        </span>
      </td>
      <td className="tp-c-now">
        <span className="tp-value tp-value-now">
          <ValueText value={entry.value} entry={entry} locale={locale} />
        </span>
        {changed ? (
          <span className="tp-delta" data-sign={sign}>
            {delta.diff > 0 ? "+" : ""}
            {formatNumber(delta.diff, locale)}
            {delta.percent === null ? "" : ` (${delta.percent > 0 ? "+" : ""}${delta.percent}%)`}
          </span>
        ) : null}
        {staged ? (
          <span className="tp-value tp-value-staged" title={m.dev_tuning_staged_value()}>
            <span className="tp-label">{m.dev_tuning_staged_value()}</span>
            <ValueText value={target} entry={entry} locale={locale} />
          </span>
        ) : null}
      </td>
      <td className="tp-c-pack">
        <span className="tp-value tp-value-pack">
          <ValueText value={entry.packValue} entry={entry} locale={locale} />
        </span>
      </td>
      <td className="tp-c-range">
        {/* 막대를 앞에 두어 줄마다 같은 자리에 선다(범위가 없으면 빈 자리) */}
        <span className="tp-range" aria-hidden="true">
          {positions ? (
            <>
              <span
                className="tp-range-mark tp-range-pack"
                style={{ insetInlineStart: `${positions.pack}%` }}
              />
              <span
                className="tp-range-mark tp-range-now"
                style={{ insetInlineStart: `${positions.now}%` }}
              />
            </>
          ) : null}
        </span>
        <span className="tp-range-text">
          {rangeShort(entry, locale)}
          <span className="tp-unit"> {unitText(entry.unit)}</span>
        </span>
      </td>
      <td className="tp-c-edit">
        {/* 담거나 적용해 처음 값이 바뀌면 칸을 새로 만든다(친 글자를 지운다) */}
        <RowEditor
          key={target}
          entry={entry}
          start={target}
          locale={locale}
          onStage={(value) => onStage(entry.id, value)}
        />
      </td>
      <td className="tp-c-actions">
        {staged ? (
          <button type="button" className="button-small tp-unstage" onClick={() => onUnstage(entry.id)}>
            {m.dev_tuning_unstage()}
          </button>
        ) : changed ? (
          <button type="button" className="button-small tp-revert" onClick={() => onStage(entry.id, null)}>
            {m.dev_tuning_stage_revert()}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
