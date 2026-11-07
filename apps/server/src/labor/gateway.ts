// WebSocket 연결 하나의 노동 계약 명령 처리(src/session.ts가 넘긴다, 구인 게시 셋은 판 8, 직무 배치 둘은 판 14) — docs/adr/2026-11-03-labor-contracts.md
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(같은 유닛·계약을 차례로 바꾼다).
// - 사용자별 속도 제한(순간 10번, 분당 30번). 밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 판정·저장은 서비스(service.ts)가 한다. 세계가 아직 없으면(부팅 중·DB 없음) busy.
import { type ClientMessageOf, type LaborResultCode, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { LaborCommandResult, LaborService } from "./service.ts";

export type LaborClientMessage = ClientMessageOf<
  | "labor_create"
  | "labor_terminate"
  | "labor_top_up"
  | "labor_set_rent"
  | "labor_post_job"
  | "labor_withdraw_job"
  | "labor_accept_job"
  | "labor_assign"
  | "labor_unassign"
>;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface LaborLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface LaborSocket {
  handle(message: LaborClientMessage): void;
  close(): void;
}

export interface LaborGateway {
  open(link: LaborLink): LaborSocket;
}

function resultText(id: number, result: LaborCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "labor_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "labor_result",
    id,
    ok: true,
    ...(result.contractId === undefined ? {} : { contractId: result.contractId }),
    ...(result.jobId === undefined ? {} : { jobId: result.jobId }),
  });
}

const fail = (code: LaborResultCode): LaborCommandResult => ({ ok: false, code });

function run(
  service: LaborService,
  userId: string,
  message: LaborClientMessage,
): Promise<LaborCommandResult> {
  switch (message.t) {
    case "labor_create":
      return service.create(userId, {
        kind: message.kind,
        buildingId: message.buildingId,
        unitId: message.unitId,
        adjustPm: message.adjustPm,
        termHours: message.termHours,
      });
    case "labor_terminate":
      return service.terminate(userId, message.contractId);
    case "labor_top_up":
      return service.topUp(userId, message.contractId, BigInt(message.amount));
    case "labor_set_rent":
      return service.setRent(userId, message.buildingId, BigInt(message.rent));
    case "labor_post_job":
      return service.postJob(userId, {
        buildingId: message.buildingId,
        adjustPm: message.adjustPm,
        slots: message.slots,
        termHours: message.termHours,
      });
    case "labor_withdraw_job":
      return service.withdrawJob(userId, message.jobId);
    case "labor_accept_job":
      return service.acceptJob(userId, message.jobId, message.unitId);
    case "labor_assign":
      return service.assign(userId, message.buildingId, message.unitId);
    case "labor_unassign":
      return service.unassign(userId, message.unitId);
    default: {
      const unhandled: never = message;
      return unhandled;
    }
  }
}

export function createLaborGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => LaborService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): LaborGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: LaborCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      const process = async (message: LaborClientMessage): Promise<void> => {
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
              options.log.error({ err: error, t: message.t }, "labor request failed");
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
