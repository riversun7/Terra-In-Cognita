// 셰이더 측정용 가짜 행성 — S2 행성 LOD 렌더러와 같은 모양의 일(ADR 2026-10-29-s2-planet-lod "렌더러").
// - 타일 하나 = 32×32칸: 꼭짓점 33×33 + 치마(가장자리를 아래로 내린 띠) 4×33. 꼭짓점 색(바이옴)과 법선(조명용).
// - 카메라 기준 좌표: 타일마다 원점(행성 중심 기준 m, 실수 64비트)을 두고, 꼭짓점은 원점 기준 32비트로 둔다.
// - 쿼드트리 LOD처럼 초점 가까운 타일을 잘게 나눈다. 크기가 다른 타일이 섞이고, 그 경계를 치마가 막는다.
// three를 가져오지 않는다(배열만 만든다). 방식마다 이 배열로 자기 three 장면을 만든다(gpuBenchScene.ts).
// 판정 코드가 아니라 화면 측정용이라 Math.tan·sin을 쓴다(AGENTS.md 4장의 금지는 판정 코드에만 해당).

/** 타일 한 변의 칸 수(ADR 36: 타일 = 그 맵 레벨의 32×32칸) */
export const TILE_CELLS = 32;
/** 타일 한 변의 꼭짓점 수 */
export const TILE_GRID = TILE_CELLS + 1;
/** 격자 꼭짓점 수(33×33) */
export const GRID_VERTEX_COUNT = TILE_GRID * TILE_GRID;
/** 타일 꼭짓점 수: 격자 + 치마 4변 */
export const TILE_VERTEX_COUNT = GRID_VERTEX_COUNT + 4 * TILE_GRID;
/** 타일 삼각형 수: 격자 32×32×2 + 치마 4×32×2 */
export const TILE_TRIANGLE_COUNT = TILE_CELLS * TILE_CELLS * 2 + 4 * TILE_CELLS * 2;
/** 타일 하나의 인덱스 수 */
export const TILE_INDEX_COUNT = TILE_TRIANGLE_COUNT * 3;
/** 행성 반지름(m) — 지구 크기 면 레벨 9(PLAN 5.2) */
export const PLANET_RADIUS_M = 531_000;
/** 화면에서 과장한 높낮이(m). 진짜 고도(1:12)로는 1차맵에서 거의 안 보인다(ADR 36 "고도 축척") */
export const RELIEF_M = 14_000;
/** 쿼드트리 가장 깊은 단계(ADR 36: 1차맵 5단계 = 깊이 0~4) */
export const MAX_TILE_LEVEL = 4;
/**
 * 카메라 거리(반지름 배수). 가까우면 땅이 화면을 꽉 채우고(채우기 비용), 멀면 행성 거의 전체가 보여
 * 작은 삼각형이 많이 화면에 든다(래스터 비용). 재는 6초 안에 한 번 가까워졌다 멀어진다.
 */
export const CAMERA_DISTANCE_MIN = 1.75;
export const CAMERA_DISTANCE_MAX = 4.25;
/** 카메라가 초점을 한 바퀴 도는 시간·가까워졌다 멀어지는 주기(초) */
const ORBIT_PERIOD_S = 12;
const ZOOM_PERIOD_S = 6;
/** 카메라가 초점 축에서 기운 각도 */
const CAMERA_TILT_RAD = (18 * Math.PI) / 180;
/** 치마 깊이 상한(m) — 높낮이 과장(RELIEF_M)보다 조금 크게 */
const SKIRT_MAX_M = 20_000;

export type Vec3 = readonly [number, number, number];

