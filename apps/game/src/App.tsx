// 첫 화면 — M0 단계: 서버 연결 상태, 시계 차이, 화면 갱신 속도를 보여준다
import { useEffect, useState } from "react";
import { m } from "./paraglide/messages.js";
import { getLocale, isLocale, locales, setLocale } from "./paraglide/runtime.js";
import { type ConnectionStatus, connect } from "./net/connection.ts";
import { useFps } from "./perf/useFps.ts";

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

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ kind: "connecting" });
  const fps = useFps();

  useEffect(() => connect(setStatus), []);

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
      {fps !== null ? <p className="metrics">{m.fps({ fps })}</p> : null}
      {status.kind === "rejected" ? (
        <button type="button" onClick={() => window.location.reload()}>
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
    </main>
  );
}
