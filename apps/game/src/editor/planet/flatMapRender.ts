// 편집기 평면 미니맵 그리기(순수 함수) — ADR 2026-10-29-planet-editor-stage1(38) "평면 미니맵"(사용자 D1).
// 미리보기 결과(칸 배열)를 등장방형 그림으로 칠한다: 가로 = 경도 −180° → 180°, 세로 = 위도 90° → −90°.
// - 픽셀 → 칸 번호 표: 픽셀 중심의 위도·경도 → 방향(엔진 globeCamera.ts directionOfLatLon과 같은 식) → 면·(u, v)
//   (xyzToFaceUV와 같은 규칙) → 칸 (i, j)(uvToST). @terra/planet/projection의 xyzToCell과 같은 계산이다(시험이 모든 픽셀로 본다).
//   칸 번호 = 면 × n² + j × n + i (생성기 출력 배열 순서, @terra/planet tiles/fields.ts).
// - 누른 점은 그 픽셀 중심의 위도·경도다(flatMapPointAt). 칸 정보창은 그 점으로 칸을 따로 찾는다(같은 길: 엔진 방향 식 → xyzToCell).
//   그래서 누른 픽셀에 칠한 칸이 정보창의 칸이다. 위도·경도 → 칸 함수는 칸 정보창 쪽 하나만 둔다(여기에는 표만 있다).
// - 표 만들기(삼각함수·uvToST)는 픽셀마다 같은 일이라 시간이 면 레벨과 상관없다. 그래서 크기마다 기준 표(한 변 2^14칸) 하나만
//   그렇게 만들고, 면 레벨 F 표는 i, j를 (14 − F)비트 밀어 끌어낸다(FlatMapLookupCache). 바로 만든 표와 비트까지 같다(시험).
// - 칠하기(결과마다): 픽셀마다 그 칸의 바이옴 색(행성 설명과 같은 바이옴 번호별 0xRRGGBB 표) × 고도 음영.
//   땅만 높을수록 밝게 한다. 바다·호수는 바이옴 색 그대로다(지구본도 수면을 평평하게 그리고 수심은 등급 색으로만 보인다.
//   바다 밑 높이까지 칠해 보니 넓은 바다의 수심 기울기가 땅·바이옴 무늬보다 눈에 띄었다 — 작업 기록 참고).
//   음영 눈금은 실제 환산 m로 고정한다(결과마다 바꾸지 않는다: 공개본 ↔ 초안을 번갈아 볼 때 같은 높이가 같은 밝기여야 한다).
//   계수는 백분율 정수 단계(86~118%)라 색표(바이옴 × 단계)를 미리 만들어 두고 픽셀마다 한 번 읽는다.
// - 그림은 픽셀 중심 표본이다. 칸이 픽셀보다 작은 곳에는 칠해지지 않는 칸이 있다(한 번이라도 칠해지는 칸: 538×269에서
//   F7 96%·F8 31%·F9 8.5%, 960×480에서 F8 85%·F9 25%). 한두 칸짜리 호수·좁은 바이옴 띠는 안 보이거나 F8 ↔ F9에서 자리가
//   바뀔 수 있다. 면적은 면적표가 기준이다.
// - 그림 크기: CSS 폭 × 픽셀 비율(상한: 휴대폰 1.5, 그 밖 2 — 엔진 1차맵과 같은 PLAN 5.7 "1.5~2"), 폭 상한 1,024점.
//   높이 = 폭 ÷ 2라 픽셀이 정사각(같은 각도)이다.
// DOM을 쓰지 않는다. 그림 버퍼는 ImageData 모양({ width, height, data })만 받는다.
import {
  FACE_FRAMES,
  WATER_LAKE,
  WATER_OCEAN,
  cellsPerSide,
  isFaceLevel,
  planetCellCount,
} from "@terra/planet";
import type { PlanetFields } from "@terra/planet";
import { VERTICAL_SCALE } from "@terra/planet/generator";
import { uvToST } from "@terra/planet/projection";

