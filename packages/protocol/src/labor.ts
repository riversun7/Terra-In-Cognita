// 노동 계약 명령 (프로토콜 6에 더함) — docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48
// - 바꾸는 명령: 맺기(labor_create: 임금형·임대형), 해지(labor_terminate), 임금형 보증금 채우기(labor_top_up),
//   시설 임대료 정하기(labor_set_rent). 조회는 tRPC labor.overview다.
// - 서버가 판정한다: 소유(시설 주인·유닛 소유 주체), 임금(식 × 고용주 조정 범위), 보증금, 잔고. 기기는 결과만 보인다.
// - 결과는 labor_result 하나로 온다(id = 요청 id). 오류는 문장이 아니라 코드다(기기가 번역).
// - 금액은 10진 정수 글자다(화폐 최소 단위, BigInt). 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/**
 * 노동 계약 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다.
 * 가지에서는 판 6에 더했으나, 합칠 때 영토 비콘·구인 카드와 함께 판 7로 올렸다(메시지를 더하면 판을 올린다, ADR 7. 최소 판 6).
 * 노동 계약 화면이 없는 6판 기기는 이 메시지를 보내지 않는다(ADR labor-contracts "프로토콜")
 */
export const LABOR_PROTOCOL_VERSION = 7;

const u32 = z.number().int().nonnegative().max(0xffff_ffff);
const requestId = u32;
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** 화폐 최소 단위 금액(1 이상, 18자리까지) */
const amount = z.string().regex(/^[1-9][0-9]{0,17}$/);

// ---------- 기기 → 서버 ----------

/**
 * 계약 맺기. 임금형(wage): 내 시설에 내 유닛을 고용한다(보증금은 내 지갑에서, adjustPm = 고용주 조정 ‰, N28 범위).
 * 임대형(lease): 남의 시설을 내 유닛으로 빌린다(그 시설에 걸린 시간당 임대료). termHours = 기간(선택, 없으면 기간 없음)
 */
export const laborCreateMessage = z.object({
  t: z.literal("labor_create"),
  id: requestId,
  kind: z.enum(["wage", "lease"]),
  buildingId: rowId,
  unitId: rowId,
  adjustPm: z.number().int().min(0).max(100_000).optional(),
  termHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .optional(),
});

/** 해지(시설 주인·유닛 소유 주체 누구나 언제든). 임금형은 남은 보증금이 고용주에게 돌아간다 */
export const laborTerminateMessage = z.object({
  t: z.literal("labor_terminate"),
  id: requestId,
  contractId: rowId,
});

/** 임금형 보증금 채우기(고용주). 일시 중지였으면 바로 다시 일한다 */
export const laborTopUpMessage = z.object({
  t: z.literal("labor_top_up"),
  id: requestId,
  contractId: rowId,
  amount,
});

/** 내 시설의 시간당 임대료(D-479 오너가 정함). "0"이면 새로 빌려주지 않는다. 열린 임대 계약은 다음 시간부터 새 값 */
export const laborSetRentMessage = z.object({
  t: z.literal("labor_set_rent"),
  id: requestId,
  buildingId: rowId,
  rent: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
});

// ---------- 서버 → 기기 ----------

export const LABOR_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 */
  "busy",
  "rate_limited",
  "unknown_building",
  "unknown_unit",
  "unknown_contract",
  /** 그 시설·유닛·계약의 주인이 아님 */
  "forbidden",
  /** 그 유닛에 이미 열린 계약이 있다 */
  "unit_busy",
  /** 잔고가 보증금·첫 임대료·채울 금액보다 적다 */
  "insufficient_funds",
  /** 조건이 규칙 밖(조정 범위·금액·내 시설을 빌림 등) */
  "invalid_terms",
  /** 그 시설은 빌려주지 않는다(임대료 없음) */
  "not_for_lease",
  /** 이미 끝났거나 그 명령을 받지 않는 상태 */
  "not_open",
  "internal_error",
] as const;
export type LaborResultCode = (typeof LABOR_RESULT_CODES)[number];

const laborResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("labor_result"),
    id: requestId,
    ok: z.literal(true),
    /** labor_create면 새 계약 ID */
    contractId: rowId.optional(),
  }),
  z.object({
    t: z.literal("labor_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(LABOR_RESULT_CODES),
  }),
]);

export const laborClientMessages = [
  laborCreateMessage,
  laborTerminateMessage,
  laborTopUpMessage,
  laborSetRentMessage,
] as const;
export const laborServerMessages = [laborResultMessage] as const;
