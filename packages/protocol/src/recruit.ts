// 구인 카드 고용 메시지 (프로토콜 6부터) — 기획 D-469(출생 없음, 인구는 정부기관(행정 건물) 구인 카드로만), 49 N45,
// docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)".
// - 바꾸는 명령: 그 도시 행정 건물의 지금 창 카드 한 장을 고용한다(recruit_hire). 카드 목록·잔고 조회는 tRPC recruit.board다.
// - 기기는 본 창·자리·값을 함께 보낸다: 그 사이 창이 바뀌었거나(갱신) 설정 칸 값이 바뀌어 카드가 달라졌으면 서버가 cards_changed로
//   거절한다(보이지 않은 값으로 사지 않게).
// - 서버가 판정한다: 카드 묶음(시드), 산 칸, 잔고(도시 화폐), 세울 자리. 결과는 recruit_result 하나로 온다(id = 요청 id).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 구인 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const RECRUIT_PROTOCOL_VERSION = 6;

const u32 = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

// ---------- 기기 → 서버 ----------

/** 구인 카드 한 장 고용 */
export const recruitHireMessage = z.object({
  t: z.literal("recruit_hire"),
  id: u32,
  /** 행정 건물이 있는 도시 */
  cityId: rowId,
  /** 기기가 본 갱신 창(⌊시각 ÷ 갱신 주기⌋) */
  window: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  /** 그 창 안의 카드 자리 */
  slot: z.number().int().nonnegative().max(63),
  /** 기기가 본 값(도시 화폐 최소 단위, 10진 문자열) */
  cost: z.string().regex(/^(0|[1-9][0-9]{0,30})$/),
});

// ---------- 서버 → 기기 ----------

/** 고용 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const RECRUIT_RESULT_CODES = [
  "sign_in_required",
  /** 세계·NPC 사회 런타임이 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  /** 사이보그가 아직 없다(고용한 휴먼의 소유자 = 사이보그, D-469) */
  "no_cyborg",
  /** 구인할 수 있는 도시가 아니다(행정 건물이 없거나 그 2차맵이 이 서버에 없음) */
  "unknown_city",
  /** 창·자리·값이 지금 카드와 다르다(갱신됐거나 설정 칸 값이 바뀜) — 목록을 다시 받는다 */
  "cards_changed",
  /** 이 창에 이미 산 카드 */
  "taken",
  /** 도시 화폐가 모자람 */
  "insufficient_funds",
  /** 도시 둘레에 세울 빈 칸이 없음 */
  "no_room",
  "internal_error",
] as const;
export type RecruitResultCode = (typeof RECRUIT_RESULT_CODES)[number];

const recruitResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("recruit_result"),
    id: u32,
    ok: z.literal(true),
    /** 새 휴먼의 세계 유닛 ID */
    unitId: rowId,
  }),
  z.object({
    t: z.literal("recruit_result"),
    id: u32,
    ok: z.literal(false),
    code: z.enum(RECRUIT_RESULT_CODES),
  }),
]);

export const recruitClientMessages = [recruitHireMessage] as const;
export const recruitServerMessages = [recruitResultMessage] as const;
