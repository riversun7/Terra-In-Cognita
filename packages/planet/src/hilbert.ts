// 면 안의 힐베르트 곡선 (S2 방식) — 정수 연산만 쓴다.
// 칸 (i, j) ↔ 힐베르트 번호 h (0 ≤ h < 4^level). 번호가 이어지는 두 칸은 늘 변을 공유하므로
// 가까운 칸이 가까운 번호를 받는다(DB 범위 조회·지역 분할에 유리, PLAN 5.2).
//
// 면별 시작 방향: 짝수 면은 기본 방향, 홀수 면은 i·j 축을 바꾼 방향으로 시작한다(S2와 같다).
// 그래서 면 f의 곡선 끝 칸과 면 f+1의 곡선 첫 칸이 변을 공유하고, 면 5의 끝은 면 0의 처음과 이어진다.
// 각 면 곡선의 첫 칸은 (0, 0)이다. 끝 칸은 짝수 면이 (n-1, 0), 홀수 면이 (0, n-1)이다.
import { pow2 } from "./levels.ts";

// 방향(orientation) 2비트: 1 = i·j 축 바꿈, 2 = 두 비트 뒤집음 (S2의 kSwapMask·kInvertMask)
const SWAP = 1;
const INVERT = 2;

// 방향별 표 (S2 s2coords와 같은 값). ij = (i 비트 << 1) | j 비트.
// POS_TO_IJ_ROWS[방향][곡선 안 순서 0~3] = ij
const POS_TO_IJ_ROWS = [
  [0, 1, 3, 2], // 기본: (0,0) (0,1) (1,1) (1,0)
  [0, 2, 3, 1], // 축 바꿈: (0,0) (1,0) (1,1) (0,1)
  [3, 2, 0, 1], // 뒤집음: (1,1) (1,0) (0,0) (0,1)
  [3, 1, 0, 2], // 바꿈+뒤집음: (1,1) (0,1) (0,0) (1,0)
];
// 하위 칸으로 내려갈 때 방향에 XOR하는 값: 첫 칸은 축 바꿈, 마지막 칸은 바꿈+뒤집음
const POS_TO_ORIENTATION_ROW = [SWAP, 0, 0, SWAP | INVERT];

// 표를 32비트 정수 하나에 2비트씩 눌러 담는다(배열 접근 없이 시프트로 읽음). 칸 위치 = 방향 × 8 + 항목 × 2
function pack(rows: readonly (readonly number[])[]): number {
  let packed = 0;
  rows.forEach((row, orientation) => {
    row.forEach((value, index) => {
      packed |= value << (orientation * 8 + index * 2);
    });
  });
  return packed >>> 0;
}

const POS_TO_IJ = pack(POS_TO_IJ_ROWS);
// IJ_TO_POS는 POS_TO_IJ의 역표
const IJ_TO_POS = pack(
  POS_TO_IJ_ROWS.map((row) => {
    const inverse = [0, 0, 0, 0];
    row.forEach((ij, pos) => {
      inverse[ij] = pos;
    });
    return inverse;
  }),
);
const POS_TO_ORIENTATION = pack([POS_TO_ORIENTATION_ROW]);

const TWO_POW_22 = pow2(22);

/** 면 `face`의 레벨 `level` 칸 (i, j)의 힐베르트 번호. 입력 검사는 호출하는 쪽(cellKey)이 한다 */
export function ijToHilbert(face: number, level: number, i: number, j: number): number {
  let orientation = face & SWAP;
  let h = 0;
  for (let k = level - 1; k >= 0; k--) {
    const ij = (((i >>> k) & 1) << 1) | ((j >>> k) & 1);
    const pos = (IJ_TO_POS >>> (orientation * 8 + ij * 2)) & 3;
    // h < 4^22 = 2^44 이라 곱셈·덧셈이 정확하다
    h = h * 4 + pos;
    orientation ^= (POS_TO_ORIENTATION >>> (pos * 2)) & 3;
  }
  return h;
}

/** 힐베르트 번호 → 칸 (i, j). 입력 검사는 호출하는 쪽이 한다 */
export function hilbertToIJ(face: number, level: number, h: number): { i: number; j: number } {
  // 44비트 번호를 22비트씩 나눠 32비트 시프트로 읽는다. 2의 거듭제곱 나눗셈과 floor는 정확하다
  const high = Math.floor(h / TWO_POW_22);
  const low = h - high * TWO_POW_22;
  let orientation = face & SWAP;
  let i = 0;
  let j = 0;
  for (let k = level - 1; k >= 0; k--) {
    const pos = k >= 11 ? (high >>> (2 * (k - 11))) & 3 : (low >>> (2 * k)) & 3;
    const ij = (POS_TO_IJ >>> (orientation * 8 + pos * 2)) & 3;
    i = (i << 1) | (ij >>> 1);
    j = (j << 1) | (ij & 1);
    orientation ^= (POS_TO_ORIENTATION >>> (pos * 2)) & 3;
  }
  return { i, j };
}
