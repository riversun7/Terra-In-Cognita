// 2차맵 엔진 — Three.js 장면 하나를 화면 요소(container)에 붙이고 지형·건물·유닛을 그린다. React와 나눈 모듈이다.
// ADR 2026-10-28-s1-second-map "렌더링": 렌더러 하나 재사용, 화면 변화가 없으면 그리기 멈춤, 컨텍스트 손실 뒤 복구, 픽셀 비율 상한.
// 한 프레임: 목표점 높이 맞추기 → 카메라 → 유닛 위치(서버 시계로 보간) → 표현 단계(실제 크기/아이콘) → 빛 → 그리기.
// 유닛이 가는 중이거나 카메라가 움직이면 다음 프레임을 예약하고, 아니면 멈춘다(FrameScheduler).
// 낮밤(lighting/): 1차맵과 같은 하늘 모드·달력으로 그 2차맵 자리의 빛을 1초마다 계산하고, 눈에 띄게 바뀔 때만 한 번 그린다.
// 지도 조작(사용자 지적 2026-11-08, docs/adr/2026-11-08-map-input.md): 누르기는 유닛 → 덧그림 층 표시(화면 거리) → 땅 차례, 고른 유닛 따라가기
// (follow, 끌면 돌리기 — docs/adr/2026-11-08-seamless-second-map.md WP-1)·확대 단계 1~6(zoomStep은 단계 대표 거리로 미끄러짐, onZoomStage)는 camera/cameraGlide.ts·secondMapZoom.ts.
import { Frustum, Matrix4, PerspectiveCamera, Scene, type WebGLRenderer } from "three";
import { type BuildingFootprint, footprintMask, footprintOutsideCells } from "./buildings/footprint.ts";
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
  withViewPitch,
} from "./camera/cameraMath.ts";
import { CameraGlide, FOLLOW_SMOOTH_MS } from "./camera/cameraGlide.ts";
import { attachControls } from "./camera/controls.ts";
import { CharacterLayer } from "./characters/characterLayer.ts";
import { WorkingUnits } from "./characters/workingUnits.ts";
import { UNIT_DETAIL_STAGE, localZoomStage, localZoomStepTarget } from "./camera/secondMapZoom.ts";
import { inertEngine } from "./engineParts.ts";
import type {
  EngineStats,
  EngineStatus,
  ObjectProp,
  SecondMapEngine,
  SecondMapEngineOptions,
  UnitSpawn,
  UnitState,
} from "./engineTypes.ts";
import { SceneLight } from "./lighting/sceneLight.ts";
import { UNIT_NIGHT_LIFT, secondMapPlace } from "./lighting/secondMapLight.ts";
import { rayHitsTerrain } from "./picking.ts";
import { FrameScheduler } from "./render/frameScheduler.ts";
import { RenderTimer } from "./render/renderStats.ts";
import { ViewDistanceController } from "./render/viewDistance.ts";
import { EngineLayers, createLayerView } from "./render/engineLayers.ts";
import { acquireRenderer, defaultMaxPixelRatio, releaseRenderer } from "./render/sharedRenderer.ts";
import { type BuiltTerrain, createTerrainBuilder } from "./terrain/terrainBuilder.ts";
import {
  PLACEMENT_CELLS,
  TERRAIN_CELLS,
  type TerrainInput,
  heightRangeM,
  mapSizeM,
  placementCellM,
  sampleHeightM,
  sampleSurfaceM,
  terrainProblem,
} from "./terrain/terrainData.ts";
import { isPlacementExplored } from "./terrain/fogBits.ts";
import { type NeighbourTerrain, NeighbourTerrains, UNEXPLORED } from "./terrain/neighbourTerrains.ts";
import { TerrainView } from "./terrain/terrainView.ts";
import { cameraThroughPlacement, invertPlacement } from "./terrain/rebase.ts";
import { propArea } from "./props/propArea.ts";
import { SchoolView } from "./props/schoolView.ts";
import { propSalt } from "./props/propLook.ts";
import { type PropSource, PropView } from "./props/propView.ts";
import type { UnitPath } from "./units/unitMotion.ts";
import { UnitRoster } from "./units/unitRoster.ts";
import { RouteView } from "./units/routeView.ts";
import { createTargetLife } from "./units/routePath.ts";
import { NationRings } from "./units/nationRings.ts";
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
/** 건물 상자가 땅 닿는 점보다 이만큼(m) 뒤여도 건물로 본다(바닥 판이 땅에 묻힌 곳) */
const BUILDING_PICK_SLACK_M = 0.6;

