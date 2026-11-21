// 가문 소켓이 받는 WebSocket 메시지의 판 문턱과 준비 전(busy) 답 — session.ts에서 덜어 냈다(묶음 1117d, 1,000줄 상한. 동작은 그대로).
// 가문 창설은 프로토콜 22, 가문 가입은 23(금고 기부·꺼내기·가문세율·도시 짓기 정책은 54 — D-574·D-576), 가문장 넘기기·해산·가문 도시는 24
// (소속 도시 바꾸기 39, 가문 이동 정책 51, 독립 선언 53, 후계자 지정 HOUSE_HEIR — D-565·2018·D-575), 가문 도시 구인은 25(질문 1041 다),
// 나라 세금 정하기는 57(질문 2322 나·2373 가 — 가문 게이트웨이가 받아 government/nationTaxPolicy.ts로), 나라 의결(docs/adr/2026-11-21-governance.md)은
// GOVERNANCE_PROTOCOL_VERSION(쿠데타는 COUP_PROTOCOL_VERSION), 도시(정부) 지분 주문(docs/adr/2026-11-21-share-market.md)은 CITY_SHARE_PROTOCOL_VERSION,
// 지도자끼리 조약(2026-11-21-diplomacy-treaties.md)은 DIPLOMACY_PROTOCOL_VERSION, 가문 연맹(npc-invest-2)은 HOUSE_LEAGUE_PROTOCOL_VERSION의 메시지다.
// 더 낮게 인사한 연결은 모르는 메시지로 본다(session.ts가 invalid_message로 끊는다).
import {
  CITY_SHARE_PROTOCOL_VERSION,
  type ClientMessage,
  COUP_PROTOCOL_VERSION,
  DIPLOMACY_PROTOCOL_VERSION,
  GOVERNANCE_PROTOCOL_VERSION,
  HOUSE_CITY_PROTOCOL_VERSION,
  HOUSE_ENTRY_POLICY_PROTOCOL_VERSION,
  HOUSE_HEIR_PROTOCOL_VERSION,
  HOUSE_HOME_PROTOCOL_VERSION,
  HOUSE_INDEPENDENCE_PROTOCOL_VERSION,
  HOUSE_LEAGUE_PROTOCOL_VERSION,
  HOUSE_MEMBER_PROTOCOL_VERSION,
  HOUSE_POLICY_PROTOCOL_VERSION,
  HOUSE_PROTOCOL_VERSION,
  HOUSE_RECRUIT_PROTOCOL_VERSION,
  NATION_TAX_PROTOCOL_VERSION,
  type ServerMessage,
} from "@terra/protocol";

/** 가문 소켓(HouseLeagueGateway)이 받는 메시지 종류 */
export const HOUSE_SOCKET_TYPES = [
  "house_found",
  "nation_tax",
  "house_invite",
  "house_apply",
  "house_answer",
  "house_withdraw",
  "house_leave",
  "house_kick",
  "house_donate",
  "house_vault_take",
  "house_tax",
  "house_build_policy",
  "house_handover",
  "house_heir",
  "house_dissolve",
  "house_home",
  "house_entry_policy",
  "house_village",
  "house_ruin",
  "house_independence",
  "house_recruit_auto",
  "house_recruit_hire",
  "gov_propose",
  "gov_vote",
  "gov_candidate",
  "gov_coup",
  "gov_coup_join",
  "city_share_order",
  "city_share_cancel",
  "house_league",
  "dip_propose",
  "dip_counter",
  "dip_respond",
  "dip_war_request",
  "dip_war_respond",
] as const satisfies readonly ClientMessage["t"][];

export type HouseSocketMessage = Extract<ClientMessage, { t: (typeof HOUSE_SOCKET_TYPES)[number] }>;

/** 판 문턱·준비 전 답에 쓰는 몫(종류와 요청 id) */
type HouseSocketHead = Pick<HouseSocketMessage, "t" | "id">;

const MEMBER_POLICY = Math.max(HOUSE_MEMBER_PROTOCOL_VERSION, HOUSE_POLICY_PROTOCOL_VERSION);

