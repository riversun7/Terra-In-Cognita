// 2차맵 가시거리 자동 조절 — 프레임 시간에 여유가 있으면 소품 모델을 세우는 거리를 한 단계씩 늘리고, 느려지면 줄인다(순수 상태, 시험 대상).
// 사용자 지적 2026-11-09 "fps 충분하면 가시거리 늘려라", docs/adr/2026-10-28-s1-second-map.md "바뀜 (2026-11-09)".
// - 잰 값: 엔진이 이어서 그린 프레임마다 프레임 간격(requestAnimationFrame 사이, 화면 전체 = 성능 판의 fps·p95와 같은 것)과
//   엔진 시간(갱신 + 그리기 명령)을 넣는다. 멈췄다 다시 그린 첫 프레임(간격 0)은 넣지 않는다 — 그리기를 쉬는 동안은 단계를 그대로 둔다.
// - 판정은 BLOCK_MS(그린 프레임 간격의 합)씩 끊은 묶음의 p95로 한다. 여유 묶음이 UP_BLOCKS개 이어지면 한 단계 올리고, 느린 묶음이
//   DOWN_BLOCKS개 이어지면 한 단계 내린다(내리기가 더 빠르다 — 휴대폰 우선, PLAN 11장 p95 ≤ 33ms). 올림·내림 문턱 사이(히스테리시스)
//   묶음은 이어진 수를 비운다. 묶음이 겹치지 않아 한 번 튄 순간(쓰레기 수거·소품 다시 세우기)은 묶음 둘까지만 망친다.
// - 단계를 바꾼 뒤 첫 묶음은 버린다(소품을 다시 세운 프레임이 튀는 것을 판정에 넣지 않게).
// - 거리는 화면 가운데 땅(카메라 목표점)에서 잰다. 지형은 이미 2차맵 전체·이웃을 다 그리므로 늘리는 것은 소품 모델(나무·바위 등)이다.

/** 가시거리 단계 하나: 화면 가운데 땅에서 소품 모델을 세우는 거리(m)와 모델 수 상한 */
export interface ViewDistanceLevel {
  readonly reachM: number;
  readonly maxProps: number;
}

/** 단계 표(가까운 것부터). 맨 위가 상한 — 휴대폰 그리기 부담(인스턴스 모델 약 40삼각형 × 상한)을 넘지 않게 */
export const VIEW_DISTANCE_LEVELS: readonly ViewDistanceLevel[] = [
  { reachM: 120, maxProps: 2_500 },
  { reachM: 180, maxProps: 3_500 },
  { reachM: 250, maxProps: 5_000 },
  { reachM: 340, maxProps: 7_000 },
  { reachM: 450, maxProps: 9_000 },
];
/** 처음 단계(가운데) — 여유가 있으면 올라가고 없으면 내려간다 */
export const VIEW_DISTANCE_START_LEVEL = 2;

/** 판정 묶음 길이(ms, 그린 프레임 간격의 합)와 묶음 하나의 최소 프레임 수(아주 느리면 프레임이 모일 때까지 묶음을 늘린다) */
export const BLOCK_MS = 500;
const MIN_BLOCK_FRAMES = 8;
/** 여유: 프레임 간격 p95 ≤ 20ms(50fps 이상)이고 엔진 시간 p95 ≤ 6ms */
export const UP_FRAME_MS = 20;
export const UP_ENGINE_MS = 6;
/** 느림: 프레임 간격 p95 > 28ms(약 36fps 아래, 기준 33ms 앞) 또는 엔진 시간 p95 > 12ms */
export const DOWN_FRAME_MS = 28;
export const DOWN_ENGINE_MS = 12;
/** 올리기 = 여유 묶음 6개(3초), 내리기 = 느린 묶음 3개(1.5초) 이어짐 */
export const UP_BLOCKS = 6;
export const DOWN_BLOCKS = 3;
/** 한 프레임 간격 상한(ms) — 숨겼다 돌아온 프레임 하나가 판정을 크게 흔들지 않게(프레임 예약기 상한과 같다) */
const MAX_SAMPLE_MS = 100;

/** p95(정렬해 쓰는 작은 배열) */
function p95(values: number[]): number {
  // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 사본이라 원본을 바꿔도 된다
  values.sort((a, b) => a - b);
  const rank = Math.min(values.length, Math.max(1, Math.ceil(0.95 * values.length)));
  return values[rank - 1] ?? 0;
}

export class ViewDistanceController {
  private levelIndex: number;
  private readonly levels: readonly ViewDistanceLevel[];
  /** 지금 묶음의 프레임 간격·엔진 시간과 그 합(ms) */
  private frameMs: number[] = [];
  private engineMs: number[] = [];
  private blockMs = 0;
  private goodBlocks = 0;
  private badBlocks = 0;
  /** 단계를 바꾼 뒤 첫 묶음은 버린다 */
  private settling = true;
  /** 자동 조절을 끄면(개발자 시험) 단계를 그대로 둔다 */
  enabled = true;

  constructor(
    levels: readonly ViewDistanceLevel[] = VIEW_DISTANCE_LEVELS,
    start = VIEW_DISTANCE_START_LEVEL,
  ) {
    this.levels = levels;
    this.levelIndex = Math.min(levels.length - 1, Math.max(0, Math.round(start)));
  }

  /** 지금 단계 번호(0부터)와 값 */
  get index(): number {
    return this.levelIndex;
  }

  get level(): ViewDistanceLevel {
    return this.levels[this.levelIndex] ?? { reachM: 0, maxProps: 0 };
  }

  /** 이어서 그린 프레임 하나. 단계가 바뀌었으면 true(엔진이 소품을 다시 세우고 한 번 더 그린다) */
  record(frameIntervalMs: number, engineMs: number): boolean {
    if (!this.enabled || !(frameIntervalMs > 0)) return false;
    const interval = Math.min(MAX_SAMPLE_MS, frameIntervalMs);
    this.frameMs.push(interval);
    this.engineMs.push(Math.max(0, engineMs));
    this.blockMs += interval;
    if (this.blockMs < BLOCK_MS || this.frameMs.length < MIN_BLOCK_FRAMES) return false;
    return this.closeBlock();
  }

  /** 묶음 하나를 판정한다 */
  private closeBlock(): boolean {
    const frames = this.frameMs;
    const engine = this.engineMs;
    this.frameMs = [];
    this.engineMs = [];
    this.blockMs = 0;
    if (this.settling) {
      this.settling = false;
      return false;
    }
    const frameP95 = p95(frames);
    const engineP95 = p95(engine);
    if (frameP95 <= UP_FRAME_MS && engineP95 <= UP_ENGINE_MS) {
      this.goodBlocks += 1;
      this.badBlocks = 0;
    } else if (frameP95 > DOWN_FRAME_MS || engineP95 > DOWN_ENGINE_MS) {
      this.badBlocks += 1;
      this.goodBlocks = 0;
    } else {
      // 문턱 사이: 그대로 둔다(이어진 수를 비워 경계에서 오르내리지 않게)
      this.goodBlocks = 0;
      this.badBlocks = 0;
    }
    if (this.goodBlocks >= UP_BLOCKS && this.levelIndex < this.levels.length - 1) return this.change(1);
    if (this.badBlocks >= DOWN_BLOCKS && this.levelIndex > 0) return this.change(-1);
    return false;
  }

  private change(step: 1 | -1): boolean {
    this.levelIndex += step;
    this.goodBlocks = 0;
    this.badBlocks = 0;
    this.settling = true;
    return true;
  }
}
