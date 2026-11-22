// WebSocket 연결 하나의 도시 지분 주문(city_share_order·city_share_cancel → city_share_result) — docs/adr/2026-11-21-share-market.md.
// 의결 게이트웨이(governance/gateway.ts)와 같은 틀이다: 로그인한 사용자만, 한 연결의 요청은 받은 순서대로 하나씩, 사용자별 속도 제한(순간 10번·
// 분당 30번), 밀린 요청이 MAX_PENDING을 넘으면 busy, 시장 서비스가 없으면 busy. 가문·의결 소켓과 한 소켓으로 묶는다(withCityShares — session.ts의
// 가문 자리 하나로 받는다. app.ts를 키우지 않는다).
import { type ClientMessageOf, type CityShareResultCode, encodeMessage } from "@terra/protocol";
import type { HouseClientMessage, HouseLink } from "../factionIdentity/gateway.ts";
import type { GovernanceClientMessage, HouseGovernanceGateway } from "../governance/gateway.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { CityShareResult, CityShareService } from "./service.ts";

export type CityShareClientMessage = ClientMessageOf<"city_share_order" | "city_share_cancel">;

const MAX_PENDING = 4;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

/** 가문 + 의결 + 도시 지분 소켓(session.ts의 가문 자리) */
export interface HouseShareGateway {
  open(link: HouseLink): {
    handle(message: HouseClientMessage | GovernanceClientMessage | CityShareClientMessage): void;
    close(): void;
  };
}

const failed = (code: CityShareResultCode): CityShareResult => ({ ok: false, code });

function resultText(id: number, result: CityShareResult): string {
  return result.ok
    ? encodeMessage({
        t: "city_share_result",
        id,
        ok: true,
        ...(result.orderId === undefined ? {} : { orderId: result.orderId }),
      })
    : encodeMessage({ t: "city_share_result", id, ok: false, code: result.code });
}

const isCityShare = (
  message: HouseClientMessage | GovernanceClientMessage | CityShareClientMessage,
): message is CityShareClientMessage => message.t === "city_share_order" || message.t === "city_share_cancel";

export function createCityShareSocket(options: {
  readonly service: () => Pick<CityShareService, "place" | "cancel"> | undefined;
  readonly now: () => number;
  readonly log: { error(obj: object, message: string): void };
}) {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link: HouseLink) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: CityShareResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      const process = async (message: CityShareClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, failed("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, failed("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, failed("rate_limited"));
        const result =
          message.t === "city_share_order"
            ? await service.place(viewer.id, {
                cityId: message.cityId,
                side: message.side,
                price: BigInt(message.price),
                shares: BigInt(message.shares),
                asHouse: message.asHouse === true,
                ...(message.exchangeId === undefined ? {} : { exchangeId: message.exchangeId }),
              })
            : await service.cancel(viewer.id, message.orderId);
        reply(message.id, result);
      };
      return {
        handle(message: CityShareClientMessage) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            reply(message.id, failed("busy"));
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "city share request failed");
              reply(message.id, failed("internal_error"));
            })
            .finally(() => {
              pending -= 1;
            });
        },
        close() {
          closed = true;
        },
      };
    },
  };
}

export type CityShareSocketGateway = ReturnType<typeof createCityShareSocket>;

/** 가문·의결 소켓과 도시 지분 소켓을 한 소켓으로 묶는다(도시 지분 소켓은 처음 도시 지분 메시지가 올 때 연다) */
export function withCityShares(
  base: HouseGovernanceGateway,
  shares: CityShareSocketGateway,
): HouseShareGateway {
  return {
    open(link) {
      const baseSocket = base.open(link);
      let shareSocket: ReturnType<CityShareSocketGateway["open"]> | undefined;
      return {
        handle(message) {
          if (isCityShare(message)) {
            shareSocket ??= shares.open(link);
            shareSocket.handle(message);
          } else baseSocket.handle(message);
        },
        close() {
          baseSocket.close();
          shareSocket?.close();
        },
      };
    },
  };
}
