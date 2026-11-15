// WebSocket 연결 하나의 채집·들어가기 메시지 처리(src/session.ts가 넘긴다, 프로토콜 17) — docs/adr/2026-11-07-gather-objects.md. 이동 게이트웨이와 같은 틀:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다.
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 건물·이동 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 소유·자리 판정과 걷기·캐기는 서비스(service.ts)가 한다. 기기는 유닛·오브젝트 번호·건물만 보낸다(서버 권위).
// - 운영자 모드(같은 연결이 2차맵 전체 보기 + 모든 유닛 명령 권한) 명령은 그 유닛에 운영자 빠르기 표시를 단다 — 채집 줄 왕복·들어가기 걸음이
//   2차맵 이동 명령처럼 빠르다(사용자 지적 2026-11-12, world/operatorPace.ts). 아니면 표시를 지운다.
import { type ClientMessageOf, type GatherResultCode, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import { type OperatorPaceLink, type PaceMap, operatorFactor, withPace } from "../world/operatorPace.ts";
import type { GatherCommandResult, GatherService } from "./service.ts";

export type GatherClientMessage = ClientMessageOf<"gather_start" | "gather_stop" | "unit_enter">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface GatherLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 같은 연결이 2차맵을 전체 보기(운영자 모드)로 구독 중인가(world/gateway.ts). 없으면 아니다 */
  observing?(): boolean;
  /** 이 연결의 운영자 배율(기본 1 — 기획 D-560 1246, world/operatorPace.ts). 없으면 1 */
  operatorPace?: OperatorPaceLink | undefined;
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
  /** 띄운 2차맵(운영자 빠르기 표시를 단다). 없으면 표시하지 않는다 */
  maps?: (() => Iterable<PaceMap>) | undefined;
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
        const factor = operatorFactor(link, viewer.roles);
        reply(
          message.id,
          await withPace(
            options.maps?.() ?? [],
            message.unitId,
            factor,
            () => run(service, viewer, message),
            link.operatorPace,
          ),
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
