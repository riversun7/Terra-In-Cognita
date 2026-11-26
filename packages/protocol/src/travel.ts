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
/**
 * 운영자 텔레포트(travel_start teleport 칸, 기획 D-560 1239 "운영자 모드에 1차맵에서 텔레포트 즉시 이동")가 생긴 판. 더 낮은 연결이 칸을 보내면
 * 서버가 invalid_message로 거절한다
 */
export const TELEPORT_PROTOCOL_VERSION = 36;
/**
 * 유닛 AI 작전 저장(unit_tactics, 기획 D-5039·D-5040 — 질문 2021·2023 답: 플레이어 유닛의 조우 판단 입력)이 생긴 판. 더 낮은 연결이 보내면
 * 서버가 invalid_message로 거절한다. 답은 travel_result(새 코드 없음)
 */
export const UNIT_TACTICS_PROTOCOL_VERSION = 50;
/**
 * 유닛 생활 규칙 저장(unit_life — 사용자 결정 2026-11-26 "유닛 성향, 주인유저가 규칙 설정 가능", docs/adr/2026-11-26-unit-life-rules.md)이 생긴 판.
 * 더 낮은 연결이 보내면 서버가 invalid_message로 거절한다. 답은 travel_result(새 코드 없음)
 */
export const UNIT_LIFE_PROTOCOL_VERSION = 75;
/** 피로 상한의 구조 값(49 N21, @terra/shared/unitLife LIFE_FATIGUE_LIMIT와 같다 — 실효 상한은 서버가 설정 칸으로 다시 본다) */
export const UNIT_LIFE_FATIGUE_LIMIT = 120;
/**
 * 유닛 공격(unit_attack, 묶음 1117d 64 — 줄기 fixes-1117c 판 123 — 사용자 결정 D-588 2496 가 "같은 나라 유저의 건물이나 유닛을 공격하면(약탈 행위) 신용이 내린다", 기획 대조 2543):
 * 내 유닛이 가까이 있는 남의 유닛을 일부러 친다. 조우(D-570 1904)는 다른 나라끼리만 저절로 만나므로 같은 나라 유저끼리 싸움·약탈은 이 명령으로만 난다 [임시 2581].
 * 더 낮은 연결이 보내면 서버가 invalid_message로 거절한다. 답은 travel_result(새 코드 out_of_reach·own_target·safe_zone은 이 메시지의 답에만 간다)
 */
export const UNIT_ATTACK_PROTOCOL_VERSION = 64;
/**
 * 유닛 공격의 수비 편 회피(묶음 1117e 65 — 줄기 gov-fix-3 판 114 — 질문 2581 (3) 사용자 답, D-570 1904 "현재 전투세팅상태나 전력차, 성향에 따라 판정"·D-573 2022 나 "더 빠르면 전투 없이
 * 빠져나간다"): 답 travel_result의 새 코드 escaped는 이 판 연결에만 간다(더 낮은 판은 out_of_reach)
 */
export const UNIT_ATTACK_ESCAPE_PROTOCOL_VERSION = 65;
/** 유닛 공격 한 번에 보낼 수 있는 내 유닛 수 */
export const UNIT_ATTACK_MAX_UNITS = 30;
/** AI 작전 프리셋·목표 우선순위(@terra/shared/aiTactics와 같은 목록 — 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다) */
export const UNIT_TACTICS_PRESETS = ["aggressive", "balanced", "defensive", "hold"] as const;
export const UNIT_TACTICS_TARGETS = ["nearest", "weakest", "threat"] as const;
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
  /**
   * 운영자 텔레포트(프로토콜 36, 기획 D-560): 걷지 않고 목적 칸 둘레의 설 칸으로 바로 옮긴다(가던 길은 버린다). 모든 유닛 명령 권한(dev·admin)이
   * 아니면 forbidden. 목적 2차맵을 띄우지 않았으면 띄운 뒤 옮긴다(상한이면 unknown_map)
   */
  teleport: z.literal(true).optional(),
});

/** 가는 중인 유닛을 그 자리에 세운다 */
export const travelCancelMessage = z.object({
  t: z.literal("travel_cancel"),
  id: requestId,
  unitId,
});

const slider = z.number().int().min(0).max(10);

/**
 * 내 유닛의 AI 작전을 저장한다(프로토콜 50): 프리셋(마지막으로 고른 것) + 슬라이더 ①~⑥(0~10) + ⑦ 퇴각 기준(파티 HP %) + 목표 우선순위.
 * 소유·유닛 종류는 서버가 본다. 저장한 값은 다음 조우 판단·조우 전투(퇴각 기준)부터 쓴다
 */
export const unitTacticsMessage = z.object({
  t: z.literal("unit_tactics"),
  id: requestId,
  unitId,
  preset: z.enum(UNIT_TACTICS_PRESETS),
  engage: slider,
  pursue: slider,
  cover: slider,
  escort: slider,
  saveSkill: slider,
  spread: slider,
  retreatPct: z.number().int().min(0).max(100),
  target: z.enum(UNIT_TACTICS_TARGETS),
});

/**
 * 내 유닛의 생활 규칙을 저장한다(프로토콜 75): 일하다 피로가 restAt에 닿으면 쉬러 가고, 쉬다 resumeAt까지 풀리면 다시 일한다
 * (0 ≤ resumeAt < restAt ≤ 피로 상한). 소유·유닛 종류·실효 상한은 서버가 본다. 저장한 값은 다음 정산부터 쓴다
 */
export const unitLifeMessage = z
  .object({
    t: z.literal("unit_life"),
    id: requestId,
    unitId,
    restAt: z.number().int().min(1).max(UNIT_LIFE_FATIGUE_LIMIT),
    resumeAt: z
      .number()
      .int()
      .min(0)
      .max(UNIT_LIFE_FATIGUE_LIMIT - 1),
  })
  .refine((message) => message.resumeAt < message.restAt, { path: ["resumeAt"] });

/**
 * 내 유닛(unitIds)으로 남의 유닛(targetUnitId)을 친다(프로토콜 64): 같은 띄운 2차맵에서 조우 거리(설정 칸 encounter_radius_cells) 안이어야 한다.
 * 조우 전투와 같은 길(그 자리 실제 지형의 전투맵 — 전쟁 상대면 전쟁 전투, 아니면 약탈 전투). 같은 나라 유저를 치면 신용이 내린다(서버가 본다)
 */
export const unitAttackMessage = z.object({
  t: z.literal("unit_attack"),
  id: requestId,
  unitIds: z.array(unitId).min(1).max(UNIT_ATTACK_MAX_UNITS),
  targetUnitId: unitId,
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
  /** 유닛 공격(프로토콜 64): 대상이 같은 2차맵 조우 거리 안에 없다 */
  "out_of_reach",
  /** 유닛 공격: 내 유닛은 칠 수 없다 */
  "own_target",
  /** 유닛 공격: 시가지(안전지대 D-146) 안이라 싸우지 않는다 */
  "safe_zone",
  /** 유닛 공격(프로토콜 65): 수비 편이 회피를 골랐고 더 빨라 전투 없이 빠져나갔다(D-573 2022 나) */
  "escaped",
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

export const travelClientMessages = [
  travelStartMessage,
  travelCancelMessage,
  unitTacticsMessage,
  unitAttackMessage,
  unitLifeMessage,
] as const;
export const travelServerMessages = [travelResultMessage] as const;
