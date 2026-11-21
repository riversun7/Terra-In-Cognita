// WebSocket 연결 하나의 나라 의결 메시지(gov_propose·gov_vote·gov_candidate → gov_result) — docs/adr/2026-11-21-governance.md 4절.
// 가문 게이트웨이(factionIdentity/gateway.ts)와 같은 틀이다: 로그인한 사용자만, 한 연결의 요청은 받은 순서대로 하나씩, 사용자별 속도 제한
// (순간 10번·분당 30번 — 표 던지기가 잦다), 밀린 요청이 MAX_PENDING을 넘으면 busy, 의결 서비스가 없으면 busy.
// 가문 게이트웨이와 한 소켓으로 묶는다(withGovernance — app.ts·session.ts의 가문 자리 하나로 받는다).
import {
  type ClientMessageOf,
  GOVERNANCE5_PROTOCOL_VERSION,
  type GovernanceResultCode,
  encodeMessage,
} from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { HouseClientMessage, HouseGateway, HouseLink } from "../factionIdentity/gateway.ts";
import type { GovernanceResult, GovernanceService } from "./service.ts";

export type GovernanceClientMessage = ClientMessageOf<
  "gov_propose" | "gov_vote" | "gov_candidate" | "gov_coup" | "gov_coup_join"
>;

const MAX_PENDING = 4;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface GovernanceSocket {
  handle(message: GovernanceClientMessage): void;
  close(): void;
}

export interface GovernanceGateway {
  open(link: HouseLink): GovernanceSocket;
}

/** 가문 + 의결 소켓(session.ts의 가문 자리) */
export interface HouseGovernanceGateway {
  open(link: HouseLink): {
    handle(message: HouseClientMessage | GovernanceClientMessage): void;
    close(): void;
  };
}

const isGovernance = (
  message: HouseClientMessage | GovernanceClientMessage,
): message is GovernanceClientMessage =>
  message.t === "gov_propose" ||
  message.t === "gov_vote" ||
  message.t === "gov_candidate" ||
  message.t === "gov_coup" ||
  message.t === "gov_coup_join";

const failed = (code: GovernanceResultCode): GovernanceResult => ({ ok: false, code });

/** 줄기 governance-5에 더한 결과 코드(더 낮은 판 연결에는 not_eligible로 보낸다) */
const GOVERNANCE5_CODES: ReadonlySet<GovernanceResultCode> = new Set([
  "not_at_war",
  "coup_protected",
  "not_majority_holder",
]);

function resultText(id: number, result: GovernanceResult, protocolVersion: number | undefined): string {
  if (result.ok)
    return encodeMessage({ t: "gov_result", id, ok: true, agendaId: result.agendaId, action: result.action });
  const old = protocolVersion !== undefined && protocolVersion < GOVERNANCE5_PROTOCOL_VERSION;
  const code = old && GOVERNANCE5_CODES.has(result.code) ? "not_eligible" : result.code;
  return encodeMessage({ t: "gov_result", id, ok: false, code });
}

/** 메시지 하나를 의결 서비스에(쿠데타 gov_coup·gov_coup_join — 줄기 governance-3) */
function dispatch(
  service: GovernanceService,
  userId: string,
  message: GovernanceClientMessage,
): Promise<GovernanceResult> {
  switch (message.t) {
    case "gov_propose":
      return service.propose(userId, {
        kind: message.kind,
        regime: message.regime,
        targetNationId: message.targetNationId,
        taxes: message.taxes,
        cityId: message.cityId,
        shares: message.shares,
        minPrice: message.minPrice,
        monetaryMode: message.monetaryMode,
        monetaryRateBp: message.monetaryRateBp,
      });
    case "gov_vote":
      return service.vote(userId, message.agendaId, message.choice);
    case "gov_candidate":
      return service.register(userId, message.agendaId);
    case "gov_coup":
      return service.coup(userId);
    default:
      return service.coupJoin(userId, message.coupId, message.side, message.unitIds);
  }
}

export function createGovernanceGateway(options: {
  readonly service: () => GovernanceService | undefined;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
}): GovernanceGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: GovernanceResult): void => {
        if (!closed) link.send(resultText(id, result, link.protocolVersion));
      };
      const process = async (message: GovernanceClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, failed("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, failed("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, failed("rate_limited"));
        const result = await dispatch(service, viewer.id, message);
        if (result.ok)
          options.log.info({ userId: viewer.id, t: message.t, agendaId: result.agendaId }, "governance");
        reply(message.id, result);
      };
      return {
        handle(message) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            reply(message.id, failed("busy"));
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "governance request failed");
              reply(message.id, failed("internal_error"));
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

/** 가문 게이트웨이와 의결 게이트웨이를 한 소켓으로 묶는다(의결 소켓은 처음 의결 메시지가 올 때 연다) */
export function withGovernance(house: HouseGateway, governance: GovernanceGateway): HouseGovernanceGateway {
  return {
    open(link) {
      const houseSocket = house.open(link);
      let governanceSocket: GovernanceSocket | undefined;
      return {
        handle(message) {
          if (isGovernance(message)) {
            governanceSocket ??= governance.open(link);
            governanceSocket.handle(message);
          } else houseSocket.handle(message);
        },
        close() {
          houseSocket.close();
          governanceSocket?.close();
        },
      };
    },
  };
}
