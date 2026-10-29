// 계정 줄 — 로그인한 아이디(본인에게만 보인다), [1차맵]·[2차맵](임시 시험 화면), [관리자](admin에게만), [설정], [로그아웃].
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
  /** 설정 화면 열기. 없으면 버튼을 그리지 않는다(이미 설정 화면) */
  onOpenSettings: (() => void) | undefined;
  /** [임시] 1차맵 시험 화면 열기 — 앱 화면 흐름(아래 탭)이 생기면 이 버튼을 지운다 */
  onOpenPlanet: (() => void) | undefined;
  /** [임시] 2차맵 시험 화면 열기 — 앱 화면 흐름(아래 탭)이 생기면 이 버튼을 지운다 */
  onOpenMap: (() => void) | undefined;
}

export function AccountBar({ user, onOpenAdmin, onOpenSettings, onOpenPlanet, onOpenMap }: AccountBarProps) {
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
        <p className="account-id" translate="no">
          <span className="visually-hidden">{m.account_id_label()} </span>
          {user.loginId}
        </p>
        <div className="account-actions">
          {/* [임시] 1차맵·2차맵 시험 화면 — 앱 화면 흐름이 생기면 지운다 */}
          {onOpenPlanet ? (
            <button type="button" className="button-small" onClick={onOpenPlanet}>
              {m.account_planet()}
            </button>
          ) : null}
          {onOpenMap ? (
            <button type="button" className="button-small" onClick={onOpenMap}>
              {m.account_map()}
            </button>
          ) : null}
          {onOpenAdmin ? (
            <button type="button" className="button-small" onClick={onOpenAdmin}>
              {m.account_admin()}
            </button>
          ) : null}
          {onOpenSettings ? (
            <button type="button" className="button-small" onClick={onOpenSettings}>
              {m.account_settings()}
            </button>
          ) : null}
          <button
            type="button"
            className="button-small"
            onClick={() => void handleSignOut()}
            aria-disabled={pending}
          >
            {m.account_sign_out()}
          </button>
        </div>
      </div>
      <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
    </header>
  );
}
