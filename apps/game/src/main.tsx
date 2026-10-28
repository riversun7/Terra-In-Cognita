// 게임 앱 시작점 — 프레임 측정·텔레메트리 보고·새 버전 확인·화면 설정·로그인 확인을 먼저 켜고 화면을 그린다
// 제목 글꼴 Jua: Fontsource 조각 파일(unicode-range, 화면에 보이는 글자가 든 조각만 받는다). WOFF2만 내보낸다(vite.config.ts).
// CSS 안의 @import가 아니라 여기서 불러와야 빌드 변환(woff2Only)이 이 파일에도 돈다.
import "@fontsource/jua/400.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startSession } from "./auth/session.ts";
import { getLocale } from "./paraglide/runtime.js";
import { startFrameMonitor } from "./perf/frameMonitor.ts";
import { startUpdates } from "./pwa/updates.ts";
import { startSettings } from "./settings/settings.ts";
import { startTelemetry } from "./telemetry/reporter.ts";
import "./styles.css";

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

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(
  <StrictMode>
    <App monitor={monitor} />
  </StrictMode>,
);
