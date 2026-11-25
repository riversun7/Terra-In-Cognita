// 홈 [도시 활동] 카드 [정보] 탭의 2차맵 미니맵 그림 자료 — 순수 함수(시험 대상, cityMinimap.test.ts). 사용자 요청 2026-11-25
// "정보탭에는 2차맵의 2차원 미니맵". 2차맵 지형 파일(@terra/protocol TerrainData — 지형 칸 128², 꼭짓점 높이·지표 종류)을 위에서 본 그림으로 바꾼다:
// 지표 종류마다 색 + 높이 기울기로 밝기(북서쪽 빛). 세계(지도) 색이라 테마와 상관없다(2차맵 화면과 같은 원칙 — map.css 머리 주석).
// 건물·유닛 표시는 화면(CityMinimap.tsx)이 이 그림 위에 그린다. 숨김 정보(자원·남의 유닛)는 지형 파일에 없다.
import { TERRAIN_SURFACE, type TerrainData } from "@terra/protocol";

type Rgb = readonly [number, number, number];

/** 지표 종류 → 색(모르는 종류는 풀) */
const SURFACE_RGB: Readonly<Record<number, Rgb>> = {
  [TERRAIN_SURFACE.water]: [52, 104, 164],
  [TERRAIN_SURFACE.shallowWater]: [92, 150, 192],
  [TERRAIN_SURFACE.grass]: [116, 158, 92],
  [TERRAIN_SURFACE.dirt]: [150, 126, 92],
  [TERRAIN_SURFACE.rock]: [128, 128, 124],
  [TERRAIN_SURFACE.sand]: [212, 196, 150],
  [TERRAIN_SURFACE.gravel]: [160, 154, 140],
  [TERRAIN_SURFACE.snow]: [236, 240, 244],
  [TERRAIN_SURFACE.ice]: [200, 224, 236],
  [TERRAIN_SURFACE.mud]: [112, 94, 72],
  [TERRAIN_SURFACE.ash]: [98, 94, 94],
};
const FALLBACK_RGB: Rgb = [116, 158, 92];

/** 지형 칸 한 변 길이를 모를 때(1판 지형) 쓰는 값(mm) */
const DEFAULT_CELL_MM = 4000;
/** 기울기 → 밝기 세기, 밝기 상한(±) */
const SHADE_GAIN = 1.6;
const SHADE_MAX = 0.3;

const isWater = (surface: number): boolean =>
  surface === TERRAIN_SURFACE.water || surface === TERRAIN_SURFACE.shallowWater;

/**
 * 지형 → RGBA 화소(terrainSize² × 4, 행 우선 — 캔버스 ImageData에 그대로 넣는다). 물은 밝기를 바꾸지 않는다(평평하게).
 * 크기가 맞지 않는 자료(지표·높이 수)는 빈 그림(길이 0)
 */
export function terrainPixels(
  terrain: Pick<TerrainData, "terrainSize" | "heights" | "surface" | "cellSizeMm">,
): Uint8ClampedArray {
  const size = terrain.terrainSize;
  const side = size + 1;
  if (size < 1 || terrain.surface.length !== size * size || terrain.heights.length !== side * side) {
    return new Uint8ClampedArray(0);
  }
  // 높이는 cm, 칸 길이는 mm → 같은 단위(cm)로
  const cellCm = (terrain.cellSizeMm ?? DEFAULT_CELL_MM) / 10;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const surface = terrain.surface[y * size + x] ?? 0;
      const rgb = SURFACE_RGB[surface] ?? FALLBACK_RGB;
      let shade = 1;
      if (!isWater(surface)) {
        // 북서(왼쪽 위) 꼭짓점과 남동 꼭짓점의 높이 차: 북서로 기운 비탈이 밝다
        const nw = terrain.heights[y * side + x] ?? 0;
        const se = terrain.heights[(y + 1) * side + x + 1] ?? 0;
        const slope = (se - nw) / cellCm;
        shade = 1 + Math.max(-SHADE_MAX, Math.min(SHADE_MAX, slope * SHADE_GAIN));
      }
      const at = (y * size + x) * 4;
      pixels[at] = rgb[0] * shade;
      pixels[at + 1] = rgb[1] * shade;
      pixels[at + 2] = rgb[2] * shade;
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

/** 2차맵 배치 칸 한 변 */
export const MINIMAP_CELLS = 256;
/** 건물 둘레 보기의 가장 작은 한 변(배치 칸)·건물 묶음 바깥 여유 */
export const MINIMAP_MIN_SPAN = 64;
export const MINIMAP_PAD = 10;

/** 미니맵이 보이는 네모(배치 칸, 정사각형) */
export interface MinimapView {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export const MINIMAP_FULL: MinimapView = { x: 0, y: 0, size: MINIMAP_CELLS };

interface CellRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 건물 둘레 보기: 건물 칸 네모들과 기준 자리(기준 유닛)를 모두 담는 정사각형에 여유를 두고, 2차맵 안으로 맞춘다. 건물이 작게 뭉친 도시도
 * 건물 자리가 또렷이 보이게(사용자 지적 2026-11-25 "유닛위치보다 건물 위치가 잘보이게"). 건물 칸을 하나도 모르면 전체(MINIMAP_FULL)
 */
export function buildingsView(
  rects: readonly CellRect[],
  focus: { readonly x: number; readonly y: number } | null,
): MinimapView {
  if (rects.length === 0) return MINIMAP_FULL;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const add = (x0: number, y0: number, x1: number, y1: number): void => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };
  for (const rect of rects) add(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  if (focus) add(focus.x, focus.y, focus.x + 1, focus.y + 1);
  const span = Math.max(maxX - minX, maxY - minY) + MINIMAP_PAD * 2;
  const size = Math.min(MINIMAP_CELLS, Math.max(MINIMAP_MIN_SPAN, Math.ceil(span)));
  const clamp = (value: number): number => Math.max(0, Math.min(MINIMAP_CELLS - size, Math.round(value)));
  return { x: clamp((minX + maxX) / 2 - size / 2), y: clamp((minY + maxY) / 2 - size / 2), size };
}
