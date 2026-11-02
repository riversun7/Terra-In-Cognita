// 게임 앱 시작점 — 프레임 측정·텔레메트리 보고·새 버전 확인·화면 설정·로그인 확인·서버 연결·화면 길(라우터)을 먼저 켜고 화면을 그린다
// 제목 글꼴 Jua: Fontsource 조각 파일(unicode-range, 화면에 보이는 글자가 든 조각만 받는다). WOFF2만 내보낸다(vite.config.ts).
// CSS 안의 @import가 아니라 여기서 불러와야 빌드 변환(woff2Only)이 이 파일에도 돈다.
import "@fontsource/jua/400.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { retrySessionIfUnavailable, startSession } from "./auth/session.ts";
import { startConnectionStatus } from "./net/connectionStatus.ts";
import { getLocale } from "./paraglide/runtime.js";
import { startFrameMonitor } from "./perf/frameMonitor.ts";
import { checkForUpdate, forceUpdate, startUpdates } from "./pwa/updates.ts";
import { startSettings } from "./settings/settings.ts";
import { startRouter } from "./shell/routerStore.ts";
import { startTelemetry } from "./telemetry/reporter.ts";
import "./styles.css";
// 개발 화면 층 부품(styles/dev.css): 기본 부품 규칙보다 뒤에 와야 같은 우선순위에서 이긴다(규칙은 :where로 우선순위를 낮췄다)
import "./styles/dev.css";

// 읽기 프로그램이 고른 언어로 읽게 문서 언어를 맞춘다(index.html 기본값은 ko)
document.documentElement.lang = getLocale();

const monitor = startFrameMonitor();
startTelemetry(monitor, __APP_BUILD__);
// 서비스 워커 등록(페이지 로드 뒤)과 새 버전 적용 규칙. 화면 밖에서 한 번만
startUpdates();
// 테마(첫 화면은 public/theme-init.js가 이미 걸었다)·기기 설정 변화 듣기·로그인하면 계정 설정과 맞추기
startSettings();
// 로그인 상태 확인(GET /api/auth/get-session)과 다시 보일 때 연장
startSession();
// 화면 길: 스크롤은 라우터가 칸마다 되돌린다(지연 로딩 화면이 그려진 뒤, ADR 2026-10-29-app-shell 1절)
window.history.scrollRestoration = "manual";
startRouter();
// 서버 연결 — 로그인과 상관없이 늘 켠다(옛 버전이면 로그인 전에도 새 버전으로 바꾼다)
startConnectionStatus({
  onStatus: (status) => {
    // 서버와 버전이 안 맞으면 새 버전을 찾아 적용한다(없으면 새로고침). 되돌림 배포로 기기가 더 새 버전일 때도 같다
    if (status.kind === "rejected" && status.code === "protocol_unsupported") void forceUpdate("auto");
  },
  onWelcome: () => {
    // 배포하면 서버가 다시 시작되고 기기가 다시 접속한다 → welcome마다 새 버전 확인
    checkForUpdate();
    // 서버가 꺼져 있어 로그인 상태를 확인하지 못했다면 지금 다시 확인한다
    retrySessionIfUnavailable();
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(
  <StrictMode>
    <App monitor={monitor} />
  </StrictMode>,
);
