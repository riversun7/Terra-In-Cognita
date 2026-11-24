// WebSocket 연결 하나의 가문 창설·가입 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)"·
// "바뀜 (981~986 답)". 가입 메시지(house_invite 등, 프로토콜 23)는 house_member_result로 답하고 속도 제한을 따로 센다(순간 10번·분당 30번).
// 나라 세금 정하기(nation_tax, 프로토콜 57 — government/nationTaxPolicy.ts)도 받아 nation_tax_result로 답한다(가입 속도 제한을 함께 센다).
// 국적 바꾸기 게이트웨이(citizenship/gateway.ts)와 같은 틀이다: 로그인한 사용자만, 한 연결의 요청은 받은 순서대로 하나씩, 사용자별 속도
// 제한(드문 명령이라 순간 3번·분당 6번), 밀린 요청이 MAX_PENDING을 넘으면 busy, 창설 서비스가 없으면(DB 없는 서버) busy.
import {
  type ClientMessageOf,
  type HouseCityResultCode,
  type HouseMemberResultCode,
  type HouseRecruitResultCode,
  type HouseResultCode,
  type NationTaxResultCode,
  PROTOCOL_VERSION,
  encodeMessage,
  legacyHouseMemberAction,
  legacyHouseMemberCode,
  NATION_TAX_PERIOD_PROTOCOL_VERSION,
} from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { HouseFounder, HouseFoundResult } from "./found.ts";
import type { HouseCityResult, HouseCityService } from "./houseCity.ts";
import type { HouseEntryPolicyService } from "./houseEntryPolicy.ts";
import type { HouseHomeService } from "./houseHome.ts";
import type { HousePolicyService } from "./housePolicy.ts";
import type { HouseMemberResult, HouseMembers } from "./members.ts";
import type { HouseRecruitResult, HouseRecruitService } from "./houseRecruit.ts";
import type { HouseSuccession } from "./succession.ts";
import type { CityMoneyPolicyService, CityMoneyResult } from "../government/cityMoneyPolicy.ts";
import type { NationTaxPolicyService, NationTaxResult } from "../government/nationTaxPolicy.ts";

export type HouseMemberClientMessage = ClientMessageOf<
  | "house_invite"
  | "house_donate"
  | "house_vault_take"
  | "house_tax"
  | "house_build_policy"
  | "house_apply"
  | "house_answer"
  | "house_withdraw"
  | "house_leave"
  | "house_kick"
  | "house_handover"
  | "house_heir"
  | "house_dissolve"
  | "house_home"
  | "house_entry_policy"
>;
export type HouseCityClientMessage = ClientMessageOf<"house_village" | "house_ruin" | "house_independence">;
export type HouseRecruitClientMessage = ClientMessageOf<"house_recruit_auto" | "house_recruit_hire">;
/** 나라 세금 정하기(프로토콜 57 — 나라 지도자 = 독립 나라 가문장, government/nationTaxPolicy.ts) */
export type NationTaxClientMessage = ClientMessageOf<"nation_tax">;
/** 도시 화폐 고르기(프로토콜 69 — 도시 주인 나라 지도자, government/cityMoneyPolicy.ts) */
export type CityCurrencyClientMessage = ClientMessageOf<"city_currency">;
export type HouseClientMessage =
  | ClientMessageOf<"house_found">
  | NationTaxClientMessage
  | CityCurrencyClientMessage
  | HouseMemberClientMessage
  | HouseCityClientMessage
  | HouseRecruitClientMessage;

const MAX_PENDING = 4;
const LIMIT = { capacity: 3, refillPerMinute: 6 };
const MEMBER_LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface HouseLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 연결이 인사한 프로토콜 판(없으면 지금 판 — 시험) */
  readonly protocolVersion?: number | undefined;
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

function memberText(id: number, result: HouseMemberResult, protocolVersion: number): string {
  return result.ok
    ? encodeMessage({
        t: "house_member_result",
        id,
        ok: true,
        // 공고·공고 거둠(D-570, 48판)은 더 낮은 판 연결에 home_set으로
        action: legacyHouseMemberAction(result.action, protocolVersion),
        factionId: result.factionId,
      })
    : encodeMessage({
        t: "house_member_result",
        id,
        ok: false,
        // 가입비 모자람(D-573, 50판)은 더 낮은 판 연결에 busy로
        code: legacyHouseMemberCode(result.code, protocolVersion),
      });
}

