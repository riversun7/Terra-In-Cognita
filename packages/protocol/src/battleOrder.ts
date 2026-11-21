// 실시간 세계 전투 명령(프로토콜 49부터) — 기획 D-558 1546("전투맵 명령 화면" — 45 §4.1 파티 탭 + 군단 단추), D-571(답 1969 "기존 결정으로
// 답함 — D-558 1546": 다시보기에서만 되던 명령 줄을 실제 세계 전투에 잇는다), D-545·D-549(파티·군단 단위 명령), D-180(다시 넣기 약 1초 막기).
// docs/adr/2026-10-31-combat-core.md "바뀜 (D-571)".
// - battle_list: 내 유닛이 낀 진행 중인 세계 전투 목록(명령 줄을 그릴 자료 — 내 편 파티·내가 지휘관인지·적 유닛). 조회지만 전투가 실시간이라
//   같은 연결로 받는다.
// - battle_order: 파티 명령(party = 파티 ID) 또는 군단 명령(party = null — 지휘관 정원 안 파티만 받는다, 1463). 바뀜(55, 줄기 판 88): legion = true + party면
//   군단장 분대 명령(정원 안 분대 하나, 2순위 — 기획 D-574, 질문 2265 나). 서버가 확인한다: 진행 중인
//   전투, 그 파티가 모두 내 유닛, 군단 명령이면 지금 내 유닛이 지휘관. 명령은 다음 틱 경계(tick)에 들어간다(판정 결정성 — 저장된 시작 자료 +
//   입력으로 다시 계산한다). 판정이 거절한 명령(다시 넣기 막기·없는 목표·칸 밖)은 rejected로 바로 알린다(질문 1974 C).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 대형·전개 방식 목록은 판정(@terra/sim FORMATION_SHAPES·TACTICS)과 같아야 한다(서버 시험이
// 견준다).
import { z } from "zod";

/** 세계 전투 명령에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const BATTLE_ORDER_PROTOCOL_VERSION = 49;
/** 군단장 분대 명령(battle_order legion·파티 squad·owned 칸)이 든 프로토콜 버전. 낮은 기기는 보내지 않는다(서버는 받으면 그대로 처리) */
export const BATTLE_SQUAD_PROTOCOL_VERSION = 55;
/** 대형(판정 FORMATION_SHAPES와 같은 차례 — custom = 손으로 짠 진형, D-172) */
export const BATTLE_FORMATIONS = ["line", "column", "wedge", "block", "custom"] as const;
/** AI 전개 방식 8가지(판정 TACTICS와 같은 차례, D-558 2차) */
export const BATTLE_TACTICS = [
  "assault",
  "defend",
  "center",
  "flank",
  "infiltrate",
  "focus",
  "harass",
  "delay",
] as const;
/** battle_list 한 번에 보내는 전투 수 상한 */
export const BATTLE_LIST_MAX = 8;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** 전투맵 칸(y × 한 변 + x). 한 변은 판정 상한 안 */
const cell = z.number().int().nonnegative().max(1_048_575);

/** 명령 모양(판정 PartyOrderInput과 같다. 목표·따라갈 파티는 전투 유닛·파티 ID) */
export const battleOrderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("advance"), cell: cell.optional() }),
  z.object({ kind: z.literal("hold") }),
  z.object({ kind: z.literal("attack"), target: rowId }),
  z.object({ kind: z.literal("retreat") }),
  z.object({ kind: z.literal("free") }),
  z.object({ kind: z.literal("rally"), cell: cell.optional() }),
  z.object({ kind: z.literal("follow"), party: rowId }),
  z.object({ kind: z.literal("formation"), shape: z.enum(BATTLE_FORMATIONS) }),
  z.object({ kind: z.literal("tactic"), tactic: z.enum(BATTLE_TACTICS) }),
]);
export type BattleOrder = z.infer<typeof battleOrderSchema>;

// ---------- 기기 → 서버 ----------

/** 내 유닛이 낀 진행 중인 세계 전투 목록 */
export const battleListMessage = z.object({
  t: z.literal("battle_list"),
  id: requestId,
});

