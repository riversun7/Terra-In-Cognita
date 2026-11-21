// WebSocket 연결 하나의 가문 연맹 명령(house_league → house_league_result) — npc-invest-2(질문 2502·2503), leagueService.ts.
// 도시 지분 게이트웨이(cityShares/gateway.ts)와 같은 틀이다: 로그인한 사용자만, 한 연결의 요청은 받은 순서대로 하나씩, 사용자별 속도 제한(드문 명령이라
// 순간 3번·분당 12번), 밀린 요청이 MAX_PENDING을 넘으면 busy, 연맹 서비스가 없으면(DB 없는 서버) busy. 가문·의결·도시 지분·조약 소켓과 한 소켓으로 묶는다
// (withLeagues — session.ts의 가문 자리 하나로 받는다. app.ts를 키우지 않는다).
import { type ClientMessageOf, type HouseLeagueResultCode, encodeMessage } from "@terra/protocol";
import type { CityShareClientMessage } from "../cityShares/gateway.ts";
import type { DiplomacyClientMessage, HouseDiplomacyGateway } from "../diplomacy/gateway.ts";
import type { GovernanceClientMessage } from "../governance/gateway.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { HouseClientMessage, HouseLink } from "./gateway.ts";
import type { HouseLeagueService, LeagueCommandResult } from "./leagueService.ts";

export type HouseLeagueClientMessage = ClientMessageOf<"house_league">;

const MAX_PENDING = 4;
const LIMIT = { capacity: 3, refillPerMinute: 12 };

/** 가문 + 의결 + 도시 지분 + 조약 + 연맹 소켓(session.ts의 가문 자리) */
export interface HouseLeagueGateway {
  open(link: HouseLink): {
    handle(
      message:
        | HouseClientMessage
        | GovernanceClientMessage
        | CityShareClientMessage
        | DiplomacyClientMessage
        | HouseLeagueClientMessage,
    ): void;
    close(): void;
  };
}

type Result = LeagueCommandResult | { readonly ok: false; readonly code: HouseLeagueResultCode };

const failed = (code: HouseLeagueResultCode): Result => ({ ok: false, code });

function resultText(id: number, result: Result): string {
  return result.ok
    ? encodeMessage({
        t: "house_league_result",
        id,
        ok: true,
        ...(result.leagueId === undefined ? {} : { leagueId: result.leagueId }),
      })
    : encodeMessage({ t: "house_league_result", id, ok: false, code: result.code });
}

export function createHouseLeagueSocket(options: {
  readonly service: () => Pick<HouseLeagueService, "command"> | undefined;
  readonly now: () => number;
  readonly log: { error(obj: object, message: string): void };
}) {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link: HouseLink) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: Result): void => {
        if (!closed) link.send(resultText(id, result));
      };
      const process = async (message: HouseLeagueClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, failed("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, failed("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, failed("rate_limited"));
        reply(
          message.id,
          await service.command(viewer.id, {
            action: message.action,
            leagueId: message.leagueId,
            house: message.house,
          }),
        );
      };
      return {
        handle(message: HouseLeagueClientMessage) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            reply(message.id, failed("busy"));
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "house league request failed");
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

export type HouseLeagueSocketGateway = ReturnType<typeof createHouseLeagueSocket>;

/** 가문·의결·도시 지분·조약 소켓과 연맹 소켓을 한 소켓으로 묶는다(연맹 소켓은 처음 연맹 메시지가 올 때 연다) */
export function withLeagues(
  base: HouseDiplomacyGateway,
  leagues: HouseLeagueSocketGateway,
): HouseLeagueGateway {
  return {
    open(link) {
      const baseSocket = base.open(link);
      let leagueSocket: ReturnType<HouseLeagueSocketGateway["open"]> | undefined;
      return {
        handle(message) {
          if (message.t === "house_league") {
            leagueSocket ??= leagues.open(link);
            leagueSocket.handle(message);
          } else baseSocket.handle(message);
        },
        close() {
          baseSocket.close();
          leagueSocket?.close();
        },
      };
    },
  };
}
