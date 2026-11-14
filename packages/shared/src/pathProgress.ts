// 경로 진행 보간(기기 표시용, 실수) — 구간 빠르기(docs/adr/2026-11-14-segment-speed.md, 기획 D-541)
// 서버 판정(packages/sim motion.ts)은 정수 고정소수점이고, 이것은 같은 모양을 실수로 따라가 화면에 쓴다.
// - 구간 i의 속도 = 기본 속도 × 1000 ÷ paces[i](천분율, 없으면 1000). 시간 거리 = 길이 × pace ÷ 1000(기본 속도로 걸리는 길이).
// - (지금 − 출발) ÷ 1000 × 기본 속도 = 지금까지 쓴 시간 거리. 그 시간 거리가 놓인 구간 안을 곧게 보간한다.
// 엔진 유닛 저장소(packages/engine units/unitMotion.ts)는 같은 식을 타입 배열로 셈한다.

/** 보간할 경로(엔진 UnitPath와 같은 칸 이름) */
export interface PacedPath {
  /** 꺾이는 점 x0, y0, x1, y1, … */
  readonly points: ArrayLike<number>;
  /** 구간마다 걸음 배율(천분율, 길이 = 점 수 − 1). 없으면 모두 1000 */
  readonly paces?: ArrayLike<number> | undefined;
  /** 출발 시각(ms) */
  readonly departAtMs: number;
  /** 기본 속도(점 좌표 단위/초) */
  readonly speedCellsPerSec: number;
}

export interface PathProgress {
  /** 지금 있는 구간(0 ~ 점 수 − 2, 점이 하나면 0) */
  readonly segment: number;
  /** 그 구간 안 비율(0 ~ 1) */
  readonly t: number;
  /** 지금까지 간 길이(점 좌표 단위) */
  readonly travelled: number;
  /** 전체 길이 */
  readonly total: number;
  /** 지금 위치 */
  readonly x: number;
  readonly y: number;
  /** 다 갔다(또는 서 있다) */
  readonly done: boolean;
}

/** 구간 i의 걸음 배율 ÷ 1000(없거나 틀리면 1) */
export function paceFactor(paces: ArrayLike<number> | undefined, segment: number): number {
  const pace = paces ? Number(paces[segment]) : 1000;
  return Number.isFinite(pace) && pace > 0 ? pace / 1000 : 1;
}

/** 시각 nowMs의 경로 진행. 속도가 0 이하면 출발점에 서 있다 */
export function pathProgress(path: PacedPath, nowMs: number): PathProgress {
  const count = Math.floor(path.points.length / 2);
  const px = (i: number): number => Number(path.points[i * 2]);
  const py = (i: number): number => Number(path.points[i * 2 + 1]);
  let total = 0;
  for (let i = 0; i + 1 < count; i++) total += Math.hypot(px(i + 1) - px(i), py(i + 1) - py(i));
  if (count === 0) return { segment: 0, t: 0, travelled: 0, total: 0, x: 0, y: 0, done: true };
  if (!(path.speedCellsPerSec > 0) || count === 1) {
    return { segment: 0, t: 0, travelled: 0, total, x: px(0), y: py(0), done: true };
  }
  let spent = (Math.max(0, nowMs - path.departAtMs) / 1000) * path.speedCellsPerSec;
  let travelled = 0;
  for (let i = 0; i + 1 < count; i++) {
    const length = Math.hypot(px(i + 1) - px(i), py(i + 1) - py(i));
    const weight = length * paceFactor(path.paces, i);
    if (spent < weight) {
      const t = weight > 0 ? spent / weight : 0;
      return {
        segment: i,
        t,
        travelled: travelled + length * t,
        total,
        x: px(i) + (px(i + 1) - px(i)) * t,
        y: py(i) + (py(i + 1) - py(i)) * t,
        done: false,
      };
    }
    spent -= weight;
    travelled += length;
  }
  return {
    segment: count - 2,
    t: 1,
    travelled: total,
    total,
    x: px(count - 1),
    y: py(count - 1),
    done: true,
  };
}
