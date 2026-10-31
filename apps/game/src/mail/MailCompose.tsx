// 우편 쓰기 — 받는 사람(사이보그 이름)·제목·내용·첨부(물건·세력 화폐, D-270). 보내기는 명령이라 곧 열림이다:
// [보내기]는 칸 검사(@terra/shared/mail checkMailDraft)만 하고, 맞으면 "아무것도 보내지 않았다"를 읽는다. 서버는 받을 때 다시 본다.
// - 오류는 [보내기]를 한 번 누른 뒤부터 칸마다 보인다(입력 중에는 고치는 대로 사라진다). 처음 틀린 칸으로 초점을 옮긴다.
// - 유닛·테라코인·계정에 묶인 물건은 고를 목록에 없다(서버가 주는 attachables만).
import {
  MAIL_ATTACHMENTS_MAX,
  MAIL_BODY_MAX,
  MAIL_SUBJECT_MAX,
  type MailAttachable,
  type MailDraft,
  checkMailDraft,
  textLength,
} from "@terra/shared/mail";
import { type FormEvent, useId, useMemo, useRef, useState } from "react";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { SoonTag } from "../sections/screenParts.tsx";
import { amountText } from "../sections/screenText.ts";
import { Field } from "../ui/Field.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import {
  type ProblemText,
  attachmentProblem,
  bodyProblem,
  firstProblemField,
  recipientProblem,
  subjectProblem,
} from "./mailView.ts";

/** 쓰기 칸 상태(화면이 들고 있어 탭을 옮겨도 남는다). 첨부 줄의 id는 기기 안 열쇠 */
export interface DraftState {
  readonly recipient: string;
  readonly subject: string;
  readonly body: string;
  readonly rows: readonly { readonly id: number; readonly key: string; readonly amount: string }[];
}

export const EMPTY_DRAFT: DraftState = { recipient: "", subject: "", body: "", rows: [] };

function toDraft(state: DraftState): MailDraft {
  return {
    recipient: state.recipient,
    subject: state.subject,
    body: state.body,
    attachments: state.rows.map((row) => ({ key: row.key, amount: row.amount })),
  };
}

/** 문제 → 문장 */
function problemMessage(problem: ProblemText | null): string | undefined {
  if (problem === null) return undefined;
  switch (problem.key) {
    case "recipient_empty":
      return m.mail_err_recipient_empty();
    case "subject_empty":
      return m.mail_err_subject_empty();
    case "text_invalid":
      return m.mail_err_text_invalid();
    case "attach_unknown":
      return m.mail_err_attach_unknown();
    case "attach_duplicate":
      return m.mail_err_attach_duplicate();
    case "attach_integer":
      return m.mail_err_attach_integer();
    case "attach_over":
      return m.mail_err_attach_over();
    case "too_short":
      return m.mail_err_too_short({ min: formatCount(problem.min) });
    case "too_long":
      return m.mail_err_too_long({ max: formatCount(problem.max) });
    default: {
      const unhandled: never = problem;
      return unhandled;
    }
  }
}

function attachableName(entry: MailAttachable, locale: string): string {
  if (entry.kind === "currency") return entry.name;
  return locale.startsWith("ko") ? entry.label.ko : entry.label.en;
}

const counter = (text: string, max: number): string =>
  m.screen_char_count({ count: formatCount(textLength(text)), max: formatCount(max) });

let nextRowId = 1;

