// 2차맵 카메라 미끄러짐 — 고른 유닛 따라가기(목표점)와 확대 단계 움직임(거리)을 프레임마다 조금씩 옮긴다(작은 상태 + 순수 계산, 시험 대상).
// 사용자 지적 2026-11-08 "화면은 선택된 유닛으로 고정되어야함"·"화면 축소확대배율 표시 없음", docs/adr/2026-11-08-map-input.md 2·3절.
// - 따라가기(followId): 엔진이 프레임마다 그 유닛의 지금 자리(서버 시계로 보간)를 주면 목표점이 지수 감쇠로 따라붙는다. 멀리 있는 유닛을
//   고르면 약 0.5초에 걸쳐 날아가고, 걷는 유닛은 거의 붙어서(빠르기 × FOLLOW_SMOOTH_MS만큼 뒤) 따라간다. 목표는 보기 범위로 묶고(630),
//   가는 길(중간 자리)은 묶지 않는다 — 떨어진 두 원 사이를 날 때 원 가장자리에서 튀지 않게.
// - 확대 움직임(distanceGoal): [+]·[−]가 정한 거리로 로그 눈금에서 지수 감쇠. 화면 가운데(= 목표점)를 붙잡으므로 거리만 바꾼다.
// - 손짓(끌기)이 따라가기를 끊는 것과 손가락 확대가 확대 움직임을 끊는 것은 엔진(secondMapEngine.ts)이 정한다.
import { type CameraLimits, type CameraState, type GroundPoint, clampCamera } from "./cameraMath.ts";

/** 따라가기 목표점이 따라붙는 빠르기(지수 감쇠 시간, ms) */
export const FOLLOW_SMOOTH_MS = 160;
/** 확대 단계 움직임 빠르기(로그 거리, ms) — 약 0.3초에 거의 닿는다(1차맵 [+]·[−] 300ms와 비슷하게) */
export const ZOOM_SMOOTH_MS = 90;
/** 이보다 가까우면 바로 맞춘다: 목표점(m), 거리(로그 차) */
const SNAP_M = 0.02;
const SNAP_LOG = 1e-3;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 지수 감쇠 한 걸음: deltaMs 동안 goal 쪽으로(snap 안이거나 빠르기 0이면 goal) */
export function approach(
  current: number,
  goal: number,
  deltaMs: number,
  smoothMs: number,
  snap: number,
): number {
  const diff = goal - current;
  if (Math.abs(diff) <= snap || smoothMs <= 0) return goal;
  return current + diff * (1 - Math.exp(-Math.max(0, deltaMs) / smoothMs));
}

/** 한 프레임 결과: 새 카메라와 아직 움직이는 중인지(다음 프레임도 그린다) */
export interface GlideStep {
  readonly state: CameraState;
  readonly busy: boolean;
}

export class CameraGlide {
  /** 따라가는 유닛(없으면 null) */
  followId: number | null = null;
  /** 확대 움직임의 목표 거리(m, 없으면 null) */
  distanceGoal: number | null = null;

  /** 따라갈 유닛을 바꾼다(null이면 그만) */
  follow(id: number | null): void {
    this.followId = id;
  }

  zoomTo(distance: number): void {
    this.distanceGoal = distance;
  }

  stopZoom(): void {
    this.distanceGoal = null;
  }

  /** 움직일 것이 있나(따라가는 유닛·확대 목표) */
  get active(): boolean {
    return this.followId !== null || this.distanceGoal !== null;
  }

  /**
   * 한 프레임. unit = 따라가는 유닛의 지금 자리(땅 좌표 m, 모르면 null — 목표점은 그대로).
   * smoothMs 0이면 바로 맞춘다(동작 줄이기 등)
   */
  step(
    state: CameraState,
    unit: GroundPoint | null,
    deltaMs: number,
    limits: CameraLimits,
    smoothMs = FOLLOW_SMOOTH_MS,
  ): GlideStep {
    let next = state;
    let busy = false;
    if (this.followId !== null && unit) {
      const goal = clampCamera({ ...state, targetX: unit.x, targetZ: unit.z }, limits);
      const targetX = approach(state.targetX, goal.targetX, deltaMs, smoothMs, SNAP_M);
      const targetZ = approach(state.targetZ, goal.targetZ, deltaMs, smoothMs, SNAP_M);
      if (targetX !== goal.targetX || targetZ !== goal.targetZ) busy = true;
      if (targetX !== state.targetX || targetZ !== state.targetZ) next = { ...next, targetX, targetZ };
    }
    if (this.distanceGoal !== null) {
      const goal = clamp(this.distanceGoal, limits.minDistance, limits.maxDistance);
      const log = approach(Math.log(next.distance), Math.log(goal), deltaMs, ZOOM_SMOOTH_MS, SNAP_LOG);
      const reached = log === Math.log(goal);
      next = { ...next, distance: reached ? goal : Math.exp(log) };
      if (reached) this.distanceGoal = null;
      else busy = true;
    }
    return { state: next, busy };
  }
}