function cityText(id: number, result: HouseCityResult): string {
  return result.ok
    ? encodeMessage({
        t: "house_city_result",
        id,
        ok: true,
        factionId: result.factionId,
        mode: result.mode,
        cityId: result.cityId,
        paid: result.paid,
      })
    : encodeMessage({ t: "house_city_result", id, ok: false, code: result.code });
}

function recruitText(id: number, result: HouseRecruitResult): string {
  return result.ok
    ? encodeMessage({
        t: "house_recruit_result",
        id,
        ok: true,
        auto: result.auto,
        ...(result.unitId === undefined ? {} : { unitId: result.unitId }),
        ...(result.payer === undefined ? {} : { payer: result.payer }),
      })
    : encodeMessage({ t: "house_recruit_result", id, ok: false, code: result.code });
}

function nationTaxText(id: number, result: NationTaxResult, protocolVersion: number): string {
  return result.ok
    ? encodeMessage({
        t: "nation_tax_result",
        id,
        ok: true,
        factionId: result.factionId,
        // 세율 안건을 열었으면(질문 2407 가 — 58판(묶음 1116x, 줄기 판 98)부터, 더 낮은 판은 모른 채 받는다)
        ...(result.agendaId === undefined ? {} : { agendaId: result.agendaId }),
      })
    : encodeMessage({
        t: "nation_tax_result",
        id,
        ok: false,
        // 주기 목록 밖(invalid_period)은 프로토콜 61부터 — 더 낮은 판은 internal_error(D-585 2)
        code:
          result.code === "invalid_period" && protocolVersion < NATION_TAX_PERIOD_PROTOCOL_VERSION
            ? "internal_error"
            : result.code,
      });
}

const recruitFail = (code: HouseRecruitResultCode): HouseRecruitResult => ({ ok: false, code });
const taxFail = (code: NationTaxResultCode): NationTaxResult => ({ ok: false, code });
const moneyText = (id: number, result: CityMoneyResult): string =>
  encodeMessage({ t: "city_currency_result", id, ...result });
const fail = (code: HouseResultCode): HouseFoundResult => ({ ok: false, code });
const cityFail = (code: HouseCityResultCode): HouseCityResult => ({ ok: false, code });
const memberFail = (code: HouseMemberResultCode): HouseMemberResult => ({ ok: false, code });

/** 해산한 뒤 남은 가문 금고 돈은 가문장 지갑으로(D-576 — 기획 해석, housePolicy.ts vaultToLeader) */
async function dissolveWithVault(
  succession: HouseSuccession,
  policy: HousePolicyService | undefined,
  userId: string,
): Promise<HouseMemberResult> {
  const result = await succession.dissolve(userId);
  if (result.ok) await policy?.vaultToLeader(userId, result.factionId);
  return result;
}

/** 가입 메시지 하나를 서비스에 넘긴다 */
function runMember(
  members: HouseMembers,
  succession: HouseSuccession | undefined,
  home: HouseHomeService | undefined,
  userId: string,
  message: HouseMemberClientMessage,
  entryPolicy?: HouseEntryPolicyService,
  policy?: HousePolicyService,
): Promise<HouseMemberResult> {
  switch (message.t) {
    // 가문 금고 기부·가문세율·도시 짓기 정책(프로토콜 54, D-574 — housePolicy.ts)
    case "house_donate":
      return policy ? policy.donate(userId, BigInt(message.amount)) : Promise.resolve(memberFail("busy"));
    case "house_vault_take":
      return policy ? policy.take(userId, BigInt(message.amount)) : Promise.resolve(memberFail("busy"));
    case "house_tax":
      return policy ? policy.setTax(userId, message.ratePm) : Promise.resolve(memberFail("busy"));
    case "house_build_policy":
      return policy
        ? policy.setBuild(userId, message.cityId, message.allow)
        : Promise.resolve(memberFail("busy"));
    case "house_entry_policy":
      return entryPolicy
        ? entryPolicy.set(userId, { scope: message.scope, cityId: message.cityId, fee: message.fee })
        : Promise.resolve(memberFail("busy"));
    case "house_home":
      return home ? home.set(userId, message.cityId) : Promise.resolve(memberFail("busy"));
    case "house_handover":
      return succession ? succession.handover(userId, message.userId) : Promise.resolve(memberFail("busy"));
    case "house_heir":
      return succession ? succession.heir(userId, message.userId) : Promise.resolve(memberFail("busy"));
    case "house_dissolve":
      return succession ? dissolveWithVault(succession, policy, userId) : Promise.resolve(memberFail("busy"));
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
    default:
      // house_kick(남은 하나)
      return members.kick(userId, message.userId);
  }
}

