// 유닛 상태(부상·포로) — docs/adr/2026-10-31-combat-core.md 8절, 기획 D-099(쓰러지면 부상, 사망은 수명만)·
// D-145(부상 3단계 + 자연 회복)·D-187(포로, 주인은 그대로)·D-351·질문 108 기본안(D-381)
// 2차맵 유닛 줄(world_units)에 함께 저장한다. 움직임(경로)과 따로라 "유닛은 한 곳에만"(I4)은 그대로다.
// [임시] 단계별 회복 시간(T6 출발값 없음), 쓰러진 유닛의 단계(중상), 단계가 시간에 따라 내려가는 일은 하지 않는다.
import {
  PLACEMENT_SIZE,
  type PlacementGrid,
  type Point,
  type SizeClass,
  anchorCenter,
  isPassable,
} from "@terra/sim";

export interface UnitCondition {
  /** 0 없음, 1 경상, 2 중상, 3 중태(활동 불가) */
  readonly injury: number;
  /** 저절로 낫는 시각. 부상이 없으면 null(DB 검사 조건과 같다) */
  readonly injuryUntilMs: number | null;
  /** 포로로 잡은 주체(없으면 null) */
  readonly heldBy: number | null;
}

export const HEALTHY: UnitCondition = { injury: 0, injuryUntilMs: null, heldBy: null };

export const INJURY_CRITICAL = 3;
/** [임시] 전투에서 쓰러진 유닛의 부상 단계(기획 Step 5 전): 중상 */
export const DOWNED_INJURY = 2;
/** [임시] 단계별 자연 회복 시간(T6 출발값 없음): 경상 1시간, 중상 4시간, 중태 12시간 */
export const INJURY_HEAL_MS: readonly number[] = [0, 3_600_000, 4 * 3_600_000, 12 * 3_600_000];

/** 지금 부상(나을 시각이 지났으면 없음) */
export function injuryAt(condition: UnitCondition, nowMs: number): number {
  return condition.injury > 0 && condition.injuryUntilMs !== null && nowMs < condition.injuryUntilMs
    ? condition.injury
    : 0;
}

/** 명령·스스로 움직이기를 못 하는가: 포로이거나 중태(D-145 활동 불가) */
export function unavailable(condition: UnitCondition, nowMs: number): boolean {
  return condition.heldBy !== null || injuryAt(condition, nowMs) >= INJURY_CRITICAL;
}

/** 쓰러졌을 때의 부상(이미 더 무거우면 그대로, 시간은 늦은 쪽) */
export function injure(condition: UnitCondition, stage: number, atMs: number): UnitCondition {
  const current = injuryAt(condition, atMs);
  const injury = Math.max(current, stage);
  const until = atMs + (INJURY_HEAL_MS[injury] ?? 0);
  return {
    ...condition,
    injury,
    injuryUntilMs: current > 0 ? Math.max(until, condition.injuryUntilMs ?? 0) : until,
  };
}

/**
 * [임시] 돌아갈 안전한 곳 = 그 2차맵 가운데에서 가장 가까운 설 수 있는 칸(R4b에서 가장 가까운 안전 도시로 바꾼다).
 * 가운데부터 사각 고리로 넓혀 찾는다(정해진 차례). 없으면 undefined
 */
export function safePoint(grid: PlacementGrid, size: SizeClass): Point | undefined {
  const center = PLACEMENT_SIZE >> 1;
  for (let radius = 0; radius < center; radius++)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (isPassable(grid, center + dx, center + dy, size))
          return anchorCenter(center + dx, center + dy, size);
      }
  return undefined;
}
