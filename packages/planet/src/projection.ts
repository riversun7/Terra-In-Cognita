// 탄젠트 투영: 칸 ↔ 구 위 방향, 칸 중심·꼭짓점, 칸 면적·크기(미터) — ADR 2026-10-28-planet-grid-contract
//
// 실수 계산이다. 탄젠트·아크탄젠트는 @terra/shared의 결정적 근사(detTan·detAtan, 사칙연산만 쓰는 다항식)를 쓴다.
//   그래서 엔진(브라우저·Node 버전)과 무관하게 같은 값이 나오고, 생성기와 화면이 같은 위치를 쓴다(ADR 2026-10-29-s2-planet-lod).
//   패키지 전체가 결정성 검사(scripts/check-boundaries.mjs) 대상이다.
//   판정 보조 코드는 칸 키·이웃·계층(정수 연산만 쓰는 패키지 본체 @terra/planet)을 쓴다.
//   이 파일은 따로 들여온다: import { … } from "@terra/planet/projection".
//   미터는 표시용이다. 이동·사거리·건물 크기 같은 규칙은 칸 수로 정한다(ADR).
//
// 좌표 이름
// - (s, t) ∈ [0, 1]: 면 위 칸 좌표를 정규화한 값. 칸이 균등하다: 레벨 L 칸 (i, j)는 s ∈ [i/2^L, (i+1)/2^L].
// - (u, v) ∈ [-1, 1]: 정육면체 면 평면 좌표. 면 위 점 = normal + u·uAxis + v·vAxis (FACE_FRAMES).
// - (x, y, z): 구 위 방향(단위 벡터).
// 탄젠트 투영 u = tan(π/2·s - π/4)는 s를 면 중심에서 본 각도에 비례하게 한다.
// 그래서 같은 레벨 칸의 면적 차이가 최대 약 √2배다(측정: 레벨 9에서 1.412배, 기본 이차 투영은 2.087배).
import { detAtan, detTan } from "@terra/shared";
import { type CellKey, cellKey, decodeCellKey } from "./cellKey.ts";
import { FACE_FRAMES, type Face } from "./faces.ts";
import { EARTH_FACE_LEVEL, assertFaceLevel, cellsPerSide, pow2 } from "./levels.ts";

/** 3차원 벡터 */
export type Vec3 = readonly [x: number, y: number, z: number];

const HALF_PI = Math.PI / 2;

/**
 * 면 칸 좌표(정규화) s → 면 평면 좌표 u. 끝점(0, 1)과 중심(0.5)은 정확하고, stToUV(1 - s) = -stToUV(s)가 정확하다
 * (그래서 면 경계를 사이에 둔 두 면이 같은 꼭짓점 좌표를 낸다).
 */
export function stToUV(s: number): number {
  const x = s - 0.5;
  if (x >= 0.5) return 1;
  if (x <= -0.5) return -1;
  const u = detTan(HALF_PI * Math.abs(x));
  return x < 0 ? -u : u;
}

/** 면 평면 좌표 u → 면 칸 좌표(정규화) s (stToUV의 반대) */
export function uvToST(u: number): number {
  if (u >= 1) return 1;
  if (u <= -1) return 0;
  const a = detAtan(Math.abs(u)) / HALF_PI;
  return u < 0 ? 0.5 - a : 0.5 + a;
}

/** 면 `face`의 평면 좌표 (u, v) → 정육면체 면 위 점 (길이가 1이 아니다) */
export function faceUVToXYZ(face: Face, u: number, v: number): Vec3 {
  const { normal: n, uAxis: a, vAxis: b } = FACE_FRAMES[face];
  return [n[0] + u * a[0] + v * b[0], n[1] + u * a[1] + v * b[1], n[2] + u * a[2] + v * b[2]];
}

/** 방향 (x, y, z) (길이 무관, 0 벡터 제외) → 면과 그 면의 평면 좌표 (u, v) */
export function xyzToFaceUV(p: Vec3): { readonly face: Face; readonly u: number; readonly v: number } {
  const [x, y, z] = p;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  if (!Number.isFinite(ax + ay + az) || ax + ay + az === 0) {
    throw new RangeError(`direction must be a non-zero finite vector: (${p.join(", ")})`);
  }
  // 절댓값이 가장 큰 축의 면 (같으면 x, y, z 순서로 앞의 것)
  let face: Face;
  if (ax >= ay && ax >= az) face = x > 0 ? 0 : 3;
  else if (ay >= az) face = y > 0 ? 1 : 4;
  else face = z > 0 ? 2 : 5;
  const { normal, uAxis, vAxis } = FACE_FRAMES[face];
  const depth = dot(p, normal);
  return { face, u: dot(p, uAxis) / depth, v: dot(p, vAxis) / depth };
}

/** 방향 (x, y, z)가 들어 있는 레벨 `level` 칸 (화면에서 고르기 등). 칸 경계 위의 점은 한쪽 칸으로 정한다 */
export function xyzToCell(p: Vec3, level: number): CellKey {
  const n = cellsPerSide(level);
  const { face, u, v } = xyzToFaceUV(p);
  const i = Math.min(n - 1, Math.floor(uvToST(u) * n));
  const j = Math.min(n - 1, Math.floor(uvToST(v) * n));
  return cellKey(face, level, i, j);
}