/** 위도·경도(°) */
export interface LatLon {
  readonly latDeg: number;
  readonly lonDeg: number;
}

/** 그림 크기(점) */
export interface FlatMapSize {
  readonly width: number;
  readonly height: number;
}

/** 픽셀 → 칸 번호 표 */
export interface FlatMapLookup extends FlatMapSize {
  readonly faceLevel: number;
  /** 픽셀(y × width + x)마다 칸 번호(면 × n² + j × n + i) */
  readonly cells: Int32Array;
}

/** 칠하는 데 쓰는 결과 값(생성기 출력 PlanetFields의 일부) */
export interface FlatMapFields {
  readonly biome: PlanetFields["biome"];
  readonly elevationM: PlanetFields["elevationM"];
  readonly water: PlanetFields["water"];
  readonly meta: { readonly faceLevel: number };
}

/** 칠할 그림 버퍼(ImageData와 같은 모양, RGBA 순서) */
export interface FlatMapImage extends FlatMapSize {
  readonly data: Uint8ClampedArray;
}

/** 바이옴 × 음영 단계 색표(그림 버퍼에 그대로 쓰는 32비트 값) */
export interface FlatMapPalette {
  readonly colors: Uint32Array;
}

/** 키보드로 옮기는 방향 */
export type FlatMapDirection = "left" | "right" | "up" | "down";

/** 픽셀 비율 상한(엔진 1차맵 render/sharedRenderer.ts defaultMaxPixelRatio와 같은 규칙, PLAN 5.7 "1.5~2") */
export const FLAT_MAP_MAX_PIXEL_RATIO = 2;
/** 휴대폰(굵은 포인터, 짧은 변 600px 이하)의 픽셀 비율 상한 */
export const FLAT_MAP_PHONE_PIXEL_RATIO = 1.5;
/** 휴대폰으로 보는 화면 짧은 변(CSS px) 상한 */
const PHONE_SHORT_SIDE = 600;
/**
 * 그림 폭 상한(점). 1,024 × 512 = 약 52만 점: 칸 번호 표 하나 2MiB(Int32) — 부품은 레벨 표 3개 + 기준 표 1개를 기억한다 —
 * + 그림 버퍼 2MiB
 */
export const FLAT_MAP_MAX_WIDTH = 1024;
/** 그림 폭 하한(점) */
const MIN_WIDTH = 2;
/** 색표에 없는 바이옴 번호의 색(엔진 1차맵 planetMaterials.ts의 "모르는 바이옴"과 같은 회색) */
export const FLAT_MAP_UNKNOWN_COLOR = 0xc8c8c8;
/** 키보드 큰 걸음(Shift) = 작은 걸음 × 이 값 */
export const FLAT_MAP_LARGE_STEP = 8;

// ── 음영 ──
/** 땅: 해수면 86% → 높이 실제 환산 LAND_FULL_REAL_M 이상 118%. 제곱근 곡선(낮은 언덕도 보이게) */
const LAND_LOW_PERCENT = 86;
const LAND_HIGH_PERCENT = 118;
const LAND_FULL_REAL_M = 6000;
/** 음영 계수의 단계: 계수 = (SHADE_MIN_PERCENT + 단계) ÷ 100, 단계 0 ~ SHADE_STEPS − 1 (86% ~ 118%) */
const SHADE_MIN_PERCENT = LAND_LOW_PERCENT;
const SHADE_STEPS = LAND_HIGH_PERCENT - LAND_LOW_PERCENT + 1;
/** 계수 100%(그대로)인 단계 — 바다·호수 */
const NEUTRAL_STEP = 100 - SHADE_MIN_PERCENT;
/** 음영 눈금(게임 m = 실제 환산 m ÷ 12) */
const LAND_FULL_M = Math.round(LAND_FULL_REAL_M / VERTICAL_SCALE);