function normalize(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** 카메라가 바라보는 초점(행성 위 방향, 길이 1) */
export const BENCH_FOCUS: Vec3 = normalize(0.42, 0.38, 0.82);
/** 초점에 수직인 두 축 — 카메라가 이 평면에서 돈다 */
const AXIS_A: Vec3 = normalize(...cross([0, 1, 0], BENCH_FOCUS));
const AXIS_B: Vec3 = cross(BENCH_FOCUS, AXIS_A);
/** 햇빛 방향(세계 좌표, 빛이 오는 쪽). 카메라 쪽에서 비스듬히 온다 */
export const BENCH_LIGHT: Vec3 = normalize(
  BENCH_FOCUS[0] + 0.55 * AXIS_A[0] + 0.35 * AXIS_B[0],
  BENCH_FOCUS[1] + 0.55 * AXIS_A[1] + 0.35 * AXIS_B[1],
  BENCH_FOCUS[2] + 0.55 * AXIS_A[2] + 0.35 * AXIS_B[2],
);

/**
 * 정육면체 면 6개: 바깥 방향 n, 면 위 두 축 u·v(u × v = n이라 바깥에서 보면 반시계 방향).
 * 측정용이라 `@terra/planet`의 면 배치와 같을 필요는 없다.
 */
const FACES: readonly { n: Vec3; u: Vec3; v: Vec3 }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

/** 쿼드트리 타일: 면, 단계(0 = 면 전체), 그 단계의 열·행 */
export interface TileKey {
  face: number;
  level: number;
  x: number;
  y: number;
}

/** 면 좌표(s, t ∈ [-1, 1]) → 구 위 방향. 탄젠트로 펴서 칸 크기 차이를 줄인다 */
function faceDirection(face: number, s: number, t: number): [number, number, number] {
  const { n, u, v } = FACES[face] ?? FACES[0]!;
  const ws = Math.tan((s * Math.PI) / 4);
  const wt = Math.tan((t * Math.PI) / 4);
  return normalize(n[0] + ws * u[0] + wt * v[0], n[1] + ws * u[1] + wt * v[1], n[2] + ws * u[2] + wt * v[2]);
}

/** 타일 모서리의 면 좌표 범위 */
function tileBounds(tile: TileKey): { s0: number; t0: number; size: number } {
  const size = 2 / 2 ** tile.level;
  return { s0: -1 + tile.x * size, t0: -1 + tile.y * size, size };
}

function tileCenter(tile: TileKey): [number, number, number] {
  const { s0, t0, size } = tileBounds(tile);
  return faceDirection(tile.face, s0 + size / 2, t0 + size / 2);
}

/**
 * 나눌 순서(클수록 먼저): 타일 크기 ÷ 카메라(초점 쪽, 반지름 2배)까지 거리 — 화면 오차와 비슷한 값.
 * 지평선 뒤(초점에서 약 60° 넘게)는 거의 나누지 않는다.
 */
function splitPriority(tile: TileKey): number {
  const center = tileCenter(tile);
  const cosAngle = center[0] * BENCH_FOCUS[0] + center[1] * BENCH_FOCUS[1] + center[2] * BENCH_FOCUS[2];
  const angle = Math.acos(Math.min(1, Math.max(-1, cosAngle)));
  // 타일 대각선 반(라디안, 대략) — 타일 한쪽 끝이 보이면 보이는 타일로 친다
  const halfExtent = (Math.PI / 4) * 2 ** -tile.level * Math.SQRT2;
  const nearest = Math.max(0, angle - halfExtent);
  const distance = Math.sqrt(5 - 4 * Math.cos(nearest));
  const visible = nearest < Math.PI / 3;
  return (2 ** -tile.level / distance) * (visible ? 1 : 0.05);
}

/** 같은 값이면 면·단계·행·열 순서(늘 같은 결과) */
function compareTiles(a: { key: TileKey; priority: number }, b: { key: TileKey; priority: number }): number {
  return (
    b.priority - a.priority ||
    a.key.face - b.key.face ||
    a.key.level - b.key.level ||
    a.key.y - b.key.y ||
    a.key.x - b.key.x
  );
}

/**
 * 타일을 정확히 target개 고른다. 면 6개에서 시작해 화면 오차가 큰 타일부터 4개로 나눈다(나눌 때마다 +3개).
 * 넘친 1~2개는 가장 덜 중요한 타일(지평선 뒤)을 뺀다 — 카메라에서 안 보이는 곳이라 구멍이 보이지 않는다.
 */
export function selectTiles(target: number, _focus: Vec3 = BENCH_FOCUS): TileKey[] {
  if (!Number.isInteger(target) || target < FACES.length) {
    throw new RangeError(`타일은 ${FACES.length}개 이상 정수여야 합니다: ${target}`);
  }
  const leaves = FACES.map((_, face) => {
    const key = { face, level: 0, x: 0, y: 0 };
    return { key, priority: splitPriority(key) };
  });
  while (leaves.length < target) {
    let best = -1;
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i]!;
      if (leaf.key.level >= MAX_TILE_LEVEL) continue;
      if (best < 0 || compareTiles(leaf, leaves[best]!) < 0) best = i;
    }
    if (best < 0) throw new RangeError(`타일 ${target}개는 쿼드트리 깊이 ${MAX_TILE_LEVEL}로 못 만듭니다`);
    const parent = leaves[best]!.key;
    const children = [0, 1, 2, 3].map((corner) => {
      const key = {
        face: parent.face,
        level: parent.level + 1,
        x: parent.x * 2 + (corner & 1),
        y: parent.y * 2 + (corner >> 1),
      };
      return { key, priority: splitPriority(key) };
    });
    leaves.splice(best, 1, ...children);
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 배열이라 원본을 바꿔도 된다
  leaves.sort(compareTiles);
  return leaves.slice(0, target).map((leaf) => leaf.key);
}

