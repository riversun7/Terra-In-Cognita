// 게임 앱 시작점 — 프레임 측정과 텔레메트리 보고를 먼저 켜고 화면을 그린다
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startFrameMonitor } from "./perf/frameMonitor.ts";
import { startTelemetry } from "./telemetry/reporter.ts";
import "./styles.css";

const monitor = startFrameMonitor();
startTelemetry(monitor, __APP_BUILD__);

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(
  <StrictMode>
    <App monitor={monitor} />
  </StrictMode>,
);