/** 땅 높이(게임 m, 0 ~ LAND_FULL_M) → 단계 */
const LAND_STEPS = Uint8Array.from({ length: LAND_FULL_M + 1 }, (_, height) =>
  Math.round((LAND_HIGH_PERCENT - LAND_LOW_PERCENT) * Math.sqrt(height / LAND_FULL_M)),
);

/** 고도(게임 m)·물 비트 → 음영 단계. 바다·호수는 그대로 */
function shadeStep(elevationM: number, water: number): number {
  if ((water & (WATER_OCEAN | WATER_LAKE)) !== 0) return NEUTRAL_STEP;
  return (
    LAND_STEPS[elevationM <= 0 ? 0 : elevationM >= LAND_FULL_M ? LAND_FULL_M : elevationM] ?? NEUTRAL_STEP
  );
}

/** 고도(게임 m)·물 비트의 음영 계수(0.86 ~ 1.18). 칠하기가 쓰는 값과 같다(범례·시험용) */
export function flatMapShade(elevationM: number, water: number): number {
  return (SHADE_MIN_PERCENT + shadeStep(Math.round(elevationM), water)) / 100;
}

/** 음영 계수의 범위 */
export const FLAT_MAP_SHADE_RANGE = {
  min: SHADE_MIN_PERCENT / 100,
  max: (SHADE_MIN_PERCENT + SHADE_STEPS - 1) / 100,
} as const;

// ── 색표 ──
/** 이 기기의 바이트 순서: 그림 버퍼(RGBA 바이트)를 32비트로 한 번에 쓰려고 본다 */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function packRgba(r: number, g: number, b: number): number {
  return LITTLE_ENDIAN
    ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
}

function isColor(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 0xffffff;
}

/** 색 성분(0~255) × 계수(백분율) — 255에서 멈춘다 */
function shadeChannel(channel: number, percent: number): number {
  return Math.min(255, Math.round((channel * percent) / 100));
}

/**
 * 바이옴 번호별 색(0xRRGGBB, 엔진 행성 설명 biomeColors와 같은 표) → 바이옴 256개 × 음영 단계 색표.
 * 없거나 틀린 번호는 회색(FLAT_MAP_UNKNOWN_COLOR). 색표가 바뀔 때만 다시 만든다(약 8,400칸 = 256 × 33)
 */
export function createFlatMapPalette(biomeColors: readonly number[]): FlatMapPalette {
  const colors = new Uint32Array(256 * SHADE_STEPS);
  for (let biome = 0; biome < 256; biome++) {
    const given = biomeColors[biome];
    const color = isColor(given) ? given : FLAT_MAP_UNKNOWN_COLOR;
    const r = color >> 16;
    const g = (color >> 8) & 255;
    const b = color & 255;
    for (let step = 0; step < SHADE_STEPS; step++) {
      const percent = SHADE_MIN_PERCENT + step;
      colors[biome * SHADE_STEPS + step] = packRgba(
        shadeChannel(r, percent),
        shadeChannel(g, percent),
        shadeChannel(b, percent),
      );
    }
  }
  return { colors };
}

// ── 크기·좌표 ──
/** 픽셀 비율 상한: 굵은 포인터(터치)이고 화면 짧은 변이 600px 이하면 휴대폰(1.5), 그 밖은 2 */
export function flatMapPixelRatioLimit(coarsePointer: boolean, screenShortSide: number): number {
  return coarsePointer && screenShortSide <= PHONE_SHORT_SIDE
    ? FLAT_MAP_PHONE_PIXEL_RATIO
    : FLAT_MAP_MAX_PIXEL_RATIO;
}

