// 2차맵 지형이 쓰는 색표와 텍스처 자료 — 순수 함수. three.js를 쓰지 않는다(지형 워커·단위 테스트도 가져온다).
// - 지표 색표: 지표 코드 → 색(0~1). 모르는 코드는 회색. 꼭짓점 색(terrainMesh.ts)과 칸 자료 텍스처가 같은 표를 쓴다.
// - 칸 자료 텍스처(128×128 RGBA8): rgb = 지표 색, a = 지표 코드. 조각 셰이더가 둘레 칸 4개를 읽어 경계를 그린다(terrainMaterial.ts).
//   색과 코드를 함께 두면 지표 종류가 늘어도(docs/questions/2026-10-29-special-terrain.md 4.3 "5단계") 셰이더를 고치지 않고
//   이 표만 늘린다.
// 잡음 텍스처 자료는 terrainNoise.ts에 있다(지형 워커가 처음 한 번 만든다, terrainBuilder.ts).
import { SURFACE, TERRAIN_CELLS } from "./terrainData.ts";

export type Rgb = readonly [number, number, number];

/** 지표 색(0~1). 파스텔 장난감 톤. 세계 색은 화면 테마와 상관없이 같다(D-070) */
const SURFACE_RGB: Readonly<Record<number, Rgb>> = {
  [SURFACE.water]: [0.56, 0.74, 0.72],
  [SURFACE.grass]: [0.56, 0.8, 0.45],
  [SURFACE.dirt]: [0.79, 0.67, 0.49],
  [SURFACE.rock]: [0.63, 0.63, 0.67],
  // 2차맵을 행성 값에서 만들 때 더한 지표(ADR 2026-10-31-second-map-from-planet, 기획 질문 124 기술 기본안)
  [SURFACE.sand]: [0.9, 0.84, 0.64],
  [SURFACE.gravel]: [0.7, 0.68, 0.62],
  [SURFACE.snow]: [0.94, 0.96, 0.98],
  [SURFACE.ice]: [0.8, 0.9, 0.95],
  [SURFACE.mud]: [0.55, 0.5, 0.42],
  [SURFACE.ash]: [0.45, 0.44, 0.46],
  [SURFACE.shallowWater]: [0.62, 0.82, 0.84],
};
/** 모르는 지표 코드(서버가 더 새 코드를 보낼 수 있다) */
export const UNKNOWN_SURFACE_RGB: Rgb = [0.8, 0.8, 0.8];

/**
 * 높이에 따른 밝기 — 높을수록 조금 밝게(깊이감), 물 아래는 조금 어둡게.
 * 밝기 = (base + span × 높이 비율(0~1)) × (물 아래면 underwater). 꼭짓점 색과 지형 재질이 같은 값을 쓴다
 */
export const HEIGHT_SHADE = { base: 0.9, span: 0.18, underwater: 0.85 } as const;

/** 높이 밝기에서 높이 폭(가장 높은 땅 − 가장 낮은 땅)을 이보다 작게 보지 않는다(m) */
export const HEIGHT_SHADE_MIN_RANGE_M = 0.01;

/**
 * 높이 비율 배율 = 1 / 높이 폭(높이 비율 = (높이 − 가장 낮은 땅) × 배율). 꼭짓점 색과 지형 재질이 같은 값을 쓴다.
 * 폭은 HEIGHT_SHADE_MIN_RANGE_M보다 작게 보지 않는다: 아주 평평한 2차맵(폭 0)에서 1 / 1e-6을 쓰면 조각마다 보간한
 * 높이의 오차(약 1ulp, 60m에서 약 4e-6m)가 10⁶배로 커져 밝기가 점마다 0.9와 1.08 사이를 뛰었다(점무늬·줄무늬, 검토 확인).
 * 높이는 0.1m 단위라 높낮이가 있는 지형은 값이 그대로다
 */
export function heightShadeScale(minHeightM: number, maxHeightM: number): number {
  return 1 / Math.max(HEIGHT_SHADE_MIN_RANGE_M, maxHeightM - minHeightM);
}

export function surfaceRgb(code: number | undefined): Rgb {
  return (code === undefined ? undefined : SURFACE_RGB[code]) ?? UNKNOWN_SURFACE_RGB;
}

/** 0~1 색 성분을 바이트로(반올림, 범위 밖은 자른다) */
export const toByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value * 255)));

/** 칸 자료 텍스처 바이트 수(128×128 RGBA8) */
export const SURFACE_TEXTURE_BYTES = TERRAIN_CELLS * TERRAIN_CELLS * 4;

/**
 * 칸 자료 텍스처: 칸마다 (r, g, b, 지표 코드). 행 우선(index = 행 × 128 + 열) — 텍스처 (x = 열, y = 행).
 * out을 주면 그 배열에 쓴다(지형이 바뀔 때 텍스처 배열을 다시 쓴다).
 */
export function buildSurfaceTextureData(
  surface: Uint8Array,
  out: Uint8Array = new Uint8Array(SURFACE_TEXTURE_BYTES),
): Uint8Array {
  if (surface.length !== TERRAIN_CELLS * TERRAIN_CELLS) {
    throw new RangeError(`surface must have ${TERRAIN_CELLS * TERRAIN_CELLS} cells: ${surface.length}`);
  }
  if (out.length !== SURFACE_TEXTURE_BYTES) {
    throw new RangeError(`out must have ${SURFACE_TEXTURE_BYTES} bytes: ${out.length}`);
  }
  for (let i = 0; i < surface.length; i++) {
    const code = surface[i] ?? 0;
    const rgb = surfaceRgb(code);
    out[i * 4] = toByte(rgb[0]);
    out[i * 4 + 1] = toByte(rgb[1]);
    out[i * 4 + 2] = toByte(rgb[2]);
    out[i * 4 + 3] = code;
  }
  return out;
}
