// 병원 치료 메시지(프로토콜 17부터) — 기획 D-521(병원은 건물 등급·의사 스탯·스킬에 따라 회복이 매우 빠르고 비용이 든다, 병원이 꼭 있어야
// 낫는 부상은 없다)·D-311(치료 = 의사·병원), docs/adr/2026-11-08-injury.md.
// - 바꾸는 명령: 치료(hospital_treat: 다친 내 유닛을 그 유닛이 선 도시의 병원에서 치료 — 남은 치유 시간이 병원 배율만큼 준다, 화폐를 낸다),
//   개발 시험 부상 주기(dev_injure_unit: 내 유닛에 단계 하나를 지금 준다, dev·admin). 조회(내 다친 유닛·병원 견적)는 tRPC hospital.overview다.
// - 기기는 본 값(치료 화폐)을 함께 보낸다: 그 사이 설정 칸·의사·레벨·남은 시간이 바뀌어 값이 달라졌으면 서버가 cost_changed로 거절한다.
// - 서버가 판정한다: 병원(의료 단계 시설·다 지음·30% 이상), 소유·포로·부상·선 도시·배율(지금보다 빨라야 함)·잔고. 결과는 hospital_result 하나.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 시설·도시 확인은 서버가 하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 병원 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const HOSPITAL_PROTOCOL_VERSION = 17;
/** 부상 단계 수(1 흰 · 2 노랑 · 3 빨강, 0 = 초록) */
export const INJURY_STAGE_MAX = 3;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);
const timestampMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

// ---------- 기기 → 서버 ----------

/** 다친 내 유닛을 그 병원에서 치료한다. cost = 기기가 본 치료 화폐(10진 문자열 최소 단위) */
export const hospitalTreatMessage = z.object({
  t: z.literal("hospital_treat"),
  id: requestId,
  buildingId: rowId,
  unit: rowId,
  cost: amount,
});

/** 개발 시험: 내 유닛에 부상 단계 하나를 지금 준다(dev·admin, 1 흰 · 2 노랑 · 3 빨강) */
export const devInjureUnitMessage = z.object({
  t: z.literal("dev_injure_unit"),
  id: requestId,
  unit: rowId,
  stage: z.number().int().min(1).max(INJURY_STAGE_MAX),
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const HOSPITAL_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 권한 없음(개발 시험 명령) */
  "forbidden",
  /** 사이보그가 아직 없다 */
  "no_cyborg",
  /** 내 유닛이 아니거나 없다 */
  "unknown_unit",
  /** 잡힌 유닛(포로) */
  "captive",
  /** 다치지 않았다(초록) */
  "not_injured",
  /** 병원이 아니거나 없다(의료 단계 시설이 아님) */
  "not_hospital",
  /** 짓는 중이거나 기능 정지(30% 미만) */
  "hospital_closed",
  /** 그 유닛이 병원이 선 도시에 있지 않다 */
  "wrong_city",
  /** 이미 그만큼(또는 더) 빠른 치료를 받고 있다 */
  "not_faster",
  /** 기기가 본 값이 지금 값과 다르다 — 다시 받는다 */
  "cost_changed",
  /** 화폐가 모자람 */
  "insufficient_funds",
] as const;
export type HospitalResultCode = (typeof HOSPITAL_RESULT_CODES)[number];

const hospitalResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("hospital_result"),
    id: requestId,
    ok: z.literal(true),
    /** 치료·부상을 받은 유닛 */
    unitId: rowId.optional(),
    /** 그 유닛의 지금 단계와 다음 단계 시각·초록 시각(치료 뒤) */
    stage: z.number().int().min(0).max(INJURY_STAGE_MAX).optional(),
    untilMs: timestampMs.optional(),
    greenAtMs: timestampMs.optional(),
    /** 낸 화폐(10진 문자열 최소 단위) */
    paid: amount.optional(),
  }),
  z.object({
    t: z.literal("hospital_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(HOSPITAL_RESULT_CODES),
  }),
]);

export const hospitalClientMessages = [hospitalTreatMessage, devInjureUnitMessage] as const;
export const hospitalServerMessages = [hospitalResultMessage] as const;
