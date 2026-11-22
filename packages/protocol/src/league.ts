// 가문 연맹 메시지(프로토콜 HOUSE_LEAGUE_PROTOCOL_VERSION부터) — 기획 D-587 4·5·6(연맹 = 가문끼리 맺는 조약, 나라와 상관없음, 들지는 그 가문이 고름,
// 대표 = 처음 만든 가문·위임이나 투표 등), 질문 2502·2503(npc-invest-2). docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (npc-invest-2)".
// - house_league: 플레이어 가문장이 연맹을 만들고(found), 들고(join — 스스로 고름), 나가고(leave), 대표를 위임하고(delegate, house = 받을 가문),
//   대표 투표를 한다(vote, house = 찍을 가문). leagueId는 found 말고 모두 필요하다. house = 가문 열쇠(p:<세력 행> · n:<NPC 가문 ID>).
//   [임시] 들기 절차(초대·신청·승인)는 묻는 중이라 가문장이 고르면 바로 든다. 투표는 든 가문 과반이면 대표가 바뀐다.
// 결과는 house_league_result 하나(id = 요청 id). 조회는 tRPC factionIdentity.leagues다. 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
// 바뀜 (league-2, 사용자 결정 D-590 — 질문 2501 다·2502 다·2504 나, 프로토콜 HOUSE_LEAGUE_REQUEST_PROTOCOL_VERSION부터):
// - 들기 절차(2502 다): 대표가 초대(invite, house = 부를 가문) → 그 가문장이 수락(join), 또는 가문장이 신청(join) → 대표가 승인(approve, house = 신청한 가문).
//   join은 받은 초대가 있으면 바로 들고, 없으면 신청만 한다(결과 pending = true). invite도 그 가문이 이미 신청했으면 바로 든다. 거절·거두기 = decline
//   (대표: house = 신청·초대한 가문 / 가문장: house 없이 — 받은 초대·보낸 신청을 거둔다).
// - 조항 카드(2501 다): 대표가 연맹에 우호 기능 카드를 붙이고(clause_on) 뗀다(clause_off). clause = HOUSE_LEAGUE_CLAUSES 하나. 카드 목록은 [임시].
// - 대표가 나가면 가장 오래 든 가문이 대표가 된다(2504 나) — 옛 결과 코드 representative_must_delegate는 더 보내지 않는다(낮은 판 기기 해석용으로 남긴다).
// 63판 이하 기기는 이 메시지를 보내지 않고, 65판 기기는 새 행동(invite·approve·decline·clause_on·clause_off)을 보내지 않는다.
// 바뀜 (league-3, 사용자 결정 D-593 "연맹은 친목이라고 그런거 아니라고" — D-590 1(조항 카드)을 대신한다): 연맹은 친목 모임일 뿐이라 조항 카드를 없앴다. 메시지 모양은
// 그대로 둔다(옛 판 기기가 clause_on·clause_off·clause를 보내도 풀린다) — 서버는 늘 invalid_clause로 답하고, 새 기기는 보내지 않는다. HOUSE_LEAGUE_CLAUSES는 옛 판 해석용으로만
// 남는다(모양·답 코드가 그대로라 프로토콜 판은 올리지 않았다).
import { z } from "zod";

/** 가문 연맹 메시지에 필요한 가장 낮은 프로토콜 버전(묶음 1117d 64 — 줄기 npc-invest-2 판 103) */
export const HOUSE_LEAGUE_PROTOCOL_VERSION = 64;

/** 연맹 들기 절차·조항 카드 행동이 생긴 판(묶음 1117g 판 66 — 줄기 league-2 판 115) */
export const HOUSE_LEAGUE_REQUEST_PROTOCOL_VERSION = 66;

/**
 * (옛 판 해석용 — league-3 D-593에서 없앤 기능. 서버는 받아도 invalid_clause) 연맹 조항 카드(2501 다 — 나라 조약과 따로, 연맹에 붙인다):
 * - shared_vision: 든 플레이어 가문의 가문원 유닛·건물 시야를 서로 나눈다(2차맵 시야, 같은 나라 공유처럼).
 * - fee_discount: 든 가문이 다른 든 가문의 시설(사업장 요금·물자 거래소 이용료)을 쓸 때 요금을 깎는다(몫 = 설정 칸 house_league_fee_discount_pm).
 */
export const HOUSE_LEAGUE_CLAUSES = ["shared_vision", "fee_discount"] as const;
export type HouseLeagueClause = (typeof HOUSE_LEAGUE_CLAUSES)[number];

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const houseKey = z.string().regex(/^[pn]:[1-9][0-9]{0,15}$/);

export const HOUSE_LEAGUE_ACTIONS = [
  "found",
  "join",
  "leave",
  "delegate",
  "vote",
  // league-2(HOUSE_LEAGUE_REQUEST_PROTOCOL_VERSION부터)
  "invite",
  "approve",
  "decline",
  "clause_on",
  "clause_off",
] as const;
export type HouseLeagueAction = (typeof HOUSE_LEAGUE_ACTIONS)[number];

// ---------- 기기 → 서버 ----------

export const houseLeagueMessage = z.object({
  t: z.literal("house_league"),
  id: requestId,
  action: z.enum(HOUSE_LEAGUE_ACTIONS),
  /** 연맹(found 말고 모두) */
  leagueId: rowId.optional(),
  /** 위임받을·찍을 가문(delegate·vote), 부를·받을·거절할 가문(invite·approve·decline — 대표) */
  house: houseKey.optional(),
  /** 붙이거나 뗄 조항 카드(clause_on·clause_off) */
  clause: z.enum(HOUSE_LEAGUE_CLAUSES).optional(),
});

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const HOUSE_LEAGUE_RESULT_CODES = [
  "sign_in_required",
  /** 세계·DB가 준비 중 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 플레이어 가문장이 아니다 */
  "not_house_head",
  /** 그런 연맹이 없다(끝났을 수 있다) */
  "unknown_league",
  /** 가문 열쇠가 없거나 꼴이 틀렸다 */
  "invalid_house",
  /** 이미 든 연맹이다 */
  "already_member",
  /** 든 가문이 아니다(나가기·위임받기·투표) */
  "not_member",
  /** 대표가 아니다(위임) */
  "not_representative",
  /** (더 보내지 않는다 — D-590 2504 나: 대표가 나가면 가장 오래 든 가문이 대표) 대표는 위임한 뒤에 나간다 */
  "representative_must_delegate",
  /** 자기에게 위임 */
  "same_house",
  /** 그 가문이 고르지 않았다(남이 넣을 수 없다) */
  "consent_required",
  /** 받을·거절할 초대·신청이 없다(league-2) */
  "no_request",
  /** 조항 카드 행동(league-2) — league-3(D-593)부터 카드가 없어 늘 이 답 */
  "invalid_clause",
] as const;
export type HouseLeagueResultCode = (typeof HOUSE_LEAGUE_RESULT_CODES)[number];

// ---------- 서버 → 기기 ----------

const houseLeagueResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("house_league_result"),
    id: requestId,
    ok: z.literal(true),
    /** 만든·바꾼 연맹 */
    leagueId: rowId.optional(),
    /** 초대·신청만 남겼다(아직 들지 않음 — league-2 join·invite) */
    pending: z.literal(true).optional(),
  }),
  z.object({
    t: z.literal("house_league_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(HOUSE_LEAGUE_RESULT_CODES),
  }),
]);

export const houseLeagueClientMessages = [houseLeagueMessage] as const;
export const houseLeagueServerMessages = [houseLeagueResultMessage] as const;
