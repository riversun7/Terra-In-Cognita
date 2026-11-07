// 유닛 상태(부상·포로) — docs/adr/2026-10-31-combat-core.md 8절, 기획 D-099(쓰러지면 부상, 사망은 수명만)·D-187(포로, 주인은 그대로)·
// D-351·질문 108 기본안(D-381), 부상 4단계 D-521(docs/adr/2026-11-08-injury.md)
// 2차맵 유닛 줄(world_units)에 함께 저장한다. 움직임(경로)과 따로라 "유닛은 한 곳에만"(I4)은 그대로다.
// - 부상(D-521): 0 초록(정상)·1 흰·2 노랑·3 빨강. 저장 = (단계, 그 단계가 내려가는 시각, 치유 배율 ‰). 지금 단계는 읽을 때 센다
//   (@terra/sim injuryNow: 빨강 3일 → 노랑 2일 → 흰 1일 → 초록, 설정 칸 N55). 병원 치료가 배율을 올린다(hospital/service.ts).
//   빨강은 옛 중태처럼 명령·스스로 움직이기를 못 한다(unavailable, 확인 대기 질문 690).
// - 설정 칸은 부를 때마다 읽는다(configureInjuryRules — app.ts가 실효 값 접근자를 잇는다, 없으면 출발값).
// - 작업 중 부상(createWorkInjury): 소유 주체 정산(settlement.ts injureWork)이 직무 정산 전에 유닛마다 부른다. @terra/sim settleWorkInjury
//   (시뮬레이터 settleFaction과 같은 함수)로 구간 안 작업 주기 경계(정시, 일 단계, 피로가 높을수록 자주)를 굴리고 다쳤으면 상태를 바꾼다(같은
//   동기 처리 → 같은 커밋). 난수 시드는 고정값 [임시]: 경계·유닛으로만 정해야 나눠 정산해도, 다시 켜도 같다(서버 세계 시드가 아직 없다).
//   2차맵 오브젝트 채집(gather/service.ts)은 createGatherInjury로 같은 판정(workInjuryStage)·시드를 부른다(채집하는 동안 지난 작업 주기 경계마다).
// 돌아갈 곳은 가장 가까운 안전 도시(cities.ts, R4b)이고, 도시가 없는 2차맵은 가운데 칸.
import {
  INJURY_RED,
  type InjuryCoefficients,
  type InjuryState,
  NATURAL_HEAL_PM,
  PLACEMENT_SIZE,
  type PlacementGrid,
  type Point,
  type SizeClass,
  TEST_JOB_RULES,
  TEST_SOCIETY_COEFFICIENTS,
  anchorCenter,
  injure as injureState,
  injuryNow,
  isPassable,
  settleWorkInjury,
  workInjuryStage,
} from "@terra/sim";
import type { WorkInjuryHook } from "./settlement.ts";

export interface UnitCondition {
  /** 저장한 부상 단계: 0 초록, 1 흰, 2 노랑, 3 빨강(활동 불가). 지금 단계는 injuryAt으로 센다 */
  readonly injury: number;
  /** 저장한 단계가 한 단계 내려가는 시각. 부상이 없으면 null(DB 검사 조건과 같다) */
  readonly injuryUntilMs: number | null;
  /** 치유 배율(‰, 없으면 1000 = 자연 치유). 병원 치료가 올린다 */
  readonly injuryHealPm?: number | undefined;
  /** 포로로 잡은 주체(없으면 null) */
  readonly heldBy: number | null;
}

export const HEALTHY: UnitCondition = { injury: 0, injuryUntilMs: null, heldBy: null };

/** 명령을 받지 못하는 단계(빨강, 옛 중태 D-145) */
export const INJURY_CRITICAL = INJURY_RED;

let rulesOf: () => InjuryCoefficients = () => TEST_SOCIETY_COEFFICIENTS.injury;

/** 부상 설정 칸 접근자를 잇는다(app.ts, 부를 때마다 실효 값) */
export function configureInjuryRules(get: (() => InjuryCoefficients) | undefined): void {
  rulesOf = get ?? (() => TEST_SOCIETY_COEFFICIENTS.injury);
}

/** 지금 부상 설정 칸 */
export const injuryRules = (): InjuryCoefficients => rulesOf();

/** 저장한 상태 → 부상 상태 */
export const injuryStateOf = (condition: UnitCondition): InjuryState => ({
  stage: condition.injury,
  untilMs: condition.injuryUntilMs,
  healPm: condition.injuryHealPm ?? NATURAL_HEAL_PM,
});

/** 부상 상태를 얹은 유닛 상태(초록이면 칸을 비운다) */
export function withInjury(condition: UnitCondition, state: InjuryState): UnitCondition {
  if (state.stage <= 0 || state.untilMs === null)
    return { injury: 0, injuryUntilMs: null, heldBy: condition.heldBy };
  return {
    injury: state.stage,
    injuryUntilMs: state.untilMs,
    ...(state.healPm === NATURAL_HEAL_PM ? {} : { injuryHealPm: state.healPm }),
    heldBy: condition.heldBy,
  };
}

/** nowMs의 부상 상태(단계·다음 단계 시각·배율) */
export const injuryNowOf = (condition: UnitCondition, nowMs: number): InjuryState =>
  injuryNow(injuryStateOf(condition), nowMs, rulesOf());

/** 지금 부상 단계(0 초록) */
export function injuryAt(condition: UnitCondition, nowMs: number): number {
  return condition.injury > 0 && condition.injuryUntilMs !== null ? injuryNowOf(condition, nowMs).stage : 0;
}

