// 설정 칸 한 줄(목록의 li) — docs/adr/2026-11-01-dev-settings-panel.md "바뀜 (2026-11-08 화면 개편)", 개발 화면 층(ADR 2026-11-02-dev-ui).
// 넓은 폭(격자 한 줄): 코드 · 이름·ID·표지 / 풀이 / 단위·출처 / 덮어쓴 사람 · 지금·팩(차이, 담은 값) · 범위 막대·글 · 값 칸 + 동작.
// 좁은 폭(휴대폰): 같은 내용을 위아래로 쌓고 값 칸·단추는 한 줄 전체 폭(누르는 곳 --dev-touch-tap).
// 값 칸: 고치는 동안 바로 검사한다(정수·범위, aria-invalid + 문구). Enter = 담고 다음 줄로(Shift+Enter = 앞 줄), 칸을 떠나도 맞는 값이면
// 담는다, Esc = 친 글자를 되돌림. 적용은 화면 아래 담은 변경 막대의 [적용](한 묶음).
// 2026-11-10(docs/adr/2026-11-10-editor-input-controls.md): 값 칸은 공용 수 조작 칸이다 — − / + 단추, 막대(팩 값 눈금), 이름 끌기,
// ↑↓ = 한 걸음(Shift 10배, 전에는 줄 옮기기였다), PageUp/PageDown, 초점이 있을 때 휠. 조작한 값은 바로 담긴다(끄는 동안은 80ms 간격).
// 범위 밖 정수는 칸을 떠날 때 가까운 끝 값으로 맞춰 담고 까닭을 적는다(정수가 아닌 글은 담지 않는다).
// 시험·측정용 data-*: data-id, data-changed(덮어쓰기 있음), data-staged(담음), data-scope.
import { TUNING_VALUE_LIMIT, type TuningEntryView } from "@terra/shared/tuning";
import { type KeyboardEvent, type RefObject, memo, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { NumberControl } from "../content/contentEditorNumber.tsx";
import { clampInt } from "../content/contentEditorNumeric.ts";
import { SCOPE_TEXT, durationUnitText, unitText } from "./tuningMessages.ts";
import {
  DURATION_EDIT_UNITS,
  DURATION_UNIT_MS,
  type DurationEditUnit,
  type Pending,
  canEditDurationInUnit,
  checkDurationInput,
  checkValueInput,
  defaultDurationUnitOf,
  deltaOf,
  durationEditBounds,
  durationEditToMs,
  formatDuration,
  formatGloss,
  formatNumber,
  msToDurationEdit,
  parseValueInput,
  stagedValue,
} from "./tuningModel.ts";

/** 값 칸에서 위·아래 줄로 옮기기(-1 = 위, 1 = 아래) */
export type MoveRow = (from: HTMLInputElement, step: -1 | 1) => void;

export interface TuningRowProps {
  entry: TuningEntryView;
  pending: Pending;
  locale: string;
  showDesc: boolean;
  /** 담기: 새 값(null = 팩 값으로 되돌리기) */
  onStage: (id: string, value: number | null) => void;
  onUnstage: (id: string) => void;
  onMove: MoveRow;
}

/** 범위 글("0 ~ 10", 한쪽만이면 "0 이상", 없으면 "범위 없음") */
export function rangeText(entry: Pick<TuningEntryView, "min" | "max">, locale: string): string {
  const n = (value: number) => formatNumber(value, locale);
  if (entry.min !== null && entry.max !== null)
    return m.dev_tuning_range_short({ min: n(entry.min), max: n(entry.max) });
  if (entry.min !== null) return m.dev_tuning_range_min({ min: n(entry.min) });
  if (entry.max !== null) return m.dev_tuning_range_max({ max: n(entry.max) });
  return m.dev_tuning_no_range();
}

function unitNumberText(value: number, unit: DurationEditUnit | null, locale: string): string {
  const formatted = formatNumber(value, locale);
  return unit && unit !== "ms" ? `${formatted}${durationUnitText(unit)}` : formatted;
}

function durationRangeText(
  entry: Pick<TuningEntryView, "min" | "max">,
  unit: DurationEditUnit | null,
  locale: string,
): string {
  if (!unit || unit === "ms") return rangeText(entry, locale);
  const bounds = durationEditBounds(entry, unit);
  const n = (value: number) => unitNumberText(value, unit, locale);
  if (bounds.min !== null && bounds.max !== null)
    return m.dev_tuning_range_short({ min: n(bounds.min), max: n(bounds.max) });
  if (bounds.min !== null) return m.dev_tuning_range_min({ min: n(bounds.min) });
  if (bounds.max !== null) return m.dev_tuning_range_max({ max: n(bounds.max) });
  return m.dev_tuning_no_range();
}

function formatDeltaDiff(diff: number, unit: DurationEditUnit | null, locale: string): string {
  const prefix = diff > 0 ? "+" : "";
  const converted = unit && unit !== "ms" ? msToDurationEdit(diff, unit) : null;
  if (converted !== null) return `${prefix}${unitNumberText(converted, unit, locale)}`;
  return `${prefix}${formatNumber(diff, locale)}`;
}

/** 값 + 풀이(예: 10분 / 600,000 ms 또는 1,440시간 / 60일 · 5,184,000,000 ms) */
function ValueText({
  value,
  entry,
  durationUnit,
  locale,
}: {
  value: number;
  entry: TuningEntryView;
  durationUnit: DurationEditUnit | null;
  locale: string;
}) {
  const converted = durationUnit && durationUnit !== "ms" ? msToDurationEdit(value, durationUnit) : null;
  if (converted !== null && durationUnit) {
    return (
      <>
        <strong className="tp-number">{unitNumberText(converted, durationUnit, locale)}</strong>
        <span className="tp-gloss">
          {m.dev_tuning_duration_ms_gloss({
            duration: formatDuration(value, locale),
            ms: formatNumber(value, locale),
          })}
        </span>
      </>
    );
  }
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
  durationUnit: DurationEditUnit | null;
  locale: string;
  onStage: (value: number) => void;
  onMove: MoveRow;
  /** 이름(좌우로 끌어 값을 바꾼다) */
  scrubRef: RefObject<HTMLElement | null>;
}

/**
 * 값 칸 + [담기](친 글자가 처음 값과 다를 때만 보인다). 바로 검사하고, 맞으면 Enter·칸 떠나기로 담는다.
 * 단추·막대·이름 끌기·↑↓·휠로 바꾼 값은 바로 담긴다. 처음 값(start) 또는 편집 단위가 바뀌면 글자를 그 값으로 맞춘다
 */
function RowEditor({ entry, start, durationUnit, locale, onStage, onMove, scrubRef }: EditorProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const noteId = useId();
  const startConverted = durationUnit ? msToDurationEdit(start, durationUnit) : start;
  const activeUnit: DurationEditUnit | null = durationUnit && startConverted !== null ? durationUnit : null;
  const displayStart = activeUnit && startConverted !== null ? startConverted : start;
  const shown = String(displayStart);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  const [seenUnit, setSeenUnit] = useState<DurationEditUnit | null>(activeUnit);
  const [clamped, setClamped] = useState<string | null>(null);
  if (seen !== shown || seenUnit !== activeUnit) {
    // 맞춘 끝 값을 담아 처음 값이 그 값이 된 때(글자 = 새 값)는 맞춘 까닭 문구를 남긴다.
    // 단위가 바뀌거나 다른 값(담기 취소·적용·되돌리기)으로 바뀌면 지운다
    if (seenUnit !== activeUnit || text !== shown) setClamped(null);
    setSeen(shown);
    setSeenUnit(activeUnit);
    setText(shown);
  }
  const bounds = activeUnit ? durationEditBounds(entry, activeUnit) : { min: entry.min, max: entry.max };
  const min = bounds.min ?? -TUNING_VALUE_LIMIT;
  const max = bounds.max ?? TUNING_VALUE_LIMIT;
  const packInUnit = activeUnit
    ? Math.round(entry.packValue / DURATION_UNIT_MS[activeUnit])
    : entry.packValue;
  const dirty = text !== shown;
  const check = activeUnit
    ? checkDurationInput(entry, text, start, activeUnit)
    : checkValueInput(entry, text, start);
  const activeRange = durationRangeText(entry, activeUnit, locale);
  const problem = !dirty
    ? null
    : check.status === "invalid"
      ? m.dev_tuning_value_invalid()
      : check.status === "out_of_range"
        ? m.dev_tuning_value_out_of_range_detail({ range: activeRange })
        : null;
  const preview =
    check.status === "ok"
      ? activeUnit && activeUnit !== "ms"
        ? m.dev_tuning_duration_ms_gloss({
            duration: formatDuration(check.value, locale),
            ms: formatNumber(check.value, locale),
          })
        : formatGloss(check.value, entry.unit, locale)
      : null;
  const parsedDisplay = activeUnit ? parseValueInput(text) : null;
  const controlValue =
    check.status === "ok" ? (activeUnit ? (parsedDisplay ?? displayStart) : check.value) : displayStart;
  const commit = (): boolean => {
    if (check.status === "out_of_range") {
      // 범위 밖 정수: 가까운 끝 값으로 맞춰 담고 까닭을 적는다
      const rawDisplay = activeUnit ? (parsedDisplay ?? displayStart) : check.value;
      const fixedDisplay = clampInt(rawDisplay, min, max);
      const fixedMs = activeUnit ? (durationEditToMs(fixedDisplay, activeUnit) ?? start) : fixedDisplay;
      setText(String(fixedDisplay));
      setClamped(
        m.dev_input_clamped({
          range: activeRange,
          value: unitNumberText(fixedDisplay, activeUnit, locale),
        }),
      );
      if (fixedMs !== start) onStage(fixedMs);
      return true;
    }
    if (check.status !== "ok") return false;
    onStage(check.value);
    return true;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        // 정수가 아니면 그 자리에 남는다(문구가 이미 보인다)
        if (dirty && check.status === "invalid") return;
        commit();
        onMove(event.currentTarget, event.shiftKey ? -1 : 1);
        return;
      case "Escape": {
        if (!dirty) return;
        event.preventDefault();
        setText(shown);
        // 되돌린 글을 골라 둔다(바로 다시 치게)
        const input = event.currentTarget;
        requestAnimationFrame(() => input.select());
        return;
      }
      default:
    }
  };
  const name = locale === "en" ? entry.name.en : entry.name.ko;
  const activeUnitText = activeUnit ? durationUnitText(activeUnit) : unitText(entry.unit);
  return (
    <div className="tp-editor" data-dirty={dirty ? "" : undefined}>
      <NumberControl
        id={inputId}
        label={name}
        text={text}
        value={controlValue}
        min={min}
        max={max}
        pack={packInUnit}
        scrubRef={scrubRef}
        inputClassName="tp-input"
        onText={(next) => {
          setClamped(null);
          setText(next);
        }}
        onAdjust={(next) => {
          const nextMs = activeUnit ? durationEditToMs(next, activeUnit) : next;
          if (nextMs === null) return;
          setClamped(null);
          setText(String(next));
          if (nextMs !== start) onStage(nextMs);
        }}
        inputProps={{
          // 음수를 받을 수 있는 칸은 글 자판(iOS 숫자 자판에는 − 가 없다)
          inputMode: entry.min !== null && entry.min >= 0 ? "numeric" : "text",
          enterKeyHint: "next",
          "aria-label": m.dev_tuning_value_for({ name }),
          "aria-invalid": problem !== null,
          "aria-describedby": [hintId, problem ? errorId : "", clamped ? noteId : ""]
            .filter((id) => id !== "")
            .join(" "),
          onFocus: (event) => event.currentTarget.select(),
          onKeyDown,
          onBlur: commit,
        }}
      />
      {dirty && check.status === "ok" ? (
        <button
          type="button"
          className="button-primary tp-stage"
          // 칸을 떠나며(blur) 이미 담는다. 누름은 마우스·터치로 확실히 담고 싶을 때
          onMouseDown={(event) => event.preventDefault()}
          onClick={commit}
        >
          {m.dev_tuning_stage()}
        </button>
      ) : null}
      <span id={hintId} className="visually-hidden">
        {m.dev_tuning_value_hint({ unit: activeUnitText })} · {activeRange}
      </span>
      {problem ? (
        <p id={errorId} className="field-error tp-error" role="alert">
          {problem}
        </p>
      ) : clamped ? (
        <p id={noteId} className="field-hint ce-clamp-note tp-clamped" role="status">
          {clamped}
        </p>
      ) : preview ? (
        <p className="tp-preview">{m.dev_tuning_value_preview({ value: preview })}</p>
      ) : null}
    </div>
  );
}