/** 정수 격자 해시 → [0, 1) */
function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4_294_967_296;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 3D 값 노이즈 [0, 1] — 격자점 값을 부드럽게 섞는다 */
function valueNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const plane = (zz: number): number =>
    lerp(
      lerp(hash3(ix, iy, zz), hash3(ix + 1, iy, zz), ux),
      lerp(hash3(ix, iy + 1, zz), hash3(ix + 1, iy + 1, zz), ux),
      uy,
    );
  return lerp(plane(iz), plane(iz + 1), uz);
}

/** 여러 크기 노이즈를 겹친 값 [0, 1] */
function fbm(x: number, y: number, z: number, octaves: number): number {
  let sum = 0;
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave++) {
    const shift = octave * 17.13;
    sum += amplitude * valueNoise(x * frequency + shift, y * frequency - shift, z * frequency + shift * 0.5);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / total;
}

/** 높이(-1 바다 깊은 곳 ~ 0 해안 ~ 1 높은 산) */
function elevation(x: number, y: number, z: number): number {
  const value = (fbm(x * 1.7 + 11.3, y * 1.7 - 4.1, z * 1.7 + 2.9, 5) - 0.47) * 3.2;
  return Math.min(1, Math.max(-1, value));
}

/** 바이옴 색(0~1, 색 관리 없이 그대로 쓴다). 표는 측정용 임시 값이다(기획 바이옴 목록과 무관) */
function biomeColor(height: number, moisture: number, latitude: number, out: Float32Array, at: number): void {
  let r: number;
  let g: number;
  let b: number;
  if (height < 0) {
    // 물속 땅 — 바다 구에 거의 가려진다
    const shallow = 1 + height;
    r = 0.05 + 0.11 * shallow;
    g = 0.12 + 0.2 * shallow;
    b = 0.25 + 0.2 * shallow;
  } else if (height < 0.035) {
    [r, g, b] = [0.83, 0.78, 0.56];
  } else if (height > 0.62 || latitude > 0.86) {
    [r, g, b] = [0.93, 0.95, 0.97];
  } else if (height > 0.42) {
    [r, g, b] = [0.5, 0.47, 0.44];
  } else if (latitude > 0.68) {
    [r, g, b] = [0.56, 0.6, 0.5];
  } else if (moisture > 0.56) {
    [r, g, b] = [0.17, 0.42, 0.19];
  } else if (moisture < 0.4 && latitude < 0.45) {
    [r, g, b] = [0.8, 0.69, 0.43];
  } else {
    [r, g, b] = [0.42, 0.63, 0.29];
  }
  out[at] = r;
  out[at + 1] = g;
  out[at + 2] = b;
}

/** 타일 하나: 원점(실수 64비트)과 원점 기준 꼭짓점 배열 */
export interface BenchTile extends TileKey {
  /** 원점 = 타일 가운데의 해수면 위 점(행성 중심 기준 m) */
  originX: number;
  originY: number;
  originZ: number;
  /** 원점 기준 위치(m) xyz × TILE_VERTEX_COUNT */
  positions: Float32Array;
  /** 법선(길이 1) */
  normals: Float32Array;
  /** 꼭짓점 색 rgb 0~1 */
  colors: Float32Array;
}

export interface BenchWorkload {
  tiles: BenchTile[];
  /** 모든 타일이 함께 쓰는 인덱스(격자 + 치마) */
  index: Uint16Array;
  triangleCount: number;
  /** 꼭짓점·인덱스 배열 바이트 합(GPU에 올라가는 크기와 거의 같다) */
  geometryBytes: number;
}

/** 격자 꼭짓점 번호 */
const gridIndex = (i: number, j: number): number => j * TILE_GRID + i;

