// 전투 실험실 입력 조각 — 숫자 칸(고치는 중 글을 들고, 떠나거나 Enter면 범위 안 정수로 넣는다)과 이름 묻는 창(ko·en).
// 숫자 칸은 바깥 값이 바뀌면(프리셋 불러오기) 고치는 중이 아닐 때 그 값을 보인다(효과로 글을 맞추지 않는다: 고치는 중 글만 상태).
import { LAB_LIMITS, normalizeLabName } from "@terra/shared/battleLab";
import type { LocalizedName } from "@terra/shared/roster";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { parseIntIn } from "./labModel.ts";

export function NumberField(props: {
  readonly label: ReactNode;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly className?: string | undefined;
  readonly hint?: string | undefined;
  readonly hideLabel?: boolean | undefined;
  readonly field?: string | undefined;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseIntIn(draft, props.min, props.max) === null;
  const commit = (): void => {
    if (draft === null) return;
    const value = parseIntIn(draft, props.min, props.max);
    if (value !== null && value !== props.value) props.onChange(value);
    setDraft(null);
  };
  return (
    <div className={`bl-num${props.className ? ` ${props.className}` : ""}`} data-field={props.field}>
      <label className={props.hideLabel ? "visually-hidden" : "bl-num-label"} htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="input bl-num-input"
        inputMode="numeric"
        autoComplete="off"
        value={draft ?? String(props.value)}
        aria-invalid={invalid || undefined}
        title={props.hint ?? m.dev_lab_range({ min: props.min, max: props.max })}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          // 바로 맞는 값이면 곧바로 넣는다(미리 보기가 따라온다)
          const value = parseIntIn(text, props.min, props.max);
          if (value !== null && value !== props.value) props.onChange(value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setDraft(null);
        }}
      />
    </div>
  );
}

export interface NameRequest {
  readonly title: string;
  readonly initial: LocalizedName;
  readonly confirm: string;
  readonly onConfirm: (name: LocalizedName) => void;
}

/** 이름(ko·en) 묻는 창. request가 있으면 <dialog>.showModal()로 연다(초점 가둠, Esc 취소, 닫으면 연 자리로 초점) */
export function NameDialog({ request, onClose }: { request: NameRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);
  return (
    <dialog ref={ref} className="bl-dialog" aria-labelledby="bl-name-title" onClose={onClose}>
      {request ? (
        <NameForm key={request.title + request.initial.ko} request={request} onClose={onClose} />
      ) : null}
    </dialog>
  );
}

function NameForm({ request, onClose }: { request: NameRequest; onClose: () => void }) {
  const id = useId();
  const [ko, setKo] = useState(request.initial.ko);
  const [en, setEn] = useState(request.initial.en);
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const nameKo = normalizeLabName(ko);
    const nameEn = normalizeLabName(en);
    if (nameKo === null || nameEn === null) {
      setInvalid(true);
      return;
    }
    request.onConfirm({ ko: nameKo, en: nameEn });
    onClose();
  };
  const hint = m.dev_lab_name_hint({ max: LAB_LIMITS.nameMax });
  return (
    <form className="bl-dialog-body" onSubmit={submit} noValidate>
      <h2 id="bl-name-title" className="bl-dialog-title">
        {request.title}
      </h2>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-ko`}>
          {m.dev_lab_name_ko()}
        </label>
        <input
          id={`${id}-ko`}
          className="input"
          autoComplete="off"
          value={ko}
          maxLength={LAB_LIMITS.nameMax * 2}
          aria-invalid={invalid && normalizeLabName(ko) === null}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setKo(event.target.value);
            setInvalid(false);
          }}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-en`}>
          {m.dev_lab_name_en()}
        </label>
        <input
          id={`${id}-en`}
          className="input"
          autoComplete="off"
          value={en}
          maxLength={LAB_LIMITS.nameMax * 2}
          aria-invalid={invalid && normalizeLabName(en) === null}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setEn(event.target.value);
            setInvalid(false);
          }}
        />
      </div>
      <p id={`${id}-hint`} className={invalid ? "field-error" : "field-hint"}>
        {invalid ? m.dev_lab_name_invalid({ max: LAB_LIMITS.nameMax }) : hint}
      </p>
      <div className="form-actions">
        <button type="button" className="button-small" onClick={onClose}>
          {m.dev_lab_cancel()}
        </button>
        <button type="submit" className="button-primary button-small">
          {request.confirm}
        </button>
      </div>
    </form>
  );
}

export interface ConfirmRequest {
  readonly title: string;
  readonly body: string;
  readonly confirm: string;
  readonly onConfirm: () => void;
}

/** 확인 창(지우기 등) */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);
  return (
    <dialog ref={ref} className="bl-dialog" aria-labelledby="bl-confirm-title" onClose={onClose}>
      {request ? (
        <div className="bl-dialog-body">
          <h2 id="bl-confirm-title" className="bl-dialog-title">
            {request.title}
          </h2>
          <p>{request.body}</p>
          <div className="form-actions">
            <button type="button" className="button-small" onClick={onClose}>
              {m.dev_lab_cancel()}
            </button>
            <button
              type="button"
              className="button-primary button-small bl-confirm"
              onClick={() => {
                request.onConfirm();
                onClose();
              }}
            >
              {request.confirm}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
