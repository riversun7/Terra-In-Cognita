// 물가 조건(질문 947 나, 옛 water_adjacent·낚시 반경 5칸) — docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)".
// 팩 facilities.needsWaterWithin = N이 있는 시설(낚시터)은 2차맵에 놓을 때 건물 칸(회전한 칸 크기)을 사방으로 N 배치 칸 넓힌 네모 안에 물 칸이
// 하나라도 있어야 한다(체비쇼프 거리 N 이하). 물 칸 = 지형 칸 지표가 물(0)·얕은 물(10)인 칸(@terra/protocol TERRAIN_SURFACE — 서버 시험이 번호가
// 같은지 본다). 지형 칸 하나 = 배치 칸 2×2(@terra/sim PLACEMENT_PER_TERRAIN).
// 서버 짓기·NPC 씨앗(apps/server facilities)과 짓기 폼 미리 보기(apps/game economy)가 이 함수 하나를 쓴다. 물 표는 지형 칸마다 1비트이고 화면에는
// 16진수 글자로 보낸다(128² = 2,048바이트 → 4,096자). 정수 연산만 쓴다.

/** 물 지표 번호(@terra/protocol TERRAIN_SURFACE water·shallowWater와 같다) */
export const WATER_SURFACE_CODES: readonly number[] = [0, 10];

/** 지형 칸 하나에 드는 배치 칸 수(한 축, @terra/sim PLACEMENT_PER_TERRAIN과 같다) */
export const WATER_CELLS_PER_TERRAIN = 2;

/** 지형 칸 물 표: size × size 지형 칸, 칸마다 1비트(행 우선, 바이트 안은 낮은 비트부터) */
export interface WaterMask {
  /** 한 변 지형 칸 수(2차맵 128) */
  readonly size: number;
  readonly bits: Uint8Array;
}

/** 배치 칸 네모(회전한 칸 크기) */
export interface WaterRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 지형 칸 지표(size², 행 우선) → 물 표 */
export function waterMaskFromSurface(surface: Uint8Array, size: number): WaterMask {
  const bits = new Uint8Array(Math.ceil((size * size) / 8));
  for (let i = 0; i < size * size; i++)
    if (WATER_SURFACE_CODES.includes(surface[i] ?? -1)) bits[i >> 3] = (bits[i >> 3] ?? 0) | (1 << (i & 7));
  return { size, bits };
}

/** 지형 칸 (tx, ty)가 물인가(표 밖은 물이 아니다) */
export function isWaterTerrainCell(mask: WaterMask, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= mask.size || ty >= mask.size) return false;
  const i = ty * mask.size + tx;
  return ((mask.bits[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
}

/**
 * 건물 칸 rect에서 radius 배치 칸 안(사방으로 넓힌 네모, 2차맵 밖은 자른다)에 물 칸이 있나. radius가 0 이하이면 조건이 없는 것으로 보고 true.
 * 넓힌 네모가 걸치는 지형 칸을 모두 본다(배치 칸 하나라도 그 지형 칸에 들면 그 지형 칸의 물을 본다)
 */
export function hasWaterNear(mask: WaterMask, rect: WaterRect, radius: number): boolean {
  if (radius <= 0) return true;
  const per = WATER_CELLS_PER_TERRAIN;
  const limit = mask.size * per - 1;
  const x0 = Math.max(0, rect.x - radius);
  const y0 = Math.max(0, rect.y - radius);
  const x1 = Math.min(limit, rect.x + rect.width - 1 + radius);
  const y1 = Math.min(limit, rect.y + rect.height - 1 + radius);
  if (x1 < x0 || y1 < y0) return false;
  for (let ty = Math.floor(y0 / per); ty <= Math.floor(y1 / per); ty++)
    for (let tx = Math.floor(x0 / per); tx <= Math.floor(x1 / per); tx++)
      if (isWaterTerrainCell(mask, tx, ty)) return true;
  return false;
}

/** 회전한 건물 칸(90·270이면 가로·세로가 바뀐다 — @terra/sim footprintRect와 같다) */
export function rotatedRect(
  x: number,
  y: number,
  footprint: { readonly width: number; readonly height: number },
  rotation: number,
): WaterRect {
  const quarter = rotation === 90 || rotation === 270;
  return {
    x,
    y,
    width: quarter ? footprint.height : footprint.width,
    height: quarter ? footprint.width : footprint.height,
  };
}

const HEX = "0123456789abcdef";

/** 물 표 → 16진수 글자(바이트마다 두 자) */
export function waterMaskToHex(mask: WaterMask): string {
  let out = "";
  for (const byte of mask.bits) out += (HEX[byte >> 4] ?? "0") + (HEX[byte & 15] ?? "0");
  return out;
}

/** 16진수 글자 → 물 표. 길이가 맞지 않거나 16진수가 아니면 undefined */
export function waterMaskFromHex(hex: string, size: number): WaterMask | undefined {
  const bytes = Math.ceil((size * size) / 8);
  if (hex.length !== bytes * 2 || !/^[0-9a-f]*$/.test(hex)) return undefined;
  const bits = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) bits[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return { size, bits };
}
