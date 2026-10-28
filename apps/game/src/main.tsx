// 게임 앱 시작점 — 프레임 측정·텔레메트리 보고·새 버전 확인·로그인 확인을 먼저 켜고 화면을 그린다
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startSession } from "./auth/session.ts";
import { getLocale } from "./paraglide/runtime.js";
import { startFrameMonitor } from "./perf/frameMonitor.ts";
import { startUpdates } from "./pwa/updates.ts";
import { startTelemetry } from "./telemetry/reporter.ts";
import "./styles.css";

// 읽기 프로그램이 고른 언어로 읽게 문서 언어를 맞춘다(index.html 기본값은 ko)
document.documentElement.lang = getLocale();

const monitor = startFrameMonitor();
startTelemetry(monitor, __APP_BUILD__);
// 서비스 워커 등록(페이지 로드 뒤)과 새 버전 적용 규칙. 화면 밖에서 한 번만
startUpdates();
// 로그인 상태 확인(GET /api/auth/get-session)과 다시 보일 때 연장
startSession();

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(
  <StrictMode>
    <App monitor={monitor} />
  </StrictMode>,
);
