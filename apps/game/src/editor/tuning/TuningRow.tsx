// 설정 칸 한 줄(목록의 li) — docs/adr/2026-11-01-dev-settings-panel.md "바뀜 (2026-11-08 화면 개편)", 개발 화면 층(ADR 2026-11-02-dev-ui).
// 넓은 폭(격자 한 줄): 코드 · 이름·ID·표지 / 풀이 / 단위·출처 / 덮어쓴 사람 · 지금·팩(차이, 담은 값) · 범위 막대·글 · 값 칸 + 동작.
// 좁은 폭(휴대폰): 같은 내용을 위아래로 쌓고 값 칸·단추는 한 줄 전체 폭(누르는 곳 --dev-touch-tap).
// 값 칸: 고치는 동안 바로 검사한다(정수·범위, aria-invalid + 문구). Enter = 담고 다음 줄로, 칸을 떠나도 맞는 값이면 담는다,
// Esc = 친 글자를 되돌림, ↑↓ = 위·아래 줄 값 칸. 적용은 화면 아래 담은 변경 막대의 [적용](한 묶음).
// 시험·측정용 data-*: data-id, data-changed(덮어쓰기 있음), data-staged(담음), data-scope.
import type { TuningEntryView } from "@terra/shared/tuning";
import { type KeyboardEvent, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { SCOPE_TEXT, unitText } from "./tuningMessages.ts";
import {
  type Pending,
  checkValueInput,
  deltaOf,
  formatGloss,
  formatNumber,
  rangePositions,
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

/** 값 + 풀이(예: 600,000 10분) */
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
  onMove: MoveRow;
}

/** 값 칸 + [담기](친 글자가 처음 값과 다를 때만 보인다). 바로 검사하고, 맞으면 Enter·칸 떠나기로 담는다 */
function RowEditor({ entry, start, locale, onStage, onMove }: EditorProps) {
  const hintId = useId();
  const errorId = useId();
  const [text, setText] = useState(String(start));
  const dirty = text !== String(start);
  const check = checkValueInput(entry, text, start);
  const problem = !dirty
    ? null
    : check.status === "invalid"
      ? m.dev_tuning_value_invalid()
      : check.status === "out_of_range"
        ? m.dev_tuning_value_out_of_range_detail({ range: rangeText(entry, locale) })
        : null;
  const preview = check.status === "ok" ? formatGloss(check.value, entry.unit, locale) : null;
  const commit = (): boolean => {
    if (check.status !== "ok") return false;
    onStage(check.value);
    return true;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        // 틀린 값이면 그 자리에 남는다(문구가 이미 보인다)
        if (problem) return;
        commit();
        onMove(event.currentTarget, 1);
        return;
      case "Escape": {
        if (!dirty) return;
        event.preventDefault();
        setText(String(start));
        // 되돌린 글을 골라 둔다(바로 다시 치게)
        const input = event.currentTarget;
        requestAnimationFrame(() => input.select());
        return;
      }
      case "ArrowUp":
      case "ArrowDown":
        event.preventDefault();
        onMove(event.currentTarget, event.key === "ArrowUp" ? -1 : 1);
        return;
      default:
    }
  };
  const name = locale === "en" ? entry.name.en : entry.name.ko;
  return (
    <div className="tp-editor" data-dirty={dirty ? "" : undefined}>
      <input
        className="input tp-input"
        // 음수를 받을 수 있는 칸은 글 자판(iOS 숫자 자판에는 − 가 없다)
        inputMode={entry.min !== null && entry.min >= 0 ? "numeric" : "text"}
        enterKeyHint="next"
        autoComplete="off"
        spellCheck={false}
        aria-label={m.dev_tuning_value_for({ name })}
        value={text}
        aria-invalid={problem !== null}
        aria-describedby={problem ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={onKeyDown}
        onBlur={commit}
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
        {m.dev_tuning_value_hint({ unit: unitText(entry.unit) })} · {rangeText(entry, locale)}
      </span>
      {problem ? (
        <p id={errorId} className="field-error tp-error" role="alert">
          {problem}
        </p>
      ) : preview ? (
        <p className="tp-preview">{m.dev_tuning_value_preview({ value: preview })}</p>
      ) : null}
    </div>
  );
}

export function TuningRow({ entry, pending, locale, showDesc, onStage, onUnstage, onMove }: TuningRowProps) {
  const staged = pending.has(entry.id);
  const target = stagedValue(entry, pending);
  const delta = deltaOf(entry.value, entry.packValue);
  const positions = rangePositions(entry, staged ? target : entry.value);
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
          <span className="tp-name">{name}</span>
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
          <ValueText value={entry.value} entry={entry} locale={locale} />
          {changed ? (
            <span className="tp-delta" data-sign={sign}>
              {delta.diff > 0 ? "+" : ""}
              {formatNumber(delta.diff, locale)}
              {delta.percent === null ? "" : ` (${delta.percent > 0 ? "+" : ""}${delta.percent}%)`}
            </span>
          ) : null}
        </span>
        <span className="tp-value tp-value-pack">
          <span className="tp-label">{m.dev_tuning_pack_value()}</span>
          <ValueText value={entry.packValue} entry={entry} locale={locale} />
        </span>
        {staged ? (
          <span className="tp-value tp-value-staged">
            <span className="tp-label">{m.dev_tuning_staged_value()}</span>
            <ValueText value={target} entry={entry} locale={locale} />
          </span>
        ) : null}
      </div>
      <div className="tp-r-range">
        {/* 막대(범위 양 끝이 있을 때): 팩 값 = 속 빈 눈금, 지금(담았으면 담은) 값 = 찬 눈금 */}
        {positions ? (
          <span className="tp-range" aria-hidden="true">
            <span
              className="tp-range-mark tp-range-pack"
              style={{ insetInlineStart: `${positions.pack}%` }}
            />
            <span className="tp-range-mark tp-range-now" style={{ insetInlineStart: `${positions.now}%` }} />
          </span>
        ) : null}
        <span className="tp-range-text">{rangeText(entry, locale)}</span>
      </div>
      <div className="tp-r-edit">
        {/* 담거나 적용해 처음 값이 바뀌면 칸을 새로 만든다(친 글자를 지운다) */}
        <RowEditor
          key={target}
          entry={entry}
          start={target}
          locale={locale}
          onStage={(value) => onStage(entry.id, value)}
          onMove={onMove}
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
