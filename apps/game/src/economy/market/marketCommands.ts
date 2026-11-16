// 물자 거래소 명령(WebSocket, 프로토콜 14) — 주문 넣기·취소·체결 알림 켜기를 보내고 같은 요청 번호의 market_result를 기다린다.
// docs/adr/2026-11-07-play-flow.md "WP4 도시 경제·거래소". 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장). 폐허 명령(ruinsCommands.ts)과
// 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout". 경제 화면 지연 조각 안에서만 쓴다.
// 체결 알림(market_fill)은 거래창을 연 동안 켜 두고(useMarketFills), 알림이 오면 받은 자료를 다시 받는다.
// 환전(프로토콜 15, docs/adr/2026-11-07-play-flow.md WP6): fx_place·fx_cancel을 같은 틀로 보내고 fx_result를 기다린다.
// 개인 창고 넓히기(프로토콜 49, 기획 D-571 1943): market_locker_expand도 같은 틀(market_result).
import type {
  ClientMessageOf,
  FxResultCode,
  MarketResultCode,
  ServerMessage,
  ServerMessageOf,
} from "@terra/protocol";
import { useEffect } from "react";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";

export type MarketCommand =
  | Omit<ClientMessageOf<"market_place">, "id">
  | Omit<ClientMessageOf<"market_cancel">, "id">
  | Omit<ClientMessageOf<"market_locker_expand">, "id">;

export type MarketOutcome =
  | {
      readonly ok: true;
      readonly orderId?: number | undefined;
      readonly filled?: string | undefined;
      readonly resting?: string | undefined;
    }
  | { readonly ok: false; readonly code: MarketResultCode | "offline" | "timeout" };

export type MarketFill = ServerMessageOf<"market_fill">;

export type FxCommand = Omit<ClientMessageOf<"fx_place">, "id"> | Omit<ClientMessageOf<"fx_cancel">, "id">;

export type FxOutcome =
  | { readonly ok: true; readonly orderId?: number | undefined }
  | { readonly ok: false; readonly code: FxResultCode | "offline" | "timeout" };

type Request = ClientMessageOf<
  "market_place" | "market_cancel" | "market_watch" | "market_locker_expand" | "fx_place" | "fx_cancel"
>;

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();
const takeId = (): number => {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return id;
};

/** 거래소 결과(market_result) → 결과 */
function marketOutcome(message: ServerMessage, id: number): MarketOutcome | undefined {
  if (message.t !== "market_result" || message.id !== id) return undefined;
  return message.ok
    ? { ok: true, orderId: message.orderId, filled: message.filled, resting: message.resting }
    : { ok: false, code: message.code };
}

/** 환전 결과(fx_result) → 결과 */
function fxOutcome(message: ServerMessage, id: number): FxOutcome | undefined {
  if (message.t !== "fx_result" || message.id !== id) return undefined;
  return message.ok ? { ok: true, orderId: message.orderId } : { ok: false, code: message.code };
}

/** 메시지 하나를 보내고 결과를 기다린다(인사 전이면 기다렸다 보낸다). match = 받은 메시지가 이 요청의 답이면 결과 */
function request<T>(
  build: (id: number) => Request,
  link: ServerLink,
  match: (message: ServerMessage, id: number) => T | undefined,
  lost: (code: "offline" | "timeout") => T,
): Promise<T> {
  const id = takeId();
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: T): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send(build(id));
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish(lost("offline"));
      else if (event.kind === "message") {
        const outcome = match(event.message, id);
        if (outcome !== undefined) finish(outcome);
      }
    });
    timer = setTimeout(() => finish(lost(sent ? "timeout" : "offline")), TIMEOUT_MS);
    trySend();
  });
}

/** 주문 넣기·취소 하나를 보내고 결과를 기다린다 */
export function sendMarketCommand(
  command: MarketCommand,
  link: ServerLink = serverLink,
): Promise<MarketOutcome> {
  return request(
    (id) => ({ ...command, id }),
    link,
    marketOutcome,
    (code) => ({ ok: false, code }),
  );
}

/** 환전 주문 내기·거두기 하나를 보내고 결과를 기다린다 */
export function sendFxCommand(command: FxCommand, link: ServerLink = serverLink): Promise<FxOutcome> {
  return request(
    (id) => ({ ...command, id }),
    link,
    fxOutcome,
    (code) => ({ ok: false, code }),
  );
}

/**
 * 거래창을 연 동안 체결 알림을 켠다(연결이 다시 이어지면 다시 켠다). 알림마다 onFill을 부른다. 화면을 떠나면 끈다
 */
export function useMarketFills(onFill: (fill: MarketFill) => void, link: ServerLink = serverLink): void {
  useEffect(() => {
    const watch = (on: boolean): void => {
      void request(
        (id) => ({ t: "market_watch", id, on }),
        link,
        marketOutcome,
        (code): MarketOutcome => ({ ok: false, code }),
      );
    };
    const stop = link.listen((event) => {
      if (event.kind === "ready") watch(true);
      else if (event.kind === "message" && event.message.t === "market_fill") onFill(event.message);
    });
    if (link.isReady()) watch(true);
    return () => {
      stop();
      if (link.isReady()) watch(false);
    };
  }, [onFill, link]);
}