/** 유닛 앞 옅게: 반지름 = 화면 짧은 변의 이 몫(m 한계 안), 유닛 몸 가운데 높이(m, 땅에서) */
const PROP_FADE_SPAN_SHARE = 0.14;
const PROP_FADE_RADIUS_M = [1.6, 6] as const;
const PROP_FADE_BODY_M = 0.9;

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
      setNightLift: (lift) => {
        unitView.setNightLift(lift);
        characters.setNightLift(lift);
        // 건물: 몸 밤 빛·창문 불빛(밤 정도 = 유닛 밤 빛 ÷ 그 상한)
        buildingView.setNight(lift / UNIT_NIGHT_LIFT);
      },
      redraw: () => scheduler.request(),
    },
  );

  // 지금 2차맵 지형 보기. 옆 2차맵으로 넘으면(rebase) 그 이웃의 보기와 맞바꾼다
  let terrainView = new TerrainView();
  const buildingView = new BuildingView();
  const unitView = new UnitView(capacity);
  // 캐릭터 모델 층: 외형이 붙은 유닛을 가까우면 모델로(characters/characterLayer.ts). 유닛 그림과 같이 보이고 숨는다
  const characters = new CharacterLayer(capacity);
  const working = new WorkingUnits(capacity);
  unitView.group.add(characters.group);
  // 발밑 나라 색 고리(units/nationRings.ts, 질문 963 나): 캡슐·모델 모두. 유닛 그림과 같이 보이고 숨는다
  const rings = new NationRings(capacity);
  unitView.group.add(rings.group);
  const ringRadiusOf = (slot: number): number => unitView.radiusOf(slot);
  scene.add(terrainView.group, buildingView.group, unitView.group);
  // 땅이 오기 전에는 유닛을 그리지 않는다(허공에 뜬 유닛이 잠깐 보이지 않게)
  unitView.group.visible = false;
  const roster = new UnitRoster(unitView, capacity, serverNow);
  const motion = roster.motion;
  /** 유닛 명단이 바뀌면 캐릭터 층·나라 색 고리의 칸 ↔ 유닛을 다시 잇는다 */
  const bindCharacters = (): void => {
    characters.bind(motion.size, (slot) => roster.idAt(slot));
    rings.bind(motion.size, (slot) => roster.idAt(slot));
  };
  // 모델로 그린 유닛은 몸 위 누르기 폭을 모델 폭으로 넓힌다(캡슐보다 넓다)
  roster.modelHalfWidthM = (slot) => characters.pickHalfWidth(slot);
  // 이동 경로·목적지 표시(units/routeView.ts): 화면이 정한 유닛(setRouteUnit)과 누른 목적지(setMoveTarget)
  const routeView = new RouteView();
  scene.add(routeView.group);
  let routeUnit: number | null = null;
  const targetLife = createTargetLife();
  /** 경로 표시를 갱신한다. 누른 목적지가 남아 있으면 true(그것을 거둘 때까지 다시 그린다) */
  const updateRoute = (ppm: number): boolean => {
    const slot = routeUnit === null ? -1 : roster.slotOf(routeUnit);
    const revision = slot >= 0 ? motion.revision(slot) : 0;
    const walking = slot >= 0 && motion.moving[slot] === 1;
    const now = serverNow();
    const target = targetLife.update(revision, walking, now);
    routeView.setPath(
      walking ? `${routeUnit}:${revision}` : "",
      walking ? motion.pathPoints(slot) : null,
      cellM,
      unitGroundAt,
    );
    const travelled = walking ? motion.travelled(slot, now) : 0;
    routeView.update(
      travelled,
      target ?? (walking ? motion.destination(slot) : null),
      cellM,
      unitGroundAt,
      ppm,
    );
    return target !== null;
  };

  let terrain: TerrainInput | null = null;
  /** 지금 2차맵 탐사 칸(안개, null = 끔) — 넘을 때 옛 2차맵 칸을 이웃으로 넘긴다 */
  let mainExplored: Uint8Array | null = null;
  let terrainVersion = 0;
  let minHeight = 0;
  let maxHeight = 0;
  /** 높이 밝기 범위(m): 지형을 새로 만든 2차맵 값. 옆 2차맵으로 넘어도 그대로 둔다(이웃을 같은 범위로 칠해 경계·넘는 순간 밝기가 같게) */
  let shade = { minHeightM: 0, maxHeightM: 0 };
  /** 지금 2차맵 이름(소품 자리 소금 — 넘어도 같은 2차맵의 나무는 같은 자리에 선다) */
  let mainId = options.mapKey === undefined ? null : String(options.mapKey);
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
  // 가시거리 자동 조절: 프레임 시간에 여유가 있으면 소품 모델 거리·상한을 한 단계씩 올리고, 느리면 내린다(render/viewDistance.ts)
  const viewDistance = new ViewDistanceController();
  propView.setReach(viewDistance.level.reachM, viewDistance.level.maxProps);
  /** 화면이 보는 땅에 소품 모델을 (필요하면 다시) 세운다 */
  const updateProps = (): boolean =>
    propView.update(
      spanForDistance(state.distance, viewport),
      propArea(state, viewport, propView.limits.reachM),
    );
  /** 건물 판 안에는 소품 모델을 세우지 않는다: 지금 2차맵 칸 표 + 옆 2차맵 건물(지금 틀로 옮겨 넣은 것)이 차지한 밖 칸 */
  const blockProps = (buildings: readonly BuildingFootprint[]): void =>
    propView.setBlocked(
      footprintMask(buildings, PLACEMENT_CELLS),
      footprintOutsideCells(buildings, PLACEMENT_CELLS),
    );
  // 움직이는 어군(기획 D-536, setSchools)
  const schoolView = new SchoolView();
  scene.add(neighbours.group, propView.group, schoolView.mesh);
  let pendingNeighbours: readonly NeighbourTerrain[] | null = null;
  /** 격자 선(개발자 2차맵 시험, setViewOptions) */
  let grid = false;
  let lastView = "";
  /** 고른 유닛 따라가기·확대 단계 움직임, 지금 확대 단계(바뀔 때 알린다) */
  const glide = new CameraGlide();
  let followSmoothMs = FOLLOW_SMOOTH_MS;
  let zoomStage = 0;
  /** 따라가기를 끊고 알린다(setView) */
  const breakFollow = (): void => {
    const id = glide.followId;
    if (id === null) return;
    glide.follow(null);
    if (!disposed) options.onFollowBreak?.(id);
  };

  // 땅 높이: 지금 2차맵 위면 그 지형, 밖이면 이웃 지형(없으면 가장자리 값)
  const groundAt = (x: number, z: number): number => {
    if (!terrain) return 0;
    if (x >= 0 && z >= 0 && x <= mapSize && z <= mapSize) return sampleHeightM(terrain, x, z);
    return neighbours.heightAt(x, z) ?? sampleHeightM(terrain, x, z);
  };
  // 수면 높이(물 위 소품·어군 — 기획 D-536): 지금 2차맵만 물 높이를 안다(이웃은 땅 높이)
  const surfaceAt = (x: number, z: number): number =>
    terrain && x >= 0 && z >= 0 && x <= mapSize && z <= mapSize
      ? sampleSurfaceM(terrain, x, z)
      : groundAt(x, z);
  // 유닛이 서는 높이: 물 위면 수면(배·승객이 물에 뜬다 — docs/adr/2026-11-13-boats.md), 땅이면 땅
  const unitGroundAt = (x: number, z: number): number => Math.max(groundAt(x, z), surfaceAt(x, z));

  /**
   * 소품 모델 층: 지금 2차맵 + 소품 층이 있는 이웃. 소금은 2차맵 이름에서 정한다(propSalt) — 옆 2차맵으로 넘어 지금 2차맵·이웃이 바뀌어도
   * 같은 2차맵의 나무가 같은 자리·크기로 선다(사용자 지적 2026-11-11 "화면전환의 흔적")
   */
  // 서버 채집 오브젝트의 소품 그림(노두, setObjectProps): 지금 2차맵 그림 층 사본에 덮는다
  let objectProps: readonly ObjectProp[] = [];
  const mainArt = (art: Uint8Array): Uint8Array => {
    if (objectProps.length === 0) return art;
    const out = art.slice();
    for (const prop of objectProps) if (prop.cell >= 0 && prop.cell < out.length) out[prop.cell] = prop.art;
    return out;
  };
  const syncPropSources = (): void => {
    const sources: PropSource[] = [];
    if (terrain?.art && terrain.cover)
      sources.push({
        art: mainArt(terrain.art),
        cover: terrain.cover,
        surface: terrain.surface,
        placement: null,
        salt: propSalt(mainId),
        explored: mainExplored,
      });
    for (const layer of neighbours.propLayers()) {
      sources.push({
        art: layer.art,
        cover: layer.cover,
        surface: layer.surface,
        placement: layer.placement,
        salt: propSalt(layer.id),
        explored: layer.explored,
      });
    }
    propView.setSources(sources, cellM, groundAt, surfaceAt);
  };
  const isPlacementVisible = (px: number, py: number): boolean => {
    if (mainExplored === null) return true;
    if (px >= 0 && px < PLACEMENT_CELLS && py >= 0 && py < PLACEMENT_CELLS) {
      return isPlacementExplored(mainExplored, px, py);
    }
    return neighbours.isPlacementExplored(px, py);
  };
  const syncBuildingVision = (): void => {
    buildingView.setVisibleCell(mainExplored === null ? null : isPlacementVisible);
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
    // 그린 기울기는 거리에 따라 바뀐다(가까이 눕힘, camera/cameraMath.ts viewPitch). 어느 길로 거리를 바꿨든 그리기 전에 맞춘다
    state = withViewPitch(state, limits);
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
    const limit = unitView.mode === "model" ? iconThresholdPx : iconThresholdPx * ICON_HYSTERESIS;
    const mode = zoomStage >= UNIT_DETAIL_STAGE || unitPx >= limit ? "model" : "icon"; // 4단계부터 늘 모델
    if (mode !== unitView.mode) unitView.setMode(mode);
  };

  /** 고른 유닛을 마지막 프레임에 어떻게 그렸나(시험·HUD) */
  const selectedDraw = (): EngineStats["selectedDraw"] => {
    const slot = roster.selectedSlot;
    if (slot < 0) return null;
    if (unitView.mode === "icon") return "icon";
    const as = characters.drawnAs(slot);
    return as === 1 ? "character0" : as === 2 ? "character1" : "capsule";
  };

  /**
   * 유닛 앞 소품 옅게(기획 질문 996 다): 고른 유닛, 없으면 따라가는 유닛의 몸 가운데와 카메라 사이 소품을 점 무늬로 덜 그린다.
   * 앱은 내 유닛만 고르거나 따라간다(엔진은 주인을 모른다). 반지름 = 화면 짧은 변 × PROP_FADE_SPAN_SHARE(한계 안)
   */
  const updatePropFade = (): void => {
    let slot = roster.selectedSlot;
    if (slot < 0 && glide.followId !== null) slot = roster.slotOf(glide.followId);
    const ux = slot >= 0 ? motion.x[slot] : undefined;
    const uy = slot >= 0 ? motion.y[slot] : undefined;
    if (ux === undefined || uy === undefined || !Number.isFinite(ux) || !Number.isFinite(uy)) {
      propView.setFade(null, null, 0);
      return;
    }
    const x = ux * cellM;
    const z = uy * cellM;
    const span = spanForDistance(state.distance, viewport);
    const radius = Math.min(
      PROP_FADE_RADIUS_M[1],
      Math.max(PROP_FADE_RADIUS_M[0], span * PROP_FADE_SPAN_SHARE),
    );
    propView.setFade(camera.position, { x, y: groundAt(x, z) + PROP_FADE_BODY_M, z }, radius);
  };

  const layers = new EngineLayers(scene);
  const layerView = createLayerView({
    camera,
    cellM: () => cellM,
    pixelsPerMetre: () => pixelsPerMetre(state.distance, viewport),
    viewport: () => viewport,
    zoomStage: () => zoomStage,
    groundAt: (x, z) => groundAt(x, z),
  });

  const frame = (time: number, deltaMs: number): boolean => {
    const started = performance.now();
    // 덧그림 층이 먼저 유닛 자리·카메라 목표를 바꾼다(전투 다시보기 시계)
    let animating = layers.before(time);
    // 고른 유닛 따라가기·확대 단계 움직임: 그 유닛의 지금 자리(서버 시계로 보간)로 목표점을 옮긴다
    if (glide.active) {
      const unit = glide.followId === null ? null : roster.state(glide.followId);
      const step = glide.step(
        state,
        unit ? { x: unit.x * cellM, z: unit.y * cellM } : null,
        deltaMs,
        limits,
        followSmoothMs,
      );
      state = step.state;
      if (step.busy) animating = true;
    }
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
    // 가까이면 화면이 보는 땅(가시거리까지)에 소품 모델을 세운다(보는 땅이 세운 땅을 벗어나면 다시 세운다)
    updateProps();
    // 카메라가 바뀌었으면 알린다(나침반·이웃 받기). 같은 값이면 부르지 않는다
    const view = `${state.targetX.toFixed(1)},${state.targetZ.toFixed(1)},${state.yaw.toFixed(3)},${state.distance.toFixed(0)}`;
    if (view !== lastView) {
      lastView = view;
      options.onView?.(state);
    }
    const stage = localZoomStage(state.distance, limits);
    if (stage !== zoomStage) {
      zoomStage = stage;
      options.onZoomStage?.(stage);
    }
    const blending = sceneLight.frame(performance.now());
    moving = motion.update(serverNow());
    updatePropFade();
    const ppm = pixelsPerMetre(state.distance, viewport);
    chooseUnitMode(ppm);
    // 모델로 그릴 유닛을 먼저 고른다(그 유닛은 캡슐을 건너뛴다). flags = 일하는·건물 안(숨김) 칸 표시
    const flags = working.slots(motion.size, (id) => roster.slotOf(id));
    characters.update({
      count: motion.size,
      x: motion.x,
      y: motion.y,
      moving: motion.moving,
      cellM,
      groundAt: unitGroundAt,
      frustum,
      targetX: state.targetX,
      targetZ: state.targetZ,
      pixelsPerMetre: ppm,
      icons: unitView.mode === "icon",
      level: viewDistance.index,
      deltaMs,
      working: flags,
    });
    unitView.update(
      motion.x,
      motion.y,
      cellM,
      unitGroundAt,
      frustum,
      roster.selectedSlot,
      ppm,
      characters.drawn,
    );
    rings.update({
      count: motion.size,
      x: motion.x,
      y: motion.y,
      cellM,
      groundAt: unitGroundAt,
      frustum,
      radiusOf: ringRadiusOf,
      pixelsPerMetre: ppm,
      icons: unitView.mode === "icon",
      flags,
    });
    const targeting = updateRoute(ppm);
    const swimming = schoolView.update(serverNow(), cellM, surfaceAt, frustum, ppm);
    layers.after(layerView);
    renderer.render(scene, camera);
    const info = renderer.info.render;
    lastInfo = { calls: info.calls, triangles: info.triangles, points: info.points };
    const spent = performance.now() - started;
    timer.record(started, spent);
    // 이어서 그린 프레임의 간격·엔진 시간으로 가시거리 단계를 고른다. 바뀌면 다음 프레임에 소품을 다시 세운다
    if (viewDistance.record(deltaMs, spent)) {
      propView.setReach(viewDistance.level.reachM, viewDistance.level.maxProps);
      animating = true;
    }
    return moving > 0 || animating || blending || targeting || swimming || characters.working > 0;
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

  // 누른 곳: 유닛(내 유닛은 넉넉한 화면 거리·남의 유닛은 몸 위, units/unitRoster.ts) → 건물(조각 상자, 땅보다 앞이면) → 땅
  /** 누른 땅(m). outside = 지금 2차맵 밖(그려 둔 이웃 위) */
  const pickGround = (point: ScreenPoint): { x: number; z: number; outside?: true } | null => {
    if (!terrain) return null;
    const ray = screenRay(state, viewport, point);
    const building = buildingView.pick(ray.origin, ray.dir);
    const hit = rayHitsTerrain(
      ray.origin,
      ray.dir,
      groundAt,
      minHeight - 1,
      maxHeight + 1,
      terrain.cellSizeM / 4,
    );
    // 건물이 땅보다 앞에서 시선을 막으면 그 건물 판 안 자리(화면은 칸으로 어느 건물인지 찾는다)
    if (building) {
      const groundDistance = hit
        ? Math.hypot(hit.x - ray.origin.x, hit.y - ray.origin.y, hit.z - ray.origin.z)
        : Number.POSITIVE_INFINITY;
      if (building.distance <= groundDistance + BUILDING_PICK_SLACK_M) {
        // 옆 2차맵 건물(지금 틀로 옮겨 그린 것)이면 옆 2차맵 땅을 누른 것과 같다
        const outside = building.x < 0 || building.z < 0 || building.x > mapSize || building.z > mapSize;
        return outside ? { x: building.x, z: building.z, outside: true } : { x: building.x, z: building.z };
      }
    }
    if (!hit) return null;
    if (hit.x < 0 || hit.z < 0 || hit.x > mapSize || hit.z > mapSize) {
      // 그려 둔 이웃 2차맵 위면 알린다(옆 2차맵으로 보내기 — docs/adr/2026-11-08-seamless-second-map.md WP-3), 아니면 없음
      return neighbours.heightAt(hit.x, hit.z) === null ? null : { x: hit.x, z: hit.z, outside: true };
    }
    return hit;
  };

  const detachControls = attachControls(canvas, {
    getState: () => state,
    // 손가락·휠로 바꾸면 [+]·[−] 움직임은 그만둔다(따라가기는 끌기만 끊는다)
    setState: (next) => {
      glide.stopZoom();
      setCamera(next);
    },
    limits: () => limits,
    viewport: () => viewport,
    onGestureChange: (active) => {
      gestureActive = active;
      if (!active) scheduler.request();
    },
    onTap: (point) => {
      const slot = roster.pick(
        point,
        { camera, state, viewport, cellM, groundAt: unitGroundAt },
        options.wideUnitTap,
      );
      if (slot >= 0) {
        // 화면이 false를 돌려주면(남의 유닛을 살펴보기만 — 명령 유닛은 그대로) 고른 표시를 바꾸지 않는다
        if (options.onSelect?.(roster.idAt(slot)) !== false) {
          roster.selectedSlot = slot;
          scheduler.request();
        }
        return;
      }
      // 덧그림 층 표시(채집 오브젝트·건물 표시 등 — 누르기를 지나보내는 HTML)를 화면 거리로 고른다
      if (layers.tap(point)) return;
      const ground = pickGround(point);
      if (ground?.outside) options.onNeighbourTap?.({ x: ground.x / cellM, y: ground.z / cellM });
      else if (ground) options.onGroundTap?.({ x: ground.x / cellM, y: ground.z / cellM });
      else options.onTapMiss?.();
    },
    onZoomPush: (edge) => {
      if (!disposed) options.onZoomEdge?.(edge);
    },
    // 따라가는 동안 한 손가락 끌기는 돌리기다(따라가기를 끊지 않는다, docs/adr/2026-11-08-seamless-second-map.md WP-1). 끊기는 setView·follow(null)뿐
    centreLocked: () => glide.followId !== null,
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
      // 옆 2차맵에서 넘어와 이미 그리고 있는 지형이면(같은 자료 — 이웃으로 받은 것을 올렸다) 다시 만들지 않는다: 메시·칸 크기·높이 밝기가
      // 바뀌며 화면이 한 번 튀었다(사용자 지적 2026-11-11). 칸 크기·밝기 범위는 화면을 연 2차맵 값을 이어 쓴다
      if (terrain && input.heights === terrain.heights && input.surface === terrain.surface) {
        emit(contextLost ? { kind: "context-lost" } : { kind: "ready" });
        return;
      }
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
      shade = { minHeightM: minHeight, maxHeightM: maxHeight };
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
        blockProps(pendingBuildings);
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

    rebase(id, oldId) {
      if (!terrain || disposed) return false;
      const taken = neighbours.take(id);
      if (!taken) return false;
      // 덮어 세운 오브젝트 소품은 옛 2차맵 것이다 — 부르는 쪽이 새 2차맵 목록을 다시 넣는다
      objectProps = [];
      // 옛 2차맵 칸 좌표 → 새 2차맵 칸 좌표. 이웃 지형은 지금 2차맵 칸 크기로 맞춰 그렸으니 같은 칸 크기로 옮긴다
      const back = invertPlacement(taken.placement);
      state = cameraThroughPlacement(state, back, terrain.cellSizeM);
      neighbours.reframe(back);
      const old = terrainView;
      neighbours.adopt(oldId, old, terrain, back, mainExplored);
      // 새 2차맵: 그 이웃의 보기를 지금 2차맵 자리(제자리)로
      terrainView = taken.view;
      terrainView.group.matrix.identity();
      terrainView.group.matrixAutoUpdate = true;
      terrainView.group.position.set(0, 0, 0);
      scene.add(terrainView.group);
      terrainView.setWalls(false);
      terrainView.setGrid(grid);
      terrain = taken.terrain;
      mainId = id;
      // 더 늦게 오는 옛 2차맵 지형 결과는 버린다
      terrainVersion += 1;
      mapSize = mapSizeM(terrain);
      cellM = placementCellM(terrain);
      // 누르기(시선 ∩ 땅)에 쓰는 높이 범위는 새 2차맵 것으로(밝기 범위 shade는 그대로 — 넘는 순간 밝기가 바뀌지 않게)
      const range = heightRangeM(terrain);
      minHeight = range.minHeightM;
      maxHeight = range.maxHeightM;
      mainExplored = mainExplored === null ? null : (taken.explored ?? UNEXPLORED);
      terrainView.setExplored(mainExplored);
      schoolView.setExplored(mainExplored);
      // 옛 2차맵 유닛·건물은 버린다(화면이 같은 작업 안에서 — 다음 프레임 전에 — 새 틀의 목록을 넣는다, mapSession.ts)
      roster.set([]);
      bindCharacters();
      // 경로는 새 목록의 경로로 다시 그린다. 누른 목적지는 새 틀로 옮긴다(넘은 뒤에도 고리가 누른 자리에 남는다)
      routeView.clear();
      const half = 2;
      targetLife.shift((cell) => ({
        x: (back.a * (cell.x / half) + back.b * (cell.y / half) + back.tx) * half,
        y: (back.cc * (cell.x / half) + back.d * (cell.y / half) + back.tz) * half,
      }));
      buildingView.set([], cellM, groundAt);
      blockProps([]);
      pendingBuildings = null;
      syncPropSources();
      syncBuildingVision();
      // 보기 범위(플레이어 카메라 묶기)도 새 틀로 옮긴다: 비우면 가장 멀리 한계가 바뀌어 확대 단계 표시가 잠깐 달라졌다.
      // 화면이 새 2차맵 값을 받으면 다시 건다
      if (viewArea) {
        const size = terrain.cellSizeM;
        viewArea = viewArea.map((disc) => ({
          x: (back.a * (disc.x / size) + back.b * (disc.z / size) + back.tx) * size,
          z: (back.cc * (disc.x / size) + back.d * (disc.z / size) + back.tz) * size,
          r: disc.r,
        }));
      }
      limits = computeLimits();
      state = clampCamera(state, limits);
      lastView = "";
      scheduler.request();
      return true;
    },

    setNeighbourExplored(id, bits) {
      neighbours.setExplored(id, bits);
      syncPropSources();
      syncBuildingVision();
      scheduler.request();
    },

    async setNeighbours(list) {
      if (!terrain) {
        pendingNeighbours = list;
        return;
      }
      const changed = await neighbours.set(list, terrain.cellSizeM, shade);
      if (disposed || !changed) return;
      // 이웃이 있으면 지금 2차맵 가장자리 벽을 숨긴다(이웃 땅과 이어 보이게). 소품 모델도 이웃까지 세운다
      terrainView.setWalls(neighbours.count === 0);
      syncPropSources();
      syncBuildingVision();
      limits = computeLimits();
      state = clampCamera(state, limits);
      scheduler.request();
    },

    setUnits(units: readonly UnitSpawn[]) {
      roster.set(units);
      bindCharacters();
      scheduler.request();
    },

    setUnitModels(models) {
      characters.setLooks(models);
      bindCharacters();
      scheduler.request();
    },

    setWorkingUnits: (ids) => working.set(ids, () => scheduler.request()),
    setHiddenUnits: (ids) => working.hide(ids, () => scheduler.request()),

    setUnitRings(list) {
      rings.setRings(list);
      bindCharacters();
      scheduler.request();
    },

    setSchools(schools) {
      schoolView.set(schools);
      scheduler.request();
    },

    setObjectProps(props) {
      if (props.length === 0 && objectProps.length === 0) return;
      objectProps = props;
      syncPropSources();
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
      mainExplored = bits;
      terrainView.setExplored(bits);
      // 이웃도 같은 안개 모드(전체 보기면 끈다)
      neighbours.setFog(bits !== null);
      syncPropSources();
      schoolView.setExplored(bits);
      syncBuildingVision();
      scheduler.request();
    },
    setBuildings(buildings) {
      if (!terrain) {
        pendingBuildings = buildings;
        return;
      }
      buildingView.set(buildings, cellM, groundAt);
      // 건물 판 안에는 나무 등 소품 모델을 세우지 않는다
      blockProps(buildings);
      scheduler.request();
    },

    select(id) {
      roster.select(id);
      scheduler.request();
    },

    selected() {
      return roster.selectedId();
    },

    setRouteUnit(id) {
      if (id === routeUnit) return;
      routeUnit = id;
      targetLife.set(null, 0, serverNow());
      scheduler.request();
    },

    setMoveTarget(cell) {
      const slot = routeUnit === null ? -1 : roster.slotOf(routeUnit);
      targetLife.set(cell, slot >= 0 ? motion.revision(slot) : 0, serverNow());
      scheduler.request();
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
        drawnUnits: unitView.mode === "model" ? unitView.drawnModels + characters.models : motion.size,
        characters: characters.models,
        characterLod0: characters.lod0,
        selectedDraw: selectedDraw(),
        nationRings: rings.drawn,
        selectedRing: rings.accentAt(roster.selectedSlot),
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
        propClutter: propView.clutterDrawn,
        propsFaded: propView.fadedCount,
        routePoints: routeView.stats.points,
        moveTarget: routeView.stats.target,
        propSpanM: propView.limits.spanM,
        propCap: propView.limits.maxProps,
        viewLevel: viewDistance.index,
        viewReachM: propView.limits.reachM,
        grid,
        zoomStage: localZoomStage(state.distance, limits),
        following: glide.followId,
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
        updateProps();
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

    zoomStep(direction) {
      // 이웃 확대 단계의 대표 거리로 미끄러진다(화면 가운데 = 목표점을 붙잡으므로 거리만 바꾼다). 움직이는 중이면 그 목표에서 센다 —
      // 거듭 누르면 단계를 하나씩 건너고, 이미 그쪽 끝이면 false(화면이 1차맵으로 넘어간다, D-6018)
      const to = localZoomStepTarget(glide.distanceGoal ?? state.distance, direction, limits);
      if (to === null) return false;
      glide.zoomTo(to);
      scheduler.request();
      return true;
    },

    setView(view) {
      breakFollow();
      if (view.spanM !== undefined) glide.stopZoom();
      const distance = view.spanM === undefined ? state.distance : distanceForSpan(view.spanM, viewport);
      state = clampCamera({ ...state, targetX: view.x * cellM, targetZ: view.y * cellM, distance }, limits);
      scheduler.request();
    },

    follow(unitId, followOptions) {
      glide.follow(unitId);
      followSmoothMs = followOptions?.instant === true ? 0 : FOLLOW_SMOOTH_MS;
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
      schoolView.dispose();
      builder.dispose();
      terrainView.dispose();
      buildingView.dispose();
      characters.dispose();
      rings.dispose();
      unitView.dispose();
      routeView.dispose();
      scene.clear();
      releaseRenderer(owner);
    },
  };
}