/** CSS 폭(px)·기기 픽셀 비율 → 그림 크기. 픽셀 비율은 maxPixelRatio에서 멈춘다. 폭은 짝수, 높이 = 폭 ÷ 2 */
export function flatMapBackingSize(
  cssWidth: number,
  devicePixelRatio: number,
  maxPixelRatio: number = FLAT_MAP_MAX_PIXEL_RATIO,
): FlatMapSize {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const limit =
    Number.isFinite(maxPixelRatio) && maxPixelRatio > 0 ? maxPixelRatio : FLAT_MAP_MAX_PIXEL_RATIO;
  const wanted = Number.isFinite(cssWidth) ? cssWidth * Math.min(ratio, limit) : 0;
  const width = Math.max(MIN_WIDTH, Math.min(FLAT_MAP_MAX_WIDTH, 2 * Math.round(wanted / 2)));
  return { width, height: width / 2 };
}

function assertSize(size: FlatMapSize): void {
  const { width, height } = size;
  if (!Number.isInteger(width) || width < MIN_WIDTH || width > FLAT_MAP_MAX_WIDTH || height * 2 !== width) {
    throw new RangeError(
      `flat map size must be W × W/2 with even W in [${MIN_WIDTH}, ${FLAT_MAP_MAX_WIDTH}]`,
    );
  }
}

/** 픽셀 (x, y) 중심의 위도(°) — 표 만들기와 같은 식 */
function pixelLatDeg(y: number, height: number): number {
  return 90 - ((y + 0.5) * 180) / height;
}

/** 픽셀 (x, y) 중심의 경도(°) — 표 만들기와 같은 식 */
function pixelLonDeg(x: number, width: number): number {
  return ((x + 0.5) * 360) / width - 180;
}

/** 픽셀 (x, y) 중심의 위도·경도 */
export function flatMapPixelCenter(x: number, y: number, size: FlatMapSize): LatLon {
  return { latDeg: pixelLatDeg(y, size.height), lonDeg: pixelLonDeg(x, size.width) };
}

