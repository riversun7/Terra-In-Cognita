// 콘텐츠 편집기 공용 입력 칸(스킬·아이템·건물 편집기) — 정수·글·고르기·켜기·빼기 단추. docs/adr/2026-11-01-item-editor.md 3절(WP-4a)·
// "바뀜 (2026-11-08 화면 개편)".
// - 이름표를 칸과 잇고(htmlFor), 틀린 정수는 칸에 남긴 채 그 자리에 까닭을 적는다(정수 아님·범위 밖·비었음, 값은 바꾸지 않는다).
// - 칸 아래 한 줄: 쉬운 풀이(desc) · 단위 · 범위(정수 칸은 min~max를 스스로 적는다) · 덧붙인 말(hint).
// - path를 주면 편집 판의 CompareProvider로 팩 값·지금 값과 견준다(담음·팩과 다름 표지, [되돌리기]·[팩 값으로], 서버 검사 문구).
// - 칸 문제(서버 검사 코드 문구)는 aria-describedby로 잇는다. hideLabel(표 칸)은 견주기 글 없이 표지(data-staged 등)만 단다.
// - 풀이 모양(FieldHintStyle): "inline"(기본) = 칸 아래 한 줄, "tip" = 이름표 옆 [ⓘ]를 눌러야 펼친다(건물 편집기, 2026-11-09 개발자 편의
//   개편 — 칸마다 긴 회색 글이 표를 밀어내지 않게). tip이면 단위는 입력 칸 오른쪽에 붙고 범위는 칸의 title·펼친 풀이에 든다.
// - 정수 칸은 수 조작 칸(contentEditorNumber: − / + 단추, 막대, 이름표 끌기, ↑↓·휠)이다 — docs/adr/2026-11-10-editor-input-controls.md.
//   표 칸(hideLabel)은 단추만 붙는다(막대는 slider로 켠다). 범위 밖 정수는 칸을 떠날 때 가까운 끝 값으로 맞추고 까닭을 적는다.
// 조각: 편집기들이 같이 쓰는 모듈이라 rolldown이 따로 묶는다(이름 contentEditor…, 미리 캐시 규칙 [Cc]ontentEditor).
import { type ReactNode, type RefObject, createContext, useContext, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import {
  CompareBadges,
  CompareLine,
  compareData,
  compareText,
  useFieldCompare,
} from "./contentEditorCompare.tsx";
import { parseInt32 } from "./contentEditorModel.ts";
import { NumberControl } from "./contentEditorNumber.tsx";
import { type NumberScale, clampInt } from "./contentEditorNumeric.ts";
import "./contentEditor.css";
import "./contentEditorShell.css";

/** 풀이 모양: inline = 칸 아래 늘 보임, tip = [ⓘ]로 펼침(단위는 칸 오른쪽) */
export type FieldHintStyle = "inline" | "tip";
const HintStyleContext = createContext<FieldHintStyle>("inline");

/** 이 안의 칸·구역 풀이 모양을 정한다(편집 판 하나에 한 번) */
export function FieldHintProvider({ mode, children }: { mode: FieldHintStyle; children: ReactNode }) {
  return <HintStyleContext.Provider value={mode}>{children}</HintStyleContext.Provider>;
}

export const useHintStyle = (): FieldHintStyle => useContext(HintStyleContext);

/** [ⓘ] 펼침 단추(tip 모양): 풀이 문단을 보이고 숨긴다. 문단은 숨겨도 aria-describedby로 읽힌다 */
export function HintToggle({
  open,
  onToggle,
  controls,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className="ce-hint-toggle"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={m.dev_content_hint_toggle({ name: label })}
      title={m.dev_content_hint_toggle({ name: label })}
      onClick={onToggle}
    >
      <span aria-hidden="true">i</span>
    </button>
  );
}

/** 칸 아래 문제 줄(서버 검사·바로 보이는 검사). id는 입력 칸의 aria-describedby가 가리킨다 */
function FieldProblem({ id, text }: { id: string; text: string | undefined }) {
  return text ? (
    <p id={id} className="field-error ce-problem">
      {text}
    </p>
  ) : null;
}

const formatInt = (value: number): string => new Intl.NumberFormat(getLocale()).format(value);

/** 범위 글: 아주 넓은 기술 범위(±100만 넘음)는 한쪽만 적는다 */
export function rangeText(min: number, max: number): string {
  const wide = 1_000_000;
  if (min <= -wide && max >= wide) return m.dev_content_range_any();
  if (max >= wide * 1000) return m.dev_content_range_min({ min: formatInt(min) });
  return m.dev_content_range({ min: formatInt(min), max: formatInt(max) });
}

/** 칸 아래 도움말 줄: 풀이 · 단위 · 범위 · 덧붙인 말 */
function FieldHint({
  id,
  desc,
  unit,
  range,
  hint,
  hidden = false,
}: {
  id: string;
  desc?: string | undefined;
  unit?: string | undefined;
  range?: string | undefined;
  hint?: string | undefined;
  /** tip 모양에서 접힘(읽기 프로그램은 aria-describedby로 그대로 읽는다) */
  hidden?: boolean;
}) {
  const facts = [
    unit ? m.dev_content_unit({ unit }) : null,
    range ? m.dev_content_range_label({ range }) : null,
    hint ?? null,
  ].filter((part): part is string => part !== null && part !== "");
  if (!desc && facts.length === 0) return null;
  return (
    <p id={id} className="field-hint ce-hint" hidden={hidden}>
      {desc ? <span className="ce-desc">{desc}</span> : null}
      {facts.map((fact) => (
        <span key={fact} className="ce-fact">
          {fact}
        </span>
      ))}
    </p>
  );
}

/** 이름표 줄(이름표 + 담음·팩과 다름 표지) */
function FieldHead({
  id,
  label,
  hideLabel,
  badges,
  tip,
  labelRef,
}: {
  id: string;
  label: string;
  hideLabel: boolean;
  badges: ReactNode;
  /** tip 모양의 [ⓘ] 단추(풀이가 있을 때만) */
  tip?: ReactNode;
  /** 이름표(수 칸은 좌우로 끌어 값을 바꾼다) */
  labelRef?: RefObject<HTMLLabelElement | null> | undefined;
}) {
  if (hideLabel)
    return (
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
    );
  return (
    <span className="ce-field-head">
      <label className="field-label" htmlFor={id} ref={labelRef}>
        {label}
      </label>
      {tip}
      {badges}
    </span>
  );
}

const joinIds = (...ids: (string | false | null | undefined)[]): string | undefined => {
  const out = ids.filter((id): id is string => typeof id === "string" && id !== "").join(" ");
  return out === "" ? undefined : out;
};

interface CommonProps {
  label: string;
  className?: string | undefined;
  /** 표 머리가 무엇인지 알리는 칸: 이름표는 읽기 프로그램에만 */
  hideLabel?: boolean | undefined;
  /** 이 칸의 문제(서버 검사 문구). 없으면 견주기 판의 problemOf(path) */
  problem?: string | undefined;
  /** 칸 아래 덧붙일 말(쓰는 곳·풀이 값) */
  hint?: string | undefined;
  /** 쉬운 풀이(무엇을 바꾸는 칸인지) */
  desc?: string | undefined;
  /** 팩 항목 안 경로(팩 값·지금 값 견주기, 칸 되돌리기) */
  path?: string | undefined;
}

/**
 * 정수 칸: 글자는 칸이 들고, 범위 안 정수일 때만 onChange를 부른다(지우고 다시 쓰는 동안 값이 튀지 않게).
 * 바깥 값이 바뀌면(다른 항목·되돌리기) 글자를 그 값으로 맞춘다(그리는 중 상태 맞추기)
 */
export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  optional = false,
  className,
  hideLabel = false,
  problem,
  hint,
  desc,
  unit,
  path,
  slider,
  scale,
  soft,
  step,
  pack,
}: CommonProps & {
  value: number | undefined;
  min: number;
  max: number;
  onChange: (value: number | undefined) => void;
  /** 비우면 undefined(선택 칸) */
  optional?: boolean;
  /** 단위 글(‰·ms·g·칸 …) */
  unit?: string | undefined;
  /** 막대를 보일까(기본: 이름표가 보이는 칸은 보이고 표 칸은 숨긴다) */
  slider?: boolean | undefined;
  /** 막대 눈금(기본: 범위 폭에 맞춰 고른다) */
  scale?: NumberScale | undefined;
  /** 막대가 덮을 범위(기술 범위보다 좁게) */
  soft?: readonly [number, number] | undefined;
  /** 한 걸음(기본: 범위 폭에 맞춘다) */
  step?: number | undefined;
  /** 팩 값(막대 눈금). path를 주면 견주기 판의 팩 값을 쓴다 */
  pack?: number | undefined;
}) {
  const id = useId();
  const problemId = useId();
  const hintId = useId();
  const noteId = useId();
  const labelRef = useRef<HTMLLabelElement>(null);
  const compare = useFieldCompare(path);
  // 범위 밖 정수를 칸을 떠날 때 맞춘 까닭(다음 고침까지 보인다)
  const [clamped, setClamped] = useState<string | null>(null);
  const shown = value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  const trimmed = text.trim();
  const parsed = parseInt32(text, min, max);
  const range = rangeText(min, max);
  // 바로 보이는 검사(칸 안 글자): 비었음·정수 아님·범위 밖
  const local =
    parsed !== null || (optional && trimmed === "")
      ? undefined
      : trimmed === ""
        ? m.dev_content_value_required()
        : /^-?\d+$/.test(trimmed)
          ? m.dev_content_value_out_of_range({ range })
          : m.dev_content_value_invalid();
  const shownProblem = local ?? problem ?? compare?.problem;
  const invalid = shownProblem !== undefined;
  const tipMode = useHintStyle() === "tip" && !hideLabel;
  const [tipOpen, setTipOpen] = useState(false);
  const packValue = pack ?? (typeof compare?.packValue === "number" ? compare.packValue : undefined);
  const setValue = (next: number): void => {
    setClamped(null);
    setText(String(next));
    setSeen(String(next));
    onChange(next);
  };
  const input = (
    <NumberControl
      id={id}
      label={label}
      text={text}
      value={parsed ?? (value === undefined ? null : value)}
      min={min}
      max={max}
      pack={packValue}
      unit={unit}
      compact={hideLabel}
      slider={slider}
      scale={scale}
      soft={soft}
      step={step}
      scrubRef={hideLabel ? undefined : labelRef}
      onAdjust={setValue}
      onText={(next) => {
        setClamped(null);
        setText(next);
        if (optional && next.trim() === "") {
          setSeen("");
          onChange(undefined);
          return;
        }
        const number = parseInt32(next, min, max);
        if (number !== null) {
          setSeen(String(number));
          onChange(number);
        }
      }}
      inputProps={{
        // 음수를 받을 수 있는 칸은 글 자판(iOS 숫자 자판에는 − 가 없다)
        inputMode: min >= 0 ? "numeric" : "text",
        title:
          hideLabel && compare?.changed
            ? m.dev_content_compare_pack_title({ value: compareText(compare.packValue) })
            : tipMode
              ? m.dev_content_range_label({ range })
              : undefined,
        "aria-invalid": invalid || undefined,
        "aria-describedby": joinIds(invalid && problemId, clamped !== null && noteId, !hideLabel && hintId),
        // 범위 밖 정수는 칸을 떠날 때 가까운 끝 값으로 맞춘다(정수가 아닌 글은 그대로 두고 까닭만 보인다)
        onBlur: () => {
          if (parsed !== null || !/^-?\d+$/.test(trimmed)) return;
          const fixed = clampInt(Number(trimmed), min, max);
          setValue(fixed);
          setClamped(m.dev_input_clamped({ range, value: formatInt(fixed) }));
        },
      }}
    />
  );
  return (
    <div className={`field ce-field ${className ?? ""}`} {...compareData(compare, invalid)}>
      <FieldHead
        id={id}
        label={label}
        hideLabel={hideLabel}
        badges={<CompareBadges compare={compare} />}
        labelRef={labelRef}
        tip={
          tipMode && (desc || hint) ? (
            <HintToggle
              open={tipOpen}
              onToggle={() => setTipOpen(!tipOpen)}
              controls={hintId}
              label={label}
            />
          ) : null
        }
      />
      {input}
      {hideLabel ? null : (
        <FieldHint id={hintId} desc={desc} range={range} hint={hint} hidden={tipMode && !tipOpen} />
      )}
      {clamped === null ? null : (
        <p id={noteId} className="field-hint ce-clamp-note" role="status">
          {clamped}
        </p>
      )}
      {hideLabel ? null : <CompareLine compare={compare} name={label} />}
      <FieldProblem id={problemId} text={shownProblem} />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  maxLength = 200,
  className,
  problem,
  hint,
  desc,
  path,
}: CommonProps & {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const id = useId();
  const problemId = useId();
  const hintId = useId();
  const compare = useFieldCompare(path);
  const shownProblem = problem ?? compare?.problem;
  const tipMode = useHintStyle() === "tip";
  const [tipOpen, setTipOpen] = useState(false);
  return (
    <div
      className={`field ce-field ${className ?? ""}`}
      {...compareData(compare, shownProblem !== undefined)}
    >
      <FieldHead
        id={id}
        label={label}
        hideLabel={false}
        badges={<CompareBadges compare={compare} />}
        tip={
          tipMode && (desc || hint) ? (
            <HintToggle
              open={tipOpen}
              onToggle={() => setTipOpen(!tipOpen)}
              controls={hintId}
              label={label}
            />
          ) : null
        }
      />
      <input
        id={id}
        className="input"
        autoComplete="off"
        maxLength={maxLength}
        value={value}
        aria-invalid={shownProblem ? true : undefined}
        aria-describedby={joinIds(shownProblem && problemId, (desc || hint) && hintId)}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldHint id={hintId} desc={desc} hint={hint} hidden={tipMode && !tipOpen} />
      <CompareLine compare={compare} name={label} />
      <FieldProblem id={problemId} text={shownProblem} />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel = false,
  problem,
  hint,
  desc,
  path,
}: CommonProps & {
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  const problemId = useId();
  const hintId = useId();
  const compare = useFieldCompare(path);
  const shownProblem = problem ?? compare?.problem;
  const labelOf = (raw: string): string | undefined => options.find((option) => option.value === raw)?.label;
  const tipMode = useHintStyle() === "tip" && !hideLabel;
  const [tipOpen, setTipOpen] = useState(false);
  return (
    <div
      className={`field ce-field ${className ?? ""}`}
      {...compareData(compare, shownProblem !== undefined)}
    >
      <FieldHead
        id={id}
        label={label}
        hideLabel={hideLabel}
        badges={<CompareBadges compare={compare} />}
        tip={
          tipMode && (desc || hint) ? (
            <HintToggle
              open={tipOpen}
              onToggle={() => setTipOpen(!tipOpen)}
              controls={hintId}
              label={label}
            />
          ) : null
        }
      />
      <select
        id={id}
        value={value}
        aria-invalid={shownProblem ? true : undefined}
        aria-describedby={joinIds(shownProblem && problemId, !hideLabel && (desc || hint) && hintId)}
        onChange={(event) => {
          const picked = options.find((option) => option.value === event.target.value);
          if (picked) onChange(picked.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hideLabel ? null : <FieldHint id={hintId} desc={desc} hint={hint} hidden={tipMode && !tipOpen} />}
      {hideLabel ? null : <CompareLine compare={compare} name={label} labelOf={labelOf} />}
      <FieldProblem id={problemId} text={shownProblem} />
    </div>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
  desc,
  problem,
  path,
}: Omit<CommonProps, "className" | "hideLabel"> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const hintId = useId();
  const problemId = useId();
  const compare = useFieldCompare(path);
  const shownProblem = problem ?? compare?.problem;
  return (
    <div className="ce-check" {...compareData(compare, shownProblem !== undefined)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={joinIds((desc || hint) && hintId, shownProblem && problemId)}
        aria-invalid={shownProblem ? true : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      <CompareBadges compare={compare} />
      {desc || hint ? (
        <p id={hintId} className="field-hint ce-check-hint">
          {desc ? <span className="ce-desc">{desc}</span> : null}
          {hint ? <span className="ce-fact">{hint}</span> : null}
        </p>
      ) : null}
      <CompareLine compare={compare} name={label} />
      <FieldProblem id={problemId} text={shownProblem} />
    </div>
  );
}

/** 줄 빼기 단추(이름표에 무엇을 빼는지 적는다) */
export function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="button-small ce-remove"
      aria-label={m.dev_content_remove_named({ name })}
      onClick={onClick}
    >
      {m.dev_content_remove()}
    </button>
  );
}
