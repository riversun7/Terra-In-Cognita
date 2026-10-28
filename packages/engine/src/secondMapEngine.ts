// 2차맵 엔진 — Three.js 장면 하나를 화면 요소(container)에 붙이고 지형·건물·유닛을 그린다. React와 나눈 모듈이다.
// ADR 2026-10-28-s1-second-map "렌더링": 렌더러 하나 재사용, 화면 변화가 없으면 그리기 멈춤, 컨텍스트 손실 뒤 복구, 픽셀 비율 상한.
// 한 프레임: 목표점 높이 맞추기 → 카메라 → 유닛 위치(서버 시계로 보간) → 표현 단계(실제 크기/아이콘) → 그리기.
// 유닛이 가는 중이거나 카메라가 움직이면 다음 프레임을 예약하고, 아니면 멈춘다(FrameScheduler).
import {
  Color,
  DirectionalLight,
  Frustum,
  HemisphereLight,
  Matrix4,
  PerspectiveCamera,
  Scene,
  Vector3,
  type WebGLRenderer,
} from "three";
import type { BuildingFootprint } from "./buildings/footprint.ts";
import { BuildingView } from "./buildings/buildingView.ts";
import {
  CAMERA_FOV_RAD,
  type CameraLimits,
  type CameraState,
  type ScreenPoint,
  type Viewport,
  cameraLimitsFor,
  cameraPosition,
  clampCamera,
  initialCamera,
  pixelsPerMetre,
  screenRay,
  spanForDistance,
} from "./camera/cameraMath.ts";
import { attachControls } from "./camera/controls.ts";
import type {
  EngineStats,
  EngineStatus,
  SecondMapEngine,
  SecondMapEngineOptions,
  UnitSpawn,
  UnitState,
} from "./engineTypes.ts";
import { pickNearest, rayHitsTerrain } from "./picking.ts";
import { FrameScheduler } from "./render/frameScheduler.ts";
import { RenderTimer } from "./render/renderStats.ts";
import { acquireRenderer, defaultMaxPixelRatio, releaseRenderer } from "./render/sharedRenderer.ts";
import { type BuiltTerrain, createTerrainBuilder } from "./terrain/terrainBuilder.ts";
import {
  TERRAIN_CELLS,
  type TerrainInput,
  mapSizeM,
  placementCellM,
  sampleHeightM,
  terrainProblem,
} from "./terrain/terrainData.ts";
import { TerrainView } from "./terrain/terrainView.ts";
import { type UnitPath, UnitMotionStore } from "./units/unitMotion.ts";
import { UnitView } from "./units/unitView.ts";

/** 하늘(2차맵 밖) 색 — 세계 색은 화면 테마와 상관없다(D-070) */
const SKY_COLOR = 0xd6eef7;
/** 지형이 오기 전 2차맵 크기(평균 칸 11.7m) */
const DEFAULT_CELL_M = 11.7;
/** 아이콘 전환 기준 유닛 키(m)와 기본 픽셀 — 이유는 ADR 33 "구현하며 정한 것" */
const REFERENCE_UNIT_HEIGHT_M = 1.8;
const DEFAULT_ICON_THRESHOLD_PX = 8;
/** 아이콘 → 실제 크기로 돌아갈 때는 조금 더 커져야 한다(경계에서 깜박이지 않게) */
const ICON_HYSTERESIS = 1.15;
/** 누르는 반경(CSS px) — 누름 영역 44px의 반 */
const TAP_RADIUS_PX = 22;
/** 목표점 높이를 땅에 맞추는 빠르기(ms, 지수 감쇠 시간) */
const TARGET_Y_SMOOTH_MS = 120;
const DEFAULT_UNIT_CAPACITY = 2048;