/** 경도를 [−180°, 180°)로 */
function wrapLonDeg(lonDeg: number): number {
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** 위도·경도가 든 픽셀(경도는 돌려 맞추고 위도는 끝에 붙인다). 픽셀 중심을 넣으면 그 픽셀이 나온다 */
export function flatMapPixelAt(point: LatLon, size: FlatMapSize): { readonly x: number; readonly y: number } {
  const { width, height } = size;
  const x = Math.floor(((wrapLonDeg(point.lonDeg) + 180) / 360) * width);
  const y = Math.floor(((90 - clamp(point.latDeg, -90, 90)) / 180) * height);
  return { x: clamp(x, 0, width - 1), y: clamp(y, 0, height - 1) };
}

/** 그림 위 비율 위치(0~1, 왼쪽 위 기준. 누른 곳) → 그 픽셀 중심의 위도·경도 */
export function flatMapPointAt(fractionX: number, fractionY: number, size: FlatMapSize): LatLon {
  const x = clamp(Math.floor(fractionX * size.width), 0, size.width - 1);
  const y = clamp(Math.floor(fractionY * size.height), 0, size.height - 1);
  return flatMapPixelCenter(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, size);
}

/** 위도·경도 → 그림 위 비율 위치(0~1, 표시 점 자리) */
export function flatMapFraction(point: LatLon): { readonly x: number; readonly y: number } {
  return { x: (wrapLonDeg(point.lonDeg) + 180) / 360, y: (90 - clamp(point.latDeg, -90, 90)) / 180 };
}

// ── 픽셀 → 칸 표 ──
const DEG = Math.PI / 180;

/**
 * 기준 표의 레벨: 칸 번호(면 × 4^L + …)가 Int32에 드는 가장 높은 레벨(6 × 4^14 ≈ 16.1억 < 2^31). 격자 상한(MAX_FACE_LEVEL)도 14다.
 * 면 레벨이 이보다 높으면(지금 격자에는 없다) 표를 바로 만든다
 */
export const FLAT_MAP_LOOKUP_BASE_LEVEL = 14;

/** 면 레벨(@terra/planet 격자 범위)인지 본다. 아니면 RangeError */
function assertFaceLevel(faceLevel: number): void {
  if (!isFaceLevel(faceLevel)) throw new RangeError(`not a face level: ${String(faceLevel)}`);
}

/**
 * 단위 방향 (x, y, z)가 든 한 변 n칸 면의 칸 번호 — xyzToCell(@terra/planet/projection)과 같은 계산(키 대신 배열 번호).
 * 면 고르기·(u, v)는 xyzToFaceUV와 같은 규칙·같은 곱셈 순서로 FACE_FRAMES에서 바로 읽는다.
 * 픽셀마다 배열·객체를 만들지 않으려고 풀어 썼다(xyzToFaceUV를 부르면 F7 표가 Node에서 중앙값 약 1.3~1.5배 느리고
 * GC로 더 흔들렸다). 같은 값인지는 시험이 모든 픽셀로 본다
 */
function cellIndexOf(x: number, y: number, z: number, n: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  // 절댓값이 가장 큰 축의 면(같으면 x, y, z 순서로 앞의 것)
  const face = ax >= ay && ax >= az ? (x > 0 ? 0 : 3) : ay >= az ? (y > 0 ? 1 : 4) : z > 0 ? 2 : 5;
  const { normal, uAxis, vAxis } = FACE_FRAMES[face];
  const depth = x * normal[0] + y * normal[1] + z * normal[2];
  const u = (x * uAxis[0] + y * uAxis[1] + z * uAxis[2]) / depth;
  const v = (x * vAxis[0] + y * vAxis[1] + z * vAxis[2]) / depth;
  const i = Math.min(n - 1, Math.floor(uvToST(u) * n));
  const j = Math.min(n - 1, Math.floor(uvToST(v) * n));
  return face * n * n + j * n + i;
}

/**
 * 픽셀마다 한 변 n칸 면의 칸 번호. 방향은 엔진과 같은 식(x = cos 위도·cos 경도, y = cos 위도·sin 경도, z = sin 위도)이고,
 * 위도·경도의 삼각함수는 줄·열마다 한 번만 잰다(곱은 엔진 식과 같은 값이다)
 */
function buildCells(n: number, size: FlatMapSize): Int32Array {
  const { width, height } = size;
  const cosLon = new Float64Array(width);
  const sinLon = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const lon = pixelLonDeg(x, width) * DEG;
    cosLon[x] = Math.cos(lon);
    sinLon[x] = Math.sin(lon);
  }
  const cells = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    const lat = pixelLatDeg(y, height) * DEG;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      cells[row + x] = cellIndexOf(cosLat * (cosLon[x] ?? 0), cosLat * (sinLon[x] ?? 0), sinLat, n);
    }
  }
  return cells;
}

/**
 * 기준 표(한 변 2^14칸) → 면 레벨 F 표: i, j를 (14 − F)비트 민다.
 * s = uvToST(u)는 [0, 1]이고(±1 밖은 끝값) 2의 거듭제곱 곱은 정확하므로 floor(s × 2^14) >> (14 − F) = floor(s × 2^F)다.
 * s = 1은 둘 다 끝 칸(n − 1)에서 멈춘다. 그래서 바로 만든 표와 비트까지 같다(시험이 모든 픽셀로 본다)
 */
function deriveCells(base: Int32Array, faceLevel: number): Int32Array {
  const shift = FLAT_MAP_LOOKUP_BASE_LEVEL - faceLevel;
  const faceShift = 2 * FLAT_MAP_LOOKUP_BASE_LEVEL;
  const mask = (1 << FLAT_MAP_LOOKUP_BASE_LEVEL) - 1;
  const cells = new Int32Array(base.length);
  for (let k = 0; k < base.length; k++) {
    const index = base[k] ?? 0;
    const j = ((index >>> FLAT_MAP_LOOKUP_BASE_LEVEL) & mask) >>> shift;
    const i = (index & mask) >>> shift;
    cells[k] = ((((index >>> faceShift) << faceLevel) | j) << faceLevel) | i;
  }
  return cells;
}

