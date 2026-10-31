// 시선 판정 — ADR 35 "시야 판정"(정수 직선, 차폐·언덕, 대각선 모서리 규칙, 대칭), D-208·D-227·D-234·D-235
// - 직선은 늘 칸 번호가 작은 끝에서 긋는다 → A가 B를 보는 선과 B가 A를 보는 선이 같다.
// - 걸음 수 n = max(|dx|, |dy|), k번째 칸의 주축 좌표는 정확히 k, 부축은 반올림(정수).
// - 사이 칸 c: h(c) × n > z(s) × n + (z(e) − z(s)) × k 이면 막힌다. h = 바닥 높이, 차폐·건물 칸은 아주 높게(2^21).
//   z = 바닥 + 시선 높이(그 끝 유닛의 몸 높이, 보는 눈과 보이는 몸에 같은 값).
// - 대각선 걸음은 양옆 두 칸이 모두 (k − ½ 자리의 선보다) 막으면 막힌다(2배 정수로 비교).
// - 공중 유닛이 한쪽 끝이면 늘 보인다(차폐·언덕을 보지 않는다, D-227 ⑧).
// 덧셈·곱셈·비교만 쓴다(가장 큰 곱 약 2^21 × 254 < 2^30).
import type { BattleMap } from "./battleMap.ts";

/** 차폐 칸 높이(16배 cm, 약 1,310m) */
export const BLOCK_HEIGHT = 0x20_0000;

export interface SightEnd {
  readonly x: number;
  readonly y: number;
  /** 시선 높이(16배 cm) */
  readonly eye: number;
  readonly air: boolean;
}

export function lineClear(map: BattleMap, a: SightEnd, b: SightEnd, destroyed: ReadonlySet<number>): boolean {
  if (a.air || b.air) return true;
  const { size } = map;
  const [s, e] = a.y * size + a.x <= b.y * size + b.x ? [a, b] : [b, a];
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  const n = ax > ay ? ax : ay;
  if (n === 0) return true;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  const zs = (map.height[s.y * size + s.x] ?? 0) + s.eye;
  const ze = (map.height[e.y * size + e.x] ?? 0) + e.eye;
  const rise = ze - zs;
  const heightAt = (x: number, y: number): number => {
    const cell = y * size + x;
    return map.blocksSight(cell, destroyed) ? BLOCK_HEIGHT : (map.height[cell] ?? 0);
  };
  // 부축 반올림: ⌊(2k × |d부| + n) ÷ 2n⌋
  const minorAt = (k: number, minor: number): number => Math.floor((2 * k * minor + n) / (2 * n));
  let px = s.x;
  let py = s.y;
  for (let k = 1; k <= n; k++) {
    const x = ax >= ay ? s.x + sx * k : s.x + sx * minorAt(k, ax);
    const y = ax >= ay ? s.y + sy * minorAt(k, ay) : s.y + sy * k;
    if (x !== px && y !== py) {
      // 대각선 걸음: 양옆 두 칸(k − ½ 자리)
      const line2 = zs * 2 * n + rise * (2 * k - 1);
      if (heightAt(px, y) * 2 * n > line2 && heightAt(x, py) * 2 * n > line2) return false;
    }
    if (k < n && heightAt(x, y) * n > zs * n + rise * k) return false;
    px = x;
    py = y;
  }
  return true;
}
