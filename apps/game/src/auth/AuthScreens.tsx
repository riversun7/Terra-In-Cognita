// 로그인하지 않았을 때의 화면 바꾸기 — 로그인 → (없는 아이디) 새 아이디 확인 → 로그인됨, 또는 비밀번호 찾기.
// 주소(라우터) 없이 상태로만 바꾼다(라우터를 들이려면 ADR이 필요하다). 로그인되면 App이 이 화면을 내린다.
import { useState } from "react";
import type { PlainMessageKey } from "../ui/messageRef.ts";
import { LoginScreen, type LoginScreenProps } from "./LoginScreen.tsx";
import { NewIdScreen } from "./NewIdScreen.tsx";
import { ResetScreen } from "./ResetScreen.tsx";
import type { SignedOutReason } from "./sessionState.ts";

type AuthView =
  | { kind: "login"; id: string; notice: LoginScreenProps["notice"]; focus: LoginScreenProps["focus"] }
  /** 비밀번호는 확인 화면에서 다시 보내려고 이 화면 동안만 메모리에 둔다 */
  | { kind: "confirm"; loginId: string; password: string }
  | { kind: "reset"; id: string };

const REASON_NOTICE: Record<SignedOutReason, { key: PlainMessageKey; tone: "success" | "info" }> = {
  signed_out: { key: "auth_notice_signed_out", tone: "success" },
  ended: { key: "auth_notice_session_ended", tone: "info" },
};

export function AuthScreens({ reason }: { reason: SignedOutReason | undefined }) {
  const [view, setView] = useState<AuthView>(() => ({
    kind: "login",
    id: "",
    notice: reason ? REASON_NOTICE[reason] : undefined,
    // 로그아웃 직후에는 제목으로 초점을 옮겨 화면이 바뀐 것을 알린다. 앱을 켰을 때는 옮기지 않는다
    focus: reason ? "heading" : "none",
  }));

  switch (view.kind) {
    case "login":
      return (
        <LoginScreen
          // 같은 종류 화면끼리 옮겨도 입력·초점을 새로 시작한다
          key={`login:${view.focus}:${view.notice?.key ?? ""}`}
          initialId={view.id}
          notice={view.notice}
          focus={view.focus}
          onNewId={(loginId, password) => setView({ kind: "confirm", loginId, password })}
          onForgot={(id) => setView({ kind: "reset", id })}
        />
      );
    case "confirm":
      return (
        <NewIdScreen
          loginId={view.loginId}
          password={view.password}
          onBack={() => setView({ kind: "login", id: view.loginId, notice: undefined, focus: "id" })}
        />
      );
    case "reset":
      return (
        <ResetScreen
          initialId={view.id}
          onDone={(id) =>
            setView({
              kind: "login",
              id,
              notice: { key: "auth_notice_password_reset", tone: "success" },
              focus: "heading",
            })
          }
          onCancel={(id) => setView({ kind: "login", id, notice: undefined, focus: "heading" })}
        />
      );
    default: {
      const unhandled: never = view;
      return unhandled;
    }
  }
}