/** 픽셀 → 칸 번호 표를 바로 만든다(시험의 기준. 부품은 FlatMapLookupCache가 기준 표에서 끌어낸다) */
export function buildFlatMapLookup(faceLevel: number, size: FlatMapSize): FlatMapLookup {
  assertFaceLevel(faceLevel);
  assertSize(size);
  return {
    faceLevel,
    width: size.width,
    height: size.height,
    cells: buildCells(cellsPerSide(faceLevel), size),
  };
}

/** 표를 얻은 길: 기억(cached) · 기준 표에서 끌어냄(derived) · 그 크기의 기준 표부터 만듦(base, 삼각함수를 도는 비싼 길) */
export type FlatMapLookupSource = "cached" | "derived" | "base";

export interface FlatMapLookupResult {
  readonly lookup: FlatMapLookup;
  readonly source: FlatMapLookupSource;
}

/**
 * 픽셀 → 칸 번호 표 기억. 면 레벨 표는 최근에 쓴 것부터 `limit`개, 기준 표는 마지막에 쓴 크기 하나.
 * 크기가 바뀌면 새 크기의 기준 표를 만들고, 옛 크기의 레벨 표는 차례로 밀려난다
 */
export class FlatMapLookupCache {
  readonly #limit: number;
  readonly #entries: FlatMapLookup[] = [];
  #base: FlatMapLookup | null = null;

  constructor(limit = 3) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`cache limit must be ≥ 1: ${limit}`);
    this.#limit = limit;
  }

  /** 표를 돌려준다. 없으면 기준 표에서 끌어낸다(그 크기의 기준 표가 없으면 먼저 만든다) */
  get(faceLevel: number, size: FlatMapSize): FlatMapLookupResult {
    const index = this.#entries.findIndex(
      (entry) => entry.faceLevel === faceLevel && entry.width === size.width && entry.height === size.height,
    );
    const found = index >= 0 ? this.#entries.splice(index, 1)[0] : undefined;
    const result: FlatMapLookupResult =
      found === undefined ? this.#make(faceLevel, size) : { lookup: found, source: "cached" };
    this.#entries.unshift(result.lookup);
    this.#entries.length = Math.min(this.#entries.length, this.#limit);
    return result;
  }

  #make(faceLevel: number, size: FlatMapSize): FlatMapLookupResult {
    assertFaceLevel(faceLevel);
    assertSize(size);
    if (faceLevel > FLAT_MAP_LOOKUP_BASE_LEVEL) {
      return { lookup: buildFlatMapLookup(faceLevel, size), source: "base" };
    }
    const { width, height } = size;
    let base = this.#base;
    let source: FlatMapLookupSource = "derived";
    if (base === null || base.width !== width || base.height !== height) {
      base = {
        faceLevel: FLAT_MAP_LOOKUP_BASE_LEVEL,
        width,
        height,
        cells: buildCells(1 << FLAT_MAP_LOOKUP_BASE_LEVEL, size),
      };
      this.#base = base;
      source = "base";
    }
    return { lookup: { faceLevel, width, height, cells: deriveCells(base.cells, faceLevel) }, source };
  }

  /** 기억한 표(레벨 표 + 기준 표)의 바이트 수 */
  get bytes(): number {
    return this.#entries.reduce(
      (sum, entry) => sum + entry.cells.byteLength,
      this.#base?.cells.byteLength ?? 0,
    );
  }

  /** 기억한 레벨 표 수(기준 표는 세지 않는다) */
  get size(): number {
    return this.#entries.length;
  }

  clear(): void {
    this.#entries.length = 0;
    this.#base = null;
  }
}

