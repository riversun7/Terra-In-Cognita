// 국적 바꾸기(귀화) 메시지(프로토콜 18부터) — 기획 정리 D-523 포인터(질문 745 나: 다른 나라 정부에서 귀화 신청, 값·쉬는 날은 설정 칸, 옛 나라
// 지원금 반환), 정착 지원금은 다시 주지 않는다(D-163·D-7032), docs/adr/2026-11-08-citizenship.md.
// - 바꾸는 명령: 받는 나라 도시의 행정 건물(그 도시 정부)에서 내 국적을 그 나라로 바꾼다(nationality_change). 조건·값 조회는 tRPC
//   world.naturalization이다.
// - 기기는 본 받는 나라와 낼 값 합(귀화 값 + 지원금 반환)을 함께 보낸다: 그 사이 도시 주인·설정 칸·지원금이 바뀌어 다르면 서버가
//   terms_changed로 거절한다(보이지 않은 값으로 내지 않게).
// - 서버가 판정한다: 행정 건물·받는 나라(고정 NPC 국가, 시작 도시가 이 서버에 있음)·쉬는 날·내 사이보그가 그 도시에 섰나·잔고. 결과는
//   nationality_result 하나로 온다(id = 요청 id).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 국적 바꾸기 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const CITIZENSHIP_PROTOCOL_VERSION = 18;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);
const timestampMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

// ---------- 기기 → 서버 ----------

/** 국적을 그 행정 건물 도시의 주인 나라로 바꾼다 */
export const nationalityChangeMessage = z.object({
  t: z.literal("nationality_change"),
  id: requestId,
  /** 받는 나라 도시의 행정 건물(2차맵 건물 ID) */
  buildingId: rowId,
  /** 기기가 본 받는 나라(세력 행 ID) */
  factionId: rowId,
  /** 기기가 본 낼 값 합 = 귀화 값 + 옛 나라 지원금 반환(10진 문자열 최소 단위) */
  cost: amount,
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const NATIONALITY_RESULT_CODES = [
  "sign_in_required",
  /** 세계·NPC 사회 런타임이 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 사이보그가 아직 없다 */
  "no_cyborg",
  /** 행정 건물이 아니거나 없다(도시에 묶이지 않은 정부 포함) */
  "not_government",
  /** 이미 그 나라 국민이다 */
  "same_nation",
  /** 받을 수 없는 나라(고정 NPC 국가가 아니거나 이 서버에 시작 도시가 없음) */
  "not_joinable",
  /** 내 사이보그가 그 도시에 서 있지 않다(정부에 직접 가야 한다) */
  "wrong_city",
  /** 내 사이보그가 잡혀 있다(포로) */
  "captive",
  /** 쉬는 날: 지난 바꿈 뒤 쉬는 기간이 아직 끝나지 않았다 */
  "resting",
  /** 기기가 본 나라·값이 지금과 다르다 — 조건을 다시 받는다 */
  "terms_changed",
  /** 화폐가 모자람(귀화 값 + 지원금 반환) */
  "insufficient_funds",
] as const;
export type NationalityResultCode = (typeof NATIONALITY_RESULT_CODES)[number];

const nationalityResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("nationality_result"),
    id: requestId,
    ok: z.literal(true),
    /** 새 나라(세력 행 ID)와 새 내 도시(귀화한 도시) */
    factionId: rowId,
    cityId: rowId,
    /** 낸 귀화 값·옛 나라에 돌려준 지원금(10진 문자열 최소 단위) */
    paid: amount,
    returned: amount,
    /** 다음에 바꿀 수 있는 시각(쉬는 날 끝) */
    nextAtMs: timestampMs,
  }),
  z.object({
    t: z.literal("nationality_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(NATIONALITY_RESULT_CODES),
  }),
]);

export const citizenshipClientMessages = [nationalityChangeMessage] as const;
export const citizenshipServerMessages = [nationalityResultMessage] as const;
