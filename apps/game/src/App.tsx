// 앱 화면 — 로그인 상태에 따라 고른다. 로그인한 뒤의 화면은 주소(라우터)가 정한다(ADR 2026-10-29-app-shell).
// - 확인 중 / 확인 못 함(다시 시도) / 로그인 화면들: 틀 없이 그린다. 로그인 화면들은 주소 없이 상태로 바꾼다(비밀번호가
//   주소에 남지 않게). 로그인하지 않은 채 어떤 주소로 열면 그 자리에 로그인 화면이 뜨고, 로그인하면 그 주소의 화면이 열린다.
// - 로그인됨: 화면 틀(shell/Shell.tsx) — 위 띠·하단 탭·사이드 메뉴와 주소의 화면.
// - 로그아웃하거나 다른 계정으로 들어오면 홈(/)으로 바꾼다(전의 OpenView.userId 규칙을 잇는다).
// - 서버 연결(net/connectionStatus.ts)과 새 버전 안내는 로그인과 상관없이 늘 켠다(main.tsx가 시작한다).
// 언어 고르기는 로그인하지 않은 화면 아래에 둔다(로그인 전에도 영어로 바꾸게). 로그인한 뒤에는 설정 화면에 있다.
import { type ReactNode, useEffect, useRef } from "react";
import { AuthScreens } from "./auth/AuthScreens.tsx";
import { refreshSession, useSession } from "./auth/session.ts";
import { followIdentity } from "./net/serverLink.ts";
import { m } from "./paraglide/messages.js";
import type { FrameMonitor } from "./perf/frameMonitor.ts";
import { UpdateBanner } from "./pwa/UpdateBanner.tsx";
import { ConnectionNotice } from "./shell/ConnectionNotice.tsx";
import { resetToHome } from "./shell/routerStore.ts";
import { Shell } from "./shell/Shell.tsx";
import { LanguageSelect } from "./ui/LanguageSelect.tsx";
import { LiveMessage } from "./ui/LiveMessage.tsx";

function SessionUnavailable() {
  return (
    <section className="screen">
      <div className="panel">
        <h1 className="screen-title">{m.app_title()}</h1>
        <LiveMessage tone="error" lines={[m.session_unavailable()]} />
        <div className="form-actions">
          <button type="button" className="button-primary" onClick={() => void refreshSession()}>
            {m.retry()}
          </button>
        </div>
      </div>
    </section>
  );
}

export function App({ monitor }: { monitor: FrameMonitor }) {
  const session = useSession();

  // 로그인한 사용자 — 확인 전(loading·unavailable)은 undefined
  const identity =
    session.kind === "signed_in" ? session.user.id : session.kind === "signed_out" ? null : undefined;
  const lastIdentity = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (identity === undefined) return;
    // 서버는 WebSocket 연결 요청에 실린 쿠키로만 사용자를 알고(2차맵 구독·명령), 앱을 켤 때 연결은 로그인보다 먼저 열린다.
    // 그래서 로그인한 사용자가 바뀌면(들어가기·로그아웃·다른 계정) 연결을 다시 맺는다
    followIdentity(identity);
    const previous = lastIdentity.current;
    lastIdentity.current = identity;
    // 로그아웃·다른 계정 → 홈. 로그인 전 → 로그인은 주소를 지킨다(로그인하지 않은 채 연 주소의 화면이 열린다)
    if (typeof previous === "string" && previous !== identity) resetToHome();
  }, [identity]);

  if (session.kind === "signed_in") {
    return (
      <>
        <Shell user={session.user} monitor={monitor} />
        <UpdateBanner />
      </>
    );
  }

  let content: ReactNode;
  if (session.kind === "loading") {
    content = (
      <p className="status" role="status">
        {m.session_checking()}
      </p>
    );
  } else if (session.kind === "unavailable") {
    content = <SessionUnavailable />;
  } else {
    content = <AuthScreens reason={session.reason} />;
  }
  return (
    <>
      <main className="page">
        {content}
        <ConnectionNotice floating={false} showLost={false} />
        <LanguageSelect />
      </main>
      <UpdateBanner />
    </>
  );
}