export function createHouseGateway(options: {
  /** 창설 서비스(없으면 busy) */
  founder: () => HouseFounder | undefined;
  /** 가입 서비스(없으면 busy) */
  members?: (() => HouseMembers | undefined) | undefined;
  /** 가문장 넘기기·해산(프로토콜 24, 없으면 busy) */
  succession?: (() => HouseSuccession | undefined) | undefined;
  /** 가문 도시(마을 세우기·폐허 고르기, 프로토콜 24, 없으면 busy) */
  city?: (() => HouseCityService | undefined) | undefined;
  /** 가문 도시 구인(자동 켬·끔·사기, 프로토콜 25, 없으면 busy) */
  recruit?: (() => HouseRecruitService | undefined) | undefined;
  /** 가문 소속 도시 바꾸기(프로토콜 39, D-565, 없으면 busy) */
  home?: (() => HouseHomeService | undefined) | undefined;
  /** 가문 이동 정책 정하기(프로토콜 50, 질문 2018 답, 없으면 busy) */
  entryPolicy?: (() => HouseEntryPolicyService | undefined) | undefined;
  /** 가문 금고 기부·가문세율·도시 짓기 정책(프로토콜 54, D-574, 없으면 busy) */
  policy?: (() => HousePolicyService | undefined) | undefined;
  /** 나라 세금 정하기(프로토콜 57, 질문 2322 나·2373 가, 없으면 busy) */
  nationTax?: (() => NationTaxPolicyService | undefined) | undefined;
  /** 도시 화폐 고르기(프로토콜 69, docs/adr/2026-11-24-city-money.md, 없으면 busy) */
  cityMoney?: (() => CityMoneyPolicyService | undefined) | undefined;
  /** 창설·가입·넘기기·해산·소속 도시가 성공한 뒤(시야 묶음·가문 표 다시 읽기 — 가문원 나라·구인 자격이 바뀐다) */
  afterMembership?: (() => Promise<void>) | undefined;
  now: () => number;
  log: {
    info(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
}): HouseGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  const memberLimiter: RateLimiter = createRateLimiter({ ...MEMBER_LIMIT, now: options.now });
  const cityLimiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: HouseFoundResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      const replyMember = (id: number, result: HouseMemberResult): void => {
        if (!closed) link.send(memberText(id, result, link.protocolVersion ?? PROTOCOL_VERSION));
      };
      const replyCity = (id: number, result: HouseCityResult): void => {
        if (!closed) link.send(cityText(id, result));
      };
      const replyRecruit = (id: number, result: HouseRecruitResult): void => {
        if (!closed) link.send(recruitText(id, result));
      };
      const replyMoney = (id: number, result: CityMoneyResult): void => {
        if (!closed) link.send(moneyText(id, result));
      };
      const replyTax = (id: number, result: NationTaxResult): void => {
        if (!closed) link.send(nationTaxText(id, result, link.protocolVersion ?? PROTOCOL_VERSION));
      };
      const answer = (
        message: HouseClientMessage,
        code: HouseResultCode &
          HouseMemberResultCode &
          HouseCityResultCode &
          HouseRecruitResultCode &
          NationTaxResultCode,
      ): void => {
        if (message.t === "house_found") reply(message.id, fail(code));
        else if (message.t === "nation_tax") replyTax(message.id, taxFail(code));
        else if (message.t === "city_currency") replyMoney(message.id, { ok: false, code });
        else if (message.t === "house_recruit_auto" || message.t === "house_recruit_hire")
          replyRecruit(message.id, recruitFail(code));
        else if (
          message.t === "house_village" ||
          message.t === "house_ruin" ||
          message.t === "house_independence"
        )
          replyCity(message.id, cityFail(code));
        else replyMember(message.id, memberFail(code));
      };
      const processCity = async (message: HouseCityClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return replyCity(message.id, cityFail("sign_in_required"));
        const city = options.city?.();
        if (!city) return replyCity(message.id, cityFail("busy"));
        if (!cityLimiter.take(viewer.id)) return replyCity(message.id, cityFail("rate_limited"));
        // 봉신 가문 독립 선언(D-575 — houseIndependence.ts)
        if (message.t === "house_independence")
          return replyCity(message.id, await city.independence(viewer.id, { regime: message.regime }));
        const choice = {
          mode: message.mode,
          ...(message.regime === undefined ? {} : { regime: message.regime }),
        };
        const result =
          message.t === "house_village"
            ? await city.village(viewer.id, {
                ...choice,
                mapKey: message.mapKey,
                x: message.x,
                y: message.y,
                cost: message.cost,
              })
            : await city.ruin(viewer.id, { ...choice, ruinId: message.ruinId });
        if (result.ok)
          options.log.info(
            {
              userId: viewer.id,
              factionId: result.factionId,
              cityId: result.cityId,
              mode: result.mode,
              t: message.t,
            },
            "house city",
          );
        replyCity(message.id, result);
      };
      const processMember = async (message: HouseMemberClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return replyMember(message.id, memberFail("sign_in_required"));
        const members = options.members?.();
        if (!members) return replyMember(message.id, memberFail("busy"));
        if (!memberLimiter.take(viewer.id)) return replyMember(message.id, memberFail("rate_limited"));
        const result = await runMember(
          members,
          options.succession?.(),
          options.home?.(),
          viewer.id,
          message,
          options.entryPolicy?.(),
          options.policy?.(),
        );
        if (result.ok) {
          options.log.info(
            { userId: viewer.id, factionId: result.factionId, action: result.action },
            "house membership",
          );
          await options
            .afterMembership?.()
            .catch((error: unknown) => options.log.error({ err: error }, "house ties reload failed"));
        }
        replyMember(message.id, result);
      };
      const processRecruit = async (message: HouseRecruitClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return replyRecruit(message.id, recruitFail("sign_in_required"));
        const recruit = options.recruit?.();
        if (!recruit) return replyRecruit(message.id, recruitFail("busy"));
        if (!memberLimiter.take(viewer.id)) return replyRecruit(message.id, recruitFail("rate_limited"));
        const result =
          message.t === "house_recruit_auto"
            ? await recruit.setAuto(viewer.id, message.on)
            : await recruit.hire(viewer.id, {
                cityId: message.cityId,
                window: message.window,
                slot: message.slot,
                cost: message.cost,
              });
        if (result.ok)
          options.log.info(
            { userId: viewer.id, t: message.t, auto: result.auto, unitId: result.unitId ?? null },
            "house recruit",
          );
        replyRecruit(message.id, result);
      };
      const processTax = async (message: NationTaxClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return replyTax(message.id, taxFail("sign_in_required"));
        const service = options.nationTax?.();
        if (!service) return replyTax(message.id, taxFail("busy"));
        if (!memberLimiter.take(viewer.id)) return replyTax(message.id, taxFail("rate_limited"));
        const { incomeTaxBp, residentTaxPm, residentEveryDays, residentNationPm, tradeTaxBp } = message;
        // 거래세(줄기 governance-5 — 질문 2460): 칸이 없으면(옛 기기) 바꾸지 않는다
        const result = await service.set(viewer.id, {
          incomeTaxBp,
          residentTaxPm,
          residentEveryDays,
          residentNationPm,
          ...(tradeTaxBp === undefined ? {} : { tradeTaxBp }),
        });
        if (result.ok)
          options.log.info(
            { userId: viewer.id, factionId: result.factionId, incomeTaxBp, residentTaxPm, residentEveryDays },
            "nation tax set",
          );
        replyTax(message.id, result);
      };
      const processMoney = async (message: CityCurrencyClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return replyMoney(message.id, { ok: false, code: "sign_in_required" });
        const service = options.cityMoney?.();
        if (!service) return replyMoney(message.id, { ok: false, code: "busy" });
        if (!memberLimiter.take(viewer.id))
          return replyMoney(message.id, { ok: false, code: "rate_limited" });
        const result = await service.set(viewer.id, message.cityId, message.currency);
        if (result.ok)
          options.log.info(
            { userId: viewer.id, cityId: result.cityId, currency: result.currency },
            "city currency set",
          );
        replyMoney(message.id, result);
      };
      const process = async (message: HouseClientMessage): Promise<void> => {
        if (message.t === "nation_tax") return processTax(message);
        if (message.t === "city_currency") return processMoney(message);
        if (message.t === "house_village" || message.t === "house_ruin" || message.t === "house_independence")
          return processCity(message);
        if (message.t === "house_recruit_auto" || message.t === "house_recruit_hire")
          return processRecruit(message);
        if (message.t !== "house_found") return processMember(message);
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const founder = options.founder();
        if (!founder) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        const result = await founder.found(viewer.id, {
          cost: message.cost,
          ...(message.cityId === undefined ? {} : { cityId: message.cityId }),
        });
        if (result.ok) {
          options.log.info({ userId: viewer.id, factionId: result.factionId }, "house founded");
          // 가문이 생기면 구인 자격·시야 나라가 바뀐다(D-565)
          await options
            .afterMembership?.()
            .catch((error: unknown) => options.log.error({ err: error }, "house ties reload failed"));
        }
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