/** 가장자리 4변을 반시계 방향으로 돈 격자 꼭짓점 번호(변마다 33개): 아래 → 오른쪽 → 위 → 왼쪽 */
function edgeLoop(): number[][] {
  const last = TILE_CELLS;
  const range = Array.from({ length: TILE_GRID }, (_, k) => k);
  return [
    range.map((k) => gridIndex(k, 0)),
    range.map((k) => gridIndex(last, k)),
    range.map((k) => gridIndex(last - k, last)),
    range.map((k) => gridIndex(0, last - k)),
  ];
}

const EDGES = edgeLoop();

/** 모든 타일이 함께 쓰는 인덱스 — 바깥에서 보면 반시계 방향(앞면) */
function buildIndex(): Uint16Array {
  const index = new Uint16Array(TILE_INDEX_COUNT);
  let at = 0;
  for (let j = 0; j < TILE_CELLS; j++) {
    for (let i = 0; i < TILE_CELLS; i++) {
      const a = gridIndex(i, j);
      const b = a + 1;
      const c = a + TILE_GRID + 1;
      const d = a + TILE_GRID;
      index.set([a, b, c, a, c, d], at);
      at += 6;
    }
  }
  // 치마: 가장자리 꼭짓점 g와 그 아래 꼭짓점 s를 잇는 띠. 바깥(타일 밖)을 본다
  EDGES.forEach((edge, side) => {
    const skirtStart = GRID_VERTEX_COUNT + side * TILE_GRID;
    for (let k = 0; k < TILE_CELLS; k++) {
      const g0 = edge[k]!;
      const g1 = edge[k + 1]!;
      const s0 = skirtStart + k;
      const s1 = s0 + 1;
      index.set([s0, s1, g1, s0, g1, g0], at);
      at += 6;
    }
  });
  return index;
}

/** 타일 하나의 꼭짓점 배열을 만든다 */
function buildTile(key: TileKey): BenchTile {
  const { s0, t0, size } = tileBounds(key);
  const center = tileCenter(key);
  const originX = center[0] * PLANET_RADIUS_M;
  const originY = center[1] * PLANET_RADIUS_M;
  const originZ = center[2] * PLANET_RADIUS_M;
  // 법선을 구하려고 먼저 절대 좌표(실수 64비트)로 둔다
  const absolute = new Float64Array(GRID_VERTEX_COUNT * 3);
  const positions = new Float32Array(TILE_VERTEX_COUNT * 3);
  const normals = new Float32Array(TILE_VERTEX_COUNT * 3);
  const colors = new Float32Array(TILE_VERTEX_COUNT * 3);
  const heightsM = new Float64Array(GRID_VERTEX_COUNT);
  for (let j = 0; j < TILE_GRID; j++) {
    for (let i = 0; i < TILE_GRID; i++) {
      const v = gridIndex(i, j);
      const [dx, dy, dz] = faceDirection(
        key.face,
        s0 + (size * i) / TILE_CELLS,
        t0 + (size * j) / TILE_CELLS,
      );
      const height = elevation(dx, dy, dz);
      const moisture = fbm(dx * 2.3 - 7.7, dy * 2.3 + 3.1, dz * 2.3 + 5.3, 3);
      const heightM = height * RELIEF_M * (height < 0 ? 0.6 : 1);
      const radius = PLANET_RADIUS_M + heightM;
      heightsM[v] = heightM;
      absolute[v * 3] = dx * radius;
      absolute[v * 3 + 1] = dy * radius;
      absolute[v * 3 + 2] = dz * radius;
      biomeColor(height, moisture, Math.abs(dy), colors, v * 3);
    }
  }
  // 법선: 이웃 꼭짓점 차이의 외적(u 방향 × v 방향 = 바깥)
  const read = (i: number, j: number, axis: number): number => absolute[gridIndex(i, j) * 3 + axis] ?? 0;
  for (let j = 0; j < TILE_GRID; j++) {
    for (let i = 0; i < TILE_GRID; i++) {
      const iPrev = Math.max(0, i - 1);
      const iNext = Math.min(TILE_CELLS, i + 1);
      const jPrev = Math.max(0, j - 1);
      const jNext = Math.min(TILE_CELLS, j + 1);
      const du: Vec3 = [
        read(iNext, j, 0) - read(iPrev, j, 0),
        read(iNext, j, 1) - read(iPrev, j, 1),
        read(iNext, j, 2) - read(iPrev, j, 2),
      ];
      const dv: Vec3 = [
        read(i, jNext, 0) - read(i, jPrev, 0),
        read(i, jNext, 1) - read(i, jPrev, 1),
        read(i, jNext, 2) - read(i, jPrev, 2),
      ];
      const [nx, ny, nz] = normalize(...cross(du, dv));
      const v = gridIndex(i, j);
      normals.set([nx, ny, nz], v * 3);
      positions.set(
        [
          (absolute[v * 3] ?? 0) - originX,
          (absolute[v * 3 + 1] ?? 0) - originY,
          (absolute[v * 3 + 2] ?? 0) - originZ,
        ],
        v * 3,
      );
    }
  }
  // 치마: 가장자리 꼭짓점을 행성 중심 쪽으로 내린다. 깊이는 타일 크기에 맞춘다(큰 타일일수록 이웃과 높이 차이가 크다)
  const tileWidthM = PLANET_RADIUS_M * (Math.PI / 2) * 2 ** -key.level;
  const skirtM = Math.min(SKIRT_MAX_M, Math.max(1_500, tileWidthM * 0.06));
  EDGES.forEach((edge, side) => {
    edge.forEach((g, k) => {
      const s = GRID_VERTEX_COUNT + side * TILE_GRID + k;
      const ax = absolute[g * 3] ?? 0;
      const ay = absolute[g * 3 + 1] ?? 0;
      const az = absolute[g * 3 + 2] ?? 0;
      const radius = PLANET_RADIUS_M + (heightsM[g] ?? 0);
      const scale = (radius - skirtM) / radius;
      positions.set([ax * scale - originX, ay * scale - originY, az * scale - originZ], s * 3);
      normals.copyWithin(s * 3, g * 3, g * 3 + 3);
      colors.copyWithin(s * 3, g * 3, g * 3 + 3);
    });
  });
  return { ...key, originX, originY, originZ, positions, normals, colors };
}

