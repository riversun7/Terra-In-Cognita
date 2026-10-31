// 2차맵 엔진 — Three.js 장면 하나를 화면 요소(container)에 붙이고 지형·건물·유닛을 그린다. React와 나눈 모듈이다.
// ADR 2026-10-28-s1-second-map "렌더링": 렌더러 하나 재사용, 화면 변화가 없으면 그리기 멈춤, 컨텍스트 손실 뒤 복구, 픽셀 비율 상한.
// 한 프레임: 목표점 높이 맞추기 → 카메라 → 유닛 위치(서버 시계로 보간) → 표현 단계(실제 크기/아이콘) → 빛 → 그리기.
// 유닛이 가는 중이거나 카메라가 움직이면 다음 프레임을 예약하고, 아니면 멈춘다(FrameScheduler).
// 낮밤(lighting/): 1차맵과 같은 하늘 모드·달력으로 그 2차맵 자리의 빛을 1초마다 계산하고, 눈에 띄게 바뀔 때만 한 번 그린다.
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
import { inertEngine, lightStats } from "./engineParts.ts";
import type {
  EngineStats,
  EngineStatus,
  SecondMapEngine,
  SecondMapEngineOptions,
  UnitSpawn,
  UnitState,
} from "./engineTypes.ts";
import {
  type SecondMapLight,
  UNIT_NIGHT_LIFT,
  nightAmount,
  secondMapPlace,
} from "./lighting/secondMapLight.ts";
import { SKY_TICK_MS, SecondMapSky } from "./lighting/secondMapSky.ts";
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
import { type NeighbourTerrain, NeighbourTerrains } from "./terrain/neighbourTerrains.ts";
import { TerrainView } from "./terrain/terrainView.ts";
import { type PropSource, PropView } from "./props/propView.ts";
import { type UnitPath, UnitMotionStore } from "./units/unitMotion.ts";
import { UnitView } from "./units/unitView.ts";

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
  const gl = renderer.getContext();
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.append(canvas);

  // 하늘(2차맵 밖) 색과 빛은 낮밤 빛(applyLight)이 정한다 — 세계 색은 화면 테마와 상관없다(D-070)
  const scene = new Scene();
  const background = new Color();
  scene.background = background;
  const camera = new PerspectiveCamera((CAMERA_FOV_RAD * 180) / Math.PI, 1, 1, 10_000);
  // 빛 수는 늘 둘이다(반구 하나 + 방향 하나: 낮에는 항성, 밤에는 달) — 바뀌지 않아 셰이더를 다시 만들지 않는다
  const hemisphere = new HemisphereLight();
  const sun = new DirectionalLight();
  scene.add(hemisphere, sun);
  const sky = new SecondMapSky(
    options.mapKey === undefined ? null : secondMapPlace(options.mapKey),
    options.sky ?? { kind: "off" },
  );

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

  const neighbours = new NeighbourTerrains(builder);
  const propView = new PropView();
  scene.add(neighbours.group, propView.group);
  let pendingNeighbours: readonly NeighbourTerrain[] | null = null;
  let lastView = "";

  // 땅 높이: 지금 2차맵 위면 그 지형, 밖이면 이웃 지형(없으면 가장자리 값)
  const groundAt = (x: number, z: number): number => {
    if (!terrain) return 0;
    if (x >= 0 && z >= 0 && x <= mapSize && z <= mapSize) return sampleHeightM(terrain, x, z);
    return neighbours.heightAt(x, z) ?? sampleHeightM(terrain, x, z);
  };

  /** 소품 모델 층: 지금 2차맵 + 소품 층이 있는 이웃(이름 순서로 소금을 정한다) */
  const syncPropSources = (): void => {
    const sources: PropSource[] = [];
    if (terrain?.art && terrain.cover)
      sources.push({ art: terrain.art, cover: terrain.cover, placement: null, salt: 0 });
    neighbours.propLayers().forEach((layer, index) => {
      sources.push({ art: layer.art, cover: layer.cover, placement: layer.placement, salt: index + 1 });
    });
    propView.setSources(sources, cellM, groundAt);
  };

  /** 카메라 한계: 확대·기울기는 지금 2차맵 기준, 목표점 범위는 이웃까지(경계 너머 보기) */
  const computeLimits = (): CameraLimits => {
    const base = cameraLimitsFor(mapSize, viewport);
    const bounds = neighbours.bounds(mapSize);
    return { ...base, ...bounds };
  };

  // 빛을 three 빛·하늘 색·유닛 밤 빛에 넣는다(숫자 몇 개라 프레임마다 넣어도 싸다)
  const applyLight = (light: SecondMapLight): void => {
    hemisphere.color.setRGB(...light.hemisphereSky);
    hemisphere.groundColor.setRGB(...light.hemisphereGround);
    hemisphere.intensity = light.hemisphereIntensity;
    sun.color.setRGB(...light.directColor);
    sun.intensity = light.directIntensity;
    sun.position.set(...light.direction);
    background.setRGB(...light.background);
    unitView.setNightLift(UNIT_NIGHT_LIFT * nightAmount(light));
  };

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
    // 가까이면 카메라 둘레 소품 모델을 세운다(움직임이 크면 다시 세운다)
    propView.update(state.targetX, state.targetZ, spanForDistance(state.distance, viewport));
    // 카메라가 바뀌었으면 알린다(나침반·이웃 받기). 같은 값이면 부르지 않는다
    const view = `${state.targetX.toFixed(1)},${state.targetZ.toFixed(1)},${state.yaw.toFixed(3)},${state.distance.toFixed(0)}`;
    if (view !== lastView) {
      lastView = view;
      options.onView?.(state);
    }
    const blending = sky.frame(performance.now());
    applyLight(sky.light);
    moving = motion.update(serverNow());
    const ppm = pixelsPerMetre(state.distance, viewport);
    chooseUnitMode(ppm);
    unitView.update(motion.x, motion.y, cellM, groundAt, frustum, selectedSlot, ppm);
    renderer.render(scene, camera);
    const info = renderer.info.render;
    lastInfo = { calls: info.calls, triangles: info.triangles, points: info.points };
    timer.record(started, performance.now() - started);
    return moving > 0 || animating || blending;
  };
  const scheduler = new FrameScheduler(frame);

  // 하늘 시계: 시계 모드면 1초마다 빛을 다시 계산하고, 눈에 띄게 바뀌었을 때만 그린다(숨긴 탭에서는 쉰다)
  let skyTimer: ReturnType<typeof setInterval> | null = null;
  const skyTick = (): void => {
    if (document.visibilityState === "hidden") return;
    if (sky.tick(performance.now())) scheduler.request();
  };
  const syncSkyTimer = (): void => {
    if (sky.ticking && skyTimer === null) skyTimer = setInterval(skyTick, SKY_TICK_MS);
    if (!sky.ticking && skyTimer !== null) {
      clearInterval(skyTimer);
      skyTimer = null;
    }
  };
  sky.tick(performance.now());
  applyLight(sky.light);
  syncSkyTimer();

  const resize = (): void => {
    const rect = container.getBoundingClientRect();
    viewport = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
    pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(viewport.width, viewport.height, false);
    unitView.setPixelScale(canvas.width, canvas.height, pixelRatio);
    limits = computeLimits();
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
    if (document.visibilityState !== "visible") return;
    sky.tick(performance.now());
    scheduler.request();
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
      terrainView.set(built.mesh, input, built.noise);
      syncPropSources();
      unitView.group.visible = true;
      limits = computeLimits();
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
      if (pendingNeighbours) {
        const list = pendingNeighbours;
        pendingNeighbours = null;
        await this.setNeighbours(list);
      }
    },

    async setNeighbours(list) {
      if (!terrain) {
        pendingNeighbours = list;
        return;
      }
      const changed = await neighbours.set(list, terrain.cellSizeM, {
        minHeightM: minHeight,
        maxHeightM: maxHeight,
      });
      if (disposed || !changed) return;
      // 이웃이 있으면 지금 2차맵 가장자리 벽을 숨긴다(이웃 땅과 이어 보이게). 소품 모델도 이웃까지 세운다
      terrainView.setWalls(neighbours.count === 0);
      syncPropSources();
      limits = computeLimits();
      state = clampCamera(state, limits);
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

    setExplored(bits) {
      terrainView.setExplored(bits);
      scheduler.request();
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
        drawingBufferWidth: gl.drawingBufferWidth,
        drawingBufferHeight: gl.drawingBufferHeight,
        pixelsPerMetre: pixelsPerMetre(state.distance, viewport),
        viewSpanM: spanForDistance(state.distance, viewport),
        terrainBuildMs,
        terrainSource,
        contextLost,
        light: lightStats(sky),
        neighbours: neighbours.count,
        props: propView.drawn,
      };
    },

    camera() {
      return state;
    },

    setSky(mode) {
      if (sky.setMode(mode, performance.now())) scheduler.request();
      syncSkyTimer();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      scheduler.stop();
      if (skyTimer !== null) clearInterval(skyTimer);
      detachControls();
      resizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      neighbours.dispose();
      propView.dispose();
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