/** 명령·스스로 움직이기를 못 하는가: 포로이거나 빨강(옛 중태, D-145 활동 불가) */
export function unavailable(condition: UnitCondition, nowMs: number): boolean {
  return condition.heldBy !== null || injuryAt(condition, nowMs) >= INJURY_CRITICAL;
}

/** world_units 줄의 상태 칸(부상·치유 배율·포로) */
export const conditionColumns = (condition: UnitCondition) => ({
  injury: condition.injury,
  injury_until_ms: condition.injuryUntilMs,
  injury_heal_pm: condition.injuryHealPm ?? NATURAL_HEAL_PM,
  held_by: condition.heldBy,
});

/** 새 부상(@terra/sim injure: 더 무거우면 새로, 같으면 시간 다시, 가벼우면 그대로) */
export function injure(condition: UnitCondition, stage: number, atMs: number): UnitCondition {
  return withInjury(condition, injureState(injuryStateOf(condition), stage, atMs, rulesOf()));
}

/** [임시] 작업 중 부상 난수 시드(세계 시드가 생기면 바꾼다 — 바꾸면 같은 경계의 결과가 달라진다) */
export const WORK_INJURY_SEED = 0x5eed_4a17;

/** 작업 중 부상 고리(소유 주체 정산이 직무가 있는 유닛마다 부른다). 다치지 않았으면 쓰지 않는다 */
export function createWorkInjury(seed: number = WORK_INJURY_SEED): WorkInjuryHook {
  return (unit, fromMs, toMs, offlineSinceMs) => {
    const info = unit.map.unitInfo(unit.id);
    if (!info) return;
    const before = injuryStateOf(info.condition);
    const after = settleWorkInjury(
      {
        injury: before,
        job: unit.job,
        unit: unit.id,
        seed,
        fromMs,
        toMs,
        offlineSinceMs,
        rules: TEST_JOB_RULES,
      },
      rulesOf(),
    );
    if (after !== before) unit.map.setCondition(unit.id, withInjury(info.condition, after));
  };
}

/** 채집 중 부상 고리가 쓰는 2차맵 몫(유닛 상태 읽기·쓰기) */
export interface ConditionMap {
  unitInfo(unitId: number): { readonly condition: UnitCondition } | undefined;
  setCondition(unitId: number, condition: UnitCondition): boolean;
}

/**
 * 채집 중 부상(2차맵 오브젝트 채집, docs/adr/2026-11-08-injury.md 5절): (fromMs, toMs] 안 작업 주기 경계(정시)마다 작업 중 부상을 굴린다.
 * 직무 정산(createWorkInjury)과 같은 판정·시드(경계 번호 = 경계 시각 ÷ 작업 주기)라 같은 경계가 같은 결과다. 채집 유닛은 직무가 없어 정산 고리는
 * 굴리지 않는다(겹치지 않음). 다친 가장 무거운 단계를 돌려준다(0 = 다치지 않음)
 */
export type GatherInjuryHook = (
  map: ConditionMap,
  unitId: number,
  fatigue: number,
  fatigueMax: number,
  fromMs: number,
  toMs: number,
) => number;

/** 한 번에 굴리는 경계 수 상한(오래 멈춘 채집 줄이 한꺼번에 많이 굴리지 않게 — 마지막 하루 몫만) */
const GATHER_INJURY_MAX_CHECKS = 24;

export function createGatherInjury(seed: number = WORK_INJURY_SEED): GatherInjuryHook {
  return (map, unitId, fatigue, fatigueMax, fromMs, toMs) => {
    const c = rulesOf();
    if (c.workPeriodMs < 1 || toMs <= fromMs) return 0;
    const info = map.unitInfo(unitId);
    if (!info) return 0;
    const last = Math.floor(toMs / c.workPeriodMs);
    const first = Math.max(Math.floor(fromMs / c.workPeriodMs) + 1, last - GATHER_INJURY_MAX_CHECKS + 1);
    let state = injuryStateOf(info.condition);
    let worst = 0;
    for (let index = first; index <= last; index++) {
      const stage = workInjuryStage({ seed, unit: unitId, index, fatigue, fatigueMax }, c);
      if (stage <= 0) continue;
      state = injureState(state, stage, index * c.workPeriodMs, c);
      worst = Math.max(worst, stage);
    }
    if (worst > 0) map.setCondition(unitId, withInjury(info.condition, state));
    return worst;
  };
}

/**
 * 돌아갈 자리: 기준 칸(가장 가까운 안전 도시의 시청 칸, cities.ts)에서 가장 가까운 설 수 있는 칸.
 * 기준이 없으면 2차맵 가운데(도시가 없는 2차맵의 대비책). 사각 고리로 넓혀 찾는다(정해진 차례). 없으면 undefined
 */
export function safePoint(
  grid: PlacementGrid,
  size: SizeClass,
  near: { readonly x: number; readonly y: number } = { x: PLACEMENT_SIZE >> 1, y: PLACEMENT_SIZE >> 1 },
): Point | undefined {
  for (let radius = 0; radius < PLACEMENT_SIZE; radius++)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = near.x + dx;
        const y = near.y + dy;
        if (x < 0 || y < 0 || x >= PLACEMENT_SIZE || y >= PLACEMENT_SIZE) continue;
        if (isPassable(grid, x, y, size)) return anchorCenter(x, y, size);
      }
  return undefined;
}
