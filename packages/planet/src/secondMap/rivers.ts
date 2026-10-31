// 2차맵 강 물길 — ADR 46 3절. 1차맵 칸의 흐름 방향(8이웃)으로 물길이 들어오는 자리·나가는 자리를 정하고 2차맵 안을 깎는다.
// 이음매 규칙(맞닿은 2차맵이 경계에서 같은 높이를 내게)
// - 변을 건너는 흐름(4이웃): 건너는 자리 = 그 변의 해시로 고른 꼭짓점(두 칸 번호를 정렬한 열쇠, 변 끝 꼭짓점 중 정육면체 점이
//   작은 쪽부터 센다). 그 자리 둘레 반지름 ZONE_RADIUS 안에서는 두 2차맵 모두 "변에 수직인 직선"까지 거리로 깎는다.
// - 꼭짓점을 건너는 흐름(대각선 이웃): 그 꼭짓점을 나누는 네 2차맵이 모두 반지름 안에서 "대각선 직선"까지 거리로 깎는다.
//   네 칸 모두 두 대각 짝(나와 대각 칸, 옆 칸 둘)을 본다. 정육면체 꼭짓점(칸 셋)에는 대각선이 없다.
// - 거리는 정수 차이(|Δ|, 대각선은 |외적| ÷ √2)라 면 틀이 돌아가 있어도 같다. 반지름 밖은 2차맵마다 자기 물길(직선 토막 + 휘는 곡선)이다.
//   물길의 직선 토막(STUB) 길이가 반지름 + 물길 반폭보다 길어 반지름 경계에서 두 규칙이 같은 값을 낸다.
// 폭·깊이는 하천 등급(Strahler)의 [임시] 표다(기획 질문 126 답 뒤 Step 5 설정값). 실수 계산은 사칙연산·Math.sqrt만 쓴다(명세가 정한 함수).
import { mix32 } from "../generator/random.ts";
import { NEIGHBOR_DI, NEIGHBOR_DJ } from "../generator/grid.ts";
import { WATER_RIVER } from "../tiles/fields.ts";
import { FACES, type Face, wrapFaceIJ } from "../faces.ts";
import { cellsPerSide } from "../levels.ts";
import { type MapCoords, SM_TERRAIN, SM_VERTICES, cubePoint, vertexI, vertexJ } from "./layout.ts";
import { NO_RECEIVER, type PlanetValues } from "./planetValues.ts";

/** 건너는 자리 둘레에서 직선 거리를 쓰는 반지름(꼭짓점 단위) */
export const ZONE_RADIUS = 8;
/** 변 건너는 자리를 변 끝에서 띄우는 거리(꼭짓점) — 꼭짓점 둘레 반지름과 겹치지 않게 */
export const CROSSING_MARGIN = 16;
/** 경계에서 안쪽으로 곧게 들어가는 길이(꼭짓점, ZONE_RADIUS + 최대 반폭보다 길다) */
export const STUB_LENGTH = 12;
/** 흐름을 받기만 하는 칸(호수·바다·마른 분지)에서 물길이 얕아지며 끝나는 길이(꼭짓점) */
export const FADE_LENGTH = 24;

/** [임시] 하천 등급 → 반폭(꼭짓점 = 지형 칸 약 11.7m)·깊이(cm). 등급 5 이상은 마지막 값 */
const CHANNEL_BY_ORDER: readonly { readonly halfWidth: number; readonly depthCm: number }[] = [
  { halfWidth: 0.6, depthCm: 100 },
  { halfWidth: 0.9, depthCm: 150 },
  { halfWidth: 1.4, depthCm: 250 },
  { halfWidth: 2.0, depthCm: 350 },
  { halfWidth: 2.5, depthCm: 500 },
];

export function channelSize(order: number): { readonly halfWidth: number; readonly depthCm: number } {
  const index = Math.min(CHANNEL_BY_ORDER.length, Math.max(1, order)) - 1;
  return CHANNEL_BY_ORDER[index] ?? { halfWidth: 0.6, depthCm: 100 };
}

/** 건너는 자리 둘레: 직선(점 + 방향)까지 거리로 깎는다 */
export interface ChannelZone {
  readonly x: number;
  readonly y: number;
  /** 직선 방향(정수, 축 방향 (1,0)·(0,1) 또는 대각선 (1,±1)) */
  readonly dx: number;
  readonly dy: number;
  readonly order: number;
}

/** 물길 토막(꼭짓점 좌표, x = 열 c, y = 행 r). 깊이는 a에서 b로 이어진다 */
export interface ChannelSegment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly order: number;
  readonly depthA: number;
  readonly depthB: number;
}

export interface RiverLayout {
  readonly zones: readonly ChannelZone[];
  readonly segments: readonly ChannelSegment[];
}

