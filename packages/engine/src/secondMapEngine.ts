// 2차맵 엔진 — Three.js 장면 하나를 화면 요소(container)에 붙이고 지형·건물·유닛을 그린다. React와 나눈 모듈이다.
// ADR 2026-10-28-s1-second-map "렌더링": 렌더러 하나 재사용, 화면 변화가 없으면 그리기 멈춤, 컨텍스트 손실 뒤 복구, 픽셀 비율 상한.
// 한 프레임: 목표점 높이 맞추기 → 카메라 → 유닛 위치(서버 시계로 보간) → 표현 단계(실제 크기/아이콘) → 빛 → 그리기.
// 유닛이 가는 중이거나 카메라가 움직이면 다음 프레임을 예약하고, 아니면 멈춘다(FrameScheduler).
// 낮밤(lighting/): 1차맵과 같은 하늘 모드·달력으로 그 2차맵 자리의 빛을 1초마다 계산하고, 눈에 띄게 바뀔 때만 한 번 그린다.
import { Frustum, Matrix4, PerspectiveCamera, Scene, type WebGLRenderer } from "three";
import type { BuildingFootprint } from "./buildings/footprint.ts";
import { BuildingView } from "./buildings/buildingView.ts";
import {
  CAMERA_FOV_RAD,
  type CameraLimits,
  type ViewDisc,
  type CameraState,
  type ScreenPoint,
  type Viewport,
  cameraLimitsFor,
  cameraPosition,
  clampCamera,
  distanceForSpan,
  initialCamera,
  pixelsPerMetre,
  screenRay,
  spanForDistance,
} from "./camera/cameraMath.ts";
import { attachControls } from "./camera/controls.ts";
import { inertEngine } from "./engineParts.ts";
import type {
  EngineStats,
  EngineStatus,
  SecondMapEngine,
  SecondMapEngineOptions,
  UnitSpawn,
  UnitState,
} from "./engineTypes.ts";
import { SceneLight } from "./lighting/sceneLight.ts";
import { secondMapPlace } from "./lighting/secondMapLight.ts";
import { rayHitsTerrain } from "./picking.ts";
import { FrameScheduler } from "./render/frameScheduler.ts";
import { RenderTimer } from "./render/renderStats.ts";
import { EngineLayers, createLayerView } from "./render/engineLayers.ts";
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
import type { UnitPath } from "./units/unitMotion.ts";
import { UnitRoster } from "./units/unitRoster.ts";
import { UnitView } from "./units/unitView.ts";

