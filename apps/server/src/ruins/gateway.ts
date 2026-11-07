// WebSocket 연결 하나의 폐허 복원 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-07-ruins-restoration.md. 신전 게이트웨이와 같은 틀이다:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(잔고·모인 값을 차례로 본다).
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 건물 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 개발 시험(dev_make_ruin)은 dev·admin(secondMap dev-spawn — 다른 개발 시험과 같은 권한).
// - 판정·저장은 서비스(service.ts, 규칙은 거울 세계 @terra/sim SocietyRuins)가 한다.
// - 폐허 2(프로토콜 15)의 새 결과 코드 not_built·expired는 15판 연결에만 가고 더 낮은 판은 not_claimed를 받는다(그 판 기기는 모르는 코드다).
import {
  type ClientMessageOf,
  RUINS_DEADLINE_CODES,
  RUINS_DEADLINE_PROTOCOL_VERSION,
  type RestorationResultCode,
  encodeMessage,
} from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { RuinCommandResult, RuinService } from "./service.ts";

export type RuinClientMessage = ClientMessageOf<"restoration_open" | "restoration_fund" | "dev_make_ruin">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface RuinLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 연결이 인사한 프로토콜 버전(없으면 지금 판으로 친다 — 시험) */
  protocolVersion?: number | undefined;
}

export interface RuinSocket {
  handle(message: RuinClientMessage): void;
  close(): void;
}

export interface RuinGateway {
  open(link: RuinLink): RuinSocket;
}

function resultText(id: number, result: RuinCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "restoration_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "restoration_result",
    id,
    ok: true,
    ...(result.ruinId === undefined ? {} : { ruinId: result.ruinId }),
    ...(result.accepted === undefined ? {} : { accepted: result.accepted }),
    ...(result.raised === undefined ? {} : { raised: result.raised }),
    ...(result.restored === undefined ? {} : { restored: result.restored }),
  });
}

const fail = (code: RestorationResultCode): RuinCommandResult => ({ ok: false, code });

async function run(service: RuinService, viewer: Viewer, message: RuinClientMessage) {
  switch (message.t) {
    case "restoration_open":
      return service.open(viewer.id, message.ruin);
    case "restoration_fund":
      return service.fund(viewer.id, message.ruin, message.amount);
    case "dev_make_ruin":
      if (!rolesAllow(viewer.roles, { secondMap: ["dev-spawn"] })) return fail("forbidden");
      return service.devMakeRuin(viewer.id);
    default: {
      const unknown: never = message;
      return unknown;
    }
  }
}

export function createRuinGateway(options: {
  /** 세계·NPC 사회가 준비되면 서비스(없으면 busy) */
  service: () => RuinService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): RuinGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const old = (link.protocolVersion ?? RUINS_DEADLINE_PROTOCOL_VERSION) < RUINS_DEADLINE_PROTOCOL_VERSION;
      const reply = (id: number, result: RuinCommandResult): void => {
        if (closed) return;
        const shown =
          old && !result.ok && RUINS_DEADLINE_CODES.includes(result.code) ? fail("not_claimed") : result;
        link.send(resultText(id, shown));
      };

      const process = async (message: RuinClientMessage): Promise<void> => {
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
              options.log.error({ err: error, t: message.t }, "ruin request failed");
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
