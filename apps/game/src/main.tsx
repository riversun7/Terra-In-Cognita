// 게임 앱 시작점 — 프레임 측정·텔레메트리 보고·새 버전 확인을 먼저 켜고 화면을 그린다
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startFrameMonitor } from "./perf/frameMonitor.ts";
import { startUpdates } from "./pwa/updates.ts";
import { startTelemetry } from "./telemetry/reporter.ts";
import "./styles.css";

const monitor = startFrameMonitor();
startTelemetry(monitor, __APP_BUILD__);
// 서비스 워커 등록(페이지 로드 뒤)과 새 버전 적용 규칙. 화면 밖에서 한 번만
startUpdates();

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(
  <StrictMode>
    <App monitor={monitor} />
  </StrictMode>,
);
