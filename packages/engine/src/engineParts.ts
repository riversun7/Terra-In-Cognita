// 2차맵 엔진 곁 조각 — 통계용 빛 요약(lightStats)과 WebGL을 못 쓸 때의 빈 엔진(inertEngine). secondMapEngine.ts가 쓴다(파일 크기를 나눈 것).
import type { CameraState } from "./camera/cameraMath.ts";
import type { EngineLightStats, EngineStats, SecondMapEngine } from "./engineTypes.ts";
import { REFERENCE_FLAT_LIGHT, flatLight } from "./lighting/secondMapLight.ts";
import { SecondMapSky } from "./lighting/secondMapSky.ts";

/** 통계용 빛 요약: 평지 밝기는 낮 기준(지금 고정 빛)에 견준 세 채널 평균 */
export function lightStats(sky: SecondMapSky): EngineLightStats {
  const light = sky.light;
  const [r, g, b] = flatLight(light);
  return {
    clock: sky.clockState,
    day: light.day,
    source: light.source,
    flat: (r + g + b) / 3 / REFERENCE_FLAT_LIGHT,
    localHours: light.localHours,
    sunElevationDeg: light.sunElevationDeg,
    moonElevationDeg: light.moonElevationDeg,
    moonLit: light.moonLit,
    changes: sky.changeCount,
  };
}

/** WebGL을 못 쓸 때: 아무것도 그리지 않는 엔진(화면은 안내를 띄운다) */
export function inertEngine(): SecondMapEngine {
  const empty: EngineStats = {
    renderedFrames: 0,
    framesLastSecond: 0,
    renderP95Ms: 0,
    renderMaxMs: 0,
    drawCalls: 0,
    triangles: 0,
    points: 0,
    units: 0,
    movingUnits: 0,
    drawnUnits: 0,
    unitMode: "model",
    pixelRatio: 1,
    drawingBufferWidth: 0,
    drawingBufferHeight: 0,
    pixelsPerMetre: 0,
    viewSpanM: 0,
    terrainBuildMs: null,
    terrainSource: null,
    contextLost: false,
    light: lightStats(new SecondMapSky(null)),
    neighbours: 0,
    props: 0,
    propClutter: 0,
    propsFaded: 0,
    routePoints: 0,
    moveTarget: false,
    propSpanM: 0,
    propCap: 0,
    viewLevel: 0,
    viewReachM: 0,
    grid: false,
    zoomStage: 0,
    following: null,
    characters: 0,
    characterLod0: 0,
    selectedDraw: null,
    nationRings: 0,
    selectedRing: null,
  };
  const camera: CameraState = { targetX: 0, targetY: 0, targetZ: 0, yaw: 0, pitch: 0, distance: 0 };
  return {
    setTerrain: () => Promise.resolve(),
    setNeighbours: () => Promise.resolve(),
    setNeighbourExplored: () => undefined,
    rebase: () => false,
    setUnits: () => undefined,
    setUnitPath: () => undefined,
    stopUnit: () => undefined,
    unitState: () => null,
    setBuildings: () => undefined,
    setExplored: () => undefined,
    select: () => undefined,
    selected: () => null,
    setRouteUnit: () => undefined,
    setWorkingUnits: () => undefined,
    setHiddenUnits: () => undefined,
    setMoveTarget: () => undefined,
    stats: () => empty,
    camera: () => camera,
    setSky: () => undefined,
    setViewOptions: () => undefined,
    addLayer: () => () => undefined,
    requestFrame: () => undefined,
    setUnitLook: () => undefined,
    setUnitModels: () => undefined,
    setUnitRings: () => undefined,
    setObjectProps: () => undefined,
    setSchools: () => undefined,
    zoomStep: () => false,
    setView: () => undefined,
    follow: () => undefined,
    setViewArea: () => undefined,
    dispose: () => undefined,
  };
}
