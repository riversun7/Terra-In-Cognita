// WebSocket 연결 하나의 가문 창설·가입 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)"·
// "바뀜 (981~986 답)". 가입 메시지(house_invite 등, 프로토콜 23)는 house_member_result로 답하고 속도 제한을 따로 센다(순간 10번·분당 30번).
// 국적 바꾸기 게이트웨이(citizenship/gateway.ts)와 같은 틀이다: 로그인한 사용자만, 한 연결의 요청은 받은 순서대로 하나씩, 사용자별 속도
// 제한(드문 명령이라 순간 3번·분당 6번), 밀린 요청이 MAX_PENDING을 넘으면 busy, 창설 서비스가 없으면(DB 없는 서버) busy.
import {
  type ClientMessageOf,
  type HouseMemberResultCode,
  type HouseResultCode,
  encodeMessage,
} from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { HouseFounder, HouseFoundResult } from "./found.ts";
import type { HouseMemberResult, HouseMembers } from "./members.ts";

export type HouseMemberClientMessage = ClientMessageOf<
  "house_invite" | "house_apply" | "house_answer" | "house_withdraw" | "house_leave" | "house_kick"
>;
export type HouseClientMessage = ClientMessageOf<"house_found"> | HouseMemberClientMessage;

const MAX_PENDING = 4;
const LIMIT = { capacity: 3, refillPerMinute: 6 };
const MEMBER_LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface HouseLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface HouseSocket {
  handle(message: HouseClientMessage): void;
  close(): void;
}

export interface HouseGateway {
  open(link: HouseLink): HouseSocket;
}

function resultText(id: number, result: HouseFoundResult): string {
  return result.ok
    ? encodeMessage({ t: "house_result", id, ok: true, factionId: result.factionId, paid: result.paid })
    : encodeMessage({ t: "house_result", id, ok: false, code: result.code });
}

function memberText(id: number, result: HouseMemberResult): string {
  return result.ok
    ? encodeMessage({
        t: "house_member_result",
        id,
        ok: true,
        action: result.action,
        factionId: result.factionId,
      })
    : encodeMessage({ t: "house_member_result", id, ok: false, code: result.code });
}

const fail = (code: HouseResultCode): HouseFoundResult => ({ ok: false, code });
const memberFail = (code: HouseMemberResultCode): HouseMemberResult => ({ ok: false, code });

/** 가입 메시지 하나를 서비스에 넘긴다 */
function runMember(members: HouseMembers, userId: string, message: HouseMemberClientMessage) {
  switch (message.t) {
    case "house_invite":
      return members.invite(userId, message.name);
    case "house_apply":
      return members.apply(userId, message.factionId);
    case "house_answer":
      return members.answer(userId, message.requestId, message.accept);
    case "house_withdraw":
      return members.withdraw(userId, message.requestId);
    case "house_leave":
      return members.leave(userId);
    case "house_kick":
      return members.kick(userId, message.userId);
  }
}

export function createHouseGateway(options: {
  /** 창설 서비스(없으면 busy) */
  founder: () => HouseFounder | undefined;
  /** 가입 서비스(없으면 busy) */
  members?: (() => HouseMembers | undefined) | undefined;
  now: () => number;
  log: {
    info(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
}): HouseGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  const memberLimiter: RateLimiter = createRateLimiter({ ...MEMBER_LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: HouseFoundResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      const replyMember = (id: number, result: HouseMemberResult): void => {
        if (!closed) link.send(memberText(id, result));
      };
      const answer = (message: HouseClientMessage, code: HouseResultCode & HouseMemberResultCode): void =>
        message.t === "house_found"
          ? reply(message.id, fail(code))
          : replyMember(message.id, memberFail(code));
      const processMember = async (message: HouseMemberClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return replyMember(message.id, memberFail("sign_in_required"));
        const members = options.members?.();
        if (!members) return replyMember(message.id, memberFail("busy"));
        if (!memberLimiter.take(viewer.id)) return replyMember(message.id, memberFail("rate_limited"));
        const result = await runMember(members, viewer.id, message);
        if (result.ok)
          options.log.info(
            { userId: viewer.id, factionId: result.factionId, action: result.action },
            "house membership",
          );
        replyMember(message.id, result);
      };
      const process = async (message: HouseClientMessage): Promise<void> => {
        if (message.t !== "house_found") return processMember(message);
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const founder = options.founder();
        if (!founder) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        const result = await founder.found(viewer.id, { cost: message.cost });
        if (result.ok)
          options.log.info(
            { userId: viewer.id, factionId: result.factionId, paid: result.paid },
            "house founded",
          );
        reply(message.id, result);
      };
      return {
        handle(message) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            answer(message, "busy");
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "house request failed");
              answer(message, "internal_error");
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
