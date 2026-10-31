// 2차맵 경계 칸 짝 — ADR 46 3절. 칸 하나 옆 칸이 이웃 2차맵에 있으면 그 2차맵 키와 칸 좌표를 준다.
// 도로·철도가 경계를 넘을 때(D-133·D-5042)의 이어짐 확인과 2차맵을 넘는 이동(D-139)이 쓴다. 정수 연산만 쓴다.
// 좌표: 열 x = 면 i 쪽, 행 y = 면 j가 작아지는 쪽(layout.ts). 한 변 칸 수 size = 2^sublevels(지형 128 = 7, 배치 256 = 8).
// 면 경계는 wrapFaceIJ(면 경계 변환표, 뒤집힘 포함)로 넘는다. 정육면체 꼭짓점 쪽 대각선 걸음은 칸이 없어 null이다.
import { type CellKey, cellKey } from "../cellKey.ts";
import { wrapFaceIJ } from "../faces.ts";
import { mapCoords } from "./layout.ts";

export interface MapCellStep {
  readonly mapKey: CellKey;
  readonly x: number;
  readonly y: number;
}

/**
 * 2차맵 mapKey의 칸 (x, y)(한 변 2^sublevels칸)에서 (dx, dy)(각 −1·0·1) 걸음 간 칸. 같은 2차맵 안이면 같은 키다.
 * 면 경계를 넘으면 이웃 면 2차맵 키와 그 2차맵 틀의 좌표다.
 */
export function stepMapCell(
  mapKey: number,
  sublevels: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
): MapCellStep | null {
  const map = mapCoords(mapKey);
  const size = 1 << sublevels;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) {
    throw new RangeError(`cell (${x}, ${y}) is outside a ${size}-cell map`);
  }
  const level = map.faceLevel + sublevels;
  // 면 좌표(레벨 F + sublevels): I = i·size + x, J = j·size + (size − 1 − y). 행이 커지면 J가 작아진다
  const I = map.i * size + x + dx;
  const J = map.j * size + (size - 1 - y) - dy;
  const target = wrapFaceIJ(map.face, level, I, J);
  if (!target) return null;
  return {
    mapKey: cellKey(target.face, map.faceLevel, Math.floor(target.i / size), Math.floor(target.j / size)),
    x: target.i % size,
    y: size - 1 - (target.j % size),
  };
}
