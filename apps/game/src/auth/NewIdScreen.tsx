// "새 아이디" 확인 화면 — 로그인 화면에서 없는 아이디를 넣었을 때. 계정은 아직 없다.
// 비밀번호를 한 번 더 받고, 이메일은 넣어도 되고 안 넣어도 된다. [가입]은 create: true로 다시 보낸다.
// 비밀번호 자체를 바꾸려면 [다시 입력]으로 로그인 화면에 돌아간다(아이디는 남겨 둔다).
import { parseLoginId } from "@terra/shared";
import { type FormEvent, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { Brand } from "../ui/Brand.tsx";
import { Field } from "../ui/Field.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { text } from "../ui/text.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { enter } from "./accountClient.ts";
import { accountFailureMessage, isNewPasswordRuleCode } from "./errorMessages.ts";
import { refreshSession } from "./session.ts";
import { type FieldErrors, checkCreate, hasErrors, newPasswordProblem } from "./validation.ts";

export interface NewIdScreenProps {
  /** 서버가 돌려준 아이디(입력한 모양) */
  loginId: string;
  /** 로그인 화면에서 넣은 비밀번호 */
  password: string;
  onBack: () => void;
}

/** 비밀번호 규칙에 걸리면: 규칙 문구 + "[다시 입력]을 누르세요" */
const ruleLines = (ruleText: string): string[] => [ruleText, m.confirm_retype_hint()];

export function NewIdScreen({ loginId, password, onBack }: NewIdScreenProps) {
  // 로그인 화면에서 넣은 비밀번호가 규칙에 걸리면 처음부터 알린다(확인을 넣기 전에)
  const [initialRule] = useState(() => {
    const id = parseLoginId(loginId);
    return newPasswordProblem(password, id.ok ? id.key : "");
  });
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"passwordConfirm" | "email">>({});
  const [pending, setPending] = useState(false);
  const failure = useLiveLines(initialRule ? ruleLines(text({ key: initialRule })) : []);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const confirmRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const check = checkCreate({ loginId, password, passwordConfirm, email });
    if (check.passwordRule) {
      failure.show(ruleLines(text({ key: check.passwordRule })));
      backRef.current?.focus();
      return;
    }
    if (hasErrors(check.fields)) {
      setErrors(check.fields);
      failure.clear();
      (check.fields.passwordConfirm ? confirmRef : emailRef).current?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    const trimmedEmail = email.trim();
    const result = await enter({
      id: loginId,
      password,
      create: true,
      passwordConfirm,
      ...(trimmedEmail === "" ? {} : { email: trimmedEmail }),
    });
    if (!result.ok) {
      setPending(false);
      const message = text(accountFailureMessage(result.failure));
      const code = result.failure.kind === "code" ? result.failure.code : undefined;
      if (code === "PASSWORD_MISMATCH") {
        setErrors({ passwordConfirm: "auth_err_password_mismatch" });
        failure.clear();
        confirmRef.current?.focus();
      } else if (code === "INVALID_EMAIL") {
        setErrors({ email: "auth_err_invalid_email" });
        failure.clear();
        emailRef.current?.focus();
      } else if (code !== undefined && isNewPasswordRuleCode(code)) {
        failure.show(ruleLines(message));
        backRef.current?.focus();
      } else {
        failure.show([message]);
      }
      return;
    }
    // created 또는 (그새 같은 비밀번호로 만들어졌으면) signed_in. 세션을 다시 읽으면 앱이 첫 화면으로 바뀐다
    const session = await refreshSession();
    if (session.kind !== "signed_in") {
      setPending(false);
      failure.show([text({ key: "auth_err_session_missing" })]);
    }
  }

  return (
    <section className="screen" aria-labelledby="new-id-title">
      <Brand size="small" />
      <div className="panel">
        <h1 id="new-id-title" className="screen-title" ref={headingRef} tabIndex={-1}>
          {m.confirm_title()}
        </h1>
        <p className="lead">{m.confirm_lead()}</p>
        <dl className="new-id-box">
          <dt className="new-id-label">{m.confirm_id_label()}</dt>
          <dd className="new-id" translate="no">
            {loginId}
          </dd>
        </dl>
        <form className="form" noValidate onSubmit={(event) => void submit(event)} aria-busy={pending}>
          {/* 비밀번호 관리자가 새 비밀번호를 이 아이디로 저장하게 한다 */}
          <input type="text" name="username" autoComplete="username" value={loginId} readOnly hidden />
          <Field
            ref={confirmRef}
            label={m.confirm_password_label()}
            hint={m.confirm_password_hint()}
            error={errors.passwordConfirm ? text({ key: errors.passwordConfirm }) : undefined}
            name="password-confirm"
            type="password"
            autoComplete="new-password"
            enterKeyHint="next"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
          />
          <Field
            ref={emailRef}
            label={m.confirm_email_label()}
            error={errors.email ? text({ key: errors.email }) : undefined}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <ul className="info-list">
            <li>{m.confirm_email_with()}</li>
            <li>{m.confirm_email_no_mail()}</li>
            <li>{m.confirm_email_without()}</li>
          </ul>
          {/* 알림 영역은 비어 있어도 자리를 지킨다. 칸 사이 간격이 두 번 생기지 않게 버튼과 묶는다 */}
          <div className="form-end">
            <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
            <p className="visually-hidden" role="status">
              {pending ? m.pending() : ""}
            </p>
            <div className="form-actions">
              <button type="submit" className="button-primary" aria-disabled={pending}>
                {m.confirm_create()}
              </button>
              <button type="button" ref={backRef} onClick={onBack}>
                {m.confirm_retype()}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
