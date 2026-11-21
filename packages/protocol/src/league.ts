// 가문 연맹 메시지(프로토콜 HOUSE_LEAGUE_PROTOCOL_VERSION부터) — 기획 D-587 4·5·6(연맹 = 가문끼리 맺는 조약, 나라와 상관없음, 들지는 그 가문이 고름,
// 대표 = 처음 만든 가문·위임이나 투표 등), 질문 2502·2503(npc-invest-2). docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (npc-invest-2)".
// - house_league: 플레이어 가문장이 연맹을 만들고(found), 들고(join — 스스로 고름), 나가고(leave), 대표를 위임하고(delegate, house = 받을 가문),
//   대표 투표를 한다(vote, house = 찍을 가문). leagueId는 found 말고 모두 필요하다. house = 가문 열쇠(p:<세력 행> · n:<NPC 가문 ID>).
//   [임시] 들기 절차(초대·신청·승인)는 묻는 중이라 가문장이 고르면 바로 든다. 투표는 든 가문 과반이면 대표가 바뀐다.
// 결과는 house_league_result 하나(id = 요청 id). 조회는 tRPC factionIdentity.leagues다. 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 가문 연맹 메시지에 필요한 가장 낮은 프로토콜 버전(묶음 1117d 64 — 줄기 npc-invest-2 판 103) */
export const HOUSE_LEAGUE_PROTOCOL_VERSION = 64;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const houseKey = z.string().regex(/^[pn]:[1-9][0-9]{0,15}$/);

export const HOUSE_LEAGUE_ACTIONS = ["found", "join", "leave", "delegate", "vote"] as const;
export type HouseLeagueAction = (typeof HOUSE_LEAGUE_ACTIONS)[number];

// ---------- 기기 → 서버 ----------

export const houseLeagueMessage = z.object({
  t: z.literal("house_league"),
  id: requestId,
  action: z.enum(HOUSE_LEAGUE_ACTIONS),
  /** 연맹(found 말고 모두) */
  leagueId: rowId.optional(),
  /** 위임받을·찍을 가문(delegate·vote) */
  house: houseKey.optional(),
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
  /** 대표는 위임한 뒤에 나간다(남은 가문이 있을 때) */
  "representative_must_delegate",
  /** 자기에게 위임 */
  "same_house",
  /** 그 가문이 고르지 않았다(남이 넣을 수 없다) */
  "consent_required",
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
