// 콘텐츠 편집기 공용 입력 칸(스킬 편집기·아이템 편집기) — 정수·글·고르기·켜기·빼기 단추. docs/adr/2026-11-01-item-editor.md 3절(WP-4a).
// 이름표를 칸과 잇고(htmlFor), 틀린 정수는 칸에 남긴 채 알린다(값은 바꾸지 않는다). 칸 문제(서버 검사 코드)는 aria-describedby로 잇는다.
// 조각: 두 편집기가 같이 쓰는 모듈이라 rolldown이 따로 묶는다(이름 contentEditor…, 미리 캐시 규칙 [Cc]ontentEditor).
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { parseInt32 } from "./contentEditorModel.ts";
import "./contentEditor.css";

/** 칸 아래 문제 줄(서버 검사·바로 보이는 검사). id는 입력 칸의 aria-describedby가 가리킨다 */
function FieldProblem({ id, text }: { id: string; text: string | undefined }) {
  return text ? (
    <p id={id} className="field-error ce-problem">
      {text}
    </p>
  ) : null;
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
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onChange: (value: number | undefined) => void;
  /** 비우면 undefined(선택 칸) */
  optional?: boolean;
  className?: string;
  /** 표 머리가 무엇인지 알리는 칸: 이름표는 읽기 프로그램에만 */
  hideLabel?: boolean;
  /** 이 칸의 문제(서버 검사 문구) */
  problem?: string | undefined;
  /** 칸 아래 작은 도움말(단위·범위·쓰는 곳) */
  hint?: string | undefined;
}) {
  const id = useId();
  const problemId = useId();
  const hintId = useId();
  const shown = value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  const parsed = parseInt32(text, min, max);
  const invalid = !(parsed !== null || (optional && text.trim() === "")) || problem !== undefined;
  const described = [problem ? problemId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className={`field ce-field ${className ?? ""}`}>
      <label className={hideLabel ? "visually-hidden" : "field-label"} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input ce-number"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || undefined}
        aria-describedby={described === "" ? undefined : described}
        onChange={(event) => {
          const next = event.target.value;
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
      />
      {hint ? (
        <p id={hintId} className="field-hint ce-hint">
          {hint}
        </p>
      ) : null}
      <FieldProblem id={problemId} text={problem} />
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  className?: string;
  problem?: string | undefined;
}) {
  const id = useId();
  const problemId = useId();
  return (
    <div className={`field ce-field ${className ?? ""}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        autoComplete="off"
        maxLength={maxLength}
        value={value}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? problemId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldProblem id={problemId} text={problem} />
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
}: {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
  className?: string;
  hideLabel?: boolean;
  problem?: string | undefined;
}) {
  const id = useId();
  const problemId = useId();
  return (
    <div className={`field ce-field ${className ?? ""}`}>
      <label className={hideLabel ? "visually-hidden" : "field-label"} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? problemId : undefined}
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
      <FieldProblem id={problemId} text={problem} />
    </div>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
  problem,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  problem?: string | undefined;
}) {
  const id = useId();
  const hintId = useId();
  const problemId = useId();
  const described = [hint ? hintId : null, problem ? problemId : null].filter(Boolean).join(" ");
  return (
    <div className="ce-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={described === "" ? undefined : described}
        aria-invalid={problem ? true : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={hintId} className="field-hint ce-check-hint">
          {hint}
        </p>
      ) : null}
      <FieldProblem id={problemId} text={problem} />
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
