// WebSocket 연결 하나의 조약 메시지(dip_propose·dip_counter·dip_respond·dip_war_request·dip_war_respond → dip_result) — docs/adr/2026-11-21-diplomacy-treaties.md.
// 도시 지분 소켓(cityShares/gateway.ts)과 같은 틀이다: 로그인한 사용자만, 한 연결의 요청은 받은 순서대로 하나씩, 사용자별 속도 제한(순간 10번·분당 30번),
// 밀린 요청이 MAX_PENDING을 넘으면 busy, 외교 서비스가 없으면 busy. 가문·의결·도시 지분 소켓과 한 소켓으로 묶는다(withDiplomacy — session.ts의 가문 자리 하나로
// 받는다. app.ts를 키우지 않는다).
import { type ClientMessageOf, type DiplomacyResultCode, encodeMessage } from "@terra/protocol";
import type { CityShareClientMessage, HouseShareGateway } from "../cityShares/gateway.ts";
import type { HouseClientMessage, HouseLink } from "../factionIdentity/gateway.ts";
import type { GovernanceClientMessage } from "../governance/gateway.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { DiplomacyResult, DiplomacyService } from "./service.ts";

export type DiplomacyClientMessage = ClientMessageOf<
  "dip_propose" | "dip_counter" | "dip_respond" | "dip_war_request" | "dip_war_respond"
>;

type AnyHouseMessage =
  | HouseClientMessage
  | GovernanceClientMessage
  | CityShareClientMessage
  | DiplomacyClientMessage;

const MAX_PENDING = 4;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

/** 가문 + 의결 + 도시 지분 + 조약 소켓(session.ts의 가문 자리) */
export interface HouseDiplomacyGateway {
  open(link: HouseLink): {
    handle(message: AnyHouseMessage): void;
    close(): void;
  };
}

const failed = (code: DiplomacyResultCode): DiplomacyResult => ({ ok: false, code });

function resultText(id: number, result: DiplomacyResult): string {
  return result.ok
    ? encodeMessage({ t: "dip_result", id, ok: true, action: result.action, ref: result.ref })
    : encodeMessage({ t: "dip_result", id, ok: false, code: result.code });
}

export const isDiplomacy = (message: AnyHouseMessage): message is DiplomacyClientMessage =>
  message.t === "dip_propose" ||
  message.t === "dip_counter" ||
  message.t === "dip_respond" ||
  message.t === "dip_war_request" ||
  message.t === "dip_war_respond";

type DiplomacyCommands = Pick<
  DiplomacyService,
  "propose" | "counter" | "respond" | "requestWar" | "respondWar"
>;

/** 메시지 하나를 외교 서비스에 */
function dispatch(
  service: DiplomacyCommands,
  userId: string,
  message: DiplomacyClientMessage,
): Promise<DiplomacyResult> {
  switch (message.t) {
    case "dip_propose":
      return service.propose(userId, {
        targetNationId: message.targetNationId,
        clauses: message.clauses,
        days: message.days,
      });
    case "dip_counter":
      return service.counter(userId, {
        treatyId: message.treatyId,
        clauses: message.clauses,
        days: message.days,
      });
    case "dip_respond":
      return service.respond(userId, { treatyId: message.treatyId, accept: message.accept });
    case "dip_war_request":
      return service.requestWar(userId, { treatyId: message.treatyId, enemyNationId: message.enemyNationId });
    default:
      return service.respondWar(userId, { requestId: message.requestId, accept: message.accept });
  }
}

export function createDiplomacySocket(options: {
  readonly service: () => DiplomacyCommands | undefined;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
}) {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link: HouseLink) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: DiplomacyResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      const process = async (message: DiplomacyClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, failed("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, failed("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, failed("rate_limited"));
        const result = await dispatch(service, viewer.id, message);
        if (result.ok) options.log.info({ userId: viewer.id, t: message.t, ref: result.ref }, "diplomacy");
        reply(message.id, result);
      };
      return {
        handle(message: DiplomacyClientMessage) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            reply(message.id, failed("busy"));
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "diplomacy request failed");
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

export type DiplomacySocketGateway = ReturnType<typeof createDiplomacySocket>;

/** 가문·의결·도시 지분 소켓과 조약 소켓을 한 소켓으로 묶는다(조약 소켓은 처음 조약 메시지가 올 때 연다) */
export function withDiplomacy(
  base: HouseShareGateway,
  diplomacy: DiplomacySocketGateway,
): HouseDiplomacyGateway {
  return {
    open(link) {
      const baseSocket = base.open(link);
      let socket: ReturnType<DiplomacySocketGateway["open"]> | undefined;
      return {
        handle(message) {
          if (isDiplomacy(message)) {
            socket ??= diplomacy.open(link);
            socket.handle(message);
          } else baseSocket.handle(message);
        },
        close() {
          baseSocket.close();
          socket?.close();
        },
      };
    },
  };
}
