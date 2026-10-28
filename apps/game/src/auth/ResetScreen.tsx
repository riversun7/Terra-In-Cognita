// 비밀번호 찾기 — 아이디 + 가입 때 넣은 이메일이 맞으면 새 비밀번호로 바꾼다(확인 메일 없음).
// 바꾸면 서버가 그 계정의 세션을 모두 끊는다. 성공하면 로그인 화면으로 돌아가 안내를 띄운다.
// 아이디가 틀렸는지 이메일이 틀렸는지는 서버가 알려 주지 않는다(RESET_FAILED 하나).
import { type AccountErrorCode, parseLoginId } from "@terra/shared";
import { type FormEvent, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { Brand } from "../ui/Brand.tsx";
import { Field } from "../ui/Field.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { text } from "../ui/text.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { resetPassword } from "./accountClient.ts";
import { accountFailureMessage } from "./errorMessages.ts";
import { type FieldErrors, type ResetField, checkReset, hasErrors } from "./validation.ts";

export interface ResetScreenProps {
  initialId: string;
  /** 바꿈 — 로그인 화면으로(입력한 아이디를 넘긴다) */
  onDone: (id: string) => void;
  onCancel: (id: string) => void;
}

/** 서버 오류 코드 중 칸 하나에 붙일 것 */
const FIELD_FOR_CODE: Partial<Record<AccountErrorCode, ResetField>> = {
  INVALID_ID: "id",
  INVALID_EMAIL: "email",
  PASSWORD_TOO_SHORT: "newPassword",
  PASSWORD_TOO_LONG: "newPassword",
  PASSWORD_SAME_AS_ID: "newPassword",
  PASSWORD_TOO_COMMON: "newPassword",
  PASSWORD_MISMATCH: "newPasswordConfirm",
};
const FIELD_ORDER: readonly ResetField[] = ["id", "email", "newPassword", "newPasswordConfirm"];

export function ResetScreen({ initialId, onDone, onCancel }: ResetScreenProps) {
  const [values, setValues] = useState<Record<ResetField, string>>({
    id: initialId,
    email: "",
    newPassword: "",
    newPasswordConfirm: "",
  });
  const [errors, setErrors] = useState<FieldErrors<ResetField>>({});
  const [pending, setPending] = useState(false);
  const failure = useLiveLines();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const idRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const change = (name: ResetField, value: string): void =>
    setValues((previous) => ({ ...previous, [name]: value }));
  const errorText = (name: ResetField): string | undefined => {
    const key = errors[name];
    return key ? text({ key }) : undefined;
  };
  /** 오류가 있는 첫 칸으로 초점(이벤트 처리 중에만 부른다) */
  const focusFirst = (found: FieldErrors<ResetField>): void => {
    const first = FIELD_ORDER.find((name) => found[name] !== undefined);
    const target =
      first === "id"
        ? idRef
        : first === "email"
          ? emailRef
          : first === "newPassword"
            ? newPasswordRef
            : first === "newPasswordConfirm"
              ? confirmRef
              : undefined;
    target?.current?.focus();
  };

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const found = checkReset(values);
    if (hasErrors(found)) {
      setErrors(found);
      failure.clear();
      focusFirst(found);
      return;
    }
    setErrors({});
    setPending(true);
    const id = parseLoginId(values.id);
    const result = await resetPassword({
      id: id.ok ? id.display : values.id,
      email: values.email.trim(),
      newPassword: values.newPassword,
      newPasswordConfirm: values.newPasswordConfirm,
    });
    setPending(false);
    if (result.ok) {
      onDone(id.ok ? id.display : values.id);
      return;
    }
    const message = accountFailureMessage(result.failure);
    const fieldName = result.failure.kind === "code" ? FIELD_FOR_CODE[result.failure.code] : undefined;
    if (fieldName && !("waitSec" in message)) {
      const fieldErrors: FieldErrors<ResetField> = { [fieldName]: message.key };
      setErrors(fieldErrors);
      failure.clear();
      focusFirst(fieldErrors);
      return;
    }
    failure.show([text(message)]);
  }

  return (
    <section className="screen" aria-labelledby="reset-title">
      <Brand size="small" />
      <div className="panel">
        <h1 id="reset-title" className="screen-title" ref={headingRef} tabIndex={-1}>
          {m.reset_title()}
        </h1>
        <p className="lead">{m.reset_lead()}</p>
        <p className="lead">{m.reset_no_email()}</p>
        <form className="form" noValidate onSubmit={(event) => void submit(event)} aria-busy={pending}>
          <Field
            ref={idRef}
            label={m.auth_id_label()}
            hint={m.auth_id_hint()}
            error={errorText("id")}
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={values.id}
            onChange={(event) => change("id", event.target.value)}
          />
          <Field
            ref={emailRef}
            label={m.reset_email_label()}
            error={errorText("email")}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={values.email}
            onChange={(event) => change("email", event.target.value)}
          />
          <Field
            ref={newPasswordRef}
            label={m.reset_new_password_label()}
            hint={m.reset_new_password_hint()}
            error={errorText("newPassword")}
            name="new-password"
            type="password"
            autoComplete="new-password"
            enterKeyHint="next"
            value={values.newPassword}
            onChange={(event) => change("newPassword", event.target.value)}
          />
          <Field
            ref={confirmRef}
            label={m.reset_confirm_label()}
            error={errorText("newPasswordConfirm")}
            name="new-password-confirm"
            type="password"
            autoComplete="new-password"
            enterKeyHint="done"
            value={values.newPasswordConfirm}
            onChange={(event) => change("newPasswordConfirm", event.target.value)}
          />
          {/* 알림 영역은 비어 있어도 자리를 지킨다. 칸 사이 간격이 두 번 생기지 않게 버튼과 묶는다 */}
          <div className="form-end">
            <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
            <p className="visually-hidden" role="status">
              {pending ? m.pending() : ""}
            </p>
            <div className="form-actions">
              <button type="submit" className="button-primary" aria-disabled={pending}>
                {m.reset_submit()}
              </button>
              <button type="button" onClick={() => onCancel(values.id)}>
                {m.cancel()}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
