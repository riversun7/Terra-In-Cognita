// S1 시험용 봇 — 서버가 움직이는 유닛 1,000개(S1_TEST_BOTS). 게임 규칙이 아니라 부하·화면 시험용이다(ADR 33 "측정").
// - 크기·속도는 (2차맵 시드, 유닛 ID)로 정한다. 판단마다의 난수는 (2차맵 시드, 유닛 ID, 판단 횟수)로 새로 뽑는다(botRng).
//   판단 횟수(ai_step)를 유닛과 함께 저장하므로 서버를 다시 켜도 같은 유닛은 이어서 같은 차례의 값을 쓴다(S3 ADR 1절).
//   (워커 결과가 오는 시각은 매번 달라서 전체 움직임이 똑같이 되풀이되지는 않는다.)
// - 크기 등급 1·2·3 = 90·8·2%, 속도는 걷기 85%·차 15%(packages/sim 출발값).
//   NPC 도시 휴먼(구인·처음 인구·들인 옛 봇)은 이 규칙을 쓰지 않고 크기 1·걷기만이다(humanPlan, 기획 D-534 — 질문 1106 가).
// - 목적지는 지금 자리 둘레 TRIP_RADIUS_CELLS칸 안에서 그 등급이 설 수 있는 칸. 도착하면 2~6초 쉬고 다시 간다.
// - 집이 있는 봇(NPC 휴먼)은 집(도시 시청 칸) 둘레 HOME_RADIUS_CELLS 안에서 고른다(homeArea, docs/adr/2026-11-07-play-flow.md "WP-NPC").
// - 일터가 있는 NPC 휴먼(도시 경제가 일꾼으로 둔 시설, 기획 답 740 나 — docs/adr/2026-11-07-play-flow.md "WP-NPC2")은 일하는 때에
//   그 시설 둘레에서 짧게 옮기며 오래 쉬고, 나머지 때는 집 둘레를 걷는다(tripArea·arrivalIdleMs).
// - 일하는 때 = 그 2차맵 지역 시각의 낮(기획 답 770 나 — 아침에 일터로, 밤에 집으로, "WP-NPC4"). 지역 시각은 2차맵 빛과 같은 셈(공용 달력
//   localSolarHours, 2차맵 경도)이라 하늘이 밝아질 때 일터로 가고 어두워질 때 돌아온다. 출근·퇴근 때는 유닛마다 조금 흩는다(한꺼번에 길을 묻지 않게).
import { createRng, type Rng } from "@terra/shared";
import { localSolarHours, planetCalendarForDisplay } from "@terra/shared/planetCalendar";
import type { UnitTraits } from "@terra/shared/unitTraits";
import {
  DEFAULT_NPC_AI_COEFFICIENTS,
  type UnitAiState,
  type UnitAiTimingRules,
  type UnitBrainRole,
  type UnitJobKind,
  decideUnitState,
} from "@terra/sim/npcAi";
import {
  CAR_SPEED,
  PLACEMENT_SIZE,
  type PlacementGrid,
  type Point,
  type SizeClass,
  WALK_SPEED,
  anchorAt,
  anchorCenter,
  isPassable,
  mix32,
} from "@terra/sim";

/** 목적지를 고르는 범위(칸). 걷기 평균 약 1~2분, 차 약 10초 걸리는 거리 */
export const TRIP_RADIUS_CELLS = 48;
/** 너무 가까운 목적지는 고르지 않는다(칸) */
const MIN_TRIP_CELLS = 4;
const IDLE_MIN_MS = 2_000;
const IDLE_SPREAD_MS = 4_000;
/** 길을 못 찾았을 때 다시 해 보기까지 */
const RETRY_MIN_MS = 1_000;
const RETRY_SPREAD_MS = 2_000;
/** 시작할 때 첫 출발을 이 시간 안에 흩어 놓는다(경로 요청이 한꺼번에 몰리지 않게) */
const START_SPREAD_MS = 5_000;
const PICK_ATTEMPTS = 16;
const SPAWN_ATTEMPTS = 4_096;

export interface BotPlan {
  /** 처음 자리 고르기에 쓰는 난수(판단 횟수 0) */
  rng: Rng;
  size: SizeClass;
  speed: number;
}

/** 봇 하나의 판단 step번째 난수 — (2차맵 시드, 유닛 ID, 판단 횟수)로 정해진다 */
export function botRng(mapSeed: number, unitId: number, step: number): Rng {
  return createRng(mix32(mapSeed ^ Math.imul(unitId, 0x9e37_79b1) ^ Math.imul(step + 1, 0x85eb_ca6b)));
}

