// 1차맵(행성) 엔진 — Three.js 장면 하나를 화면 요소(container)에 붙이고 행성 타일을 고르고 받아 그린다. React와 나눈 모듈이다.
// ADR 2026-10-29-s2-planet-lod "렌더러". 2차맵 엔진(secondMapEngine.ts)과 같은 렌더러(acquireRenderer)·프레임 예약(FrameScheduler)을 쓴다.
// 한 프레임: 움직임(두 번 누르기) → 목표점 높이 맞추기 → 카메라(가장 낮은 고도) → 올리기(상한) → 고르기(화면 오차·시야·상한)
//          → 받기(동시 상한, 원하지 않게 된 것 취소) → 그리기 목록 놓기(카메라 기준 좌표) → 그리기 → 메모리 상한.
// 화면 변화가 없으면 그리지 않는다. 받기·만들기가 끝나면 다시 그린다. 컨텍스트를 잃으면 멈췄다가 복구되면 다시 그린다.
// 가장 높은 땅(시야 거르기 경계구·지평선·누르기·먼 자르기 면): 행성 설명 값(없으면 1,000m)과 받은 타일 중 높은 것.
import { averageCellEdgeMeters } from "@terra/planet/projection";
import type { WebGLRenderer } from "three";
import { FrameScheduler } from "../render/frameScheduler.ts";
import { RenderTimer } from "../render/renderStats.ts";
import { acquireRenderer, defaultMaxPixelRatio, releaseRenderer } from "../render/sharedRenderer.ts";
import { frustumPlanes, multiplyMatrices, perspectiveMatrix, viewRotationMatrix } from "./culling.ts";
import {
  GLOBE_FOV_RAD,
  type GlobeLimits,
  type GlobePose,
  type GlobeState,
  type ScreenPoint,
  type Viewport,
  clampGlobe,
  dragGlobe,
  globeLimits,
  globePose,
  grabDirection,
  headingOf,
  initialGlobe,
  latLonOf,
  screenRay,
} from "./globeCamera.ts";
import { attachGlobeControls } from "./globeControls.ts";
import { inertPlanetEngine } from "./inertPlanetEngine.ts";
import { GpuBench } from "./gpuBench.ts";
import { type Selection, selectTiles } from "./lodSelect.ts";
import {
  DEFAULT_MAX_ELEVATION_M,
  DEFAULT_PLANET_BUDGETS,
  type PickedCell,
  type PlanetCameraView,
  type PlanetEngine,
  type PlanetEngineOptions,
  type PlanetLayer,
  type PlanetStats,
  type PlanetStatus,
  type PlanetView as PlanetViewOption,
  planetDescriptionProblem,
} from "./planetTypes.ts";
import { cloudLiftM } from "./cloudSchedule.ts";
import { createProjector } from "./planetOverlay.ts";
import { ATMOSPHERE_SCALE, type PlanetTileGpu, PlanetView } from "./planetView.ts";
import type { PlanetSkyMode } from "./sky.ts";
import { SkyController } from "./skyController.ts";
import { skyLayerFactories } from "./skyLayers.ts";
import { type DecodedLookup, cellAt, displayedHeightAt, rayHitsSurface } from "./surfaceLookup.ts";
import { createTileBuilder } from "./tileBuilder.ts";
import { TilePipeline } from "./tilePipeline.ts";
import { TileShapeCache, coarsestSagM, directionToFaceST, skirtDepthM } from "./tileShape.ts";
import { PRIMARY_LEVELS, type TileLayout, nodeSTRange, primaryLevelOf, tileLayout } from "./tileTree.ts";
import { type Vec3, length, normalize } from "./vec3.ts";

