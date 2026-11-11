// 2차맵 물 표(물가 조건, 질문 947 나 — docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)").
// 서버 2차맵은 배치 칸 지형 비용(물 = 막힘이지만 벼랑·바위와 섞인다)만 들고 있어 물을 따로 알지 못한다. 그래서 같은 지형 파일(TCTR, 기기가 그리는
// 것과 같은 바이트)의 지표 층을 한 번 풀어 지형 칸마다 물인지(@terra/shared/waterNearby)를 적는다. 2차맵마다 처음 부를 때 한 번(secondMap.ts).
import { TERRAIN_SURFACE, decodeTerrain } from "@terra/protocol";
import { WATER_SURFACE_CODES, type WaterMask, waterMaskFromSurface } from "@terra/shared/waterNearby";
import type { MapTerrain } from "./mapTerrain.ts";

/** shared 물 번호가 프로토콜 지표 번호와 같은가(시험이 본다) */
export const WATER_CODES_MATCH =
  WATER_SURFACE_CODES.length === 2 &&
  WATER_SURFACE_CODES.includes(TERRAIN_SURFACE.water) &&
  WATER_SURFACE_CODES.includes(TERRAIN_SURFACE.shallowWater);

/** 지형 → 지형 칸 물 표 */
export function waterMaskOfTerrain(terrain: MapTerrain): WaterMask {
  const data = decodeTerrain(terrain.file().raw);
  return waterMaskFromSurface(data.surface, data.terrainSize);
}