/** 봇 하나의 크기·속도 (유닛 ID와 2차맵 시드로 정해진다)와 처음 자리 난수 */
export function botPlan(mapSeed: number, unitId: number): BotPlan {
  const rng = createRng(mix32(mapSeed ^ Math.imul(unitId, 0x9e37_79b1)));
  const sizeRoll = rng.nextInt(100);
  const size: SizeClass = sizeRoll < 90 ? 1 : sizeRoll < 98 ? 2 : 3;
  const speed = rng.nextInt(100) < 15 ? CAR_SPEED : WALK_SPEED;
  return { rng, size, speed };
}

/** NPC 도시 휴먼의 크기 등급(D-534 — 1106 가) */
export const HUMAN_SIZE: SizeClass = 1;

/**
 * NPC 도시 휴먼의 몸(기획 D-534 — 질문 1106 가): 크기 등급 1·걷기만. 시험 봇 규칙(botPlan의 크기 2·3, 차 빠르기)은 시험 2차맵의 시험 봇만
 * 쓴다. 처음 자리 난수는 botPlan과 같은 줄이다(크기·속도 굴림을 건너뛰지 않고 같은 차례로 뽑아 버린다 — 세울 자리가 예전과 같은 차례)
 */
export function humanPlan(mapSeed: number, unitId: number): BotPlan {
  const plan = botPlan(mapSeed, unitId);
  return { rng: plan.rng, size: HUMAN_SIZE, speed: WALK_SPEED };
}

/** 그 등급이 설 수 있는 아무 기준 칸의 중심. 없으면 undefined */
export function pickSpawn(grid: PlacementGrid, rng: Rng, size: SizeClass): Point | undefined {
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const x = rng.nextInt(PLACEMENT_SIZE);
    const y = rng.nextInt(PLACEMENT_SIZE);
    if (isPassable(grid, x, y, size)) return anchorCenter(x, y, size);
  }
  return undefined;
}

function clampCell(value: number): number {
  return value < 0 ? 0 : value >= PLACEMENT_SIZE ? PLACEMENT_SIZE - 1 : value;
}

