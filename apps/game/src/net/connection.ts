// 서버 연결 — 접속 핸드셰이크, 시계 차이 측정, 끊기면 다시 연결
// 2차맵 같은 기능의 메시지는 기능 통로(serverLink.ts)로 넘긴다. 기능은 이 연결 하나를 함께 쓴다.
// 이 모듈은 첫 화면 묶음에 넣지 않는다 — 값을 가져오는 곳은 connectionStatus.ts의 동적 import 하나뿐이다(lazyConnection.ts,
// 타입만 가져오는 것은 괜찮다).
// 정적으로 가져오면 서버 메시지 검사(스키마·zod)가 첫 화면에 돌아온다(ADR 2026-10-29-app-shell 11절 "첫 화면 줄이기").
import { PROTOCOL_VERSION, type ServerMessage, decodeServerMessage, encodeMessage } from "@terra/protocol";
import { type ClockEstimate, type ClockSample, estimateClockOffset } from "@terra/shared";
import { attachConnection } from "./serverLink.ts";

export type ConnectionStatus =
  | { kind: "connecting" }
  | { kind: "connected"; clock: ClockEstimate | null }
  | { kind: "disconnected" }
  | { kind: "rejected"; code: "protocol_unsupported" | "hello_required" | "invalid_message" };

export interface ConnectOptions {
  /** 서버의 welcome을 받을 때마다(다시 연결 포함). 배포 뒤 새 버전 확인에 쓴다 */
  onWelcome?: () => void;
}

const CLOCK_SAMPLE_COUNT = 5;
const CLOCK_SAMPLE_INTERVAL_MS = 200;
const MAX_RECONNECT_DELAY_MS = 15_000;

/** 열린 연결들의 "새로고침 전 정상 종료" 함수 */
const reloadClosers = new Set<() => void>();

/** 새로고침 직전 — 열린 연결을 정상 종료(1000)하고 다시 연결하지 않는다 (pwa/updates.ts가 connectionStatus.ts를 거쳐 부른다) */
export function closeForReload(): void {
  for (const close of reloadClosers) close();
}

function socketUrl(): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws`;
}

export function connect(
  onStatus: (status: ConnectionStatus) => void,
  options: ConnectOptions = {},
): () => void {
  let socket: WebSocket | undefined;
  let stopped = false;
  let rejected = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let samples: ClockSample[] = [];
  let pingTimers: ReturnType<typeof setTimeout>[] = [];
  // 기능 통로에 이 연결을 붙인다. 로그인한 사용자가 바뀌면 통로가 reconnectNow를 부른다
  const link = attachConnection({ reconnect: () => reconnectNow() });

  const clearPings = (): void => {
    for (const timer of pingTimers) clearTimeout(timer);
    pingTimers = [];
  };

  /** 기능 메시지 보내기 — 지금 소켓이 열려 있을 때만 */
  const sendText = (text: string): boolean => {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(text);
    return true;
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

  const handle = (message: ServerMessage, size: number): void => {
    switch (message.t) {
      case "welcome":
        attempt = 0;
        onStatus({ kind: "connected", clock: null });
        syncClock();
        link.ready(sendText);
        options.onWelcome?.();
        return;
      case "pong":
        samples.push({
          clientSendTime: message.clientSendTime,
          serverTime: message.serverTime,
          clientReceiveTime: Date.now(),
        });
        if (samples.length === CLOCK_SAMPLE_COUNT) {
          const clock = estimateClockOffset(samples);
          link.clock(clock);
          onStatus({ kind: "connected", clock });
        }
        return;
      case "reject":
        rejected = true;
        link.down();
        onStatus({ kind: "rejected", code: message.code });
        return;
      default:
        // 2차맵 구독·명령 결과 같은 기능 메시지
        link.message(message, size);
    }
  };

  const open = (): void => {
    if (stopped) return;
    onStatus({ kind: "connecting" });
    const ws = new WebSocket(socketUrl());
    socket = ws;
    ws.addEventListener("open", () => {
      ws.send(encodeMessage({ t: "hello", protocolVersion: PROTOCOL_VERSION, clientBuild: __APP_BUILD__ }));
    });
    ws.addEventListener("message", (event) => {
      // 다시 맺느라 버린 옛 소켓의 메시지는 버린다
      if (ws !== socket || typeof event.data !== "string") return;
      let message: ServerMessage;
      try {
        message = decodeServerMessage(event.data);
      } catch {
        // 알 수 없는 메시지는 무시한다 (서버가 더 새 버전일 수 있음)
        return;
      }
      handle(message, event.data.length);
    });
    ws.addEventListener("close", () => {
      if (ws !== socket) return;
      clearPings();
      link.down();
      if (stopped || rejected) return;
      onStatus({ kind: "disconnected" });
      // 지수 백오프로 다시 연결
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = setTimeout(open, delay);
    });
  };

  // 지금 연결을 닫고 바로 새로 맺는다 — 로그인한 사용자가 바뀌었을 때(serverLink.ts followIdentity)
  const reconnectNow = (): void => {
    if (stopped || rejected) return;
    const old = socket;
    socket = undefined;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    clearPings();
    attempt = 0;
    link.down();
    old?.close(1000, "reconnect");
    open();
  };

  // 앱이 다시 보이면(iOS 등 백그라운드 복귀) 시계를 다시 맞춘다
  const onVisibility = (): void => {
    if (document.visibilityState === "visible" && socket?.readyState === WebSocket.OPEN) {
      syncClock();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const stop = (): void => {
    stopped = true;
    clearPings();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    reloadClosers.delete(closeNormally);
    link.detach();
  };
  // 정상 종료(1000)를 알리고 끊는다. 코드 없이 close()하면 서버는 1005(코드 없음)를 받는다
  const closeNormally = (): void => {
    stop();
    socket?.close(1000, "reload");
  };
  reloadClosers.add(closeNormally);

  open();

  return () => {
    stop();
    socket?.close();
  };
}
