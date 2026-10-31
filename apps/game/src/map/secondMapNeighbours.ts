// 이웃 2차맵 놓기·받기(경계 너머 보기) — ADR 2026-10-31-second-map-from-planet WP-4. 순수 계산은 시험 대상이다.
// - 놓는 자리: 2차맵은 면 격자 틀이라(사용자 결정 U1) 면 경계 너머 이웃은 틀이 90°의 배수로 돌아가 있다. 경계 칸 짝
//   (@terra/planet/secondMap stepMapCell)으로 이웃 칸 → 지금 2차맵 칸 좌표의 돌림·옮김을 구한다. 대각 이웃은 변 이웃 둘을
//   이어서 구한다. 정육면체 꼭짓점 쪽 대각선은 칸이 없다(이웃 7장).
// - 받기: 지금 2차맵 지형 주소의 판 표지(?v=)를 그대로 써서 이웃 주소를 만든다(서버 지형 경로가 볼 수 있는 2차맵의 이웃만 준다).
//   카메라 목표점이 경계 가까이(2차맵 변의 NEAR_EDGE 안) 오면 그쪽 이웃만 받는다. ?second-map-neighbours=all이면 처음부터 모두(개발자 3×3 이어 보기).
// - 유닛이 2차맵을 넘는 이동(D-139)은 아직 없다: 이웃에는 지형만 보인다. 넘을 때의 화면 바꿈은 ADR 46 WP-4 메모(D-106).
import type { NeighbourPlacement } from "@terra/engine";
import { isCellKey, stepCell } from "@terra/planet";
import { SM_PLACEMENT, stepMapCell } from "@terra/planet/secondMap";
import { terrainPath } from "@terra/protocol";

/** 이웃 하나: 키, 지금 2차맵 기준 칸 방향(ox 오른쪽 +, oy 아래 +), 놓는 자리 */
export interface NeighbourSpot {
  readonly key: number;
  readonly ox: -1 | 0 | 1;
  readonly oy: -1 | 0 | 1;
  readonly placement: NeighbourPlacement;
}

/** 2×2 돌림 행렬(행 우선 [a, b, c, d]: x' = a·x + b·y, y' = c·x + d·y) — 90°의 배수 넷 */
type Rotation = readonly [number, number, number, number];
const ROTATIONS: readonly Rotation[] = [
  [1, 0, 0, 1],
  [0, -1, 1, 0],
  [-1, 0, 0, -1],
  [0, 1, -1, 0],
];

/** 이웃 배치 칸 좌표 → 지금 2차맵 배치 칸 좌표(연속): p' = M·p + t */
interface Transform {
  readonly key: number;
  readonly m: Rotation;
  readonly tx: number;
  readonly ty: number;
}

const apply = (m: Rotation, x: number, y: number): [number, number] => [
  m[0] * x + m[1] * y,
  m[2] * x + m[3] * y,
];
const multiply = (p: Rotation, q: Rotation): Rotation => [
  p[0] * q[0] + p[1] * q[2],
  p[0] * q[1] + p[1] * q[3],
  p[2] * q[0] + p[3] * q[2],
  p[2] * q[1] + p[3] * q[3],
];

/** 변 하나 너머 이웃(방향 (dx, dy)는 축 하나, from 2차맵 틀)의 변환. 칸이 없으면 null */
function edgeTransform(fromKey: number, dx: number, dy: number): Transform | null {
  const last = SM_PLACEMENT - 1;
  // 변 위 칸 둘(처음·끝)
  const along: [number, number][] =
    dx !== 0
      ? [
          [dx > 0 ? last : 0, 0],
          [dx > 0 ? last : 0, last],
        ]
      : [
          [0, dy > 0 ? last : 0],
          [last, dy > 0 ? last : 0],
        ];
  const steps = along.map(([x, y]) => stepMapCell(fromKey, 8, x, y, dx, dy));
  const [q0, q1] = steps;
  const [p0, p1] = along;
  if (!q0 || !q1 || !p0 || !p1 || q0.mapKey !== q1.mapKey) return null;
  // 지금 2차맵 틀에서 넘은 칸 자리
  const e0: [number, number] = [p0[0] + dx, p0[1] + dy];
  const e1: [number, number] = [p1[0] + dx, p1[1] + dy];
  const m = ROTATIONS.find((rotation) => {
    const [x, y] = apply(rotation, q1.x - q0.x, q1.y - q0.y);
    return x === e1[0] - e0[0] && y === e1[1] - e0[1];
  });
  if (!m) return null;
  // 칸 가운데(+0.5)끼리 맞춘다
  const [rx, ry] = apply(m, q0.x + 0.5, q0.y + 0.5);
  return { key: q0.mapKey, m, tx: e0[0] + 0.5 - rx, ty: e0[1] + 0.5 - ry };
}