function TuningRowView({ entry, pending, locale, showDesc, onStage, onUnstage, onMove }: TuningRowProps) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [chosenUnit, setChosenUnit] = useState<DurationEditUnit | null>(null);
  const staged = pending.has(entry.id);
  const target = stagedValue(entry, pending);
  const durationUnit: DurationEditUnit | null =
    entry.unit === "ms"
      ? chosenUnit && canEditDurationInUnit(entry, target, chosenUnit)
        ? chosenUnit
        : defaultDurationUnitOf(entry, target)
      : null;
  const delta = deltaOf(entry.value, entry.packValue);
  const stagedDelta = deltaOf(target, entry.packValue);
  const scope = SCOPE_TEXT[entry.scope];
  const override = entry.override;
  const changed = override !== null;
  const when = (ms: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(ms);
  const sign = delta.diff > 0 ? "up" : delta.diff < 0 ? "down" : "same";
  const name = locale === "en" ? entry.name.en : entry.name.ko;
  return (
    <li
      className="tp-row"
      data-id={entry.id}
      data-changed={changed ? "" : undefined}
      data-staged={staged ? "" : undefined}
      data-scope={entry.scope}
    >
      <span className="tp-r-code">
        <span className="tp-code">{entry.code === "" ? "—" : entry.code}</span>
      </span>
      <div className="tp-r-main">
        <p className="tp-title">
          <span className="tp-name" ref={nameRef}>
            {name}
          </span>
          <code className="tp-id">{entry.id}</code>
          {staged ? (
            <span className="tp-chip tp-chip-staged">{m.dev_tuning_staged_mark()}</span>
          ) : changed ? (
            <span className="tp-chip tp-chip-changed">{m.dev_tuning_changed_mark()}</span>
          ) : null}
          {entry.structural ? (
            <span className="tp-chip tp-chip-structural">{m.dev_tuning_structural()}</span>
          ) : null}
          <span className="tp-chip tp-scope" data-scope={entry.scope} title={scope.hint()}>
            {scope.label()}
          </span>
        </p>
        {/* 쉬운 풀이(팩 항목 desc). [풀이 보기]를 끄면 숨는다(찾기는 계속 풀이도 본다) */}
        {showDesc && entry.desc ? (
          <p className="tp-desc">{locale === "en" ? entry.desc.en : entry.desc.ko}</p>
        ) : null}
        <p className="tp-meta">
          {/* 단위가 없으면 "단위 없음"만(이름표 "단위"를 겹쳐 쓰지 않는다) */}
          <span className="tp-meta-item">
            {entry.unit === null ? null : <span className="tp-meta-label">{m.dev_tuning_unit_label()} </span>}
            {unitText(entry.unit)}
          </span>
          {entry.source ? (
            <span className="tp-meta-item tp-source">
              <span className="tp-meta-label">{m.dev_tuning_source_label()}</span> {entry.source}
            </span>
          ) : null}
        </p>
        {override ? (
          <p className="tp-override">
            {m.dev_tuning_changed_by({
              who: override.updatedBy ?? m.dev_tuning_someone(),
              when: when(override.updatedAt),
            })}
            {override.note ? <span className="tp-note"> · {override.note}</span> : null}
          </p>
        ) : null}
      </div>
      <div className="tp-r-values">
        <span className="tp-value tp-value-now">
          <span className="tp-label">{m.dev_tuning_now()}</span>
          <ValueText value={entry.value} entry={entry} durationUnit={durationUnit} locale={locale} />
          {changed ? (
            <span className="tp-delta" data-sign={sign}>
              {formatDeltaDiff(delta.diff, durationUnit, locale)}
              {delta.percent === null ? "" : ` (${delta.percent > 0 ? "+" : ""}${delta.percent}%)`}
            </span>
          ) : null}
        </span>
        <span className="tp-value tp-value-pack">
          <span className="tp-label">{m.dev_tuning_pack_value()}</span>
          <ValueText value={entry.packValue} entry={entry} durationUnit={durationUnit} locale={locale} />
        </span>
        {staged ? (
          <span className="tp-value tp-value-staged">
            <span className="tp-label">{m.dev_tuning_staged_value()}</span>
            <ValueText value={target} entry={entry} durationUnit={durationUnit} locale={locale} />
            {/* 결과 읽기: 팩 값과의 차이(끄는 동안 따라 바뀐다) */}
            {stagedDelta.diff === 0 ? null : (
              <span className="tp-delta" data-sign={stagedDelta.diff > 0 ? "up" : "down"}>
                {formatDeltaDiff(stagedDelta.diff, durationUnit, locale)}
                {stagedDelta.percent === null
                  ? ""
                  : ` (${stagedDelta.percent > 0 ? "+" : ""}${stagedDelta.percent}%)`}
              </span>
            )}
          </span>
        ) : null}
      </div>
      <div className="tp-r-range">
        <span className="tp-range-text">{durationRangeText(entry, durationUnit, locale)}</span>
      </div>
      <div className="tp-r-edit">
        {durationUnit ? (
          <div className="tp-unit-switch" role="group" aria-label={m.dev_tuning_duration_switch()}>
            {DURATION_EDIT_UNITS.map((unit) => (
              <button
                key={unit}
                type="button"
                className="tp-unit-btn"
                data-unit={unit}
                aria-pressed={durationUnit === unit}
                disabled={!canEditDurationInUnit(entry, target, unit)}
                onClick={() => setChosenUnit(unit)}
              >
                {durationUnitText(unit)}
              </button>
            ))}
          </div>
        ) : null}
        {/* 담거나 적용해 처음 값이 바뀌면 칸의 글자가 그 값을 따른다(끄는 동안에도 칸은 그대로 남는다) */}
        <RowEditor
          entry={entry}
          start={target}
          durationUnit={durationUnit}
          locale={locale}
          onStage={(value) => onStage(entry.id, value)}
          onMove={onMove}
          scrubRef={nameRef}
        />
        {staged ? (
          <button type="button" className="tp-row-action tp-unstage" onClick={() => onUnstage(entry.id)}>
            {m.dev_tuning_unstage()}
          </button>
        ) : changed ? (
          <button type="button" className="tp-row-action tp-revert" onClick={() => onStage(entry.id, null)}>
            {m.dev_tuning_stage_revert()}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * 줄은 자기 칸의 담은 값이 바뀔 때만 다시 그린다(막대를 끄는 동안 다른 줄 수백 개가 따라 그려지지 않게).
 * 동작 함수(onStage 등)는 그릴 때마다 새로 만들어지지만 칸 ID로만 일하므로 견주지 않는다: 목록을 다시 받으면 entry가 바뀌어 다시 그린다
 */
export const TuningRow = memo(
  TuningRowView,
  (before, after) =>
    before.entry === after.entry &&
    before.locale === after.locale &&
    before.showDesc === after.showDesc &&
    before.pending.has(before.entry.id) === after.pending.has(after.entry.id) &&
    before.pending.get(before.entry.id) === after.pending.get(after.entry.id),
);