/** 목적지를 고를 네모(가운데 칸·반경 칸) */
export interface TripArea {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * 집이 있는 봇(NPC 휴먼 — 집 = 그 도시 시청 칸, docs/adr/2026-11-07-play-flow.md "WP-NPC")이 그 둘레에서 고르는 반경(칸) [임시].
 * 사이보그 시야(24칸)·도시 기본 시설 자리(가운데에서 48칸 안)와 견줄 만큼 — 도시에 가면 휴먼이 보인다(사용자 지적 2026-11-08)
 */
export const HOME_RADIUS_CELLS = 32;
/** 집에서 멀리 있는 봇이 집 쪽으로 한 번에 다가가는 곳 둘레의 반경(칸) */
const HOME_STEP_RADIUS_CELLS = 8;

/**
 * 일하는 때(기획 답 770 나 — 그 2차맵 지역 시각의 낮, docs/adr/2026-11-07-play-flow.md "WP-NPC4"). 지역 하루를 1000으로 나눈 천분율(250 = 06:00)
 * 이고, 시작 ≤ 끝이면 [시작, 끝), 시작 > 끝이면 밤을 넘는 몫([시작, 1000) + [0, 끝)), 둘이 같으면 일하는 때가 없다(늘 집). 수치는 설정 칸
 * npc_work_start_pm·npc_work_end_pm [임시](세계 씨앗 계수표 workStartPm·workEndPm — 개발자 패널에서 바꾸면 다음 맞추기부터)
 */
export interface WorkShift {
  /** 그 2차맵 경도(°, 2차맵 빛 secondMapPlace와 같은 셈 — 칸 가운데 방향). 셀 키가 아닌 시험 2차맵은 0 */
  readonly lonDeg: number;
  readonly startPm: number;
  readonly endPm: number;
  /**
   * 피로 바퀴(질문 1095 가, 설정 칸 worker_rest_cycle_mode 1): 있으면 낮·밤 대신 이 바퀴로 일한다 — 바퀴(periodMs) 가운데 앞 workMs가 일터, 나머지가
   * 쉼터(오감 포함). 휴먼마다 바퀴 시작을 유닛 ID 해시로 흩는다(한꺼번에 쉬러 가지 않게). 바퀴는 도시 경제 생산 셈(npc/cityRest.ts)과 같다
   */
  readonly cycle?: RestCycle | undefined;
}

/** 일·쉼 한 바퀴(ms) */
export interface RestCycle {
  readonly workMs: number;
  readonly periodMs: number;
}

/** [임시] 설정 칸이 없을 때(시험) 일하는 때: 06:00~18:00(춘분·추분에 해가 뜨고 지는 때) */
export const DEFAULT_WORK_SHIFT: WorkShift = { lonDeg: 0, startPm: 250, endPm: 750 };

/** 집이 있는 봇(NPC 휴먼)의 자리: 집(도시 시청 칸)과 일터(없으면 집 둘레만 걷는다). 저장하지 않는다(NPC 사회 런타임이 다시 넣는다) */
export interface BotHome {
  readonly x: number;
  readonly y: number;
  /** 일터 네모(도시 경제가 일꾼으로 둔 시설 건물 둘레, npc/humanPlaces.ts). 없으면 일하지 않는 휴먼(집 둘레) */
  readonly work?: TripArea | undefined;
  /** 일하는 때(그 2차맵 경도·설정 칸). 없으면 DEFAULT_WORK_SHIFT */
  readonly shift?: WorkShift | undefined;
  /** 집 둘레 반경(칸). 없으면 HOME_RADIUS_CELLS(도시 시청 칸 둘레). 숙소가 집인 일꾼은 숙소 둘레(docs/adr/2026-11-11-city-building-layout.md) */
  readonly homeRadius?: number | undefined;
  /**
   * 운반 일정(기획 D-564 1626·D-570 1886 "보이는 운반꾼이 원칙(NPC 포함)", npc/humanPlaces.ts): [fromMs, untilMs) 동안 일터 대신 이 네모(그 도시
   * 창고 둘레)로 걸어가 산출을 내려놓는 모습. 보는 사람이 있는 2차맵에만 붙는다. 판정은 도시 경제의 시간 셈 그대로(모습만)
   */
  readonly haul?: HaulTrip | undefined;
  /** 유닛 자율행동 5상태 FSM 직군(ADR 2026-11-21-npc-needs-drives). 없으면 기존 단순 출퇴근 규칙 */
  readonly role?: UnitBrainRole | undefined;
  /** 개별 유닛 7축 성향(0~1000). aiEnabled와 함께 있을 때 5상태 FSM을 활성화한다 */
  readonly traits?: UnitTraits | undefined;
  /** 도시 시장·상업 구역 네모(욕구 해결 need 상태 목적지) */
  readonly market?: TripArea | undefined;
  /** 유닛 개별 자율행동 AI 스위치(npc_ai_unit_enabled = 1) */
  readonly aiEnabled?: boolean | undefined;
  /** 그날 받은 생필품 몫(‰, 거울 세계 SimUnit.fedPm — 하루 끝마다 바뀐다). 없으면 가득으로 본다 */
  readonly fedPm?: number | undefined;
  /** 만족도(밀리점, 점 단위로 내림 — 거울 세계 휴먼). 없으면 세지 않은 것으로 본다 */
  readonly satisfactionMilli?: number | undefined;
  /** 소속 도시가 전쟁 중인지(evade·patrol 점수에 반영) */
  readonly cityAtWar?: boolean | undefined;
  /** 유닛 FSM 주기·체류·순찰 계수(없으면 DEFAULT_NPC_AI_COEFFICIENTS) */
  readonly aiRules?: UnitAiTimingRules | undefined;
}

/** 운반 일정 하나(보이는 모습만) */
export interface HaulTrip {
  readonly area: TripArea;
  readonly fromMs: number;
  readonly untilMs: number;
}

/** 운반 일정이 지금인가 */
function hauling(home: BotHome, nowMs: number): boolean {
  return home.haul !== undefined && nowMs >= home.haul.fromMs && nowMs < home.haul.untilMs;
}

/**
 * [임시] 출근·퇴근 흩기(지역 하루 천분율): 휴먼마다 0~이만큼 늦게 일터로 가고 같은 만큼 늦게 돌아온다(유닛 ID 해시). 42‰ ≈ 지역 1시간 =
 * 실제 약 2.5분 — 도시 하나의 휴먼이 한꺼번에 길을 묻지 않게. 판정에 쓰지 않는다(보이는 움직임만 — 산출은 도시 경제가 센다)
 */
export const WORK_JITTER_PM = 42;
/** [임시] 일터 안에서 옮긴 뒤 쉬는 시간(일하는 모습 — 경로 요청을 줄인다) */
const WORK_IDLE_MIN_MS = 45_000;
const WORK_IDLE_SPREAD_MS = 90_000;
/** [임시] 집 둘레에 닿은 NPC 휴먼이 쉬는 시간(시험 봇 2~6초보다 길게 — 사람처럼 서 있다가 걷는다) */
const HOME_IDLE_MIN_MS = 8_000;
const HOME_IDLE_SPREAD_MS = 16_000;
/** [임시] 운반꾼이 창고에서 서 있는 가장 짧은 시간·일정을 기다리는 가장 짧은 잠(경로 요청을 줄인다) */
const HAUL_IDLE_MIN_MS = 2_000;

/** 그 경도의 지금 지역 시각(지역 하루 천분율, 0 이상 1000 미만). 2차맵 빛과 같은 셈(공용 달력 localSolarHours) */
export function localDayPm(nowMs: number, lonDeg: number): number {
  const msIntoDay = planetCalendarForDisplay(nowMs)?.msIntoDay ?? 0;
  return (localSolarHours(msIntoDay, lonDeg) * 1000) / 24;
}

/** 천분율 t가 일하는 때 [시작, 끝)에 드나(시작 > 끝이면 밤을 넘는 몫, 같으면 없음) */
function inShift(t: number, startPm: number, endPm: number): boolean {
  if (startPm === endPm) return false;
  return startPm < endPm ? t >= startPm && t < endPm : t >= startPm || t < endPm;
}

/** 그 유닛이 지금 일하는 때인가(그 2차맵 지역 시각의 낮, 유닛마다 조금 흩은 출근·퇴근) */
export function atWork(shift: WorkShift, unitId: number, nowMs: number): boolean {
  const cycle = shift.cycle;
  if (cycle && cycle.periodMs > 0) {
    // 피로 바퀴: 바퀴 시작을 유닛마다 흩는다
    const offset = (mix32(Math.imul(unitId, 0x2545_f491)) >>> 0) % cycle.periodMs;
    return (((nowMs + offset) % cycle.periodMs) + cycle.periodMs) % cycle.periodMs < cycle.workMs;
  }
  const jitter = (mix32(Math.imul(unitId, 0x2545_f491)) >>> 0) % (WORK_JITTER_PM + 1);
  const t = (localDayPm(nowMs, shift.lonDeg) - jitter + 1000) % 1000;
  return inShift(t, shift.startPm, shift.endPm);
}

/** [임시] 일하는 때가 끝날 무렵의 어림 피로(‰). 쉬는 동안 0으로 내려간다 */
const SHIFT_FATIGUE_PEAK_PM = 600;

/** 일하는 몫 동안 0 → 꼭대기로 오르고 나머지 동안 0으로 내린다 */
function fatigueRamp(pos: number, work: number, total: number): number {
  if (work <= 0 || total <= work) return 0;
  const pm =
    pos < work ? Math.floor((pos * 1000) / work) : 1000 - Math.floor(((pos - work) * 1000) / (total - work));
  return Math.floor((Math.max(0, Math.min(1000, pm)) * SHIFT_FATIGUE_PEAK_PM) / 1000);
}

/**
 * 어림 피로(‰, 보이는 움직임용 — 판정의 피로는 도시 경제의 쉼터 셈 그대로): 일하는 때 동안 0 → 꼭대기로 오르고 쉬는 때 동안 0으로 내린다.
 * 피로 바퀴(shift.cycle)가 있으면 그 바퀴, 없으면 지역 시각의 낮·밤
 */
export function shiftFatiguePm(shift: WorkShift, unitId: number, nowMs: number): number {
  const cycle = shift.cycle;
  if (cycle && cycle.periodMs > 0) {
    const offset = (mix32(Math.imul(unitId, 0x2545_f491)) >>> 0) % cycle.periodMs;
    const pos = (((nowMs + offset) % cycle.periodMs) + cycle.periodMs) % cycle.periodMs;
    return fatigueRamp(pos, cycle.workMs, cycle.periodMs);
  }
  const jitter = (mix32(Math.imul(unitId, 0x2545_f491)) >>> 0) % (WORK_JITTER_PM + 1);
  const t = (localDayPm(nowMs, shift.lonDeg) - jitter + 1000) % 1000;
  const work = (shift.endPm - shift.startPm + 1000) % 1000;
  return fatigueRamp((t - shift.startPm + 1000) % 1000, work, 1000);
}

/** 5상태 FSM 기반 현재 상태 결정(aiEnabled && traits가 있을 때만 사용, 없으면 undefined) */
export function resolveBotAiState(
  home: BotHome,
  unitId: number,
  nowMs: number,
):
  | { readonly state: UnitAiState; readonly job: UnitJobKind | null; readonly nextReevalMs: number }
  | undefined {
  if (!home.aiEnabled || !home.traits) return undefined;
  const shift = home.shift ?? DEFAULT_WORK_SHIFT;
  const isWorkHours = atWork(shift, unitId, nowMs);
  const hasHaulJob = hauling(home, nowMs);
  const role: UnitBrainRole = home.role ?? (home.work ? "worker" : "citizen");
  const ai = home.aiRules ?? DEFAULT_NPC_AI_COEFFICIENTS;
  // 유닛 ID + 현재 재평가 구간으로 결정적 굴림 생성(매 호출마다 진동하지 않게 dwell 간격으로 양자화)
  const bucket = Math.floor(nowMs / Math.max(1_000, ai.unitDwellMinMs));
  const roll = mix32(Math.imul(unitId, 0x9e37_79b1) ^ Math.imul(bucket, 0x85eb_ca6b)) >>> 0;
  // 피로: 일하는 때 동안 오르고 쉬는 때 동안 내리는 어림값(예전: 일하는 때 300·쉬는 때 650 고정)
  const fatiguePm = shiftFatiguePm(shift, unitId, nowMs);
  const dec = decideUnitState(
    {
      unitId,
      role,
      traits: home.traits,
      currentState: hasHaulJob || (isWorkHours && home.work) ? "work" : "rest",
      stateEnteredAtMs: 0,
      nowMs: Math.max(ai.unitDwellMaxMs + 1, nowMs),
      isWorkHours,
      hasWorkplace: home.work !== undefined,
      hasHaulJob,
      hasMarket: home.market !== undefined,
      fatiguePm,
      fedPm: home.fedPm ?? null,
      satisfactionMilli: home.satisfactionMilli ?? null,
      threatNear: false,
      cityAtWar: home.cityAtWar === true,
      ai,
    },
    roll,
  );
  return { state: dec.state, job: dec.job, nextReevalMs: dec.nextReevalMs };
}

/** 지금 가려는 네모: FSM이 켜져 있으면 5상태 목적지(일은 일감에 따라), 아니면 기존 운반 → 일터 → 집 규칙 */
function targetOf(home: BotHome, unitId: number, nowMs: number): TripArea {
  const baseHome: TripArea = { x: home.x, y: home.y, radius: home.homeRadius ?? HOME_RADIUS_CELLS };
  const fsm = resolveBotAiState(home, unitId, nowMs);
  if (fsm) {
    switch (fsm.state) {
      case "work":
        if (fsm.job === "haul") return home.haul?.area ?? baseHome;
        if (fsm.job === "post") return home.work ?? baseHome;
        // 둘레 채집(일터 없는 시민): 집 둘레보다 조금 넓게
        return {
          x: home.x,
          y: home.y,
          radius: Math.min(
            TRIP_RADIUS_CELLS,
            Math.max(baseHome.radius, Math.floor((baseHome.radius * 3) / 2)),
          ),
        };
      case "need":
        return home.market ?? baseHome;
      case "evade":
        return { x: home.x, y: home.y, radius: Math.max(2, Math.min(6, baseHome.radius)) };
      case "patrol":
      case "rest":
        return baseHome;
    }
  }
  if (home.haul && hauling(home, nowMs)) return home.haul.area;
  return home.work && atWork(home.shift ?? DEFAULT_WORK_SHIFT, unitId, nowMs) ? home.work : baseHome;
}

/**
 * 네모로 다가가는 목적지 네모: 그 네모에 들었거나 한 번 길(TRIP_RADIUS_CELLS) 안에 닿으면 그 네모, 멀면 그쪽으로 TRIP_RADIUS_CELLS만큼 다가간
 * 칸 둘레(작은 반경). 처음 들인 휴먼은 2차맵 아무 곳에 있다 → 몇 번 걸어 도시로 모인다(경로 예산 안의 짧은 길만 묻는다)
 */
function approach(from: Point, size: SizeClass, target: TripArea): TripArea {
  const here = anchorAt(from, size);
  const dx = target.x - here.x;
  const dy = target.y - here.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance <= Math.max(target.radius, TRIP_RADIUS_CELLS - target.radius)) return target;
  return {
    x: clampCell(here.x + Math.round((dx * TRIP_RADIUS_CELLS) / distance)),
    y: clampCell(here.y + Math.round((dy * TRIP_RADIUS_CELLS) / distance)),
    radius: HOME_STEP_RADIUS_CELLS,
  };
}

