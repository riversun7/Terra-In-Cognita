// 입력칸 하나 — 보이는 이름표(label), 안내, 오류를 입력칸에 이어 둔다(aria-describedby).
// 오류가 있으면 aria-invalid. 글자 크기는 16px 이상(iOS 확대 방지, styles/tokens.css).
// 오류 문구 앞에는 상태 아이콘을 둔다(색만으로 알리지 않는다).
import { type InputHTMLAttributes, type Ref, useId } from "react";
import { StatusIcon } from "./StatusIcon.tsx";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "children"> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  ref?: Ref<HTMLInputElement>;
}

export function Field({ label, hint, error, ref, ...input }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      <input
        {...input}
        ref={ref}
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === "" ? undefined : describedBy}
      />
      {error ? (
        <p id={errorId} className="field-error">
          <StatusIcon tone="error" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
