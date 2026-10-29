// 꼭짓점 높이 — ADR 2026-10-29-s2-planet-lod(36) "꼭짓점 높이 = 그 꼭짓점을 나누는 칸들의 평균"
// 면 경계 위 꼭짓점은 이웃 면 칸까지 넣고(4칸), 정육면체 꼭짓점은 3칸이다. 정수 연산만 쓴다.
// 맵 레벨마다 행성 전체의 꼭짓점 높이를 한 번 계산하고 타일은 그 값을 잘라 쓴다.
// 그래서 같은 레벨 이웃 타일(면 경계 너머 포함)은 경계 높이가 같다(틈 없음).
// 면 경계 위 꼭짓점은 두 면에서 따로 계산하지만 칸 고도가 정수라 합이 정확하고, 같은 칸들을 쓰므로 값이 같다.
//
// 꼭짓점 (ci, cj) (0 ≤ ci, cj ≤ n)는 그 면의 st 점 (ci / n, cj / n)이다. 나누는 칸은 (ci−1, cj−1), (ci, cj−1),
// (ci−1, cj), (ci, cj)이고, 면 밖으로 나간 칸은 wrapFaceIJ로 이웃 면 칸으로 옮긴다(두 축이 모두 나가면 칸이 없다).
import { FACES, wrapFaceIJ } from "../faces.ts";
import type { PlanetLevel } from "./aggregate.ts";

/** 평균을 가장 가까운 정수로(.5는 +∞ 쪽). 칸이 3개면 나눈 값이 정확하지 않지만 .5에 걸리지 않아 결과는 정확하다 */
function roundedMean(sum: number, count: number): number {
  return Math.round(sum / count);
}

/**
 * 맵 레벨 하나의 꼭짓점 높이(게임 m). 면마다 (n+1)²개, index = 면 × (n+1)² + cj × (n+1) + ci.
 */
export function planetCornerHeights(level: PlanetLevel): Int16Array {
  const { n, elevationM } = level;
  const m = n + 1;
  const out = new Int16Array(6 * m * m);
  const cell = (face: number, i: number, j: number): number => elevationM[face * n * n + j * n + i] ?? 0;
  for (const face of FACES) {
    for (let cj = 0; cj <= n; cj++) {
      for (let ci = 0; ci <= n; ci++) {
        const index = face * m * m + cj * m + ci;
        if (ci > 0 && ci < n && cj > 0 && cj < n) {
          // 면 안쪽: 4칸 모두 같은 면
          const sum =
            cell(face, ci - 1, cj - 1) + cell(face, ci, cj - 1) + cell(face, ci - 1, cj) + cell(face, ci, cj);
          out[index] = roundedMean(sum, 4);
          continue;
        }
        // 면 가장자리: 면 밖 칸은 이웃 면으로 옮긴다
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 0; dj++) {
          for (let di = -1; di <= 0; di++) {
            const target = wrapFaceIJ(face, level.level, ci + di, cj + dj);
            if (!target) continue;
            sum += cell(target.face, target.i, target.j);
            count += 1;
          }
        }
        out[index] = roundedMean(sum, count);
      }
    }
  }
  return out;
}
