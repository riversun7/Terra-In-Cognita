// 서버 연결 — 접속 핸드셰이크, 시계 차이 측정, 끊기면 다시 연결
import { PROTOCOL_VERSION, type ServerMessage, decodeServerMessage, encodeMessage } from "@terra/protocol";
import { type ClockEstimate, type ClockSample, estimateClockOffset } from "@terra/shared";

export type ConnectionStatus =
  | { kind: "connecting" }
  | { kind: "connected"; clock: ClockEstimate | null }
  | { kind: "disconnected" }
  | { kind: "rejected"; code: "protocol_unsupported" | "hello_required" | "invalid_message" };

const CLOCK_SAMPLE_COUNT = 5;
const CLOCK_SAMPLE_INTERVAL_MS = 200;
const MAX_RECONNECT_DELAY_MS = 15_000;

function socketUrl(): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws`;
}

export function connect(onStatus: (status: ConnectionStatus) => void): () => void {
  let socket: WebSocket | undefined;
  let stopped = false;
  let rejected = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let samples: ClockSample[] = [];
  let pingTimers: ReturnType<typeof setTimeout>[] = [];

  const clearPings = (): void => {
    for (const timer of pingTimers) clearTimeout(timer);
    pingTimers = [];
  };

  // 시계 차이 측정: ping 여러 개를 간격을 두고 보낸다
  const syncClock = (): void => {
    clearPings();
    samples = [];
    for (let i = 0; i < CLOCK_SAMPLE_COUNT; i++) {
      pingTimers.push(
        setTimeout(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(encodeMessage({ t: "ping", id: i, clientSendTime: Date.now() }));
          }
        }, i * CLOCK_SAMPLE_INTERVAL_MS),
      );
    }
  };

  const handle = (message: ServerMessage): void => {
    switch (message.t) {
      case "welcome":
        attempt = 0;
        onStatus({ kind: "connected", clock: null });
        syncClock();
        return;
      case "pong":
        samples.push({
          clientSendTime: message.clientSendTime,
          serverTime: message.serverTime,
          clientReceiveTime: Date.now(),
        });
        if (samples.length === CLOCK_SAMPLE_COUNT) {
          onStatus({ kind: "connected", clock: estimateClockOffset(samples) });
        }
        return;
      case "reject":
        rejected = true;
        onStatus({ kind: "rejected", code: message.code });
        return;
    }
  };

  const open = (): void => {
    if (stopped) return;
    onStatus({ kind: "connecting" });
    socket = new WebSocket(socketUrl());
    socket.addEventListener("open", () => {
      socket?.send(
        encodeMessage({ t: "hello", protocolVersion: PROTOCOL_VERSION, clientBuild: __APP_BUILD__ }),
      );
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        handle(decodeServerMessage(event.data));
      } catch {
        // 알 수 없는 메시지는 무시한다 (서버가 더 새 버전일 수 있음)
      }
    });
    socket.addEventListener("close", () => {
      clearPings();
      if (stopped || rejected) return;
      onStatus({ kind: "disconnected" });
      // 지수 백오프로 다시 연결
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = setTimeout(open, delay);
    });
  };

  // 앱이 다시 보이면(iOS 등 백그라운드 복귀) 시계를 다시 맞춘다
  const onVisibility = (): void => {
    if (document.visibilityState === "visible" && socket?.readyState === WebSocket.OPEN) {
      syncClock();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  open();

  return () => {
    stopped = true;
    clearPings();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    socket?.close();
  };
}
