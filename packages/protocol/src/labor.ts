// 노동 계약 명령 (프로토콜 7, 구인 게시는 8) — docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48
// - 바꾸는 명령: 맺기(labor_create: 임금형·임대형), 해지(labor_terminate), 임금형 보증금 채우기(labor_top_up),
//   시설 임대료 정하기(labor_set_rent). 구인 게시(판 8, 기획 338~342): 내기(labor_post_job), 거두기(labor_withdraw_job),
//   받기(labor_accept_job = 남의 시설 일자리를 내 유닛으로 → 임금형 계약). 조회는 tRPC labor.overview·labor.jobs다.
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

/**
 * 구인 게시 메시지(labor_post_job·labor_withdraw_job·labor_accept_job)에 필요한 가장 낮은 프로토콜 버전.
 * 메시지를 더해 판을 올렸다(ADR 7). 7판 기기는 이 메시지를 보내지 않는다(그 기기는 새 결과 코드도 받지 않는다)
 */
export const LABOR_JOBS_PROTOCOL_VERSION = 8;

/**
 * 직무 배치 메시지(labor_assign·labor_unassign, docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산")에 필요한 가장 낮은 프로토콜 버전.
 * 메시지를 더해 판을 올렸다(ADR 7). 13판 기기는 이 메시지를 보내지 않는다(새 결과 코드는 이 메시지의 답에만 간다)
 */
export const LABOR_ASSIGN_PROTOCOL_VERSION = 14;

/**
 * 결과 코드 wrong_map(유닛이 그 시설과 같은 2차맵에 없다, docs/adr/2026-11-07-play-flow.md "WP8", 기획 정리 D-518 522 ①)을 받는 가장 낮은
 * 프로토콜 버전. 더 낮은 판 연결은 같은 경우에 invalid_terms를 받는다(그 판 기기는 이 코드를 모른다)
 */
export const LABOR_MAP_PROTOCOL_VERSION = 15;

/**
 * 멈춘 계약 기다림(labor_wait, 기획 대조 2237 — D-6006 처리할 일은 서버가 계정마다 보낸다)에 필요한 가장 낮은 프로토콜 버전. 메시지를 더해 판을
 * 올렸다(ADR 7). 더 낮은 판 기기는 이 메시지를 보내지 않는다(그 판은 [기다림]을 그 기기에만 접었다)
 */
export const LABOR_WAIT_PROTOCOL_VERSION = 72;

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

/**
 * 구인 내기(판 8): 내 시설에 일자리를 낸다. 직무는 시설이 정한다(서버 시설은 아직 시험 채집 하나).
 * adjustPm = 고용주 조정 ‰(N28 범위, 임금 = 받는 유닛의 효율 × 단가 × 조정), slots = 뽑을 자리 수, termHours = 계약 기간(선택).
 * 그 시설에 열린 게시가 있으면 바꾼다(앞 게시는 거둠, 이미 맺은 계약은 그대로). 성공하면 labor_result.jobId
 */
export const laborPostJobMessage = z.object({
  t: z.literal("labor_post_job"),
  id: requestId,
  buildingId: rowId,
  adjustPm: z.number().int().min(0).max(100_000),
  /** 입력 한도(게임 값 아님): 한 게시의 자리 1~100 */
  slots: z.number().int().min(1).max(100),
  termHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .optional(),
});

/** 구인 거두기(판 8, 낸 사람만). 더 받지 않을 뿐 이미 맺은 계약은 그대로다(옛 is_accepting_workers) */
export const laborWithdrawJobMessage = z.object({
  t: z.literal("labor_withdraw_job"),
  id: requestId,
  jobId: rowId,
});

/**
 * 구인 받기(판 8): 남의 시설 일자리를 내 유닛으로 받는다 → 임금형 계약(고용주 = 시설 주인, 보증금은 그 지갑에서,
 * 임금은 내 지갑으로). 성공하면 labor_result.contractId
 */
export const laborAcceptJobMessage = z.object({
  t: z.literal("labor_accept_job"),
  id: requestId,
  jobId: rowId,
  unitId: rowId,
});

/**
 * 직무 배치(판 14): 내 유닛을 내 채집 시설(다 지은 것)에 둔다. 돈이 오가지 않는다(노동 계약이 아니다). 산출은 그 시설이 선 도시의 내 도시
 * 창고로 간다. 자리 = 시설 레벨 × 레벨당 자리(직무 배치 + 열린 노동 계약)
 */
export const laborAssignMessage = z.object({
  t: z.literal("labor_assign"),
  id: requestId,
  buildingId: rowId,
  unitId: rowId,
});

/** 직무 배치 풀기(판 14, 배치한 사람만). 그때까지 일한 몫은 정산해 낸다 */
export const laborUnassignMessage = z.object({
  t: z.literal("labor_unassign"),
  id: requestId,
  unitId: rowId,
});

/**
 * 멈춘 계약 기다림(판 72, 기획 대조 2237 — D-573 2045 "기다릴지 해지하고 다른곳으로 갈지 정함"): 일꾼 유닛 주인이 일시 중지된 임금형 계약의
 * 처리할 일(labor_paused)을 접는다. 계약은 그대로(이미 일시 중지 — 사업장에 수익이 나면 다시 일한다). 서버가 그 멈춤 회차(dueAt = 밀린 지급
 * 시각 = 처리할 일의 처음 생긴 시각)에 "기다림" 표시를 남겨 같은 계정의 모든 기기에서 접힌다. 같은 계약이 다시 돌다 또 멈추면(dueAt가 바뀜)
 * 다시 보인다. 그 회차가 아니면(이미 다시 돎·해지) not_open
 */
export const laborWaitMessage = z.object({
  t: z.literal("labor_wait"),
  id: requestId,
  contractId: rowId,
  dueAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
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
  /** 이미 끝났거나 그 명령을 받지 않는 상태(유예 중인 계약은 손으로 끝내지 않는다) */
  "not_open",
  "internal_error",
  /** (판 8) 그 구인은 없거나 이미 닫혔다(자리 다 참·거둠·시설 사라짐) */
  "job_not_open",
  /** (판 8) 시설 주인 잔고가 보증금보다 적어 받을 수 없다 */
  "employer_insufficient_funds",
  /** (판 14) 그 시설은 일터가 아니다(채집 시설이 아니거나 아직 짓는 중) */
  "not_workplace",
  /** (판 14) 그 시설의 일꾼 자리가 다 찼다(레벨 × 레벨당 자리) */
  "facility_full",
  /** (판 14) 그 유닛은 직무 배치되어 있지 않다 */
  "not_assigned",
  /** (판 15) 그 유닛은 그 시설과 같은 2차맵에 있지 않다(직무 배치·노동 계약·구인 받기, 14판 이하 연결은 invalid_terms) */
  "wrong_map",
] as const;
export type LaborResultCode = (typeof LABOR_RESULT_CODES)[number];

const laborResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("labor_result"),
    id: requestId,
    ok: z.literal(true),
    /** labor_create·labor_accept_job이면 새 계약 ID */
    contractId: rowId.optional(),
    /** labor_post_job이면 새 게시 ID */
    jobId: rowId.optional(),
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
  laborPostJobMessage,
  laborWithdrawJobMessage,
  laborAcceptJobMessage,
  laborAssignMessage,
  laborUnassignMessage,
  laborWaitMessage,
] as const;
export const laborServerMessages = [laborResultMessage] as const;