/** 집이 있는 봇의 목적지 네모(일터 없이 집만): 집에서 HOME_RADIUS_CELLS 안이면 집 둘레, 멀면 집 쪽으로 다가간 칸 둘레 */
export function homeArea(
  from: Point,
  size: SizeClass,
  home: { readonly x: number; readonly y: number },
): TripArea {
  return approach(from, size, { x: home.x, y: home.y, radius: HOME_RADIUS_CELLS });
}

/** 집이 있는 봇의 목적지 네모(지역 시각에 따라 일터 또는 집) */
export function tripArea(
  from: Point,
  size: SizeClass,
  home: BotHome,
  unitId: number,
  nowMs: number,
): TripArea {
  return approach(from, size, targetOf(home, unitId, nowMs));
}

/**
 * 도착한 뒤 쉬는 시간: 집 없는 봇(시험 봇)은 예전과 같다(idleMs). 집이 있는 봇이 지금 가려는 네모 안에 닿았으면 일터는 길게(일하는 모습),
 * 집 둘레는 조금 길게, 아직 다가가는 중이면 짧게(예전 값). 난수는 어느 쪽이든 한 번 뽑는다(판단 차례가 같다)
 */
export function arrivalIdleMs(
  rng: Rng,
  bot: { readonly id: number; readonly size: SizeClass; readonly home: BotHome | undefined },
  at: Point,
  nowMs: number,
): number {
  const { home } = bot;
  if (!home) return idleMs(rng);
  const target = targetOf(home, bot.id, nowMs);
  const here = anchorAt(at, bot.size);
  if (Math.max(Math.abs(target.x - here.x), Math.abs(target.y - here.y)) > target.radius) return idleMs(rng);
  const baseRest =
    target === home.work
      ? WORK_IDLE_MIN_MS + rng.nextInt(WORK_IDLE_SPREAD_MS + 1)
      : HOME_IDLE_MIN_MS + rng.nextInt(HOME_IDLE_SPREAD_MS + 1);
  const fsm = resolveBotAiState(home, bot.id, nowMs);
  const rest = fsm ? Math.max(HOME_IDLE_MIN_MS, fsm.nextReevalMs) : baseRest;
  // 운반 일정(D-570 1886): 창고에 닿으면 내려놓는 동안만 서 있고(일정 끝까지), 다가오는 일정이 있으면 그때 깨어 창고로 간다
  if (home.haul && target === home.haul.area) return Math.max(HAUL_IDLE_MIN_MS, home.haul.untilMs - nowMs);
  if (home.haul && nowMs < home.haul.fromMs)
    return Math.min(rest, Math.max(HAUL_IDLE_MIN_MS, home.haul.fromMs - nowMs));
  return rest;
}