const DEFAULT_EXAGGERATION = 6;
const MIN_EXAGGERATION = 1;
const MAX_EXAGGERATION = 50;
const DEFAULT_MAX_SCREEN_ERROR_PX = 4;
/** 처음 거리 = 가장 먼 거리 × 이 값 */
const INITIAL_DISTANCE_FACTOR = 0.9;
/** 처음 볼 곳(위도·경도) */
const DEFAULT_VIEW: PlanetViewOption = { latDeg: 20, lonDeg: 30 };
/** 목표점 높이를 땅에 맞추는 빠르기(ms, 지수 감쇠 시간) */
const TARGET_HEIGHT_SMOOTH_MS = 120;
/** 카메라 아래 땅에서 띄울 높이 = 가장 가까운 거리 × 이 값 */
const GROUND_CLEARANCE = 0.3;
/** 두 번 누르기: 거리 ÷ 이 값, 걸리는 시간(ms) */
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;
/** 대기 띠를 보이는 거리(행성 반지름 비) */
const ATMOSPHERE_MIN_DISTANCE = 0.25;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

interface ZoomAnimation {
  readonly point: ScreenPoint;
  readonly anchor: Vec3;
  readonly from: number;
  readonly to: number;
  elapsed: number;
}

export function createPlanetEngine(container: HTMLElement, options: PlanetEngineOptions): PlanetEngine {
  const owner = {};
  const createdAt = performance.now();
  const planet = options.planet;
  const budgets = { ...DEFAULT_PLANET_BUDGETS, ...options.budgets };
  const maxScreenErrorPx = options.maxScreenErrorPx ?? DEFAULT_MAX_SCREEN_ERROR_PX;
  const maxPixelRatio = options.maxPixelRatio ?? defaultMaxPixelRatio();
  let exaggeration = clamp(options.exaggeration ?? DEFAULT_EXAGGERATION, MIN_EXAGGERATION, MAX_EXAGGERATION);
  let layer: PlanetLayer = options.layer ?? "terrain";
  let disposed = false;
  const emit = (status: PlanetStatus): void => {
    if (!disposed) options.onStatus?.(status);
  };
  // 그릴 수 없는 행성(면 레벨 12 이상 등, 목록 정보에서 올 수 있다)은 던지지 않고 오류 상태로 알린다(화면이 안내를 띄운다)
  const problem = planetDescriptionProblem(planet);
  if (problem) {
    emit({ kind: "error", message: problem });
    return inertPlanetEngine(exaggeration, layer, budgets);
  }
  const layout = tileLayout(planet.faceLevel);
  const radiusM = planet.radiusM;
  const describedMaxElevationM = Math.max(1, planet.maxElevationM ?? DEFAULT_MAX_ELEVATION_M);

  let renderer: WebGLRenderer;
  try {
    renderer = acquireRenderer(owner);
  } catch (error) {
    emit({ kind: "unsupported", message: error instanceof Error ? error.message : String(error) });
    return inertPlanetEngine(exaggeration, layer, budgets);
  }
  const canvas = renderer.domElement;
  const gl = renderer.getContext();
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.append(canvas);

  const view = new PlanetView(
    radiusM,
    planet.biomeColors,
    GLOBE_FOV_RAD,
    skirtDepthM(layout, radiusM),
    options.debugCracks ?? false,
  );
  view.setExaggeration(exaggeration);
  view.setLayer(layer);
  const shapes = new TileShapeCache(radiusM);
  const finestCellM = averageCellEdgeMeters(layout.lastLevel, radiusM);
  // 행성 몸(가리는 구): 가장 거친 타일 메시의 활꼴 깊이만큼 안쪽
  const occluderRadiusM = radiusM - coarsestSagM(layout, radiusM);

  let viewport: Viewport = { width: 1, height: 1 };
  let limits: GlobeLimits = globeLimits(radiusM, finestCellM, viewport);
  const startView = options.initialView ?? DEFAULT_VIEW;
  let state: GlobeState = initialGlobe(startView.latDeg, startView.lonDeg, limits.maxDistance, limits);
  let cameraPlaced = false;
  let pose: GlobePose = globePose(state, radiusM, limits);
  let gestureActive = false;
  /** 마지막 손가락 동작이 끝난 때(performance.now) — 구름은 300ms 뒤부터 굽는다 */
  let gestureEndedAt = Number.NEGATIVE_INFINITY;
  let animation: ZoomAnimation | null = null;
  let lastSelection: Selection | null = null;
  let tileBudgetHits = 0;
  let lastInfo = { calls: 0, triangles: 0 };
  let firstDisplayMs: number | null = null;
  let contextLost = false;
  let pixelRatio = 1;
  let center = { primaryLevel: 0, mapLevel: 0 };
  let frameNo = 0;
  const timer = new RenderTimer();

  const pipeline = new TilePipeline<PlanetTileGpu>({
    source: options.tileSource,
    builder: createTileBuilder(),
    layout,
    radiusM,
    budgets,
    createGpu: (mesh, node) => view.createTile(mesh, node),
    onChange: () => scheduler.request(),
    now: () => performance.now(),
  });
  const lookup: DecodedLookup = (key) => pipeline.decoded(key);
  /** 가장 높은 땅(게임 m): 설명 값보다 높은 타일이 오면 그 높이(목록 정보에 값이 없거나 틀려도 경계가 땅을 자르지 않게) */
  const maxElevationM = (): number => Math.max(describedMaxElevationM, pipeline.highestHeightM());
  const shownHeight = (direction: Vec3): number => displayedHeightAt(direction, layout, lookup, exaggeration);

  /** 카메라가 아래 땅보다 낮으면 거리를 늘린다(가장 낮은 고도) */
  const keepAboveGround = (): void => {
    for (let i = 0; i < 3; i++) {
      pose = globePose(state, radiusM, limits);
      const ground = shownHeight(normalize(pose.position));
      const altitude = length(pose.position) - radiusM;
      const required = ground + limits.minDistance * GROUND_CLEARANCE;
      if (altitude >= required || state.distance >= limits.maxDistance) return;
      const lift = (required - altitude) / Math.max(0.2, Math.cos(pose.tilt));
      state = { ...state, distance: Math.min(limits.maxDistance, state.distance + lift) };
    }
    pose = globePose(state, radiusM, limits);
  };

  /** 가까운·먼 자르기 면(m): 가까이는 아래 땅까지 반, 멀리는 지평선 너머 가장 높은 땅까지 */
  const clipRange = (): { near: number; far: number } => {
    const cameraRadius = length(pose.position);
    const ground = shownHeight(normalize(pose.position));
    const clearance = Math.max(1, cameraRadius - radiusM - ground);
    const near = Math.max(1, Math.min(clearance * 0.5, state.distance * 0.25));
    // 먼 자르기 면: 가장 높은 땅 또는 구름 껍질 중 높은 것까지
    const outer = radiusM + Math.max(maxElevationM() * exaggeration, cloudLiftM(radiusM, exaggeration));
    const horizon =
      Math.sqrt(Math.max(0, cameraRadius * cameraRadius - occluderRadiusM * occluderRadiusM)) +
      Math.sqrt(Math.max(0, outer * outer - occluderRadiusM * occluderRadiusM));
    return { near, far: Math.max(near * 4, horizon * 1.05 + 1000) };
  };

  const stepAnimation = (deltaMs: number): boolean => {
    if (!animation) return false;
    animation.elapsed += deltaMs;
    // 기기의 "동작 줄이기"를 켜면 움직임 없이 바로 간다
    const u = reducedMotion() ? 1 : Math.min(1, animation.elapsed / DOUBLE_TAP_MS);
    const eased = 1 - (1 - u) ** 3;
    const distance = Math.exp(
      Math.log(animation.from) + (Math.log(animation.to) - Math.log(animation.from)) * eased,
    );
    state = dragGlobe({ ...state, distance }, animation.anchor, animation.point, radiusM, limits, viewport);
    if (u >= 1) animation = null;
    return animation !== null;
  };

  const updateCenterLevel = (selection: Selection): void => {
    const { face, s, t } = directionToFaceST(state.target);
    for (const item of selection.draw) {
      if (item.node.face !== face) continue;
      const range = nodeSTRange(item.node);
      if (s >= range.s0 && s <= range.s0 + range.span && t >= range.t0 && t <= range.t0 + range.span) {
        center = { primaryLevel: primaryLevelOf(layout, item.node.mapLevel), mapLevel: item.node.mapLevel };
        return;
      }
    }
    center = { primaryLevel: 0, mapLevel: 0 };
  };

  const frame = (_time: number, deltaMs: number): boolean => {
    const started = performance.now();
    frameNo += 1;
    let animating = stepAnimation(deltaMs);
    // 누르고 있지 않을 때 목표점 높이를 땅에 맞춘다(끄는 동안은 잡은 구를 그대로 둔다)
    if (!gestureActive) {
      const desired = shownHeight(state.target);
      const diff = desired - state.targetHeight;
      if (Math.abs(diff) > 0.5) {
        const step = Math.abs(diff) < 2 ? diff : diff * (1 - Math.exp(-deltaMs / TARGET_HEIGHT_SMOOTH_MS));
        state = { ...state, targetHeight: state.targetHeight + step };
        animating = true;
      }
    }
    keepAboveGround();
    const aspect = viewport.width / Math.max(1, viewport.height);
    const { near, far } = clipRange();
    view.applyCamera(pose, aspect, near, far);
    view.setAtmosphere(state.distance > radiusM * ATMOSPHERE_MIN_DISTANCE);
    const planes = frustumPlanes(
      multiplyMatrices(
        perspectiveMatrix(GLOBE_FOV_RAD, aspect, near, far),
        viewRotationMatrix(pose.right, pose.up, pose.back),
      ),
    );

    // 올리기 먼저(이번 프레임에 바로 그린다): 지금 원하는 것 우선
    const priority = new Map<number, number>();
    for (const item of lastSelection?.wanted ?? []) priority.set(item.key, item.priority);
    const moreUploads = pipeline.upload(budgets.uploadsPerFrame, priority);

    const selection = selectTiles(
      {
        position: pose.position,
        frustum: planes,
        pixelsPerMeterAtUnitDistance: viewport.height / (2 * Math.tan(GLOBE_FOV_RAD / 2)),
      },
      {
        layout,
        innerRadiusM: radiusM,
        outerRadiusM: radiusM + maxElevationM() * exaggeration,
        occluderRadiusM,
        maxScreenErrorPx,
        maxTiles: budgets.visibleTiles,
      },
      { shape: (key, node) => shapes.get(key, node), drawable: (key) => pipeline.drawable(key) },
    );
    if (selection.budgetHit) tileBudgetHits += 1;
    lastSelection = selection;
    pipeline.touch(selection.used, frameNo);
    pipeline.request(selection.wanted, frameNo);
    const drawn: PlanetTileGpu[] = [];
    for (const item of selection.draw) {
      const gpu = pipeline.gpu(item.key);
      if (gpu) drawn.push(gpu);
    }
    view.showTiles(drawn, pose.position);
    updateCenterLevel(selection);

    // 하늘(낮밤 uniform·달·구름 굽기): 그리기 바로 앞. 켜지는 중·굽는 중이면 다음 프레임도 그린다
    const busy = pipeline.counts();
    const skyMoving = sky.update({
      pose,
      viewport,
      distanceM: state.distance,
      minDistanceM: limits.minDistance,
      layer,
      exaggeration,
      firstDisplayed: firstDisplayMs !== null,
      gestureActive,
      msSinceGesture: started - gestureEndedAt,
      cameraMoving: animating,
      tilesBusy: busy.fetching + busy.building + busy.queued > 0,
      nowMs: started,
    });
    if (bench) bench.measure(() => renderer.render(view.scene, view.camera));
    else renderer.render(view.scene, view.camera);
    const info = renderer.info.render;
    lastInfo = { calls: info.calls, triangles: info.triangles };
    // 덧그림(도시 표시 등): 이 프레임의 카메라로 투영기를 넘긴다(planetOverlay.ts)
    options.onOverlay?.(
      createProjector({
        pose,
        viewport,
        radiusM,
        occluderRadiusM,
        distanceM: state.distance,
        heightAt: shownHeight,
      }),
    );
    pipeline.evict(frameNo, (node) => node.mapLevel <= layout.firstLevel);

    if (firstDisplayMs === null && !selection.incomplete) {
      const early = selection.wanted.some((item) => item.node.mapLevel <= layout.firstLevel + 1);
      if (!early) {
        firstDisplayMs = performance.now() - createdAt;
        if (!contextLost) emit({ kind: "ready" });
      }
    }
    timer.record(started, performance.now() - started);
    return animating || moreUploads || skyMoving;
  };
  const scheduler = new FrameScheduler(frame);
  // 하늘: 옵션이 없으면 off = 지금 모습(편집기·지금 시험). 틈 찾기는 늘 끈다
  const skyModeOf = (mode: PlanetSkyMode | undefined): PlanetSkyMode =>
    options.debugCracks || !mode ? { kind: "off" } : mode;
  const bench = options.gpuBenchRepeat ? new GpuBench(options.gpuBenchRepeat, renderer.getContext()) : null;
  const requestFrame = (): void => scheduler.request();
  const sky = new SkyController({
    radiusM,
    // 달을 가리는 원판 = 대기 띠까지(그 안에 다 들면 보이지 않으므로 그리지 않는다)
    occluderRadiusM: radiusM * ATMOSPHERE_SCALE,
    ...(planet.sky ? { sky: planet.sky } : {}),
    setSkyLight: (blend, sun, strength, at) => view.setSkyLight(blend, sun, strength, at),
    requestFrame,
    // 달·구름: 첫 표시 뒤 숨긴 채 만들고 미리 컴파일한다(skyLayers.ts)
    ...skyLayerFactories({
      renderer,
      view,
      pipeline,
      layout,
      radiusM,
      seed: planet.skySeed ?? 0,
      requestFrame,
      bench,
    }),
  });
  sky.setMode(skyModeOf(options.sky));

  const resize = (): void => {
    const rect = container.getBoundingClientRect();
    viewport = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
    pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(viewport.width, viewport.height, false);
    limits = globeLimits(radiusM, finestCellM, viewport);
    if (!cameraPlaced) {
      const distance = startView.distanceM ?? limits.maxDistance * INITIAL_DISTANCE_FACTOR;
      state = initialGlobe(startView.latDeg, startView.lonDeg, distance, limits);
      cameraPlaced = viewport.width > 1 && viewport.height > 1;
    } else {
      state = clampGlobe(state, limits);
    }
    scheduler.request();
  };
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  resizeObserver?.observe(container);
  resize();

  const pick = (point: ScreenPoint): PickedCell | null => {
    const ray = screenRay(globePose(state, radiusM, limits), viewport, point);
    const hit = rayHitsSurface(
      ray.origin,
      ray.dir,
      radiusM,
      maxElevationM() * exaggeration,
      shownHeight,
      finestCellM / 2,
    );
    const cell = hit ? cellAt(normalize(hit), layout, lookup) : null;
    view.setPick(cell);
    scheduler.request();
    return cell;
  };

  const detachControls = attachGlobeControls(canvas, {
    getState: () => state,
    setState: (next) => {
      state = next;
      animation = null;
      scheduler.request();
    },
    limits: () => limits,
    radiusM: () => radiusM,
    viewport: () => viewport,
    onGestureChange: (active) => {
      gestureActive = active;
      if (active) animation = null;
      else {
        gestureEndedAt = performance.now();
        scheduler.request();
      }
    },
    onTap: (point) => options.onPick?.(pick(point)),
    onDoubleTap: (point) => {
      const anchor = grabDirection(
        globePose(state, radiusM, limits),
        viewport,
        point,
        radiusM + state.targetHeight,
      );
      const to = clamp(state.distance / DOUBLE_TAP_ZOOM, limits.minDistance, limits.maxDistance);
      animation = { point, anchor, from: state.distance, to, elapsed: 0 };
      scheduler.request();
    },
  });

  // 컨텍스트 손실(iOS 앱 전환 등): 멈췄다가 복구되면 다시 그린다. three.js가 손실 이벤트의 기본 동작을 막아 복구를 받는다.
  // 복구되면 three가 남겨 둔 배열로 GPU 자원을 다시 올린다(그 프레임은 올리기 상한을 넘는다)
  const onContextLost = (): void => {
    contextLost = true;
    scheduler.pause();
    emit({ kind: "context-lost" });
  };
  const onContextRestored = (): void => {
    contextLost = false;
    sky.contextRestored();
    scheduler.resume();
    emit(firstDisplayMs === null ? { kind: "loading" } : { kind: "ready" });
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  const onVisibility = (): void => {
    if (document.visibilityState === "visible") scheduler.request();
  };
  document.addEventListener("visibilitychange", onVisibility);

  emit({ kind: "loading" });

  const cameraView = (): PlanetCameraView => {
    const current = globePose(state, radiusM, limits);
    const { latDeg, lonDeg } = latLonOf(state.target);
    return {
      latDeg,
      lonDeg,
      distanceM: state.distance,
      altitudeM: length(current.position) - radiusM,
      headingDeg: (headingOf(state) * 180) / Math.PI,
      tiltDeg: (current.tilt * 180) / Math.PI,
    };
  };

  return {
    setLayer(next) {
      layer = next;
      view.setLayer(next);
      scheduler.request();
    },

    setSky(mode) {
      sky.setMode(skyModeOf(mode));
    },

    setExaggeration(value) {
      if (!Number.isFinite(value)) return;
      exaggeration = clamp(value, MIN_EXAGGERATION, MAX_EXAGGERATION);
      // 치마 바닥은 과장과 상관없다(모든 타일이 같은 바닥) — uniform 하나만 바꾼다
      view.setExaggeration(exaggeration);
      scheduler.request();
    },

    pickAt(point) {
      return pick(point);
    },

    lookAt(target: PlanetViewOption) {
      const distance = target.distanceM ?? state.distance;
      state = initialGlobe(target.latDeg, target.lonDeg, distance, limits);
      animation = null;
      scheduler.request();
    },

    requestFrame() {
      scheduler.request();
    },

    stats(): PlanetStats {
      const summary = timer.summary(performance.now());
      const counts = pipeline.counts();
      return {
        renderedFrames: timer.total,
        framesLastSecond: summary.frames,
        renderP95Ms: summary.p95Ms,
        renderMaxMs: summary.maxMs,
        drawCalls: lastInfo.calls,
        triangles: lastInfo.triangles,
        shaderPrograms: renderer.info.programs?.length ?? 0,
        tilesDrawn: lastSelection?.draw.length ?? 0,
        tilesDrawnByLevel: drawnByLevel(lastSelection, layout),
        tilesSelected: lastSelection?.selected ?? 0,
        tilesLoaded: counts.loaded,
        tilesPending: counts.fetching + counts.building + counts.queued,
        fetching: counts.fetching,
        building: counts.building,
        uploadQueue: counts.queued,
        budgetHits: {
          tiles: tileBudgetHits,
          fetches: pipeline.hits.fetches,
          uploads: pipeline.hits.uploads,
          memory: pipeline.hits.memory,
        },
        budgets: { ...budgets },
        tileErrors: pipeline.errors,
        tilesFailed: counts.failed,
        gpuBytes: counts.gpuBytes,
        memoryBytes: counts.memoryBytes,
        maxElevationM: maxElevationM(),
        primaryLevel: center.primaryLevel,
        mapLevel: center.mapLevel,
        incomplete: lastSelection?.incomplete ?? true,
        firstDisplayMs,
        exaggeration,
        layer,
        pixelRatio,
        drawingBufferWidth: gl.drawingBufferWidth,
        drawingBufferHeight: gl.drawingBufferHeight,
        contextLost,
        camera: cameraView(),
        sky: sky.stats(),
        gpuBench: bench?.summary() ?? null,
      };
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
      sky.dispose();
      pipeline.dispose();
      view.dispose();
      releaseRenderer(owner);
    },
  };
}

/** 마지막 고르기에서 그린 타일 수를 1차맵 단계(1~5)별로(차례대로) */
function drawnByLevel(selection: Selection | null, layout: TileLayout): number[] {
  const counts = Array.from({ length: PRIMARY_LEVELS }, () => 0);
  for (const item of selection?.draw ?? []) {
    const index = primaryLevelOf(layout, item.node.mapLevel) - 1;
    if (index >= 0) counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}