export function createSecondMapEngine(
  container: HTMLElement,
  options: SecondMapEngineOptions = {},
): SecondMapEngine {
  const owner = {};
  const serverNow = options.serverNow ?? (() => Date.now());
  const iconThresholdPx = options.iconThresholdPx ?? DEFAULT_ICON_THRESHOLD_PX;
  const maxPixelRatio = options.maxPixelRatio ?? defaultMaxPixelRatio();
  const capacity = options.unitCapacity ?? DEFAULT_UNIT_CAPACITY;
  let disposed = false;
  const emit = (status: EngineStatus): void => {
    if (!disposed) options.onStatus?.(status);
  };

  let renderer: WebGLRenderer;
  try {
    renderer = acquireRenderer(owner);
  } catch (error) {
    emit({ kind: "unsupported", message: error instanceof Error ? error.message : String(error) });
    return inertEngine();
  }
  const canvas = renderer.domElement;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.append(canvas);

  const scene = new Scene();
  scene.background = new Color(SKY_COLOR);
  const camera = new PerspectiveCamera((CAMERA_FOV_RAD * 180) / Math.PI, 1, 1, 10_000);
  const hemisphere = new HemisphereLight(0xffffff, 0xb59f86, 1.7);
  const sun = new DirectionalLight(0xffffff, 2.1);
  sun.position.set(0.55, 1, 0.4);
  scene.add(hemisphere, sun);

  const terrainView = new TerrainView();
  const buildingView = new BuildingView();
  const unitView = new UnitView(capacity);
  scene.add(terrainView.group, buildingView.group, unitView.group);
  // 땅이 오기 전에는 유닛을 그리지 않는다(허공에 뜬 유닛이 잠깐 보이지 않게)
  unitView.group.visible = false;
  const motion = new UnitMotionStore(capacity);
  const slots = new Map<number, number>();
  let ids: number[] = [];

  let terrain: TerrainInput | null = null;
  let terrainVersion = 0;
  let minHeight = 0;
  let maxHeight = 0;
  let mapSize = TERRAIN_CELLS * DEFAULT_CELL_M;
  let cellM = DEFAULT_CELL_M / 2;
  let pendingBuildings: readonly BuildingFootprint[] | null = null;
  let viewport: Viewport = { width: 1, height: 1 };
  let limits: CameraLimits = cameraLimitsFor(mapSize, viewport);
  let state: CameraState = initialCamera(mapSize, limits);
  let cameraPlaced = false;
  let gestureActive = false;
  let selectedSlot = -1;
  let moving = 0;
  let pixelRatio = 1;
  let contextLost = false;
  let lastInfo = { calls: 0, triangles: 0, points: 0 };
  let terrainBuildMs: number | null = null;
  let terrainSource: "worker" | "main" | null = null;
  const timer = new RenderTimer();
  const builder = createTerrainBuilder();
  const projected = new Vector3();
  const frustum = new Frustum();
  const viewProjection = new Matrix4();
  const screenX = new Float32Array(capacity);
  const screenY = new Float32Array(capacity);
  const onScreen = new Uint8Array(capacity);
  const pickExtra = new Float32Array(capacity);

  const groundAt = (x: number, z: number): number => (terrain ? sampleHeightM(terrain, x, z) : 0);

  const applyCamera = (): void => {
    const position = cameraPosition(state);
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(state.targetX, state.targetY, state.targetZ);
    camera.near = Math.max(0.5, state.distance * 0.05);
    camera.far = state.distance + mapSize * 2 + 500;
    camera.aspect = viewport.width / Math.max(1, viewport.height);
    camera.updateProjectionMatrix();
    // 유닛마다 화면 밖을 거르려고 시야를 그리기 전에 구한다
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
  };

  const chooseUnitMode = (ppm: number): void => {
    const unitPx = REFERENCE_UNIT_HEIGHT_M * ppm;
    if (unitView.mode === "model" && unitPx < iconThresholdPx) unitView.setMode("icon");
    else if (unitView.mode === "icon" && unitPx > iconThresholdPx * ICON_HYSTERESIS)
      unitView.setMode("model");
  };

  const frame = (_time: number, deltaMs: number): boolean => {
    const started = performance.now();
    let animating = false;
    // 누르고 있지 않을 때 목표점 높이를 땅에 맞춘다(끄는 동안은 잡은 평면을 그대로 둔다)
    if (terrain && !gestureActive) {
      const desired = groundAt(state.targetX, state.targetZ);
      const diff = desired - state.targetY;
      if (Math.abs(diff) > 0.01) {
        const step = Math.abs(diff) < 0.05 ? diff : diff * (1 - Math.exp(-deltaMs / TARGET_Y_SMOOTH_MS));
        state = { ...state, targetY: state.targetY + step };
        animating = true;
      }
    }
    applyCamera();
    moving = motion.update(serverNow());
    const ppm = pixelsPerMetre(state.distance, viewport);
    chooseUnitMode(ppm);
    unitView.update(motion.x, motion.y, cellM, groundAt, frustum, selectedSlot, ppm);
    renderer.render(scene, camera);
    const info = renderer.info.render;
    lastInfo = { calls: info.calls, triangles: info.triangles, points: info.points };
    timer.record(started, performance.now() - started);
    return moving > 0 || animating;
  };
  const scheduler = new FrameScheduler(frame);

  const resize = (): void => {
    const rect = container.getBoundingClientRect();
    viewport = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
    pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(viewport.width, viewport.height, false);
    unitView.setPixelScale(canvas.width, canvas.height, pixelRatio);
    limits = cameraLimitsFor(mapSize, viewport);
    state = clampCamera(state, limits);
    scheduler.request();
  };
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  resizeObserver?.observe(container);
  resize();

  const setCamera = (next: CameraState): void => {
    state = next;
    scheduler.request();
  };

  // 누른 곳: 유닛(화면 거리) → 없으면 땅
  const pickUnit = (point: ScreenPoint): number => {
    const n = motion.size;
    const ppm = pixelsPerMetre(state.distance, viewport);
    const model = unitView.mode === "model";
    for (let slot = 0; slot < n; slot++) {
      const wx = (motion.x[slot] ?? 0) * cellM;
      const wz = (motion.y[slot] ?? 0) * cellM;
      const height = unitView.heightOf(slot);
      projected.set(wx, groundAt(wx, wz) + height / 2, wz).project(camera);
      const visible = projected.z > -1 && projected.z < 1;
      onScreen[slot] = visible ? 1 : 0;
      screenX[slot] = ((projected.x + 1) / 2) * viewport.width;
      screenY[slot] = ((1 - projected.y) / 2) * viewport.height;
      // 실제 크기로 크게 보이는 유닛은 몸 전체를 누를 수 있게 반경을 늘린다
      pickExtra[slot] = model ? (height * ppm * Math.cos(state.pitch)) / 2 : 0;
    }
    return pickNearest(screenX, screenY, onScreen, n, point, TAP_RADIUS_PX, pickExtra);
  };

  const pickGround = (point: ScreenPoint): { x: number; z: number } | null => {
    if (!terrain) return null;
    const ray = screenRay(state, viewport, point);
    const hit = rayHitsTerrain(
      ray.origin,
      ray.dir,
      groundAt,
      minHeight - 1,
      maxHeight + 1,
      terrain.cellSizeM / 4,
    );
    if (!hit || hit.x < 0 || hit.z < 0 || hit.x > mapSize || hit.z > mapSize) return null;
    return hit;
  };

  const detachControls = attachControls(canvas, {
    getState: () => state,
    setState: setCamera,
    limits: () => limits,
    viewport: () => viewport,
    onGestureChange: (active) => {
      gestureActive = active;
      if (!active) scheduler.request();
    },
    onTap: (point) => {
      const slot = pickUnit(point);
      if (slot >= 0) {
        selectedSlot = slot;
        scheduler.request();
        options.onSelect?.(ids[slot] ?? null);
        return;
      }
      const ground = pickGround(point);
      if (ground) options.onGroundTap?.({ x: ground.x / cellM, y: ground.z / cellM });
    },
  });

  // 컨텍스트 손실(iOS 앱 전환 등): 멈췄다가 복구되면 다시 그린다. three.js가 손실 이벤트의 기본 동작을 막아 복구를 받는다
  const onContextLost = (): void => {
    contextLost = true;
    scheduler.pause();
    emit({ kind: "context-lost" });
  };
  const onContextRestored = (): void => {
    contextLost = false;
    unitView.setPixelScale(canvas.width, canvas.height, pixelRatio);
    scheduler.resume();
    emit(terrain ? { kind: "ready" } : { kind: "loading" });
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  // 숨겨졌다 돌아오면 유닛이 그동안 움직였으니 한 번은 그린다
  const onVisibility = (): void => {
    if (document.visibilityState === "visible") scheduler.request();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const slotOf = (id: number): number => slots.get(id) ?? -1;

  emit({ kind: "loading" });

  return {
    async setTerrain(input) {
      const problem = terrainProblem(input);
      if (problem) throw new Error(`invalid terrain: ${problem}`);
      const version = ++terrainVersion;
      emit({ kind: "loading" });
      let built: BuiltTerrain;
      try {
        built = await builder.build(input);
      } catch (error) {
        if (disposed || version !== terrainVersion) return;
        emit({ kind: "error", message: error instanceof Error ? error.message : String(error) });
        throw error;
      }
      // 화면을 닫았거나 더 새 지형이 왔으면 버린다
      if (disposed || version !== terrainVersion) return;
      terrain = input;
      terrainBuildMs = built.buildMs;
      terrainSource = built.source;
      minHeight = built.mesh.minHeightM;
      maxHeight = built.mesh.maxHeightM;
      mapSize = mapSizeM(input);
      cellM = placementCellM(input);
      terrainView.set(built.mesh, mapSize, input.waterLevelM);
      unitView.group.visible = true;
      limits = cameraLimitsFor(mapSize, viewport);
      if (!cameraPlaced) {
        state = initialCamera(mapSize, limits, groundAt(mapSize / 2, mapSize / 2));
        cameraPlaced = true;
      } else {
        state = clampCamera(state, limits);
      }
      if (pendingBuildings) {
        buildingView.set(pendingBuildings, cellM, groundAt);
        pendingBuildings = null;
      }
      emit(contextLost ? { kind: "context-lost" } : { kind: "ready" });
      scheduler.request();
    },

    setUnits(units: readonly UnitSpawn[]) {
      if (units.length > capacity) throw new RangeError(`too many units: ${units.length} > ${capacity}`);
      slots.clear();
      ids = units.map((unit) => unit.id);
      motion.resize(units.length);
      unitView.setCount(units.length);
      const now = serverNow();
      units.forEach((unit, slot) => {
        slots.set(unit.id, slot);
        unitView.setLook(slot, unit.look);
        motion.setPath(slot, { points: [unit.x, unit.y], departAtMs: now, speedCellsPerSec: 0 });
      });
      selectedSlot = -1;
      scheduler.request();
    },

    setUnitPath(id: number, path: UnitPath) {
      const slot = slotOf(id);
      if (slot < 0) return;
      motion.setPath(slot, path);
      scheduler.request();
    },

    stopUnit(id: number) {
      const slot = slotOf(id);
      if (slot < 0) return;
      const now = serverNow();
      motion.compute(slot, now);
      motion.setPath(slot, {
        points: [motion.x[slot] ?? 0, motion.y[slot] ?? 0],
        departAtMs: now,
        speedCellsPerSec: 0,
      });
      scheduler.request();
    },

    unitState(id: number): UnitState | null {
      const slot = slotOf(id);
      if (slot < 0) return null;
      const isMoving = motion.compute(slot, serverNow());
      return { x: motion.x[slot] ?? 0, y: motion.y[slot] ?? 0, moving: isMoving };
    },

    setBuildings(buildings) {
      if (!terrain) {
        pendingBuildings = buildings;
        return;
      }
      buildingView.set(buildings, cellM, groundAt);
      scheduler.request();
    },

    select(id) {
      selectedSlot = id === null ? -1 : slotOf(id);
      scheduler.request();
    },

    selected() {
      return selectedSlot >= 0 ? (ids[selectedSlot] ?? null) : null;
    },

    stats(): EngineStats {
      const summary = timer.summary(performance.now());
      return {
        renderedFrames: timer.total,
        framesLastSecond: summary.frames,
        renderP95Ms: summary.p95Ms,
        renderMaxMs: summary.maxMs,
        drawCalls: lastInfo.calls,
        triangles: lastInfo.triangles,
        points: lastInfo.points,
        units: motion.size,
        movingUnits: moving,
        drawnUnits: unitView.mode === "model" ? unitView.drawnModels : motion.size,
        unitMode: unitView.mode,
        pixelRatio,
        pixelsPerMetre: pixelsPerMetre(state.distance, viewport),
        viewSpanM: spanForDistance(state.distance, viewport),
        terrainBuildMs,
        terrainSource,
        contextLost,
      };
    },

    camera() {
      return state;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      scheduler.stop();
      detachControls();
      resizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      builder.dispose();
      terrainView.dispose();
      buildingView.dispose();
      unitView.dispose();
      hemisphere.dispose();
      sun.dispose();
      scene.clear();
      releaseRenderer(owner);
    },
  };
}

/** WebGL을 못 쓸 때: 아무것도 그리지 않는 엔진(화면은 안내를 띄운다) */
function inertEngine(): SecondMapEngine {
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
    pixelsPerMetre: 0,
    viewSpanM: 0,
    terrainBuildMs: null,
    terrainSource: null,
    contextLost: false,
  };
  const camera: CameraState = { targetX: 0, targetY: 0, targetZ: 0, yaw: 0, pitch: 0, distance: 0 };
  return {
    setTerrain: () => Promise.resolve(),
    setUnits: () => undefined,
    setUnitPath: () => undefined,
    stopUnit: () => undefined,
    unitState: () => null,
    setBuildings: () => undefined,
    select: () => undefined,
    selected: () => null,
    stats: () => empty,
    camera: () => camera,
    dispose: () => undefined,
  };
}
