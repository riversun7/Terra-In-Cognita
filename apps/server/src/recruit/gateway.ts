// WebSocket 연결 하나의 구인 카드 고용 메시지 처리(src/session.ts가 넘긴다) — D-469, docs/adr/2026-10-31-faction-society-core.md
// "바뀜 (D-469 구인 카드)". 사이보그 만들기 게이트웨이(cyborg/gateway.ts)와 같은 틀이다:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(산 칸·잔고를 차례로 본다).
// - 사용자별 속도 제한(순간 10번, 분당 30번). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 판정·저장은 서비스(service.ts)가 한다.
import {
  type ClientMessageOf,
  type RecruitResultCode,
  encodeMessage,
  legacyRecruitCode,
} from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { RecruitHireResult, RecruitService } from "./service.ts";

export type RecruitClientMessage = ClientMessageOf<"recruit_hire">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface RecruitLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 연결이 인사한 프로토콜 판(39 아래면 no_house를 internal_error로 낮춘다 — D-565). 없으면 지금 판 */
  readonly protocolVersion?: number | undefined;
}

export interface RecruitSocket {
  handle(message: RecruitClientMessage): void;
  close(): void;
}

export interface RecruitGateway {
  open(link: RecruitLink): RecruitSocket;
}

function resultText(id: number, result: RecruitHireResult, protocolVersion: number | undefined): string {
  return encodeMessage(
    result.ok
      ? { t: "recruit_result", id, ok: true, unitId: result.unitId }
      : {
          t: "recruit_result",
          id,
          ok: false,
          code: protocolVersion === undefined ? result.code : legacyRecruitCode(result.code, protocolVersion),
        },
  );
}

const fail = (code: RecruitResultCode): RecruitHireResult => ({ ok: false, code });

export function createRecruitGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => RecruitService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): RecruitGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: RecruitHireResult): void => {
        if (!closed) link.send(resultText(id, result, link.protocolVersion));
      };

      const process = async (message: RecruitClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        reply(
          message.id,
          await service.hire(viewer.id, {
            cityId: message.cityId,
            window: message.window,
            slot: message.slot,
            cost: message.cost,
          }),
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
              options.log.error({ err: error, t: message.t }, "recruit request failed");
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