/** 지형이 오기 전 2차맵 크기(평균 칸 11.7m) */
const DEFAULT_CELL_M = 11.7;
/** 아이콘 전환 기준 유닛 키(m)와 기본 픽셀 — 이유는 ADR 33 "구현하며 정한 것" */
const REFERENCE_UNIT_HEIGHT_M = 1.8;
const DEFAULT_ICON_THRESHOLD_PX = 8;
/** 아이콘 → 실제 크기로 돌아갈 때는 조금 더 커져야 한다(경계에서 깜박이지 않게) */
const ICON_HYSTERESIS = 1.15;
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

  const scene = new Scene();
  const camera = new PerspectiveCamera((CAMERA_FOV_RAD * 180) / Math.PI, 1, 1, 10_000);
  // 하늘(2차맵 밖) 색과 빛 둘은 낮밤 빛 장치가 정한다(lighting/sceneLight.ts). 유닛 밤 빛과 다시 그리기는 엔진에 부탁한다
  const sceneLight = new SceneLight(
    scene,
    options.mapKey === undefined ? null : secondMapPlace(options.mapKey),
    options.sky ?? { kind: "off" },
    {
      setNightLift: (lift) => unitView.setNightLift(lift),
      redraw: () => scheduler.request(),
    },
  );

  const terrainView = new TerrainView();
  const buildingView = new BuildingView();
  const unitView = new UnitView(capacity);
  scene.add(terrainView.group, buildingView.group, unitView.group);
  // 땅이 오기 전에는 유닛을 그리지 않는다(허공에 뜬 유닛이 잠깐 보이지 않게)
  unitView.group.visible = false;
  const roster = new UnitRoster(unitView, capacity, serverNow);
  const motion = roster.motion;

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
  let moving = 0;
  let pixelRatio = 1;
  let contextLost = false;
  let lastInfo = { calls: 0, triangles: 0, points: 0 };
  let terrainBuildMs: number | null = null;
  let terrainSource: "worker" | "main" | null = null;
  const timer = new RenderTimer();
  const builder = createTerrainBuilder();
  const frustum = new Frustum();
  const viewProjection = new Matrix4();

  const neighbours = new NeighbourTerrains(builder);
  const propView = new PropView();
  scene.add(neighbours.group, propView.group);
  let pendingNeighbours: readonly NeighbourTerrain[] | null = null;
  /** 격자 선(개발자 2차맵 시험, setViewOptions) */
  let grid = false;
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

  /** 보기 범위(m, setViewArea). null이면 없음 */
  let viewArea: ViewDisc[] | null = null;
  /** 카메라 한계: 확대·기울기는 지금 2차맵 기준, 목표점 범위는 이웃까지(경계 너머 보기). 보기 범위가 있으면 그 원들과 가장 큰 원 기준 줄이기 */
  const computeLimits = (): CameraLimits => {
    const base = cameraLimitsFor(mapSize, viewport);
    const bounds = neighbours.bounds(mapSize);
    if (!viewArea || viewArea.length === 0) return { ...base, ...bounds };
    const widest = viewArea.reduce((max, disc) => Math.max(max, disc.r), 0);
    const maxDistance = Math.max(
      base.minDistance,
      Math.min(base.maxDistance, distanceForSpan(widest * 4, viewport)),
    );
    return { ...base, ...bounds, maxDistance, area: viewArea };
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

  const layers = new EngineLayers(scene);
  const layerView = createLayerView({
    camera,
    cellM: () => cellM,
    pixelsPerMetre: () => pixelsPerMetre(state.distance, viewport),
    viewport: () => viewport,
    groundAt: (x, z) => groundAt(x, z),
  });

  const frame = (time: number, deltaMs: number): boolean => {
    const started = performance.now();
    // 덧그림 층이 먼저 유닛 자리·카메라 목표를 바꾼다(전투 다시보기 시계)
    let animating = layers.before(time);
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
    const blending = sceneLight.frame(performance.now());
    moving = motion.update(serverNow());
    const ppm = pixelsPerMetre(state.distance, viewport);
    chooseUnitMode(ppm);
    unitView.update(motion.x, motion.y, cellM, groundAt, frustum, roster.selectedSlot, ppm);
    layers.after(layerView);
    renderer.render(scene, camera);
    const info = renderer.info.render;
    lastInfo = { calls: info.calls, triangles: info.triangles, points: info.points };
    timer.record(started, performance.now() - started);
    return moving > 0 || animating || blending;
  };
  const scheduler = new FrameScheduler(frame);

  // 하늘 시계: 시계 모드면 1초마다 빛을 다시 계산하고, 눈에 띄게 바뀌었을 때만 그린다(숨긴 탭에서는 쉰다)
  sceneLight.start(performance.now());

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

  // 누른 곳: 유닛(화면 거리, units/unitRoster.ts) → 없으면 땅
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
      const slot = roster.pick(point, { camera, state, viewport, cellM, groundAt });
      if (slot >= 0) {
        roster.selectedSlot = slot;
        scheduler.request();
        options.onSelect?.(roster.idAt(slot));
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
    sceneLight.wake(performance.now());
    scheduler.request();
  };
  document.addEventListener("visibilitychange", onVisibility);

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
        state = initialCamera(mapSize, limits, groundAt(mapSize / 2, mapSize / 2), options.initialZoom);
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
      roster.set(units);
      scheduler.request();
    },

    setUnitPath(id: number, path: UnitPath) {
      if (roster.setPath(id, path)) scheduler.request();
    },

    stopUnit(id: number) {
      if (roster.stop(id)) scheduler.request();
    },

    unitState(id: number): UnitState | null {
      return roster.state(id);
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
      roster.select(id);
      scheduler.request();
    },

    selected() {
      return roster.selectedId();
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
        light: sceneLight.stats(),
        neighbours: neighbours.count,
        props: propView.drawn,
        propSpanM: propView.limits.spanM,
        propCap: propView.limits.maxProps,
        grid,
      };
    },

    camera() {
      return state;
    },

    setSky(mode) {
      sceneLight.setMode(mode, performance.now());
    },

    setViewOptions(view) {
      if (view.grid !== undefined) {
        grid = view.grid;
        terrainView.setGrid(grid);
        neighbours.setGrid(grid);
      }
      if (view.propSpanM !== undefined || view.propCap !== undefined) {
        const current = propView.limits;
        propView.setLimits(view.propSpanM ?? current.spanM, view.propCap ?? current.maxProps);
        propView.update(state.targetX, state.targetZ, spanForDistance(state.distance, viewport));
      }
      scheduler.request();
    },

    addLayer(layer) {
      const remove = layers.add(layer);
      scheduler.request();
      return remove;
    },

    requestFrame() {
      scheduler.request();
    },

    setUnitLook(id, look) {
      if (roster.setLook(id, look)) scheduler.request();
    },

    setView(view) {
      const distance = view.spanM === undefined ? state.distance : distanceForSpan(view.spanM, viewport);
      state = clampCamera({ ...state, targetX: view.x * cellM, targetZ: view.y * cellM, distance }, limits);
      scheduler.request();
    },

    setViewArea(area) {
      viewArea =
        area === null
          ? null
          : area.map((disc) => ({ x: disc.x * cellM, z: disc.y * cellM, r: disc.r * cellM }));
      limits = computeLimits();
      const next = clampCamera(state, limits);
      if (
        next.targetX !== state.targetX ||
        next.targetZ !== state.targetZ ||
        next.distance !== state.distance
      ) {
        state = next;
        scheduler.request();
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      layers.clear();
      scheduler.stop();
      sceneLight.dispose();
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
      scene.clear();
      releaseRenderer(owner);
    },
  };
}
