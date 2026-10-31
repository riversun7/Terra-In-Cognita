// 이름 묻는 창 — [새 행성](이름 + 시작점), [다른 이름으로 저장], [이름 바꾸기](ADR 38 "바뀜: 행성 보관함").
// <dialog>.showModal()로 연다(초점 가둠, Esc 취소). 이름은 @terra/shared normalizePlanetLibraryName 규칙으로 기기에서 먼저 본다
// (서버도 같은 규칙으로 다시 본다). 맞지 않으면 칸 아래에 알리고 닫지 않는다.
import { PLANET_LIBRARY_NAME_MAX, normalizePlanetLibraryName } from "@terra/shared";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";

export interface PromptChoice {
  readonly value: string;
  readonly label: string;
}

export interface PromptRequest {
  readonly title: string;
  readonly initialName: string;
  readonly confirmLabel: string;
  /** 시작점 고르기(새 행성만) */
  readonly choices?: { readonly options: readonly PromptChoice[]; readonly initial: string };
  readonly onConfirm: (name: string, choice: string | null) => void;
}

function PromptForm({ request, onClose }: { request: PromptRequest; onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState(request.initialName);
  const [choice, setChoice] = useState(request.choices?.initial ?? null);
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const normalized = normalizePlanetLibraryName(name);
    if (normalized === null) {
      setInvalid(true);
      return;
    }
    request.onConfirm(normalized, choice);
    onClose();
  };
  return (
    <form className="pe-dialog-body" onSubmit={submit} noValidate>
      <h2 id={`${id}-title`} className="pe-dialog-title">
        {request.title}
      </h2>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-name`}>
          {m.planet_editor_library_name()}
        </label>
        <input
          id={`${id}-name`}
          className="input pe-name-input"
          name="planet-name"
          autoComplete="off"
          value={name}
          maxLength={PLANET_LIBRARY_NAME_MAX * 2}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setName(event.target.value);
            setInvalid(false);
          }}
        />
        <p id={`${id}-hint`} className={invalid ? "field-error" : "field-hint"}>
          {invalid
            ? m.planet_editor_library_name_invalid({ max: String(PLANET_LIBRARY_NAME_MAX) })
            : m.planet_editor_library_name_hint({ max: String(PLANET_LIBRARY_NAME_MAX) })}
        </p>
      </div>
      {request.choices ? (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-base`}>
            {m.planet_editor_library_start_from()}
          </label>
          <select
            id={`${id}-base`}
            className="pe-base-select"
            value={choice ?? ""}
            onChange={(event) => setChoice(event.target.value)}
          >
            {request.choices.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          {m.planet_editor_cancel()}
        </button>
        <button type="submit" className="button-primary pe-prompt-confirm">
          {request.confirmLabel}
        </button>
      </div>
    </form>
  );
}

export function PromptDialog({ request, onClose }: { request: PromptRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);
  return (
    <dialog
      ref={ref}
      className="pe-dialog pe-prompt"
      data-density="compact"
      aria-label={request?.title}
      onClose={() => {
        if (request) onClose();
      }}
    >
      {request ? <PromptForm key={request.title} request={request} onClose={onClose} /> : null}
    </dialog>
  );
}
