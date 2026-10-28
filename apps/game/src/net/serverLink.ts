// 기능 통로 — 2차맵 같은 기능이 앱의 서버 연결 하나(connection.ts)를 함께 쓴다.
// ADR 2026-10-28-s1-second-map "구현하며 정한 것 (기기 연결)"
// - connection.ts가 연결 상태(인사 끝·끊김)와 기능 메시지를 여기로 알리고, 기능은 이 통로만 본다.
// - 서버의 2차맵 구독은 연결마다 따로라서, 기능은 ready(처음 연결·다시 연결)마다 다시 구독한다.
// - 시계 차이는 마지막으로 잰 값을 새로 잴 때까지 쓴다(다시 연결 직후 0으로 돌아가 유닛이 튀지 않게).
// - 서버는 WebSocket 연결 요청에 실린 쿠키로만 사용자를 안다(연결 뒤에는 다시 읽지 않는다).
//   그래서 로그인한 사용자가 바뀌면 연결을 다시 맺는다(followIdentity). 앱을 켤 때 연결은 로그인보다 먼저 열린다.
import { type ClientMessage, type ServerMessage, encodeMessage } from "@terra/protocol";
import type { ClockEstimate } from "@terra/shared";

/** 기능이 보내는 메시지(인사·시계 맞추기는 연결이 직접 한다) */
export type FeatureClientMessage = Exclude<ClientMessage, { t: "hello" | "ping" }>;
/** 기능이 받는 메시지(인사 답·거절·시계 답은 연결이 처리한다) */
export type FeatureServerMessage = Exclude<ServerMessage, { t: "welcome" | "reject" | "pong" }>;

export type LinkEvent =
  /** 인사가 끝났다(처음 연결·다시 연결) */
  | { kind: "ready" }
  /** 끊겼다(연결이 다시 맺기를 기다린다) */
  | { kind: "down" }
  /** size: 받은 글자 수. 서버 메시지는 숫자·영문 키뿐인 JSON이라 글자 수 = UTF-8 바이트 수다 */
  | { kind: "message"; message: FeatureServerMessage; size: number };

export interface ServerLink {
  /** 인사가 끝난 연결이 있으면 보내고 true. 없으면 보내지 않고 false */
  send(message: FeatureClientMessage): boolean;
  isReady(): boolean;
  /** 서버 시계 − 기기 시계(ms). 마지막으로 잰 값이고, 아직 못 쟀으면 0 */
  clockOffsetMs(): number;
  listen(listener: (event: LinkEvent) => void): () => void;
  /** 연결을 끊고 바로 다시 맺는다(로그인 상태가 연결과 어긋났을 때) */
  reconnect(): void;
}

/** connection.ts 쪽 — 연결 하나가 붙어서 상태를 알린다. 다른 연결이 붙으면 앞 연결의 알림은 무시한다 */
export interface LinkDriver {
  /** welcome을 받았다. send는 지금 소켓으로 보내고, 열려 있지 않으면 false */
  ready(send: (text: string) => boolean): void;
  down(): void;
  message(message: FeatureServerMessage, size: number): void;
  clock(estimate: ClockEstimate): void;
  /** 연결을 끝냈다(앱 화면을 내렸다) */
  detach(): void;
}

export interface LinkHub {
  readonly link: ServerLink;
  attach(controls: { reconnect(): void }): LinkDriver;
  /** 로그인한 사용자(없으면 null). 아는 값에서 다른 값으로 바뀌면 연결을 다시 맺는다 */
  followIdentity(identity: string | null): void;
}

interface Attachment {
  reconnect(): void;
  send: ((text: string) => boolean) | null;
}

/** 기능 하나의 오류가 연결이나 다른 기능을 멈추지 않게 한다. 오류는 전역 처리기(텔레메트리)로 넘긴다 */
function reportLater(error: unknown): void {
  if (typeof reportError === "function") reportError(error);
  else
    queueMicrotask(() => {
      throw error;
    });
}

export function createLinkHub(onListenerError: (error: unknown) => void = reportLater): LinkHub {
  const listeners = new Set<(event: LinkEvent) => void>();
  let current: Attachment | null = null;
  let lastClock: ClockEstimate | null = null;
  /** 마지막으로 안 사용자. undefined = 아직 모름(로그인 확인 전) */
  let knownIdentity: string | null | undefined;

  const emit = (event: LinkEvent): void => {
    // Set은 도는 중에 지워도 된다(듣는 쪽이 듣는 중에 그만 들어도 된다)
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        onListenerError(error);
      }
    }
  };

  const link: ServerLink = {
    send(message) {
      const send = current?.send;
      return send ? send(encodeMessage(message)) : false;
    },
    isReady: () => Boolean(current?.send),
    clockOffsetMs: () => lastClock?.offsetMs ?? 0,
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reconnect() {
      current?.reconnect();
    },
  };

  return {
    link,
    attach(controls) {
      const previous = current;
      const attachment: Attachment = { reconnect: () => controls.reconnect(), send: null };
      current = attachment;
      // 앞 연결이 준비된 채였다면(정리 전에 새 연결이 붙음) 끊김으로 알린다
      if (previous?.send) emit({ kind: "down" });
      const active = (): boolean => current === attachment;
      return {
        ready(send) {
          if (!active()) return;
          attachment.send = send;
          emit({ kind: "ready" });
        },
        down() {
          if (!active() || !attachment.send) return;
          attachment.send = null;
          emit({ kind: "down" });
        },
        message(message, size) {
          if (active() && attachment.send) emit({ kind: "message", message, size });
        },
        clock(estimate) {
          if (active()) lastClock = estimate;
        },
        detach() {
          if (!active()) return;
          const wasReady = attachment.send !== null;
          current = null;
          if (wasReady) emit({ kind: "down" });
        },
      };
    },
    followIdentity(identity) {
      const previous = knownIdentity;
      knownIdentity = identity;
      if (previous !== undefined && previous !== identity) current?.reconnect();
    },
  };
}

/** 앱 전체에 하나 — connection.ts가 붙고, 기능(2차맵 화면)은 serverLink만 본다 */
const hub = createLinkHub();
export const serverLink: ServerLink = hub.link;
export const attachConnection = (controls: { reconnect(): void }): LinkDriver => hub.attach(controls);
export const followIdentity = (identity: string | null): void => hub.followIdentity(identity);
