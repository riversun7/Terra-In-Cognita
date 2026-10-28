// 로그인 화면 — 아이디·비밀번호. 있는 아이디면 로그인하고, 없는 아이디면 "새 아이디" 확인 화면으로 간다.
// 아이디는 보내기 전에 @terra/shared parseLoginId로 검사한다(서버와 같은 규칙).
import { type FormEvent, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { Brand } from "../ui/Brand.tsx";
import { Field } from "../ui/Field.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import type { PlainMessageKey } from "../ui/messageRef.ts";
import { text } from "../ui/text.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { enter } from "./accountClient.ts";
import { accountFailureMessage } from "./errorMessages.ts";
import { refreshSession } from "./session.ts";
import { type FieldErrors, checkLogin } from "./validation.ts";

export interface LoginScreenProps {
  initialId: string;
  /** 위에 띄울 안내(로그아웃함, 비밀번호 바꿈 등) */
  notice: { key: PlainMessageKey; tone: "success" | "info" } | undefined;
  /** 처음 그릴 때 초점: 제목(화면이 바뀜), 아이디 칸(다시 입력), 없음(앱을 켬) */
  focus: "heading" | "id" | "none";
  onNewId: (loginId: string, password: string) => void;
  onForgot: (id: string) => void;
}

export function LoginScreen({ initialId, notice, focus, onNewId, onForgot }: LoginScreenProps) {
  const [id, setId] = useState(initialId);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"id" | "password">>({});
  const [pending, setPending] = useState(false);
  const failure = useLiveLines();
  const headingRef = useMountFocus<HTMLHeadingElement>(focus === "heading");
  const idRef = useMountFocus<HTMLInputElement>(focus === "id");
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const check = checkLogin({ id, password });
    if (!check.ok) {
      setErrors(check.errors);
      failure.clear();
      (check.errors.id ? idRef : passwordRef).current?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    const result = await enter({ id: check.loginId, password });
    if (!result.ok) {
      setPending(false);
      failure.show([text(accountFailureMessage(result.failure))]);
      if (result.failure.kind === "code" && result.failure.code === "INVALID_PASSWORD") {
        passwordRef.current?.select();
      }
      return;
    }
    if (result.value.status === "new_id") {
      onNewId(result.value.loginId, password);
      return;
    }
    // 로그인됨: 세션을 다시 읽으면 앱이 첫 화면으로 바뀐다. 쿠키가 남지 않았으면 여기서 알린다
    const session = await refreshSession();
    if (session.kind !== "signed_in") {
      setPending(false);
      failure.show([text({ key: "auth_err_session_missing" })]);
    }
  }

  return (
    <section className="screen" aria-labelledby="login-title">
      <Brand size="large" />
      <div className="panel">
        <h1 id="login-title" className="screen-title" ref={headingRef} tabIndex={-1}>
          {m.auth_login_title()}
        </h1>
        <p className="lead">{m.auth_login_lead()}</p>
        {notice ? <LiveMessage tone={notice.tone} lines={[text({ key: notice.key })]} /> : null}
        <form className="form" noValidate onSubmit={(event) => void submit(event)} aria-busy={pending}>
          <Field
            ref={idRef}
            label={m.auth_id_label()}
            hint={m.auth_id_hint()}
            error={errors.id ? text({ key: errors.id }) : undefined}
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={id}
            onChange={(event) => setId(event.target.value)}
          />
          <Field
            ref={passwordRef}
            label={m.auth_password_label()}
            hint={m.auth_password_hint()}
            error={errors.password ? text({ key: errors.password }) : undefined}
            name="password"
            type="password"
            autoComplete="current-password"
            enterKeyHint="go"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {/* 알림 영역은 비어 있어도 자리를 지킨다. 칸 사이 간격이 두 번 생기지 않게 버튼과 묶는다 */}
          <div className="form-end">
            <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
            <p className="visually-hidden" role="status">
              {pending ? m.pending() : ""}
            </p>
            <div className="form-actions">
              <button type="submit" className="button-primary" aria-disabled={pending}>
                {m.auth_sign_in()}
              </button>
            </div>
          </div>
        </form>
        <button type="button" className="button-text" onClick={() => onForgot(id)}>
          {m.auth_forgot()}
        </button>
      </div>
    </section>
  );
}
