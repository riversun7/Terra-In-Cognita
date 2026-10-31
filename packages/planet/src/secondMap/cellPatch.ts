// 1차맵 칸 값 → 2차맵 안 매끈한 값 — ADR 46 3절(선택지 B2). 정수만 쓴다.
// 칸 하나 위에 2차 베지어 조각을 놓는다. 조절점 9개:
// - 가운데 = 그 칸 값, 변 가운데 = 변을 나누는 두 칸의 평균, 꼭짓점 = 꼭짓점을 나누는 칸(보통 4, 정육면체 꼭짓점은 3)의 평균.
//   이것은 칸 가운데에 조절점을 둔 균일 2차 B-스플라인과 같은 곡면이라(정육면체 꼭짓점 밖) 2차맵 경계에서 값과 기울기가 이어진다.
// - 변 위 값은 그 변의 조절점 셋(꼭짓점 둘 + 변 가운데)으로만 정해지고, 셋 모두 어느 면 틀에서 보아도 같은 칸들의 평균이다.
//   그래서 맞닿은 두 2차맵이 공유 변에서 비트까지 같은 값을 낸다(면 경계·정육면체 꼭짓점 포함). 꼭짓점 1차맵 높이(cornerHeights.ts)와도 같다.
// - 평균의 분모(1·2·3·4)를 없애려고 조절점은 값 × 12 정수로 둔다. 가중치(번스타인)는 위치 x / 2^e에서 (D − x)², 2x(D − x), x²
//   (D = 2^e, 합 D²)라 합은 값 × 12 × D⁴이다. 부르는 쪽이 값 범위를 2^53 안에 둔다(e = 7이면 |값| ≤ 약 2.8 × 10⁶).
//   모든 부분합이 2^53 안의 정수라 더하는 차례가 달라도(맞닿은 두 2차맵의 틀이 돌아가 있어도) 합이 같다.
import { pow2 } from "../levels.ts";
import { floorDiv } from "./layout.ts";

/** 조절점 값 배율(1·2·3·4의 최소공배수) */
export const NET_SCALE = 12;

/**
 * 둘레 3×3 칸 번호(neighbourhood, 없으면 −1)와 칸 값 함수로 조절점 9개(× 12)를 만든다.
 * 순서 b × 3 + a: a = 면 I 방향(0 = I가 작은 변, 1 = 가운데, 2 = I가 큰 변), b = 면 J 방향(같은 뜻).
 * 변을 나누는 칸(4이웃)은 늘 있다. 정육면체 꼭짓점 쪽 대각선만 없을 수 있다(그 꼭짓점은 3칸 평균).
 */
export function controlNet(nb: Int32Array, value: (cell: number) => number): Float64Array {
  const at = (di: number, dj: number): number => nb[(dj + 1) * 3 + (di + 1)] ?? -1;
  const center = value(at(0, 0));
  const net = new Float64Array(9);
  const edge = (di: number, dj: number): number => (center + value(at(di, dj))) * 6;
  const corner = (di: number, dj: number): number => {
    let sum = center + value(at(di, 0)) + value(at(0, dj));
    const diagonal = at(di, dj);
    if (diagonal < 0) return sum * 4;
    sum += value(diagonal);
    return sum * 3;
  };
  net[0] = corner(-1, -1);
  net[1] = edge(0, -1);
  net[2] = corner(1, -1);
  net[3] = edge(-1, 0);
  net[4] = center * NET_SCALE;
  net[5] = edge(1, 0);
  net[6] = corner(-1, 1);
  net[7] = edge(0, 1);
  net[8] = corner(1, 1);
  return net;
}

/** 번스타인 가중치 표: 위치 x = 0 ~ 2^e마다 [(D − x)², 2x(D − x), x²] (합 D²) */
export function bernsteinTable(e: number): Float64Array {
  const D = 1 << e;
  const table = new Float64Array((D + 1) * 3);
  for (let x = 0; x <= D; x++) {
    table[x * 3] = (D - x) * (D - x);
    table[x * 3 + 1] = 2 * x * (D - x);
    table[x * 3 + 2] = x * x;
  }
  return table;
}

/** 조절점 × 가중치의 합(값 × 12 × D⁴). x·y는 칸 안 위치(0 ~ D, x = 면 I 방향, y = 면 J 방향) */
export function netSum(net: Float64Array, table: Float64Array, x: number, y: number): number {
  const a0 = table[x * 3] ?? 0;
  const a1 = table[x * 3 + 1] ?? 0;
  const a2 = table[x * 3 + 2] ?? 0;
  const b0 = table[y * 3] ?? 0;
  const b1 = table[y * 3 + 1] ?? 0;
  const b2 = table[y * 3 + 2] ?? 0;
  // 행(J 방향)마다 I 방향 합을 먼저 낸다 — 변 위(x = 0 등)에서는 0 가중치 항이 정확히 0이라 순서와 상관없이 같은 합이다
  const row0 = (net[0] ?? 0) * a0 + (net[1] ?? 0) * a1 + (net[2] ?? 0) * a2;
  const row1 = (net[3] ?? 0) * a0 + (net[4] ?? 0) * a1 + (net[5] ?? 0) * a2;
  const row2 = (net[6] ?? 0) * a0 + (net[7] ?? 0) * a1 + (net[8] ?? 0) * a2;
  return row0 * b0 + row1 * b1 + row2 * b2;
}

/** 합 → 값(내림). 분모 = 12 × D⁴ */
export function netValue(sum: number, e: number): number {
  return floorDiv(floorDiv(sum, pow2(4 * e)), NET_SCALE);
}
