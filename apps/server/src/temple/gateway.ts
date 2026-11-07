// WebSocket 연결 하나의 신전 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-07-temple-religion.md. 융합 게이트웨이와 같은 틀이다:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(잔고·신앙도를 차례로 본다).
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 건물 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 개발 시험(dev_inactivate_unit)·개발 편집(dev_guardian_buff, 기획 답 456 가 — 수호신마다 버프 칸)은 dev·admin(secondMap dev-spawn — 융합 개발
//   시험과 같은 권한).
// - 판정·저장은 서비스(service.ts)가 한다.
import { type ClientMessageOf, type TempleResultCode, encodeMessage } from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { TempleCommandResult, TempleService } from "./service.ts";

export type TempleClientMessage = ClientMessageOf<
  "temple_pray" | "temple_offer" | "temple_rite" | "dev_inactivate_unit" | "dev_guardian_buff"
>;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface TempleLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface TempleSocket {
  handle(message: TempleClientMessage): void;
  close(): void;
}

export interface TempleGateway {
  open(link: TempleLink): TempleSocket;
}

function resultText(id: number, result: TempleCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "temple_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "temple_result",
    id,
    ok: true,
    ...(result.unitId === undefined ? {} : { unitId: result.unitId }),
    ...(result.faith === undefined ? {} : { faith: result.faith }),
    ...(result.gained === undefined ? {} : { gained: result.gained }),
  });
}

const fail = (code: TempleResultCode): TempleCommandResult => ({ ok: false, code });

async function run(service: TempleService, viewer: Viewer, message: TempleClientMessage) {
  switch (message.t) {
    case "temple_pray":
      return service.pray(viewer.id, { buildingId: message.buildingId });
    case "temple_offer":
      return service.offer(viewer.id, { buildingId: message.buildingId, amount: message.amount });
    case "temple_rite":
      return service.rite(viewer.id, {
        buildingId: message.buildingId,
        unit: message.unit,
        rite: message.rite,
        cost: message.cost,
      });
    case "dev_inactivate_unit":
      if (!rolesAllow(viewer.roles, { secondMap: ["dev-spawn"] })) return fail("forbidden");
      return service.devInactivate(viewer.id, { unit: message.unit });
    case "dev_guardian_buff":
      if (!rolesAllow(viewer.roles, { secondMap: ["dev-spawn"] })) return fail("forbidden");
      return service.devGuardianBuff({ unit: message.unit, buff: message.buff });
    default: {
      const unknown: never = message;
      return unknown;
    }
  }
}

export function createTempleGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => TempleService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): TempleGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: TempleCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const process = async (message: TempleClientMessage): Promise<void> => {
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
              options.log.error({ err: error, t: message.t }, "temple request failed");
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