/** 진행 중인 세계 전투에 파티·군단 명령을 넣는다(party = null이면 군단) */
export const battleOrderMessage = z.object({
  t: z.literal("battle_order"),
  id: requestId,
  battle: rowId,
  party: rowId.nullable(),
  order: battleOrderSchema,
  /**
   * 군단장 분대 명령(프로토콜 55 — 줄기 판 88, 기획 D-574 "군단장 명령 가능하나 2순위" — 질문 2265 나): true면 party(정원 안 남의 분대도 됨)에 군단 명령(2순위)을
   * 넣는다. 지금 내 유닛이 지휘관이어야 하고(not_commander), 그 분대에 소유주 명령이 서 있거나 정원 밖이면 rejected. 없으면 옛 뜻
   */
  legion: z.boolean().optional(),
});

// ---------- 서버 → 기기 ----------

export const BATTLE_ORDER_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 바쁨 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 사이보그가 아직 없다 */
  "no_cyborg",
  /** 없거나 끝난 전투 */
  "unknown_battle",
  /** 내 유닛이 없는 전투 */
  "not_participant",
  /** 내 파티가 아니다(남의 유닛이 낀 파티·없는 파티) */
  "not_your_party",
  /** 군단 명령: 지금 내 유닛이 그 편 지휘관이 아니다 */
  "not_commander",
  /** 판정이 거절했다(다시 넣기 막기·없는 목표·칸 밖·퇴각 중인 파티 등) */
  "rejected",
] as const;
export type BattleOrderResultCode = (typeof BATTLE_ORDER_RESULT_CODES)[number];

const battlePartyView = z.object({
  id: rowId,
  /** 파티 유닛(전투 유닛 ID = 세계 유닛 ID) */
  units: z.array(rowId).max(64),
  /** 모두 내 유닛인가(파티 명령을 넣을 수 있다) */
  mine: z.boolean(),
  /** (55) 내가 지휘관이고 이 분대가 지휘 정원 안이다 — 군단장 분대 명령(2순위)을 넣을 수 있다. 없으면 false */
  squad: z.boolean().optional(),
  /** (55) 소유주 파티 명령이 서 있다(군단장 명령은 거절된다). 없으면 false */
  owned: z.boolean().optional(),
});

const battleView = z.object({
  battle: rowId,
  kind: z.enum(["normal", "siege"]),
  startedAtMs: z.number().nonnegative(),
  /** 지금 입력으로 계산한 끝 시각(명령이 바꿀 수 있다) */
  endsAtMs: z.number().nonnegative(),
  /** 내 편(판정 편 ID) */
  side: rowId,
  /** 전투맵 한 변(칸) */
  mapSize: z.number().int().positive().max(1024),
  /** 지금 내 유닛이 내 편 지휘관인가(군단 명령) */
  commander: z.boolean(),
  /** 내 편 파티(파티 ID 차례) */
  parties: z.array(battlePartyView).max(64),
  /** 다른 편 유닛(목표 공격 — 전투 유닛 ID) */
  enemies: z.array(rowId).max(512),
});
export type BattleView = z.infer<typeof battleView>;

const battleListResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("battle_list_result"),
    id: requestId,
    ok: z.literal(true),
    battles: z.array(battleView).max(BATTLE_LIST_MAX),
  }),
  z.object({
    t: z.literal("battle_list_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(BATTLE_ORDER_RESULT_CODES),
  }),
]);

const battleOrderResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("battle_order_result"),
    id: requestId,
    ok: z.literal(true),
    battle: rowId,
    /** 명령이 들어간 판정 틱 */
    tick: z.number().int().nonnegative(),
    /** 명령을 넣고 다시 계산한 끝 시각 */
    endsAtMs: z.number().nonnegative(),
  }),
  z.object({
    t: z.literal("battle_order_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(BATTLE_ORDER_RESULT_CODES),
  }),
]);

export const battleOrderClientMessages = [battleListMessage, battleOrderMessage] as const;
export const battleOrderServerMessages = [battleListResultMessage, battleOrderResultMessage] as const;
