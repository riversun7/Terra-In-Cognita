// 2차맵 사이 이동 메시지(프로토콜 16부터) — 1차맵 명령 [확정](기획 60 §4.2 D-6019·D-6021 "대상 → 명령 → 파티 → 확인 → 확정"),
// 기획 D-197(1차맵은 좌표·명령만, 유닛은 실제 2차맵을 지나간다)·질문 571 가, docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동".
// - 바꾸는 명령: 보내기(travel_start: 내 유닛을 목적 2차맵의 칸으로 — 서버가 지나는 2차맵 줄·넘는 자리·2차맵마다 길을 정하고 걷게 한다.
//   이미 가는 중이면 새 명령으로 바꾼다), 멈추기(travel_cancel: 그 자리에 선다). 조회(확인 단계의 길·걸리는 시간, 가는 중인 길)는
//   tRPC world.travelPlan·world.travels다.
// - 결과의 ok는 첫 구간 길을 찾았다는 뜻이다(도착이 아니다). 도착·멈춤은 tRPC world.travels가 알린다.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 소유·길 확인은 서버가 하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 2차맵 사이 이동 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const TRAVEL_PROTOCOL_VERSION = 16;
/** 명령 종류(D-6021의 이동·공격·운송·정찰 가운데 지금 받는 둘 — 둘 다 걸어서 간다, 정찰의 다른 점은 확인 대기) */
export const TRAVEL_KINDS = ["move", "scout"] as const;
export type TravelKind = (typeof TRAVEL_KINDS)[number];

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const unitId = z.number().int().positive().max(0xffff_ffff);
/** 2차맵 키 = 그 1차맵 칸의 셀 키(@terra/planet). 셀 키 검사는 서버가 한다 */
const mapKey = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** 배치 칸(0 ~ 255, secondMap.ts SECOND_MAP_CELLS) */
const cell = z.number().int().nonnegative().max(255);

// ---------- 기기 → 서버 ----------

/** 내 유닛을 목적 2차맵 mapKey의 칸 (x, y) 둘레로 보낸다(그 칸에 설 수 없으면 가장 가까운 설 수 있는 칸) */
export const travelStartMessage = z.object({
  t: z.literal("travel_start"),
  id: requestId,
  unitId,
  mapKey,
  x: cell,
  y: cell,
  kind: z.enum(TRAVEL_KINDS),
});

/** 가는 중인 유닛을 그 자리에 세운다 */
export const travelCancelMessage = z.object({
  t: z.literal("travel_cancel"),
  id: requestId,
  unitId,
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const TRAVEL_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 길 찾기가 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 내 유닛이 아니거나 옮길 수 없는 유닛(수호신) */
  "forbidden",
  /** 띄운 2차맵에 없는 유닛 */
  "unknown_unit",
  /** 목적 2차맵을 서버가 띄우지 않았다 */
  "unknown_map",
  /** 띄운 2차맵만으로 이어지는 줄이 없다 */
  "no_route",
  /** 다음 2차맵으로 넘는 변이 막혔다(물·절벽·건물) */
  "border_blocked",
  /** 목표 둘레에 설 곳이 없다 */
  "goal_blocked",
  "start_blocked",
  "no_path",
  "budget_exceeded",
  "path_too_complex",
  /** 포로·중태라 움직일 수 없다 */
  "unavailable",
  /** 멈추기: 가는 중이 아니다 */
  "not_traveling",
] as const;
export type TravelResultCode = (typeof TRAVEL_RESULT_CODES)[number];

const travelResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("travel_result"),
    id: requestId,
    ok: z.literal(true),
    /** 보내기: 지나는 2차맵 수(출발 포함)와 도착 예상 시각(서버 ms, 곧은 거리 ÷ 속도) */
    maps: z.number().int().positive().max(1024).optional(),
    arriveAt: z.number().int().nonnegative().optional(),
  }),
  z.object({
    t: z.literal("travel_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(TRAVEL_RESULT_CODES),
  }),
]);

export const travelClientMessages = [travelStartMessage, travelCancelMessage] as const;
export const travelServerMessages = [travelResultMessage] as const;