// ── 칠하기 ──
/**
 * 결과를 그림 버퍼에 칠한다. 표·결과·버퍼의 면 레벨과 크기가 맞아야 한다(아니면 RangeError).
 * 칸 색 = 색표[바이옴 × 음영 단계(물 비트·고도)]. 칸이 픽셀보다 적으면(F5~F7을 미니맵 크기에) 칸마다 색을 한 번 정하고
 * 픽셀은 옮겨 쓰기만 한다. 칸이 더 많으면(F8·F9) 픽셀이 가리키는 칸만 정한다(픽셀 중심 표본 — 파일 머리 설명). 두 길의 결과는 같다
 */
export function paintFlatMap(
  lookup: FlatMapLookup,
  fields: FlatMapFields,
  palette: FlatMapPalette,
  image: FlatMapImage,
): void {
  if (fields.meta.faceLevel !== lookup.faceLevel) {
    throw new RangeError(
      `result face level ${fields.meta.faceLevel} ≠ lookup face level ${lookup.faceLevel}`,
    );
  }
  const count = planetCellCount(lookup.faceLevel);
  const { biome, elevationM, water } = fields;
  if (biome.length !== count || elevationM.length !== count || water.length !== count) {
    throw new RangeError(`result arrays must have ${count} cells for face level ${lookup.faceLevel}`);
  }
  const pixels = lookup.width * lookup.height;
  const { data } = image;
  if (image.width !== lookup.width || image.height !== lookup.height || data.length !== pixels * 4) {
    throw new RangeError(`image must be ${lookup.width} × ${lookup.height} RGBA`);
  }
  if (data.byteOffset % 4 !== 0) throw new RangeError("image data must start on a 4-byte boundary");
  const out = new Uint32Array(data.buffer, data.byteOffset, pixels);
  const { cells } = lookup;
  const { colors } = palette;
  if (count <= pixels) {
    const cellColors = new Uint32Array(count);
    for (let c = 0; c < count; c++) {
      const step = shadeStep(elevationM[c] ?? 0, water[c] ?? 0);
      cellColors[c] = colors[(biome[c] ?? 0) * SHADE_STEPS + step] ?? 0;
    }
    for (let k = 0; k < pixels; k++) out[k] = cellColors[cells[k] ?? 0] ?? 0;
    return;
  }
  for (let k = 0; k < pixels; k++) {
    const cell = cells[k] ?? 0;
    const step = shadeStep(elevationM[cell] ?? 0, water[cell] ?? 0);
    out[k] = colors[(biome[cell] ?? 0) * SHADE_STEPS + step] ?? 0;
  }
}

// ── 키보드 ──
/**
 * 키보드로 고른 점 옮기기: 한 걸음 = 적도에서 칸 하나쯤(폭 ÷ (4 × n), 적어도 1점), large면 FLAT_MAP_LARGE_STEP 걸음.
 * 경도는 돌아 넘어가고 위도는 끝에서 멈춘다. 돌려주는 점은 픽셀 중심이다. 고른 점이 없으면 가운데(위도 0, 경도 0) 픽셀
 */
export function moveFlatMapPoint(
  from: LatLon | null,
  direction: FlatMapDirection | null,
  large: boolean,
  faceLevel: number,
  size: FlatMapSize,
): LatLon {
  const start = flatMapPixelAt(from ?? { latDeg: 0, lonDeg: 0 }, size);
  if (from === null || direction === null) return flatMapPixelCenter(start.x, start.y, size);
  const step =
    Math.max(1, Math.round(size.width / (4 * cellsPerSide(faceLevel)))) * (large ? FLAT_MAP_LARGE_STEP : 1);
  const dx = direction === "left" ? -step : direction === "right" ? step : 0;
  const dy = direction === "up" ? -step : direction === "down" ? step : 0;
  const x = (((start.x + dx) % size.width) + size.width) % size.width;
  const y = clamp(start.y + dy, 0, size.height - 1);
  return flatMapPixelCenter(x, y, size);
}
