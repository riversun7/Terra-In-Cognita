// WebSocket 연결 하나의 채집·들어가기 메시지 처리(src/session.ts가 넘긴다, 프로토콜 17) — docs/adr/2026-11-07-gather-objects.md. 이동 게이트웨이와 같은 틀:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다.
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 건물·이동 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 소유·자리 판정과 걷기·캐기는 서비스(service.ts)가 한다. 기기는 유닛·오브젝트 번호·건물만 보낸다(서버 권위).
import { type ClientMessageOf, type GatherResultCode, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { GatherCommandResult, GatherService } from "./service.ts";

export type GatherClientMessage = ClientMessageOf<"gather_start" | "gather_stop" | "unit_enter">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface GatherLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface GatherSocket {
  handle(message: GatherClientMessage): void;
  close(): void;
}

export interface GatherGateway {
  open(link: GatherLink): GatherSocket;
}

function resultText(id: number, result: GatherCommandResult): string {
  return result.ok
    ? encodeMessage({ t: "gather_result", id, ok: true })
    : encodeMessage({ t: "gather_result", id, ok: false, code: result.code });
}

const fail = (code: GatherResultCode): GatherCommandResult => ({ ok: false, code });

function run(service: GatherService, viewer: Viewer, message: GatherClientMessage) {
  switch (message.t) {
    case "gather_start":
      return service.start(viewer.id, {
        unitId: message.unitId,
        mapKey: message.mapKey,
        objectId: message.objectId,
      });
    case "gather_stop":
      return Promise.resolve(service.halt(viewer.id, message.unitId));
    case "unit_enter":
      return service.enter(viewer.id, { unitId: message.unitId, buildingId: message.buildingId });
    default: {
      const unknown: never = message;
      return unknown;
    }
  }
}

export function createGatherGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => GatherService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): GatherGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: GatherCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const process = async (message: GatherClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        reply(message.id, await run(service, viewer, message));
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
              options.log.error({ err: error, t: message.t }, "gather request failed");
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