const isRiverCell = (values: PlanetValues, cell: number): boolean =>
  cell >= 0 && ((values.water[cell] ?? 0) & WATER_RIVER) !== 0 && (values.river[cell] ?? 0) > 0;

/** 칸 번호 → 면·i·j */
export function cellFaceIJ(faceLevel: number, cell: number): { face: Face; i: number; j: number } {
  const n = cellsPerSide(faceLevel);
  const faceIndex = Math.floor(cell / (n * n));
  const rest = cell - faceIndex * n * n;
  const j = Math.floor(rest / n);
  return { face: FACES[faceIndex] ?? 0, i: rest - j * n, j };
}

/** 칸 cell이 흘러가는 칸 번호(없으면 −1). 흐름 방향은 그 칸 면 틀의 8이웃 번호다 */
export function receiverOf(values: PlanetValues, cell: number): number {
  const dir = values.receiverDir[cell] ?? NO_RECEIVER;
  if (dir === NO_RECEIVER || dir > 7) return -1;
  const { face, i, j } = cellFaceIJ(values.faceLevel, cell);
  const n = cellsPerSide(values.faceLevel);
  const next = wrapFaceIJ(face, values.faceLevel, i + (NEIGHBOR_DI[dir] ?? 0), j + (NEIGHBOR_DJ[dir] ?? 0));
  return next ? next.face * n * n + next.j * n + next.i : -1;
}

/** a에서 b로 흐르는 강인가(a가 강 칸이고 a의 받는 칸이 b) */
const flowsInto = (values: PlanetValues, a: number, b: number): boolean =>
  a >= 0 && b >= 0 && isRiverCell(values, a) && receiverOf(values, a) === b;

