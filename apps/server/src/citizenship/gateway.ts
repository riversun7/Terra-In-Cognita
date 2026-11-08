// WebSocket 연결 하나의 국적 바꾸기 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-08-citizenship.md. 병원 게이트웨이와 같은 틀이다:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(잔고·쉬는 날을 차례로 본다).
// - 사용자별 속도 제한(순간 5번, 분당 10번 — 드문 명령이라 다른 명령보다 낮다). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 없으면 busy.
// - 판정·저장은 서비스(service.ts)가 한다. 결과 코드는 화면 문구와 감사(원장 거래·기록 표)에 그대로 쓴다.
import { type ClientMessageOf, type NationalityResultCode, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { CitizenshipService, NationalityCommandResult } from "./service.ts";

export type CitizenshipClientMessage = ClientMessageOf<"nationality_change">;

const MAX_PENDING = 4;
const LIMIT = { capacity: 5, refillPerMinute: 10 };

export interface CitizenshipLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface CitizenshipSocket {
  handle(message: CitizenshipClientMessage): void;
  close(): void;
}

export interface CitizenshipGateway {
  open(link: CitizenshipLink): CitizenshipSocket;
}

function resultText(id: number, result: NationalityCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "nationality_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "nationality_result",
    id,
    ok: true,
    factionId: result.factionId,
    cityId: result.cityId,
    paid: result.paid,
    returned: result.returned,
    nextAtMs: result.nextAtMs,
  });
}

const fail = (code: NationalityResultCode): NationalityCommandResult => ({ ok: false, code });

export function createCitizenshipGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => CitizenshipService | undefined;
  now: () => number;
  log: {
    info(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
}): CitizenshipGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: NationalityCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const process = async (message: CitizenshipClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        const result = await service.change(viewer.id, {
          buildingId: message.buildingId,
          factionId: message.factionId,
          cost: message.cost,
        });
        // 바뀐 국적은 서버 기록에도 남긴다(원장 거래·기록 표가 원본, 이 줄은 운영자가 찾기 쉽게)
        if (result.ok)
          options.log.info(
            {
              userId: viewer.id,
              factionId: result.factionId,
              cityId: result.cityId,
              paid: result.paid,
              returned: result.returned,
            },
            "nationality changed",
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
              options.log.error({ err: error, t: message.t }, "nationality request failed");
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