/** 측정 자료: 타일 target개(정확히) + 공용 인덱스. 같은 target이면 늘 같은 자료다 */
export function buildWorkload(target: number): BenchWorkload {
  const tiles = selectTiles(target).map(buildTile);
  const index = buildIndex();
  const vertexBytes = TILE_VERTEX_COUNT * 3 * 4 * 3;
  return {
    tiles,
    index,
    triangleCount: tiles.length * TILE_TRIANGLE_COUNT,
    geometryBytes: tiles.length * vertexBytes + index.byteLength,
  };
}

/** 카메라 자리(행성 중심 기준 m)와 깊이 범위 */
export interface CameraPose {
  x: number;
  y: number;
  z: number;
  near: number;
  far: number;
}

/**
 * timeSec초의 카메라: 초점 축에서 18° 기울어 12초에 한 바퀴 돌고, 6초 주기로 가까워졌다 멀어진다.
 * 늘 행성 중심을 본다. 초점 둘레(잘게 나눈 타일)가 화면 가운데에 온다.
 */
export function cameraPose(timeSec: number): CameraPose {
  const phase = (2 * Math.PI * timeSec) / ORBIT_PERIOD_S;
  const zoom = (2 * Math.PI * timeSec) / ZOOM_PERIOD_S;
  const middle = (CAMERA_DISTANCE_MIN + CAMERA_DISTANCE_MAX) / 2;
  const swing = (CAMERA_DISTANCE_MAX - CAMERA_DISTANCE_MIN) / 2;
  const distance = PLANET_RADIUS_M * (middle + swing * Math.sin(zoom));
  const tiltCos = Math.cos(CAMERA_TILT_RAD);
  const tiltSin = Math.sin(CAMERA_TILT_RAD);
  const around = (axis: number): number =>
    tiltCos * (BENCH_FOCUS[axis] ?? 0) +
    tiltSin * (Math.cos(phase) * (AXIS_A[axis] ?? 0) + Math.sin(phase) * (AXIS_B[axis] ?? 0));
  const [dx, dy, dz] = normalize(around(0), around(1), around(2));
  const surfaceGap = distance - PLANET_RADIUS_M - RELIEF_M;
  return {
    x: dx * distance,
    y: dy * distance,
    z: dz * distance,
    near: Math.max(1_000, surfaceGap * 0.5),
    far: distance + PLANET_RADIUS_M,
  };
}