/** 메시지마다 받는 가장 낮은 판 — 가문 도시 묶음은 HOUSE_CITY 판과 그 메시지의 판 가운데 높은 쪽 */
const HOUSE_MESSAGE_NEED: Readonly<Record<HouseSocketMessage["t"], number>> = {
  house_found: HOUSE_PROTOCOL_VERSION,
  nation_tax: NATION_TAX_PROTOCOL_VERSION,
  house_invite: HOUSE_MEMBER_PROTOCOL_VERSION,
  house_apply: HOUSE_MEMBER_PROTOCOL_VERSION,
  house_answer: HOUSE_MEMBER_PROTOCOL_VERSION,
  house_withdraw: HOUSE_MEMBER_PROTOCOL_VERSION,
  house_leave: HOUSE_MEMBER_PROTOCOL_VERSION,
  house_kick: HOUSE_MEMBER_PROTOCOL_VERSION,
  house_donate: MEMBER_POLICY,
  house_vault_take: MEMBER_POLICY,
  house_tax: MEMBER_POLICY,
  house_build_policy: MEMBER_POLICY,
  house_handover: HOUSE_CITY_PROTOCOL_VERSION,
  house_heir: Math.max(HOUSE_CITY_PROTOCOL_VERSION, HOUSE_HEIR_PROTOCOL_VERSION),
  house_dissolve: HOUSE_CITY_PROTOCOL_VERSION,
  house_home: Math.max(HOUSE_CITY_PROTOCOL_VERSION, HOUSE_HOME_PROTOCOL_VERSION),
  house_entry_policy: Math.max(HOUSE_CITY_PROTOCOL_VERSION, HOUSE_ENTRY_POLICY_PROTOCOL_VERSION),
  house_village: HOUSE_CITY_PROTOCOL_VERSION,
  house_ruin: HOUSE_CITY_PROTOCOL_VERSION,
  house_independence: Math.max(HOUSE_CITY_PROTOCOL_VERSION, HOUSE_INDEPENDENCE_PROTOCOL_VERSION),
  house_recruit_auto: HOUSE_RECRUIT_PROTOCOL_VERSION,
  house_recruit_hire: HOUSE_RECRUIT_PROTOCOL_VERSION,
  gov_propose: GOVERNANCE_PROTOCOL_VERSION,
  gov_vote: GOVERNANCE_PROTOCOL_VERSION,
  gov_candidate: GOVERNANCE_PROTOCOL_VERSION,
  gov_coup: COUP_PROTOCOL_VERSION,
  gov_coup_join: COUP_PROTOCOL_VERSION,
  city_share_order: CITY_SHARE_PROTOCOL_VERSION,
  city_share_cancel: CITY_SHARE_PROTOCOL_VERSION,
  house_league: HOUSE_LEAGUE_PROTOCOL_VERSION,
  dip_propose: DIPLOMACY_PROTOCOL_VERSION,
  dip_counter: DIPLOMACY_PROTOCOL_VERSION,
  dip_respond: DIPLOMACY_PROTOCOL_VERSION,
  dip_war_request: DIPLOMACY_PROTOCOL_VERSION,
  dip_war_respond: DIPLOMACY_PROTOCOL_VERSION,
};

/** 이 메시지를 받는 가장 낮은 프로토콜 판(인사한 판이 이보다 낮으면 모르는 메시지) */
export function houseMessageNeed(message: Pick<HouseSocketMessage, "t">): number {
  return HOUSE_MESSAGE_NEED[message.t];
}

/** 가문 게이트웨이가 아직 없을 때(세계·DB 준비 중) 보내는 busy 답 */
export function houseBusyReply(message: HouseSocketHead): ServerMessage {
  const id = message.id;
  switch (message.t) {
    case "house_found":
      return { t: "house_result", id, ok: false, code: "busy" };
    case "nation_tax":
      return { t: "nation_tax_result", id, ok: false, code: "busy" };
    case "house_village":
    case "house_ruin":
    case "house_independence":
      return { t: "house_city_result", id, ok: false, code: "busy" };
    case "house_recruit_auto":
    case "house_recruit_hire":
      return { t: "house_recruit_result", id, ok: false, code: "busy" };
    case "gov_propose":
    case "gov_vote":
    case "gov_candidate":
    case "gov_coup":
    case "gov_coup_join":
      return { t: "gov_result", id, ok: false, code: "busy" };
    case "city_share_order":
    case "city_share_cancel":
      return { t: "city_share_result", id, ok: false, code: "busy" };
    case "house_league":
      return { t: "house_league_result", id, ok: false, code: "busy" };
    case "dip_propose":
    case "dip_counter":
    case "dip_respond":
    case "dip_war_request":
    case "dip_war_respond":
      return { t: "dip_result", id, ok: false, code: "busy" };
    default:
      // 가문 가입·가문장 넘기기·해산·가문 자리·이동 정책·후계자 묶음
      return { t: "house_member_result", id, ok: false, code: "busy" };
  }
}
