// 신전·종교 메시지(프로토콜 12부터) — 기획 D-021·D-311(신관이 신전에서 환생·신격화 집전, 신격화 = 그 도시 수호신)·D-441·D-451·
// D-517(수명이 다한 유저 휴먼은 비활성 — 신전에서 환생·신격화하거나 생명과학 연구소에서 유전자로 변환, 유전자 변환은 fusion.ts gene_convert),
// docs/adr/2026-11-07-temple-religion.md.
// - 바꾸는 명령: 기도(temple_pray: 쿨다운마다 내 사이보그·휴먼 신앙도 +), 헌금(temple_offer: 화폐 → 신앙도 +), 의식(temple_rite: 비활성인
//   내 휴먼을 환생 또는 신격화 — 신격화하면 같은 유닛이 수호신 유닛이 되어 그 도시에 남는다, 기획 답 456 가), 개발 시험 비활성 만들기
//   (dev_inactivate_unit), 개발 편집 수호신 버프 바꾸기(dev_guardian_buff, 판 13). 조회(신전·연구소·내 휴먼 신앙도·비활성·수호신)는 tRPC
//   temple.overview다.
// - 기기는 본 값(의식 화폐)을 함께 보낸다: 그 사이 설정 칸 값이 바뀌었으면 서버가 cost_changed로 거절한다.
// - 서버가 판정한다: 신전(신앙 단계 시설·다 지음·30% 이상), 소유·종류·포로·비활성·선 도시·신앙도·잔고·도시당 수호신. 결과는 temple_result 하나.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 시설·도시 확인은 서버가 하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 신전 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const TEMPLE_PROTOCOL_VERSION = 12;
/** 개발 편집 수호신 버프 바꾸기(dev_guardian_buff, 기획 답 456 가)에 필요한 가장 낮은 프로토콜 버전 */
export const GUARDIAN_BUFF_PROTOCOL_VERSION = 13;
/** 신전 의식(환생·신격화) */
export const TEMPLE_RITE_IDS = ["rebirth", "deify"] as const;
/** 수호신 도시 버프 종류(수호신마다 편집기 칸, 출발값 방어 — 기획 답 456 가). 방어만 효과가 있다(만족도·생산은 확인 대기) */
export const GUARDIAN_BUFF_IDS = ["defense", "satisfaction", "production"] as const;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);
const positiveAmount = z.string().regex(/^[1-9][0-9]{0,30}$/);

// ---------- 기기 → 서버 ----------

/** 신전에서 기도한다(쿨다운마다, 내 사이보그와 내 휴먼 모두의 신앙도·신앙 포인트가 오른다) */
export const templePrayMessage = z.object({
  t: z.literal("temple_pray"),
  id: requestId,
  buildingId: rowId,
});

/** 신전에 헌금한다(화폐 → 신앙도, amount = 10진 문자열 최소 단위) */
export const templeOfferMessage = z.object({
  t: z.literal("temple_offer"),
  id: requestId,
  buildingId: rowId,
  amount: positiveAmount,
});

/** 비활성인 내 휴먼을 그 신전에서 환생시키거나 신격화한다. cost = 기기가 본 의식 화폐(10진 문자열) */
export const templeRiteMessage = z.object({
  t: z.literal("temple_rite"),
  id: requestId,
  buildingId: rowId,
  unit: rowId,
  rite: z.enum(TEMPLE_RITE_IDS),
  cost: amount,
});

/** 개발 시험: 내 휴먼의 수명을 지금 끝내 비활성으로 만든다(dev·admin) */
export const devInactivateUnitMessage = z.object({
  t: z.literal("dev_inactivate_unit"),
  id: requestId,
  unit: rowId,
});

/** 개발 편집: 수호신 하나의 도시 버프 종류를 바꾼다(dev·admin, 누구의 수호신이든, 판 13) */
export const devGuardianBuffMessage = z.object({
  t: z.literal("dev_guardian_buff"),
  id: requestId,
  unit: rowId,
  buff: z.enum(GUARDIAN_BUFF_IDS),
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const TEMPLE_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 권한 없음(개발 시험 명령) */
  "forbidden",
  /** 사이보그가 아직 없다 */
  "no_cyborg",
  /** 신전이 아니거나 없다(신앙 단계 시설이 아님) */
  "not_temple",
  /** 짓는 중이거나 기능 정지(30% 미만) */
  "temple_closed",
  /** 내 유닛이 아니거나 없다 */
  "unknown_unit",
  /** 그 명령을 받을 수 없는 유닛 종류(의식 = 내가 고용한 휴먼만, 버프 바꾸기 = 수호신만) */
  "wrong_kind",
  /** 잡힌 유닛(포로) */
  "captive",
  /** 비활성이 아니다(수명이 남았다) */
  "not_inactive",
  /** 이미 비활성이다(개발 시험) */
  "already_inactive",
  /** 그 유닛이 신전이 선 도시에 있지 않다 */
  "wrong_city",
  /** 기기가 본 값이 지금 설정 칸 값과 다르다 — 다시 받는다 */
  "cost_changed",
  /** 신앙도가 문턱보다 낮다 */
  "faith_low",
  /** 화폐가 모자람 */
  "insufficient_funds",
  /** 그 도시의 수호신이 상한에 닿았다(49 S15) */
  "guardian_cap",
  /** 기도 쿨다운 중 */
  "cooldown",
] as const;
export type TempleResultCode = (typeof TEMPLE_RESULT_CODES)[number];

const templeResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("temple_result"),
    id: requestId,
    ok: z.literal(true),
    /** 의식·비활성 만들기를 받은 유닛 */
    unitId: rowId.optional(),
    /** 기도·헌금 뒤 내 사이보그 신앙도(0~100) */
    faith: z.number().int().nonnegative().max(100).optional(),
    /** 기도·헌금 한 번에 쌓인 양 */
    gained: z.number().int().nonnegative().max(2_147_483_647).optional(),
  }),
  z.object({
    t: z.literal("temple_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(TEMPLE_RESULT_CODES),
  }),
]);

export const templeClientMessages = [
  templePrayMessage,
  templeOfferMessage,
  templeRiteMessage,
  devInactivateUnitMessage,
  devGuardianBuffMessage,
] as const;
export const templeServerMessages = [templeResultMessage] as const;
