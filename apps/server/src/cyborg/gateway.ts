// WebSocket 연결 하나의 사이보그 만들기 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-01-first-login-cyborg.md 4절
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(굴림 횟수를 차례로 센다).
// - 사용자별 속도 제한(굴리기·만들기 합쳐 순간 10번, 분당 30번). 밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 판정·저장은 서비스(service.ts)가 한다. 세계가 아직 없으면(부팅 중·DB 없음) busy.
// - 속성 분배(프로토콜 5, D-450): 5판 연결의 만들기는 분배(elements)를 꼭 보낸다(없으면 elements_invalid). 4판 연결의 만들기는
//   분배 없이 서비스에 넘긴다 → "분배 기다림"으로 만들고 새 앱이 cyborg_elements로 한 번 나눈다.
import {
  CYBORG_ELEMENTS_PROTOCOL_VERSION,
  type ClientMessageOf,
  type CyborgResultCode,
  encodeMessage,
} from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { CyborgCommandResult, CyborgService } from "./service.ts";

export type CyborgClientMessage = ClientMessageOf<"cyborg_roll" | "cyborg_create" | "cyborg_elements">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface CyborgLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 이 연결이 인사한 프로토콜 판(5부터 만들기에 속성 분배가 따라온다) */
  readonly protocolVersion: number;
}

export interface CyborgSocket {
  handle(message: CyborgClientMessage): void;
  close(): void;
}

export interface CyborgGateway {
  open(link: CyborgLink): CyborgSocket;
}

function resultText(id: number, result: CyborgCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "cyborg_result", id, ok: false, code: result.code });
  return encodeMessage(
    result.roll === undefined
      ? { t: "cyborg_result", id, ok: true }
      : { t: "cyborg_result", id, ok: true, roll: result.roll },
  );
}

const fail = (code: CyborgResultCode): CyborgCommandResult => ({ ok: false, code });

export function createCyborgGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => CyborgService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): CyborgGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: CyborgCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const run = (
        service: CyborgService,
        userId: string,
        message: CyborgClientMessage,
      ): Promise<CyborgCommandResult> => {
        if (message.t === "cyborg_roll") return service.roll(userId, message.temperament);
        if (message.t === "cyborg_elements") return service.allocateElements(userId, message.elements);
        if (message.elements === undefined && link.protocolVersion >= CYBORG_ELEMENTS_PROTOCOL_VERSION)
          return Promise.resolve(fail("elements_invalid"));
        return service.create(userId, {
          name: message.name,
          appearance: message.appearance,
          factionId: message.factionId,
          cityId: message.cityId,
          ...(message.elements === undefined ? {} : { elements: message.elements }),
          ...(message.look === undefined ? {} : { look: message.look }),
        });
      };

      const process = async (message: CyborgClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        reply(message.id, await run(service, viewer.id, message));
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
              options.log.error({ err: error, t: message.t }, "cyborg request failed");
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
