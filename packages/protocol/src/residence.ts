// 사는 곳(거주지) 고르기 메시지(프로토콜 61, 묶음 1117a) — 사용자 답 D-585 1: 플레이어·유닛은 집(주거 건물)을 여럿 가질 수 있지만 사는 곳은 하나만
// 고른다. 고른 집이 선 도시·나라의 주민이 되고, 주민세(집 몫·사업장 몫)와 신용이 그 사는 곳을 따른다. docs/adr/2026-11-15-business-ledger.md "바뀜 (residence …)".
// - 고르는 쪽: 내 유닛 하나(사이보그 본체 = 플레이어 자신, 일꾼·휴먼 = 그 유닛). 고를 수 있는 집 = 그 유닛 주인이 가진 주거 건물(생활 단계 시설) 또는 그 유닛이
//   지금 배정받은 숙소(D-581 2372 — 지금 플레이어 일꾼이 사는 길). 판정·저장은 서버가 한다.
// - buildingId null = 고른 것을 푼다(옛 길로 돌아간다 — 숙소 배정이 있으면 그 숙소가 사는 곳).
// - 조회는 tRPC gather.residence(유닛의 지금 사는 곳·이 건물을 고를 수 있나)다. 답은 residence_result 하나(id = 요청 id).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 이 파일의 메시지에 필요한 가장 낮은 프로토콜 버전(더 낮게 인사한 연결이 보내면 invalid_message) */
export const RESIDENCE_PROTOCOL_VERSION = 61;

/** 정원이 다 참(full)을 받는 가장 낮은 판(질문 2481 가 — 묶음 1117b, 줄기 governance-6 판 111) */
export const RESIDENCE_FULL_PROTOCOL_VERSION = 62;

/**
 * 남의 주거 건물 세 들기·미리 내는 숙박비(사용자 결정 D-591 2 — 질문 2536 다, 줄기 residence-3): 집세 정하기 residence_rent → residence_rent_result와 사는 곳
 * 고르기의 새 코드 insufficient_funds(첫 기간 집세·숙박비를 낼 돈이 유닛 지갑에 모자람)가 생긴 판. 더 낮은 판 연결은 insufficient_funds 대신 not_eligible을 받는다
 */
export const RESIDENCE_RENT_PROTOCOL_VERSION = 145;

/** 그 연결 판이 모르는 코드(full·insufficient_funds)를 not_eligible로 낮춘다 */
export function legacyResidenceCode(code: ResidenceResultCode, protocolVersion: number): ResidenceResultCode {
  if (code === "full" && protocolVersion < RESIDENCE_FULL_PROTOCOL_VERSION) return "not_eligible";
  if (code === "insufficient_funds" && protocolVersion < RESIDENCE_RENT_PROTOCOL_VERSION)
    return "not_eligible";
  return code;
}

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const buildingId = z.number().int().positive().max(0xffff_ffff);

/** 내 유닛의 사는 곳을 고른다(null = 고른 것 풀기) */
export const residenceSetMessage = z.object({
  t: z.literal("residence_set"),
  id: requestId,
  unitId: rowId,
  buildingId: buildingId.nullable(),
});

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const RESIDENCE_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 내 유닛이 아니다(없거나 남의 유닛) */
  "unknown_unit",
  /** 건물이 없거나 다 짓지 않았다 */
  "unknown_building",
  /** 주거 건물(생활 단계 시설)이 아니다 */
  "not_housing",
  /** 도시에 서 있지 않은 건물(사는 도시가 없다) */
  "no_city",
  /** 내 집도 아니고 이 유닛이 배정받은 숙소도 아니다 */
  "not_eligible",
  /** 이미 그 집이 사는 곳이다(풀기면 고른 것이 없다) */
  "unchanged",
  /** 62판부터(RESIDENCE_FULL_PROTOCOL_VERSION): 그 집에 살 수 있는 수가 다 찼다(질문 2481 가 — 정원 = 레벨(층) × 설정 칸). 더 낮은 판은 not_eligible */
  "full",
  /**
   * 145판부터(RESIDENCE_RENT_PROTOCOL_VERSION): 첫 기간 집세(남의 집)·미리 내는 숙박비(고른 숙소)를 낼 돈이 그 유닛 지갑에 모자란다(D-591 2). 더 낮은 판은
   * not_eligible
   */
  "insufficient_funds",
] as const;
export type ResidenceResultCode = (typeof RESIDENCE_RESULT_CODES)[number];

/**
 * 내 주거 건물의 집세를 정한다(145판 — D-591 2 "건물 주인이 집세를 정하고, 세 든 유닛이 기간마다 미리 낸다, 집세는 그 건물 사업장 금고로"). rent = 한 기간
 * (설정 칸 residence_rent_period_ms) 집세(최소 단위 정수 글자), null = 세를 놓지 않음(이미 낸 기간은 끝까지 산다). 바뀐 집세는 다음 기간부터
 */
export const residenceRentMessage = z.object({
  t: z.literal("residence_rent"),
  id: requestId,
  buildingId,
  rent: z
    .string()
    .regex(/^[0-9]{1,18}$/)
    .nullable(),
});

/** 집세 정하기 결과 코드 */
export const RESIDENCE_RENT_RESULT_CODES = [
  "sign_in_required",
  "busy",
  "rate_limited",
  "internal_error",
  /** 건물이 없거나 다 짓지 않았다 */
  "unknown_building",
  /** 주거 건물(생활 단계 시설)이 아니다 */
  "not_housing",
  /** 내 건물이 아니다 */
  "forbidden",
  /** 이미 그 집세다(풀기면 세를 놓지 않고 있다) */
  "unchanged",
] as const;
export type ResidenceRentResultCode = (typeof RESIDENCE_RENT_RESULT_CODES)[number];

const residenceRentResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("residence_rent_result"),
    id: requestId,
    ok: z.literal(true),
    buildingId,
    /** 정한 집세(null = 세를 놓지 않음) */
    rent: z
      .string()
      .regex(/^[0-9]{1,18}$/)
      .nullable(),
  }),
  z.object({
    t: z.literal("residence_rent_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(RESIDENCE_RENT_RESULT_CODES),
  }),
]);

const residenceResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("residence_result"),
    id: requestId,
    ok: z.literal(true),
    unitId: rowId,
    /** 고른 집(null = 풀었다) */
    buildingId: buildingId.nullable(),
    /** 고른 집이 선 도시(null = 풀었다) */
    cityId: rowId.nullable(),
  }),
  z.object({
    t: z.literal("residence_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(RESIDENCE_RESULT_CODES),
  }),
]);

export const residenceClientMessages = [residenceSetMessage, residenceRentMessage] as const;
export const residenceServerMessages = [residenceResultMessage, residenceRentResultMessage] as const;
