// WebSocket 연결 하나의 가문 창설 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)".
// 국적 바꾸기 게이트웨이(citizenship/gateway.ts)와 같은 틀이다: 로그인한 사용자만, 한 연결의 요청은 받은 순서대로 하나씩, 사용자별 속도
// 제한(드문 명령이라 순간 3번·분당 6번), 밀린 요청이 MAX_PENDING을 넘으면 busy, 창설 서비스가 없으면(DB 없는 서버) busy.
import { type ClientMessageOf, type HouseResultCode, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { HouseFounder, HouseFoundResult } from "./found.ts";

export type HouseClientMessage = ClientMessageOf<"house_found">;

const MAX_PENDING = 2;
const LIMIT = { capacity: 3, refillPerMinute: 6 };

export interface HouseLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface HouseSocket {
  handle(message: HouseClientMessage): void;
  close(): void;
}

export interface HouseGateway {
  open(link: HouseLink): HouseSocket;
}

function resultText(id: number, result: HouseFoundResult): string {
  return result.ok
    ? encodeMessage({ t: "house_result", id, ok: true, factionId: result.factionId, paid: result.paid })
    : encodeMessage({ t: "house_result", id, ok: false, code: result.code });
}

const fail = (code: HouseResultCode): HouseFoundResult => ({ ok: false, code });

export function createHouseGateway(options: {
  /** 창설 서비스(없으면 busy) */
  founder: () => HouseFounder | undefined;
  now: () => number;
  log: {
    info(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
}): HouseGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: HouseFoundResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      const process = async (message: HouseClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const founder = options.founder();
        if (!founder) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        const result = await founder.found(viewer.id, { cost: message.cost });
        if (result.ok)
          options.log.info(
            { userId: viewer.id, factionId: result.factionId, paid: result.paid },
            "house founded",
          );
        reply(message.id, result);
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
              options.log.error({ err: error, t: message.t }, "house request failed");
              reply(message.id, fail("internal_error"));
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
