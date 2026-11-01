// 스킬 편집기 입력 칸 — 정수·글·고르기·켜기. 이름표를 칸과 잇고(htmlFor), 틀린 정수는 칸에 남긴 채 알린다(값은 바꾸지 않는다).
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { parseInt32 } from "./skillModel.ts";

/**
 * 정수 칸: 글자는 칸이 들고, 범위 안 정수일 때만 onChange를 부른다(지우고 다시 쓰는 동안 값이 튀지 않게).
 * 바깥 값이 바뀌면(다른 스킬·되돌리기) 글자를 그 값으로 맞춘다(그리는 중 상태 맞추기)
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
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onChange: (value: number | undefined) => void;
  /** 비우면 undefined(효과 지속 = 사전 값) */
  optional?: boolean;
  className?: string;
  /** 표 머리가 무엇인지 알리는 칸: 이름표는 읽기 프로그램에만 */
  hideLabel?: boolean;
}) {
  const id = useId();
  const shown = value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  const parsed = parseInt32(text, min, max);
  const invalid = !(parsed !== null || (optional && text.trim() === ""));
  return (
    <div className={`field sk-field ${className ?? ""}`}>
      <label className={hideLabel ? "visually-hidden" : "field-label"} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input sk-number"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || undefined}
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
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  maxLength = 200,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`field sk-field ${className ?? ""}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        autoComplete="off"
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
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
}: {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field sk-field ${className ?? ""}`}>
      <label className={hideLabel ? "visually-hidden" : "field-label"} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
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
    </div>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="sk-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={hintId} className="field-hint sk-check-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** 줄 빼기 단추(이름표에 무엇을 빼는지 적는다) */
export function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="button-small sk-remove"
      aria-label={m.dev_skills_remove_named({ name })}
      onClick={onClick}
    >
      {m.dev_skills_remove()}
    </button>
  );
}
