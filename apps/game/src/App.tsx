// 앱 화면 — 로그인 상태에 따라 바꾼다(주소·라우터 없이 상태로).
// - 확인 중 / 확인 못 함(다시 시도) / 로그인 화면들 / 로그인됨: 계정 줄 + 상태 화면(M0)·관리자 화면·설정 화면
// - 서버 연결과 새 버전 안내는 로그인과 상관없이 늘 켠다(옛 버전이면 로그인 전에도 새 버전으로 바꾼다)
// 관리자 화면과 설정 화면은 지연 로딩한다(별도 조각 파일). 관리자 권한은 서버가 매 요청 확인한다.
// 언어 고르기는 로그인하지 않은 화면 아래에 둔다(로그인 전에도 영어로 바꾸게). 로그인한 뒤에는 설정 화면에 있다.
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
const SettingsPage = lazy(() => import("./settings/SettingsPage.tsx"));
// [임시] 2차맵 시험 화면 — 앱 화면 흐름(홈·아래 탭)이 생기면 그 "지도" 탭으로 옮기고 여기 여는 곳(map)과 계정 줄 버튼을 지운다.
// Three.js·엔진은 이 조각과 함께만 내려온다(첫 화면 묶음에 넣지 않는다)
const SecondaryMapScreen = lazy(() => import("./map/SecondaryMapScreen.tsx"));

/** 계정 줄에서 여는 화면. 연 사용자를 함께 둔다: 로그아웃하거나 다른 계정으로 들어오면 저절로 닫힌다 */
interface OpenView {
  kind: "admin" | "settings" | "map";
  userId: string;
}

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

/** 지연 로딩 조각을 못 불러왔을 때. [다시 시도]는 강제 적용(새 버전, 없으면 새로고침)이다 */
function ChunkLoadFailed({ message }: { message: string }) {
  return (
    <section className="screen">
      <LiveMessage tone="error" lines={[message]} />
      <div className="form-actions">
        <button type="button" onClick={() => void forceUpdate("manual")}>
          {m.retry()}
        </button>
      </div>
    </section>
  );
}

/** 지연 로딩 화면 — 실패하면 그 자리만 안내로 바뀐다 */
function LazyView({ loading, failed, children }: { loading: string; failed: string; children: ReactNode }) {
  return (
    <ChunkErrorBoundary fallback={<ChunkLoadFailed message={failed} />}>
      <Suspense
        fallback={
          <p className="status" role="status">
            {loading}
          </p>
        }
      >
        {children}
      </Suspense>
    </ChunkErrorBoundary>
  );
}

export function App({ monitor }: { monitor: FrameMonitor }) {
  const [status, setStatus] = useState<ConnectionStatus>({ kind: "connecting" });
  const session = useSession();
  const [openView, setOpenView] = useState<OpenView | null>(null);

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
  const view = user !== null && openView?.userId === user.id ? openView.kind : null;
  const adminOpen = admin && view === "admin";
  const settingsOpen = view === "settings";
  // [임시] 2차맵 시험 화면(화면 전체를 덮는다)
  const mapOpen = view === "map";
  const open = (kind: OpenView["kind"]) => (user ? () => setOpenView({ kind, userId: user.id }) : undefined);
  const close = () => setOpenView(null);

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
      <LazyView loading={m.admin_loading()} failed={m.admin_load_failed()}>
        <AdminPage viewer={session.user} onClose={close} />
      </LazyView>
    );
  } else if (settingsOpen) {
    content = (
      <LazyView loading={m.settings_loading()} failed={m.settings_load_failed()}>
        <SettingsPage onClose={close} />
      </LazyView>
    );
  } else if (mapOpen) {
    content = (
      <LazyView loading={m.map_loading()} failed={m.map_load_failed()}>
        <SecondaryMapScreen
          onClose={close}
          monitor={monitor}
          clockOffsetMs={status.kind === "connected" && status.clock ? status.clock.offsetMs : 0}
        />
      </LazyView>
    );
  } else {
    statusShown = true;
    content = <StatusPanel status={status} monitor={monitor} />;
  }

  return (
    <>
      {/* 2차맵은 화면 전체를 덮으므로 그동안 계정 줄을 내린다(가려진 버튼으로 초점이 가지 않게) */}
      {user && !mapOpen ? (
        <AccountBar
          user={user}
          onOpenAdmin={admin && !adminOpen ? open("admin") : undefined}
          onOpenSettings={settingsOpen ? undefined : open("settings")}
          onOpenMap={open("map")}
        />
      ) : null}
      <main className="shell">
        {content}
        {statusShown ? null : <RejectedNotice status={status} />}
        {user ? null : <LanguageSelect />}
      </main>
      <UpdateBanner />
    </>
  );
}
