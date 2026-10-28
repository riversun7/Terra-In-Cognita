// 앱 화면 — 로그인 상태에 따라 바꾼다(주소·라우터 없이 상태로).
// - 확인 중 / 확인 못 함(다시 시도) / 로그인 화면들 / 로그인됨: 계정 줄 + 상태 화면(M0) 또는 관리자 화면
// - 서버 연결과 새 버전 안내는 로그인과 상관없이 늘 켠다(옛 버전이면 로그인 전에도 새 버전으로 바꾼다)
// 관리자 화면은 지연 로딩한다(별도 조각 파일, admin에게만 버튼이 보인다). 권한은 서버가 매 요청 확인한다.
import { type ReactNode, Suspense, lazy, useEffect, useState } from "react";
import { AccountBar } from "./auth/AccountBar.tsx";
import { AuthScreens } from "./auth/AuthScreens.tsx";
import { refreshSession, retrySessionIfUnavailable, useSession } from "./auth/session.ts";
import { isAdmin } from "./auth/sessionState.ts";
import { type ConnectionStatus, connect } from "./net/connection.ts";
import { m } from "./paraglide/messages.js";
import type { FrameMonitor } from "./perf/frameMonitor.ts";
import { UpdateBanner } from "./pwa/UpdateBanner.tsx";
import { checkForUpdate, forceUpdate } from "./pwa/updates.ts";
import { RejectedNotice, StatusPanel } from "./StatusPanel.tsx";
import { ChunkErrorBoundary } from "./ui/ChunkErrorBoundary.tsx";
import { LanguageSelect } from "./ui/LanguageSelect.tsx";
import { LiveMessage } from "./ui/LiveMessage.tsx";

const AdminPage = lazy(() => import("./admin/AdminPage.tsx"));

function SessionUnavailable() {
  return (
    <section className="screen">
      <h1 className="screen-title">{m.app_title()}</h1>
      <LiveMessage tone="error" lines={[m.session_unavailable()]} />
      <div className="form-actions">
        <button type="button" onClick={() => void refreshSession()}>
          {m.retry()}
        </button>
      </div>
    </section>
  );
}

function AdminLoadFailed() {
  return (
    <section className="screen">
      <LiveMessage tone="error" lines={[m.admin_load_failed()]} />
      <div className="form-actions">
        <button type="button" onClick={() => void forceUpdate("manual")}>
          {m.retry()}
        </button>
      </div>
    </section>
  );
}

export function App({ monitor }: { monitor: FrameMonitor }) {
  const [status, setStatus] = useState<ConnectionStatus>({ kind: "connecting" });
  const session = useSession();
  /** 관리자 화면을 연 사용자. 로그아웃하거나 다른 계정으로 들어오면 저절로 닫힌다 */
  const [adminFor, setAdminFor] = useState<string | null>(null);

  useEffect(
    () =>
      connect(
        (next) => {
          setStatus(next);
          // 서버와 버전이 안 맞으면 새 버전을 찾아 적용한다(없으면 새로고침). 되돌림 배포로 기기가 더 새 버전일 때도 같다
          if (next.kind === "rejected" && next.code === "protocol_unsupported") void forceUpdate("auto");
        },
        {
          onWelcome: () => {
            // 배포하면 서버가 다시 시작되고 기기가 다시 접속한다 → welcome마다 새 버전 확인
            checkForUpdate();
            // 서버가 꺼져 있어 로그인 상태를 확인하지 못했다면 지금 다시 확인한다
            retrySessionIfUnavailable();
          },
        },
      ),
    [],
  );

  const user = session.kind === "signed_in" ? session.user : null;
  const admin = isAdmin(session);
  const adminOpen = admin && user !== null && adminFor === user.id;

  let content: ReactNode;
  let statusShown = false;
  if (session.kind === "loading") {
    content = (
      <p className="status" role="status">
        {m.session_checking()}
      </p>
    );
  } else if (session.kind === "unavailable") {
    content = <SessionUnavailable />;
  } else if (session.kind === "signed_out") {
    content = <AuthScreens reason={session.reason} />;
  } else if (adminOpen) {
    content = (
      <ChunkErrorBoundary fallback={<AdminLoadFailed />}>
        <Suspense
          fallback={
            <p className="status" role="status">
              {m.admin_loading()}
            </p>
          }
        >
          <AdminPage viewer={session.user} onClose={() => setAdminFor(null)} />
        </Suspense>
      </ChunkErrorBoundary>
    );
  } else {
    statusShown = true;
    content = <StatusPanel status={status} monitor={monitor} />;
  }

  return (
    <>
      {user ? (
        <AccountBar user={user} onOpenAdmin={admin && !adminOpen ? () => setAdminFor(user.id) : undefined} />
      ) : null}
      <main className="shell">
        {content}
        {statusShown ? null : <RejectedNotice status={status} />}
        <LanguageSelect />
      </main>
      <UpdateBanner />
    </>
  );
}
