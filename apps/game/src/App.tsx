// 첫 화면 — M0 단계: 서버 연결 상태, 시계 차이, 성능 오버레이(fps·프레임 시간 p95·메모리)와 새 버전 안내를 보여준다
import { useEffect, useState } from "react";
import { m } from "./paraglide/messages.js";
import { getLocale, isLocale, locales, setLocale } from "./paraglide/runtime.js";
import { type ConnectionStatus, connect } from "./net/connection.ts";
import type { FrameMonitor } from "./perf/frameMonitor.ts";
import { usePerfStats } from "./perf/usePerfStats.ts";
import { UpdateBanner } from "./pwa/UpdateBanner.tsx";
import { checkForUpdate, forceUpdate } from "./pwa/updates.ts";

function statusText(status: ConnectionStatus): string {
  switch (status.kind) {
    case "connecting":
      return m.status_connecting();
    case "connected":
      return m.status_connected();
    case "disconnected":
      return m.status_disconnected();
    case "rejected":
      return status.code === "protocol_unsupported"
        ? m.status_rejected_protocol()
        : m.status_rejected_other();
    default: {
      // 새 상태가 추가되면 여기서 타입 오류가 난다
      const unhandled: never = status;
      return unhandled;
    }
  }
}

function changeLocale(value: string): void {
  if (isLocale(value)) void setLocale(value);
}

export function App({ monitor }: { monitor: FrameMonitor }) {
  const [status, setStatus] = useState<ConnectionStatus>({ kind: "connecting" });
  const perf = usePerfStats(monitor);

  useEffect(
    () =>
      connect(
        (next) => {
          setStatus(next);
          // 서버와 버전이 안 맞으면 새 버전을 찾아 적용한다(없으면 새로고침). 되돌림 배포로 기기가 더 새 버전일 때도 같다
          if (next.kind === "rejected" && next.code === "protocol_unsupported") void forceUpdate("auto");
        },
        // 배포하면 서버가 다시 시작되고 기기가 다시 접속한다 → welcome마다 새 버전 확인
        { onWelcome: checkForUpdate },
      ),
    [],
  );

  return (
    <main className="shell">
      <h1>{m.app_title()}</h1>
      <p className="status" role="status">
        {statusText(status)}
      </p>
      {status.kind === "connected" && status.clock ? (
        <p className="metrics">
          {m.clock_offset({
            offset: Math.round(status.clock.offsetMs),
            rtt: Math.round(status.clock.roundTripMs),
          })}
        </p>
      ) : null}
      {perf !== null ? (
        <p className="metrics">
          {m.fps({ fps: perf.fps })} · {m.frame_p95({ ms: perf.p95Ms })}
          {perf.memoryMb === undefined ? null : ` · ${m.memory({ mb: perf.memoryMb })}`}
        </p>
      ) : null}
      {status.kind === "rejected" ? (
        // 자동 적용이 막혔을 때(1분 안에 이미 자동 새로고침함)를 위한 손 버튼. 그냥 새로고침하면 SW가 옛 화면을 다시 띄운다
        <button type="button" onClick={() => void forceUpdate("manual")}>
          {m.reload()}
        </button>
      ) : null}
      <label className="metrics">
        {m.language()}{" "}
        <select value={getLocale()} onChange={(event) => changeLocale(event.target.value)}>
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {locale === "ko" ? "한국어" : "English"}
            </option>
          ))}
        </select>
      </label>
      <UpdateBanner />
    </main>
  );
}
