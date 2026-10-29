// 강가·호숫가 습도 가산의 띠 몫 — 지표 단계(surface.ts)가 쓴다
// 물가에서 RIPARIAN_REACH 안쪽 땅이 가산을 받는다. 칸이 띠보다 크면 칸 면적 중 띠가 차지하는 몫만 받는다.
// 강을 가로지르는 칸 줄의 (몫 × 칸 폭) 합이 칸 크기와 무관하게 띠 폭이 되도록 정했다(시험: riparian.test.ts).
import { clamp, km } from "./util.ts";

/**
 * 강가·호숫가 습도 가산이 닿는 거리(라디안, 실제 환산 12km, S2 임시값).
 * 강은 강 칸 가운데를 지나는 선에서, 호수는 호숫가(호수 칸 가장자리)에서 잰다.
 */
export const RIPARIAN_REACH = km(12);
/** 호숫가 습도 가산 (띠 안 땅 전부가 받을 때) */
export const LAKE_SHORE_BONUS = 24;

/** 강가 습도 가산 (띠 안 땅 전부가 받을 때): 하천 등급 1 → 19, 6 이상 → 44 */
export function riverBonus(order: number): number {
  return 14 + 5 * Math.min(order, 6);
}

/**
 * 강가 띠가 칸 폭에서 차지하는 몫(0~1). 강은 강 칸 가운데를 지나는 선으로 보고, 칸은 강에 수직인 폭 s의 구간
 * [d − s/2, d + s/2]로 본다(d = 칸 가운데에서 강까지 거리). 그 구간 중 [−RIPARIAN_REACH, RIPARIAN_REACH]인 몫.
 * 강 칸 자신(d = 0)은 min(1, 2 × 닿는 거리 ÷ s)다. 거리·폭은 모두 라디안이다.
 */
export function riverShare(distance: number, size: number): number {
  const inside =
    Math.min(distance + size / 2, RIPARIAN_REACH) - Math.max(distance - size / 2, -RIPARIAN_REACH);
  return clamp(inside / size, 0, 1);
}

/**
 * 호숫가 띠가 칸 폭에서 차지하는 몫(0~1). 호숫가는 가장 가까운 호수 칸의 가장자리(가운데에서 반 칸)라
 * 칸은 호숫가에서 [d − s, d]에 있다(d = 두 칸 가운데 사이 거리). 그 구간 중 [0, RIPARIAN_REACH]인 몫.
 */
export function lakeShare(distance: number, size: number): number {
  const inside = Math.min(distance, RIPARIAN_REACH) - Math.max(distance - size, 0);
  return clamp(inside / size, 0, 1);
}
