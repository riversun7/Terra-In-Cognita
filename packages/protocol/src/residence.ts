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
] as const;
export type ResidenceResultCode = (typeof RESIDENCE_RESULT_CODES)[number];

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

export const residenceClientMessages = [residenceSetMessage] as const;
export const residenceServerMessages = [residenceResultMessage] as const;
