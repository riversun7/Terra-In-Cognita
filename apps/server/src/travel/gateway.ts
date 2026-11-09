// WebSocket 연결 하나의 2차맵 사이 이동 메시지 처리(src/session.ts가 넘긴다, 프로토콜 16) — docs/adr/2026-11-07-play-flow.md "WP9". 폐허 게이트웨이와 같은 틀이다:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(같은 유닛의 보내기·멈추기 차례).
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 건물 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 소유·길 판정과 걷기는 서비스(service.ts)가 한다. 기기는 목적 2차맵·칸·명령 종류만 보낸다(서버 권위).
import { type ClientMessageOf, type TravelResultCode, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import { OPERATOR_SPEED_FACTOR } from "../world/gateway.ts";
import { canCommandAnyUnit } from "../world/unitControl.ts";
import type { TravelCommandResult, TravelService } from "./service.ts";

export type TravelClientMessage = ClientMessageOf<"travel_start" | "travel_cancel">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface TravelLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /**
   * 같은 연결이 2차맵을 전체 보기(운영자 모드)로 구독 중인가. 그러면 보내는 길은 운영자 빠르기(OPERATOR_SPEED_FACTOR) — 2차맵 이동 명령과 같다
   * (사용자 지적 2026-11-09 "운영자모드에서 인접 2차맵을 목적지로 선택시 원래 속도로 느려진다")
   */
  observing?(): boolean;
}

export interface TravelSocket {
  handle(message: TravelClientMessage): void;
  close(): void;
}

export interface TravelGateway {
  open(link: TravelLink): TravelSocket;
}

function resultText(id: number, result: TravelCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "travel_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "travel_result",
    id,
    ok: true,
    ...(result.maps === undefined ? {} : { maps: result.maps }),
    ...(result.arriveAt === undefined ? {} : { arriveAt: result.arriveAt }),
  });
}

const fail = (code: TravelResultCode): TravelCommandResult => ({ ok: false, code });

function run(service: TravelService, viewer: Viewer, message: TravelClientMessage, operatorFast: boolean) {
  switch (message.t) {
    case "travel_start":
      return service.start(
        viewer.id,
        {
          unitId: message.unitId,
          mapKey: message.mapKey,
          x: message.x,
          y: message.y,
          kind: message.kind,
        },
        { speedFactor: operatorFast ? OPERATOR_SPEED_FACTOR : 1 },
      );
    case "travel_cancel":
      return Promise.resolve(service.cancel(viewer.id, message.unitId));
    default: {
      const unknown: never = message;
      return unknown;
    }
  }
}

export function createTravelGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => TravelService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): TravelGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: TravelCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const process = async (message: TravelClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        const operatorFast = link.observing?.() === true && canCommandAnyUnit(viewer.roles);
        reply(message.id, await run(service, viewer, message, operatorFast));
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
              options.log.error({ err: error, t: message.t }, "travel request failed");
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