/** 면 칸 좌표(정규화) (s, t) → 구 위 단위 벡터 */
function faceSTToUnit(face: Face, s: number, t: number): Vec3 {
  return normalize(faceUVToXYZ(face, stToUV(s), stToUV(t)));
}

/** 칸 중심 방향 (단위 벡터) */
export function cellCenter(key: CellKey): Vec3 {
  const { face, level, i, j } = decodeCellKey(key);
  const n = cellsPerSide(level);
  return faceSTToUnit(face, (i + 0.5) / n, (j + 0.5) / n);
}

/**
 * 칸 꼭짓점 4개 (단위 벡터): (i, j), (i+1, j), (i+1, j+1), (i, j+1) 모서리 순서.
 * 모든 면에서 uAxis × vAxis = normal이라 밖에서 보면 반시계 방향이다. 이웃 칸과 같은 꼭짓점은 같은 값이 나온다.
 */
export function cellCorners(key: CellKey): readonly [Vec3, Vec3, Vec3, Vec3] {
  const { face, level, i, j } = decodeCellKey(key);
  const n = cellsPerSide(level);
  const s0 = i / n;
  const s1 = (i + 1) / n;
  const t0 = j / n;
  const t1 = (j + 1) / n;
  return [
    faceSTToUnit(face, s0, t0),
    faceSTToUnit(face, s1, t0),
    faceSTToUnit(face, s1, t1),
    faceSTToUnit(face, s0, t1),
  ];
}

/**
 * 칸 면적 (스테라디안, 구 전체 = 4π). 면 평면의 직사각형 [u0, u1] × [v0, v1]을 구에 비춘 입체각:
 * Ω = F(u1, v1) - F(u0, v1) - F(u1, v0) + F(u0, v0),  F(u, v) = atan(u·v / √(1 + u² + v²)).
 * 깊은 레벨일수록 비슷한 값끼리 빼서 자리가 줄어든다. 잰 상대 오차(2026-10-28): 레벨 17(지구 배치 칸)까지 약 1e-6 이하,
 * 레벨 20 약 7e-5, 레벨 22 약 2e-3. 표시용이라 그대로 둔다.
 */
export function cellAreaSteradians(key: CellKey): number {
  const { level, i, j } = decodeCellKey(key);
  const n = cellsPerSide(level);
  const u0 = stToUV(i / n);
  const u1 = stToUV((i + 1) / n);
  const v0 = stToUV(j / n);
  const v1 = stToUV((j + 1) / n);
  return (
    cornerSolidAngle(u1, v1) - cornerSolidAngle(u0, v1) - cornerSolidAngle(u1, v0) + cornerSolidAngle(u0, v0)
  );
}

function cornerSolidAngle(u: number, v: number): number {
  return detAtan((u * v) / Math.sqrt(1 + u * u + v * v));
}

/** 칸 크기(미터, 표시용) = √(칸 면적) — 한 변 길이의 근사. 칸은 정사각형이 아니다(면 가장자리 가운데에서 약 1.4 : 1) */
export function cellSizeMeters(key: CellKey, radiusMeters: number): number {
  return radiusMeters * Math.sqrt(cellAreaSteradians(key));
}

/** 레벨 `level` 칸의 평균 한 변 길이(미터, 표시용) = R × √(4π / (6 × 4^level)) */
export function averageCellEdgeMeters(level: number, radiusMeters: number): number {
  return (radiusMeters * Math.sqrt((2 * Math.PI) / 3)) / cellsPerSide(level);
}

// ── 행성 반지름 (표시용) ──

/** 지구 평균 반지름(미터, IUGG 평균 반지름 R1) */
export const EARTH_RADIUS_METERS = 6_371_008.8;
/** 지구 축척 1 : 12 (ADR) */
export const EARTH_SCALE_DENOMINATOR = 12;

/**
 * 면 레벨 `faceLevel`인 행성의 반지름(미터, 표시용).
 * 행성 크기는 면 레벨로 정한다(ADR). 지구(레벨 9) = 지구 반지름 / 12 ≈ 530.9km이고,
 * 면 레벨이 1 오르면 반지름이 2배가 되어 1차맵 최소 칸 평균 크기(약 1.5km)는 모든 행성에서 같다.
 */
export function planetRadiusMeters(faceLevel: number): number {
  assertFaceLevel(faceLevel);
  const earth = EARTH_RADIUS_METERS / EARTH_SCALE_DENOMINATOR;
  return faceLevel >= EARTH_FACE_LEVEL
    ? earth * pow2(faceLevel - EARTH_FACE_LEVEL)
    : earth / pow2(EARTH_FACE_LEVEL - faceLevel);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(p: Vec3): Vec3 {
  const length = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  return [p[0] / length, p[1] / length, p[2] / length];
}