/** 목적지 하나: 네모(없으면 지금 자리 둘레 TRIP_RADIUS_CELLS) 안 설 수 있는 칸. 못 고르면 undefined(잠시 뒤 다시) */
export function pickDestination(
  grid: PlacementGrid,
  rng: Rng,
  size: SizeClass,
  from: Point,
  area?: TripArea,
): Point | undefined {
  const here = anchorAt(from, size);
  const center = area ?? { x: here.x, y: here.y, radius: TRIP_RADIUS_CELLS };
  const span = center.radius * 2 + 1;
  for (let attempt = 0; attempt < PICK_ATTEMPTS; attempt++) {
    const x = clampCell(center.x + rng.nextInt(span) - center.radius);
    const y = clampCell(center.y + rng.nextInt(span) - center.radius);
    if (Math.max(Math.abs(x - here.x), Math.abs(y - here.y)) < MIN_TRIP_CELLS) continue;
    if (isPassable(grid, x, y, size)) return anchorCenter(x, y, size);
  }
  return undefined;
}

export function idleMs(rng: Rng): number {
  return IDLE_MIN_MS + rng.nextInt(IDLE_SPREAD_MS + 1);
}

export function retryMs(rng: Rng): number {
  return RETRY_MIN_MS + rng.nextInt(RETRY_SPREAD_MS + 1);
}

export function startDelayMs(rng: Rng): number {
  return rng.nextInt(START_SPREAD_MS);
}