/** 정육면체 점 사전순 비교(a < b면 음수) */
function compareCube(a: readonly number[], b: readonly number[]): number {
  for (let k = 0; k < 3; k++) {
    const d = (a[k] ?? 0) - (b[k] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 이웃 (di, dj)(4이웃 하나)와 나누는 변의 건너는 자리(이 2차맵 꼭짓점 좌표). 두 칸 번호와 변 끝 정육면체 점으로만 정하므로
 * 맞닿은 2차맵도 같은 자리를 낸다.
 */
export function edgeCrossing(
  map: MapCoords,
  me: number,
  other: number,
  di: number,
  dj: number,
  salt: number,
): { x: number; y: number } {
  // 변 끝 꼭짓점 둘(이 2차맵 좌표)
  const ends: [number, number][] =
    di !== 0
      ? [
          [di > 0 ? SM_TERRAIN : 0, 0],
          [di > 0 ? SM_TERRAIN : 0, SM_TERRAIN],
        ]
      : [
          [0, dj > 0 ? 0 : SM_TERRAIN],
          [SM_TERRAIN, dj > 0 ? 0 : SM_TERRAIN],
        ];
  const level = map.faceLevel + 7;
  const cube = ends.map(([x, y]) => cubePoint(map.face, level, vertexI(map, x), vertexJ(map, y)));
  const [startIndex, endIndex] = compareCube(cube[0] ?? [], cube[1] ?? []) <= 0 ? [0, 1] : [1, 0];
  const start = ends[startIndex] ?? [0, 0];
  const end = ends[endIndex] ?? [0, 0];
  const low = Math.min(me, other);
  const high = Math.max(me, other);
  const hash = mix32((mix32((salt ^ low) >>> 0) ^ Math.imul(high, 0x9e3779b1)) >>> 0);
  const span = SM_TERRAIN - 2 * CROSSING_MARGIN + 1;
  const t = CROSSING_MARGIN + (hash % span);
  const sx = Math.sign(end[0] - start[0]);
  const sy = Math.sign(end[1] - start[1]);
  return { x: start[0] + sx * t, y: start[1] + sy * t };
}

/** 칸 안 물길이 모이는 점(칸 번호 해시, 가운데 쪽 40 ~ 88) */
function joinPoint(cell: number, salt: number): { x: number; y: number } {
  const h = mix32((salt ^ Math.imul(cell + 1, 0x85ebca6b)) >>> 0);
  return { x: 40 + (h % 49), y: 40 + ((h >>> 8) % 49) };
}

/** 길이 √(x² + y²) — Math.hypot은 명세가 값을 정하지 않아 쓰지 않는다 */
const distance2d = (x: number, y: number): number => Math.sqrt(x * x + y * y);

/** 2차 베지어(a → 조절점 → b)를 꼭짓점 1 안팎 간격 토막으로 */
function bezierSegments(
  out: ChannelSegment[],
  a: readonly [number, number],
  control: readonly [number, number],
  b: readonly [number, number],
  order: number,
  depth: number,
): void {
  const length =
    distance2d(control[0] - a[0], control[1] - a[1]) + distance2d(b[0] - control[0], b[1] - control[1]);
  const steps = Math.max(2, Math.ceil(length));
  let px = a[0];
  let py = a[1];
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const u = 1 - t;
    const x = u * u * a[0] + 2 * u * t * control[0] + t * t * b[0];
    const y = u * u * a[1] + 2 * u * t * control[1] + t * t * b[1];
    out.push({ ax: px, ay: py, bx: x, by: y, order, depthA: depth, depthB: depth });
    px = x;
    py = y;
  }
}

/**
 * 이 2차맵의 강 배치: 건너는 자리(zones)와 자기 물길 토막(segments).
 * nb는 둘레 3×3 칸 번호(neighbourhood), me = nb[4].
 */
export function riverLayout(values: PlanetValues, map: MapCoords, nb: Int32Array, salt: number): RiverLayout {
  const zones: ChannelZone[] = [];
  const segments: ChannelSegment[] = [];
  const me = nb[4] ?? -1;
  const at = (di: number, dj: number): number => nb[(dj + 1) * 3 + (di + 1)] ?? -1;
  const ownRiver = isRiverCell(values, me);
  const ownOrder = values.river[me] ?? 0;
  /** 이 칸의 들어오는·나가는 자리: 경계 점, 안쪽 방향(정수), 등급 */
  const ends: { x: number; y: number; dx: number; dy: number; order: number; outflow: boolean }[] = [];

  // 4이웃 변: 나에게 흘러들거나 내가 흘러가면 건너는 자리
  for (const [di, dj] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const other = at(di, dj);
    const inflow = flowsInto(values, other, me);
    const outflow = flowsInto(values, me, other);
    if (!inflow && !outflow) continue;
    const crossing = edgeCrossing(map, me, other, di, dj, salt);
    const order = outflow ? ownOrder : (values.river[other] ?? 1);
    // 직선 방향: 변에 수직(열 방향이면 (1, 0), 행 방향이면 (0, 1)). 안쪽 = 이웃 반대쪽(행은 J와 반대)
    const lineX = di !== 0 ? 1 : 0;
    const lineY = di !== 0 ? 0 : 1;
    zones.push({ x: crossing.x, y: crossing.y, dx: lineX, dy: lineY, order });
    ends.push({ x: crossing.x, y: crossing.y, dx: -di, dy: dj, order, outflow });
  }

  // 꼭짓점: 두 대각 짝 (나, 대각 칸)·(옆 칸 둘)의 흐름. 정육면체 꼭짓점(대각 칸 없음)은 건너뛴다
  for (const [di, dj] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const diagonal = at(di, dj);
    if (diagonal < 0) continue;
    const sideA = at(di, 0);
    const sideB = at(0, dj);
    const corner = { x: di > 0 ? SM_TERRAIN : 0, y: dj > 0 ? 0 : SM_TERRAIN };
    const ownIn = flowsInto(values, diagonal, me);
    const ownOut = flowsInto(values, me, diagonal);
    if (ownIn || ownOut) {
      const order = ownOut ? ownOrder : (values.river[diagonal] ?? 1);
      // 나 ↔ 대각 칸 직선: 면 (I, J) 방향 (di, dj) → 2차맵 (열, 행) 방향 (di, −dj)
      zones.push({ x: corner.x, y: corner.y, dx: di, dy: -dj, order });
      ends.push({ x: corner.x, y: corner.y, dx: -di, dy: dj, order, outflow: ownOut });
    }
    const crossAB = flowsInto(values, sideA, sideB);
    const crossBA = flowsInto(values, sideB, sideA);
    if (crossAB || crossBA) {
      const order = values.river[crossAB ? sideA : sideB] ?? 1;
      // 옆 칸 둘을 잇는 직선: 면 방향 (−di, dj) → 2차맵 (−di, −dj)
      zones.push({ x: corner.x, y: corner.y, dx: -di, dy: -dj, order });
    }
  }

  // 자기 물길: 들어오는 자리마다 → 모이는 점 → 나가는 자리. 강 칸이 아니면(호수·바다 등) 들어오는 토막만 얕아지며 끝난다
  const join = joinPoint(me, salt);
  for (const end of ends) {
    const { depthCm } = channelSize(end.order);
    const norm = distance2d(end.dx, end.dy);
    const ux = end.dx / norm;
    const uy = end.dy / norm;
    const stubEnd: [number, number] = [end.x + ux * STUB_LENGTH, end.y + uy * STUB_LENGTH];
    if (!ownRiver && !end.outflow) {
      // 받기만 하는 칸: 곧게 STUB_LENGTH 들어간 뒤 FADE_LENGTH까지 얕아진다
      segments.push({
        ax: end.x,
        ay: end.y,
        bx: stubEnd[0],
        by: stubEnd[1],
        order: end.order,
        depthA: depthCm,
        depthB: depthCm,
      });
      segments.push({
        ax: stubEnd[0],
        ay: stubEnd[1],
        bx: end.x + ux * FADE_LENGTH,
        by: end.y + uy * FADE_LENGTH,
        order: end.order,
        depthA: depthCm,
        depthB: 0,
      });
      continue;
    }
    segments.push({
      ax: end.x,
      ay: end.y,
      bx: stubEnd[0],
      by: stubEnd[1],
      order: end.order,
      depthA: depthCm,
      depthB: depthCm,
    });
    const control: [number, number] = [stubEnd[0] + ux * 16, stubEnd[1] + uy * 16];
    bezierSegments(segments, stubEnd, control, [join.x, join.y], end.order, depthCm);
  }
  // 샘(들어오는 물 없이 시작하는 강 칸)은 모이는 점에서 시작한다 — 나가는 토막만 있다(위 반복에 포함)
  return { zones, segments };
}

/** 물길 단면: 반폭 안에서 포물선(가운데 깊이 1, 반폭에서 0) */
function profile(distance: number, halfWidth: number): number {
  if (distance >= halfWidth) return 0;
  const q = distance / halfWidth;
  return 1 - q * q;
}

export interface ChannelRaster {
  /** 꼭짓점마다 깎는 깊이(cm, 0 = 물길 아님) */
  readonly carveCm: Int32Array;
  /** 꼭짓점마다 물길 등급(0 = 아님) — 가장 깊게 깎은 물길의 등급 */
  readonly order: Uint8Array;
}

/**
 * 강 배치 → 꼭짓점 129²마다 깎는 깊이. 건너는 자리 반지름 안의 꼭짓점은 직선 거리만 쓴다(이음매). 그 밖은 물길 토막 거리.
 */
export function rasterizeChannels(layout: RiverLayout): ChannelRaster {
  const count = SM_VERTICES * SM_VERTICES;
  const carveCm = new Int32Array(count);
  const order = new Uint8Array(count);
  const inZone = new Uint8Array(count);
  const apply = (index: number, depth: number, channelOrder: number): void => {
    if (depth > (carveCm[index] ?? 0)) {
      carveCm[index] = depth;
      order[index] = Math.min(255, channelOrder);
    }
  };
  const r2 = ZONE_RADIUS * ZONE_RADIUS;
  for (const zone of layout.zones) {
    const { halfWidth, depthCm } = channelSize(zone.order);
    const diagonal = zone.dx !== 0 && zone.dy !== 0;
    for (let y = Math.max(0, zone.y - ZONE_RADIUS); y <= Math.min(SM_TERRAIN, zone.y + ZONE_RADIUS); y++) {
      for (let x = Math.max(0, zone.x - ZONE_RADIUS); x <= Math.min(SM_TERRAIN, zone.x + ZONE_RADIUS); x++) {
        const ox = x - zone.x;
        const oy = y - zone.y;
        if (ox * ox + oy * oy > r2) continue;
        const index = y * SM_VERTICES + x;
        inZone[index] = 1;
        // 직선까지 거리: 축 방향이면 |수직 차|, 대각선이면 |외적| ÷ √2 (정수 차이라 면 틀과 상관없이 같다)
        const cross = Math.abs(ox * zone.dy - oy * zone.dx);
        const distance = diagonal ? cross / Math.SQRT2 : cross;
        const depth = Math.floor(depthCm * profile(distance, halfWidth));
        if (depth > 0) apply(index, depth, zone.order);
      }
    }
  }
  for (const segment of layout.segments) {
    const { halfWidth } = channelSize(segment.order);
    const minX = Math.max(0, Math.floor(Math.min(segment.ax, segment.bx) - halfWidth));
    const maxX = Math.min(SM_TERRAIN, Math.ceil(Math.max(segment.ax, segment.bx) + halfWidth));
    const minY = Math.max(0, Math.floor(Math.min(segment.ay, segment.by) - halfWidth));
    const maxY = Math.min(SM_TERRAIN, Math.ceil(Math.max(segment.ay, segment.by) + halfWidth));
    const sx = segment.bx - segment.ax;
    const sy = segment.by - segment.ay;
    const length2 = sx * sx + sy * sy;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const index = y * SM_VERTICES + x;
        if (inZone[index]) continue;
        const t =
          length2 > 0
            ? Math.min(1, Math.max(0, ((x - segment.ax) * sx + (y - segment.ay) * sy) / length2))
            : 0;
        const px = segment.ax + sx * t - x;
        const py = segment.ay + sy * t - y;
        const depthHere = segment.depthA + (segment.depthB - segment.depthA) * t;
        const depth = Math.floor(depthHere * profile(Math.sqrt(px * px + py * py), halfWidth));
        if (depth > 0) apply(index, depth, segment.order);
      }
    }
  }
  return { carveCm, order };
}
