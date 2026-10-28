// 계정 줄 — 로그인한 아이디(본인에게만 보인다), [관리자](admin에게만), [로그아웃].
// 관리자 버튼을 숨기는 것은 화면 편의일 뿐이다. 권한은 서버가 매 요청 확인한다(기본 거부).
import type { AccountView } from "@terra/shared";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { signOut } from "./session.ts";

interface AccountBarProps {
  user: AccountView;
  /** 관리자 화면 열기. 없으면 버튼을 그리지 않는다(admin이 아니거나 이미 관리자 화면) */
  onOpenAdmin: (() => void) | undefined;
}

export function AccountBar({ user, onOpenAdmin }: AccountBarProps) {
  const [pending, setPending] = useState(false);
  const failure = useLiveLines();

  async function handleSignOut(): Promise<void> {
    if (pending) return;
    setPending(true);
    const ok = await signOut();
    // 성공하면 App이 로그인 화면으로 바꾸며 이 줄을 내린다
    if (!ok) {
      setPending(false);
      failure.show([m.account_sign_out_failed()]);
    }
  }

  return (
    <header className="account-bar">
      <div className="account-bar-row">
        <p className="account-id">
          <span className="visually-hidden">{m.account_id_label()} </span>
          {user.loginId}
        </p>
        {onOpenAdmin ? (
          <button type="button" onClick={onOpenAdmin}>
            {m.account_admin()}
          </button>
        ) : null}
        <button type="button" onClick={() => void handleSignOut()} aria-disabled={pending}>
          {m.account_sign_out()}
        </button>
      </div>
      <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
    </header>
  );
}
