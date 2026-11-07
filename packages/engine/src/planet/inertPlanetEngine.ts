// 그리지 않는 1차맵 엔진 — WebGL을 못 쓸 때·그릴 수 없는 행성일 때 createPlanetEngine이 돌려준다(화면은 안내를 띄운다).
// planetEngine.ts가 600줄 경고에 닿지 않게 따로 둔다.
import type { PlanetEngine, PlanetLayer, PlanetStats } from "./planetTypes.ts";
import { OFF_SKY_STATS } from "./skyController.ts";
import { PRIMARY_LEVELS } from "./tileTree.ts";

/** WebGL을 못 쓸 때·그릴 수 없는 행성일 때: 아무것도 그리지 않는 엔진(화면은 안내를 띄운다) */
export function inertPlanetEngine(
  exaggeration: number,
  layer: PlanetLayer,
  budgets: PlanetStats["budgets"],
): PlanetEngine {
  const stats: PlanetStats = {
    renderedFrames: 0,
    framesLastSecond: 0,
    renderP95Ms: 0,
    renderMaxMs: 0,
    drawCalls: 0,
    triangles: 0,
    shaderPrograms: 0,
    tilesDrawn: 0,
    tilesDrawnByLevel: Array.from({ length: PRIMARY_LEVELS }, () => 0),
    tilesSelected: 0,
    tilesLoaded: 0,
    tilesPending: 0,
    fetching: 0,
    building: 0,
    uploadQueue: 0,
    budgetHits: { tiles: 0, fetches: 0, uploads: 0, memory: 0 },
    budgets,
    tileErrors: 0,
    tilesFailed: 0,
    gpuBytes: 0,
    memoryBytes: 0,
    maxElevationM: 0,
    primaryLevel: 0,
    mapLevel: 0,
    zoomStage: 0,
    incomplete: true,
    firstDisplayMs: null,
    exaggeration,
    layer,
    pixelRatio: 1,
    drawingBufferWidth: 0,
    drawingBufferHeight: 0,
    contextLost: false,
    camera: { latDeg: 0, lonDeg: 0, distanceM: 0, altitudeM: 0, headingDeg: 0, tiltDeg: 0 },
    sky: OFF_SKY_STATS,
    gpuBench: null,
  };
  return {
    setLayer: () => undefined,
    setSky: () => undefined,
    setExaggeration: () => undefined,
    pickAt: () => null,
    lookAt: () => undefined,
    zoomStep: () => false,
    requestFrame: () => undefined,
    stats: () => stats,
    dispose: () => undefined,
  };
}
