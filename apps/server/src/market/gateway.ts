// WebSocket 연결 하나의 물자 거래소 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-07-play-flow.md WP4. 폐허·신전 게이트웨이와 같은 틀:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(잔고·걸린 주문을 차례로 본다).
// - 사용자별 속도 제한(순간 10번, 분당 60번 — 거래창은 건물 명령보다 잦다 [임시]). 밀린 요청이 MAX_PENDING을 넘으면 busy. 거래소가 아직 없으면 busy.
// - 체결 알림(market_watch on): 그 연결을 사용자 몫 알림 목록에 둔다. 거래소 모음의 체결이 그 사용자의 걸린 주문이면 market_fill을 보낸다.
// - 판정·저장은 서비스(service.ts)가 한다.
import { type ClientMessageOf, type MarketResultCode, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { FillNotice } from "./books.ts";
import type { MarketCommandResult, MarketService } from "./service.ts";

export type MarketClientMessage = ClientMessageOf<"market_place" | "market_cancel" | "market_watch">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 60 };

export interface MarketLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface MarketSocket {
  handle(message: MarketClientMessage): void;
  close(): void;
}

export interface MarketGateway {
  open(link: MarketLink): MarketSocket;
}

function resultText(id: number, result: MarketCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "market_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "market_result",
    id,
    ok: true,
    ...(result.orderId === undefined ? {} : { orderId: result.orderId }),
    ...(result.filled === undefined ? {} : { filled: result.filled }),
    ...(result.resting === undefined ? {} : { resting: result.resting }),
  });
}

function fillText(notice: FillNotice): string {
  return encodeMessage({
    t: "market_fill",
    order: notice.trade.makerOrderId,
    city: notice.book.cityId,
    item: notice.book.item,
    // 걸린 주문의 쪽(들어온 주문의 반대)
    side: notice.trade.side === "buy" ? "sell" : "buy",
    price: String(notice.trade.price),
    qty: String(notice.trade.qty),
    remaining: String(notice.makerRemaining),
    at: notice.trade.at,
  });
}

const fail = (code: MarketResultCode): MarketCommandResult => ({ ok: false, code });

export function createMarketGateway(options: {
  /** 세계·도시 경제가 준비되면 서비스(없으면 busy) */
  service: () => MarketService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): MarketGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  /** 사용자 → 알림을 켠 연결의 보내기 */
  const watchers = new Map<string, Set<(text: string) => void>>();
  let subscribed: { service: MarketService; stop: () => void } | undefined;
  const subscribe = (service: MarketService): void => {
    if (subscribed?.service === service) return;
    subscribed?.stop();
    subscribed = {
      service,
      stop: service.onFill((ownerId, notice) => {
        const userId = service.userOf(ownerId);
        const sends = userId === undefined ? undefined : watchers.get(userId);
        if (!sends || sends.size === 0) return;
        const text = fillText(notice);
        for (const send of sends) send(text);
      }),
    };
  };

  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      let watchingAs: string | undefined;
      const send = (text: string): void => {
        if (!closed) link.send(text);
      };
      const reply = (id: number, result: MarketCommandResult): void => send(resultText(id, result));
      const unwatch = (): void => {
        if (watchingAs === undefined) return;
        const set = watchers.get(watchingAs);
        set?.delete(send);
        if (set?.size === 0) watchers.delete(watchingAs);
        watchingAs = undefined;
      };

      const process = async (message: MarketClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (message.t === "market_watch") {
          unwatch();
          if (message.on) {
            subscribe(service);
            watchingAs = viewer.id;
            const set = watchers.get(viewer.id) ?? new Set();
            set.add(send);
            watchers.set(viewer.id, set);
          }
          return reply(message.id, { ok: true });
        }
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        if (message.t === "market_cancel")
          return reply(message.id, await service.cancel(viewer.id, message.order));
        reply(
          message.id,
          await service.place(viewer.id, {
            city: message.city,
            item: message.item,
            side: message.side,
            kind: message.kind,
            price: message.price,
            qty: message.qty,
            expiryDays: message.expiryDays,
          }),
        );
      };

      return {
        handle(message) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            reply(message.id, fail("busy"));
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "market request failed");
              reply(message.id, fail("internal_error"));
            })
            .finally(() => {
              pending -= 1;
            });
        },
        close() {
          unwatch();
          closed = true;
        },
      };
    },
  };
}
