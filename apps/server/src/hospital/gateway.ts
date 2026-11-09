// WebSocket 연결 하나의 병원 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-08-injury.md. 신전 게이트웨이와 같은 틀이다:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(잔고를 차례로 본다).
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 건물·신전 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 개발 시험(dev_injure_unit)은 dev·admin(secondMap dev-test — 신전 개발 시험과 같은 권한).
// - 판정·저장은 서비스(service.ts)가 한다.
import { type ClientMessageOf, type HospitalResultCode, encodeMessage } from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { HospitalCommandResult, HospitalService } from "./service.ts";

export type HospitalClientMessage = ClientMessageOf<"hospital_treat" | "dev_injure_unit">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface HospitalLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface HospitalSocket {
  handle(message: HospitalClientMessage): void;
  close(): void;
}

export interface HospitalGateway {
  open(link: HospitalLink): HospitalSocket;
}

function resultText(id: number, result: HospitalCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "hospital_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "hospital_result",
    id,
    ok: true,
    unitId: result.unitId,
    stage: result.stage,
    ...(result.untilMs === undefined ? {} : { untilMs: result.untilMs }),
    ...(result.greenAtMs === undefined ? {} : { greenAtMs: result.greenAtMs }),
    ...(result.paid === undefined ? {} : { paid: result.paid }),
  });
}

const fail = (code: HospitalResultCode): HospitalCommandResult => ({ ok: false, code });

async function run(service: HospitalService, viewer: Viewer, message: HospitalClientMessage) {
  switch (message.t) {
    case "hospital_treat":
      return service.treat(viewer.id, {
        buildingId: message.buildingId,
        unit: message.unit,
        cost: message.cost,
      });
    case "dev_injure_unit":
      if (!rolesAllow(viewer.roles, { secondMap: ["dev-test"] })) return fail("forbidden");
      return service.devInjure(viewer.id, { unit: message.unit, stage: message.stage });
    default: {
      const unknown: never = message;
      return unknown;
    }
  }
}

export function createHospitalGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => HospitalService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): HospitalGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: HospitalCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const process = async (message: HospitalClientMessage): Promise<void> => {
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
              options.log.error({ err: error, t: message.t }, "hospital request failed");
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
