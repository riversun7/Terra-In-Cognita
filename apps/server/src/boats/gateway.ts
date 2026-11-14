// WebSocket 연결 하나의 배 메시지 처리(src/session.ts가 넘긴다, 프로토콜 27) — docs/adr/2026-11-13-boats.md. 채집 게이트웨이와 같은 틀:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다.
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 채집·건물 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 운영자 모드(같은 연결이 2차맵 전체 보기 + 모든 유닛 명령 권한)는 남의 부두·유닛·배에 명령하고 배를 재료 없이 만든다. 타러 걷는 길은 운영자
//   빠르기(world/operatorPace.ts).
import { type BoatResultCode, type ClientMessageOf, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import { type PaceMap, isOperatorMode, withPace } from "../world/operatorPace.ts";
import type { BoatCommandResult, BoatService } from "./service.ts";

export type BoatClientMessage = ClientMessageOf<"boat_build" | "boat_board" | "boat_leave">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface BoatLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 같은 연결이 2차맵을 전체 보기(운영자 모드)로 구독 중인가(world/gateway.ts). 없으면 아니다 */
  observing?(): boolean;
}

export interface BoatSocket {
  handle(message: BoatClientMessage): void;
  close(): void;
}

export interface BoatGateway {
  open(link: BoatLink): BoatSocket;
}

function resultText(id: number, result: BoatCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "boat_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "boat_result",
    id,
    ok: true,
    ...(result.boatId === undefined ? {} : { boatId: result.boatId }),
    ...(result.walking ? { walking: true } : {}),
  });
}

const fail = (code: BoatResultCode): BoatCommandResult => ({ ok: false, code });

export function createBoatGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => BoatService | undefined;
  /** 띄운 2차맵(운영자 빠르기 표시를 단다). 없으면 표시하지 않는다 */
  maps?: (() => Iterable<PaceMap>) | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): BoatGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: BoatCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const process = async (message: BoatClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        const operator = isOperatorMode(link.observing?.() === true, viewer.roles);
        switch (message.t) {
          case "boat_build":
            return reply(message.id, service.build(viewer.id, message.buildingId, operator));
          case "boat_board":
            return reply(
              message.id,
              await withPace(options.maps?.() ?? [], message.unitId, operator, () =>
                service.board(viewer.id, message.unitId, message.boatId, operator),
              ),
            );
          case "boat_leave":
            return reply(message.id, service.leave(viewer.id, message.boatId, operator));
          default: {
            const unknown: never = message;
            return unknown;
          }
        }
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
              options.log.error({ err: error, t: message.t }, "boat request failed");
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