export function MailCompose({
  draft,
  onChange,
  attachables,
}: {
  draft: DraftState;
  onChange: (next: DraftState) => void;
  attachables: readonly MailAttachable[];
}) {
  const base = useId();
  const locale = getLocale();
  const [attempted, setAttempted] = useState(false);
  const [tone, setTone] = useState<"info" | "error">("info");
  const live = useLiveLines();
  const recipientRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const check = useMemo(() => checkMailDraft(toDraft(draft), attachables), [draft, attachables]);
  const byKey = useMemo(() => new Map(attachables.map((entry) => [entry.key, entry])), [attachables]);
  const items = attachables.filter((entry) => entry.kind === "item");
  const currencies = attachables.filter((entry) => entry.kind === "currency");
  const bodyId = `${base}-body`;
  const bodyHintId = `${base}-body-hint`;
  const bodyErrorId = `${base}-body-error`;

  const patch = (next: Partial<DraftState>): void => onChange({ ...draft, ...next });
  const patchRow = (id: number, next: { key?: string; amount?: string }): void =>
    patch({ rows: draft.rows.map((row) => (row.id === id ? { ...row, ...next } : row)) });

  const focusField = (field: ReturnType<typeof firstProblemField>): void => {
    if (field === null) return;
    if (field === "recipient") recipientRef.current?.focus();
    else if (field === "subject") subjectRef.current?.focus();
    else if (field === "body") document.getElementById(bodyId)?.focus();
    else if (field.startsWith("attachment-")) {
      const row = draft.rows[Number(field.slice("attachment-".length))];
      if (row !== undefined) formRef.current?.querySelector<HTMLElement>(`[data-row="${row.id}"]`)?.focus();
    }
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setAttempted(true);
    if (check.ok) {
      setTone("info");
      live.show([m.mail_send_soon()]);
      return;
    }
    setTone("error");
    live.show([m.mail_send_invalid()]);
    focusField(firstProblemField(check));
  };

  const bodyError = attempted ? problemMessage(bodyProblem(check.body)) : undefined;
  return (
    <form
      ref={formRef}
      className="mail-compose"
      noValidate
      onSubmit={onSubmit}
      aria-labelledby={`${base}-title`}
    >
      <h2 id={`${base}-title`} className="screen-section-title">
        {m.mail_compose_title()}
      </h2>
      <Field
        ref={recipientRef}
        label={m.mail_field_recipient()}
        name="recipient"
        value={draft.recipient}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="next"
        hint={m.mail_recipient_hint()}
        onChange={(event) => patch({ recipient: event.target.value })}
        error={attempted ? problemMessage(recipientProblem(check.recipient)) : undefined}
      />
      <Field
        ref={subjectRef}
        label={m.mail_field_subject()}
        name="subject"
        value={draft.subject}
        autoComplete="off"
        enterKeyHint="next"
        hint={counter(draft.subject.trim(), MAIL_SUBJECT_MAX)}
        onChange={(event) => patch({ subject: event.target.value })}
        error={attempted ? problemMessage(subjectProblem(check.subject)) : undefined}
      />
      <div className="field">
        <label className="field-label" htmlFor={bodyId}>
          {m.mail_field_body()}
        </label>
        <p id={bodyHintId} className="field-hint">
          {counter(draft.body, MAIL_BODY_MAX)}
        </p>
        <textarea
          id={bodyId}
          name="body"
          className="input mail-textarea"
          rows={6}
          value={draft.body}
          onChange={(event) => patch({ body: event.target.value })}
          aria-invalid={bodyError === undefined ? undefined : true}
          aria-describedby={bodyError === undefined ? bodyHintId : `${bodyErrorId} ${bodyHintId}`}
        />
        {bodyError === undefined ? null : (
          <p id={bodyErrorId} className="field-error">
            <StatusIcon tone="error" />
            <span>{bodyError}</span>
          </p>
        )}
      </div>
      <fieldset className="mail-attach">
        <legend className="field-label">{m.mail_attach_title()}</legend>
        <p className="field-hint">{m.mail_attach_hint({ count: formatCount(MAIL_ATTACHMENTS_MAX) })}</p>
        {attachables.length === 0 ? <p className="mail-muted">{m.mail_attach_none()}</p> : null}
        {draft.rows.map((row, index) => {
          const chosen = byKey.get(row.key);
          const error = attempted
            ? problemMessage(attachmentProblem(check.attachments[index] ?? null))
            : undefined;
          const rowName = m.mail_attach_row({ index: formatCount(index + 1) });
          const errorId = `${base}-row-${row.id}-error`;
          // 무엇을 보낼지 고르지 않은 오류는 고르기 칸에, 수 오류는 수량 칸에 단다
          const pickError = error !== undefined && check.attachments[index] === "unknown";
          const amountError = error !== undefined && !pickError;
          return (
            <div key={row.id} className="mail-attach-row" role="group" aria-label={rowName}>
              <label className="mail-attach-cell">
                <span className="field-label">{m.mail_attach_pick()}</span>
                <select
                  name={`attachment-${row.id}`}
                  value={row.key}
                  data-row={check.attachments[index] === "unknown" ? row.id : undefined}
                  onChange={(event) => patchRow(row.id, { key: event.target.value })}
                  aria-invalid={pickError ? true : undefined}
                  aria-describedby={pickError ? errorId : undefined}
                >
                  <option value="">{m.mail_attach_pick()}</option>
                  {items.length === 0 ? null : (
                    <optgroup label={m.mail_attach_kind_item()}>
                      {items.map((entry) => (
                        <option key={entry.key} value={entry.key}>
                          {attachableName(entry, locale)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {currencies.length === 0 ? null : (
                    <optgroup label={m.mail_attach_kind_currency()}>
                      {currencies.map((entry) => (
                        <option key={entry.key} value={entry.key}>
                          {attachableName(entry, locale)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <label className="mail-attach-cell mail-attach-amount">
                <span className="field-label">{m.mail_attach_amount()}</span>
                <input
                  name={`amount-${row.id}`}
                  className="input"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.amount}
                  data-row={check.attachments[index] === "unknown" ? undefined : row.id}
                  onChange={(event) => patchRow(row.id, { amount: event.target.value })}
                  aria-invalid={amountError ? true : undefined}
                  aria-describedby={amountError ? errorId : undefined}
                />
              </label>
              <button
                type="button"
                className="button-small mail-attach-remove"
                onClick={() => patch({ rows: draft.rows.filter((entry) => entry.id !== row.id) })}
                aria-label={`${m.mail_attach_remove()} · ${rowName}`}
              >
                {m.mail_attach_remove()}
              </button>
              {chosen === undefined ? null : (
                <p className="field-hint mail-attach-have">
                  {m.mail_attach_have({ max: amountText(chosen.max) })}
                </p>
              )}
              {error === undefined ? null : (
                <p id={errorId} className="field-error mail-attach-error">
                  <StatusIcon tone="error" />
                  <span>{error}</span>
                </p>
              )}
            </div>
          );
        })}
        {attempted && check.tooManyAttachments ? (
          <p className="field-error">
            <StatusIcon tone="error" />
            <span>{m.mail_err_attach_many({ max: formatCount(MAIL_ATTACHMENTS_MAX) })}</span>
          </p>
        ) : null}
        {attachables.length > 0 && draft.rows.length < MAIL_ATTACHMENTS_MAX ? (
          <div className="screen-actions">
            <button
              type="button"
              className="button-small"
              onClick={() => {
                nextRowId += 1;
                patch({ rows: [...draft.rows, { id: nextRowId, key: "", amount: "" }] });
              }}
            >
              {m.mail_attach_add()}
            </button>
          </div>
        ) : null}
      </fieldset>
      <LiveMessage tone={tone} lines={live.lines} version={live.version} />
      <div className="form-actions">
        <button type="submit" className="button-primary mail-send">
          <span>{m.mail_send()}</span>
          <SoonTag />
        </button>
      </div>
    </form>
  );
}