/** 이웃 변환 b(이웃 → c)와 c(c → 지금)를 이어 이웃 → 지금 */
function compose(outer: Transform, inner: Transform): Transform {
  const [tx, ty] = apply(outer.m, inner.tx, inner.ty);
  return { key: inner.key, m: multiply(outer.m, inner.m), tx: tx + outer.tx, ty: ty + outer.ty };
}

/** 지금 2차맵 둘레 이웃(최대 8장, 정육면체 꼭짓점 쪽 대각선 빼고) */
export function neighbourSpots(mapKey: number): NeighbourSpot[] {
  if (!isCellKey(mapKey)) return [];
  const out: NeighbourSpot[] = [];
  for (const oy of [-1, 0, 1] as const) {
    for (const ox of [-1, 0, 1] as const) {
      if (ox === 0 && oy === 0) continue;
      // 면 칸 방향(dj = −oy: 행이 커지면 j가 작아진다)
      const expected = stepCell(mapKey, ox, -oy);
      if (expected === null) continue;
      let transform: Transform | null;
      if (ox === 0 || oy === 0) {
        transform = edgeTransform(mapKey, ox, oy);
      } else {
        // 대각: 가로 이웃 → 그 틀에서 세로 방향으로 한 번 더(안 되면 세로 이웃 먼저)
        transform = viaEdge(mapKey, ox, 0, 0, oy, expected) ?? viaEdge(mapKey, 0, oy, ox, 0, expected);
      }
      if (!transform || transform.key !== expected) continue;
      const [a, b, c, d] = transform.m;
      // 배치 칸(256) → 지형 칸(128): 돌림은 같고 옮김은 반
      out.push({
        key: expected,
        ox,
        oy,
        placement: { a, b, cc: c, d, tx: transform.tx / 2, tz: transform.ty / 2 },
      });
    }
  }
  return out;
}

function viaEdge(
  mapKey: number,
  firstX: number,
  firstY: number,
  thenX: number,
  thenY: number,
  expected: number,
): Transform | null {
  const first = edgeTransform(mapKey, firstX, firstY);
  if (!first) return null;
  // 지금 틀의 방향 (thenX, thenY) → 첫 이웃 틀의 방향(돌림의 역 = 전치)
  const [m0, m1, m2, m3] = first.m;
  const dx = m0 * thenX + m2 * thenY;
  const dy = m1 * thenX + m3 * thenY;
  const second = edgeTransform(first.key, dx, dy);
  if (!second || second.key !== expected) return null;
  return compose(first, second);
}

/** 지형 주소(…/terrain?v=<판 표지>)의 판 표지. 없으면 null */
export function terrainVersionOf(url: string): string | null {
  const query = url.indexOf("?");
  if (query < 0) return null;
  return new URLSearchParams(url.slice(query + 1)).get("v");
}

/** 이웃 2차맵 지형 주소(지금 2차맵과 같은 판 표지) */
export function neighbourTerrainUrl(mainUrl: string, key: number): string | null {
  const version = terrainVersionOf(mainUrl);
  return version === null ? null : terrainPath(key, version);
}

/** 이 비율(2차맵 변 길이에 대한) 안으로 목표점이 경계에 다가오면 그쪽 이웃을 받는다 */
export const NEAR_EDGE = 0.2;

/**
 * 카메라 목표점(m)과 2차맵 변 길이(m) → 받을 이웃 방향("ox,oy"). 경계 가까이·너머의 쪽, 둘 다면 대각까지
 */
export function wantedDirections(targetX: number, targetZ: number, mapSizeM: number): string[] {
  const near = mapSizeM * NEAR_EDGE;
  const xs: number[] = [0];
  const ys: number[] = [0];
  if (targetX < near) xs.push(-1);
  if (targetX > mapSizeM - near) xs.push(1);
  if (targetZ < near) ys.push(-1);
  if (targetZ > mapSizeM - near) ys.push(1);
  const out: string[] = [];
  for (const oy of ys) for (const ox of xs) if (ox !== 0 || oy !== 0) out.push(`${ox},${oy}`);
  return out;
}

/** 카메라 목표점이 있는 2차맵(지금 0,0, 이웃이면 그 방향) — 화면 시험 표지 */
export function viewMap(targetX: number, targetZ: number, mapSizeM: number): string {
  const side = (value: number): number => (value < 0 ? -1 : value > mapSizeM ? 1 : 0);
  return `${side(targetX)},${side(targetZ)}`;
}

/** ?second-map-neighbours=all: 처음부터 이웃 8장을 모두 받는다(개발자 3×3 이어 보기) */
export function wantsAllNeighbours(search: string): boolean {
  return new URLSearchParams(search).get("second-map-neighbours") === "all";
}
