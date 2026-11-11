// 2차맵 엔진의 바깥 모양(타입) — 게임 앱은 이것만 보고 쓴다. React와 상관없다(stack ADR: 엔진은 React와 나눈다).
// 엔진 안의 고빈도 상태(유닛 위치 등)는 타입 배열에 두고, 바깥에는 요약(stats)만 준다(PLAN 5.7).
import type { BuildingFootprint } from "./buildings/footprint.ts";
import type { CameraState } from "./camera/cameraMath.ts";
import type { SecondMapClockState } from "./lighting/secondMapSky.ts";
import type { PlanetSkyMode } from "./planet/sky.ts";
import type { EngineLayer } from "./render/engineLayers.ts";
import type { NeighbourTerrain } from "./terrain/neighbourTerrains.ts";
import type { TerrainInput } from "./terrain/terrainData.ts";
import type { UnitPath } from "./units/unitMotion.ts";
import type { UnitDisplayMode, UnitLook } from "./units/unitView.ts";

export type EngineStatus =
  /** 지형을 만드는 중(워커) */
  | { kind: "loading" }
  | { kind: "ready" }
  /** WebGL 컨텍스트를 잃었다(iOS 앱 전환 등). 돌아오면 다시 그린다 */
  | { kind: "context-lost" }
  /** 이 기기에서 WebGL을 쓸 수 없다 */
  | { kind: "unsupported"; message: string }
  | { kind: "error"; message: string };

/** 유닛 하나(처음 놓을 때). 좌표는 배치 칸 */
export interface UnitSpawn {
  id: number;
  look: UnitLook;
  x: number;
  y: number;
}

/** 지금 위치와 가는 중인지(배치 칸) */
export interface UnitState {
  x: number;
  y: number;
  moving: boolean;
}

export interface SecondMapEngineOptions {
  /** 서버 시계(ms) — 유닛 경로의 출발 시각과 같은 시계. 기본은 기기 시계 */
  serverNow?: () => number;
  /** 원거리 아이콘으로 바꾸는 기준: 키 1.8m 유닛이 이 CSS 픽셀보다 작게 보이면(기본 8) */
  iconThresholdPx?: number;
  /** 픽셀 비율 상한(기본 2, 휴대폰도). 실제 값 = min(기기 픽셀 비율, 상한) */
  maxPixelRatio?: number;
  /** 유닛 수 상한(기본 2,048) */
  unitCapacity?: number;
  /**
   * 이 2차맵의 키(1차맵 최소 칸의 셀 키). 낮밤 빛의 자리(위도·경도·세계 축)를 정한다. 없거나 셀 키가 아니면 늘 낮(고정 빛)
   */
  mapKey?: number;
  /** 하늘(낮밤) 모드 — 1차맵과 같은 모양(구름은 쓰지 않는다). 없으면 끔 = 지금 고정 빛 */
  sky?: PlanetSkyMode;
  /**
   * 처음 카메라 거리 = 가장 가까운 거리 × 이 값(기본 1.75: 화면 짧은 변 약 70m). 개발자 2차맵 시험은 고저를 보려고 멀리서 시작한다
   */
  initialZoom?: number;
  onStatus?: (status: EngineStatus) => void;
  /**
   * 유닛을 눌렀을 때. 엔진이 고른 표시를 그 유닛으로 옮긴다 — false를 돌려주면 옮기지 않는다(앞 고르기 그대로. 플레이어가 남의 유닛을 누르면
   * 명령 유닛은 그대로 두고 정보 판만 연다, docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)")
   */
  onSelect?: (unitId: number | null) => boolean | void;
  /**
   * 넉넉한 반경으로 고르는 유닛인가(내 유닛 — 화면 거리 22px + 몸 반 높이). false인 유닛(남의 유닛)은 화면의 몸 위를 눌렀을 때만 고르고
   * 빗나간 누르기는 땅 누르기가 된다(picking.ts pickUnit, docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-10)"). 없으면 모두 넉넉히
   */
  wideUnitTap?: (unitId: number) => boolean;
  /** 유닛이 아닌 땅을 눌렀을 때 — 배치 칸 좌표 */
  onGroundTap?: (cell: { x: number; y: number }) => void;
  /** 누른 곳에 아무것도 없을 때(유닛·덧그림 표시·땅·이웃 땅이 아님 — 하늘 등). 화면이 열어 둔 작은 창을 닫는 데 쓴다 */
  onTapMiss?: () => void;
  /**
   * 지금 2차맵 밖, 그려 둔 이웃 2차맵 땅을 눌렀을 때 — 지금 2차맵 틀의 배치 칸 좌표(0~256 밖). 화면이 그 이웃 2차맵·칸으로 바꿔 보낸다
   * (docs/adr/2026-11-08-seamless-second-map.md WP-3)
   */
  onNeighbourTap?: (cell: { x: number; y: number }) => void;
  /**
   * 카메라가 바뀐 프레임마다(그리기 전). 나침반·이웃 2차맵 받기에 쓴다 — 가볍게 처리한다(React 상태를 프레임마다 바꾸지 않는다)
   */
  onView?: (camera: Readonly<CameraState>) => void;
  /**
   * 이미 가장 가까이(in)·가장 멀리(out)에 닿은 채 다시 키우기·줄이기를 했을 때(두 손가락·휠, ADR 2026-11-07-planet-view 2절).
   * 화면이 정한다: out = 1차맵 5단계로(D-6018)
   */
  onZoomEdge?: (edge: "in" | "out") => void;
  /** 확대 단계(1 = 가장 멀리 ~ 5 = 가장 가까이, camera/secondMapZoom.ts)가 바뀔 때. 확대 사다리 표시(사용자 지적 2026-11-08) */
  onZoomStage?: (stage: number) => void;
  /** setView로 옮겨 유닛 따라가기(follow)가 끊겼을 때 — 끊긴 유닛(손으로 끌면 끊지 않고 돌린다) */
  onFollowBreak?: (unitId: number) => void;
}

export interface EngineStats {
  /** 지금까지 그린 프레임 수(화면이 멈춰 있으면 늘지 않는다) */
  renderedFrames: number;
  /** 최근 1초 동안 그린 프레임 수 */
  framesLastSecond: number;
  /** 최근 1초, 엔진 한 프레임(갱신 + 그리기) 화면 스레드 시간 p95·최대(ms) */
  renderP95Ms: number;
  renderMaxMs: number;
  /** 마지막 프레임의 그리기 호출·삼각형·점 수 */
  drawCalls: number;
  triangles: number;
  points: number;
  units: number;
  movingUnits: number;
  /** 마지막 프레임에 그린 유닛 수 — 실제 크기 단계는 화면 안 유닛만, 아이콘 단계는 모두 */
  drawnUnits: number;
  unitMode: UnitDisplayMode;
  /** 쓰는 픽셀 비율 = min(기기 픽셀 비율, 상한) */
  pixelRatio: number;
  /** 그리기 버퍼 크기(실제 픽셀, WebGL drawingBuffer) — 화면 CSS 크기 × pixelRatio. 브라우저가 줄였으면 그 값 */
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  /** 목표점에서 1m의 CSS 픽셀, 화면 짧은 변에 보이는 길이(m) */
  pixelsPerMetre: number;
  viewSpanM: number;
  /** 지형 메시를 만든 시간(ms)과 곳 */
  terrainBuildMs: number | null;
  terrainSource: "worker" | "main" | null;
  contextLost: boolean;
  /** 낮밤 빛 요약(시험·HUD) */
  light: EngineLightStats;
  /** 확대 단계(1 = 가장 멀리 ~ 5 = 가장 가까이) — 지금 거리 한계 기준 */
  zoomStage: number;
  /** 따라가는 유닛(없으면 null) */
  following: number | null;
  /** 그린 이웃 2차맵 수(경계 너머 보기) */
  neighbours: number;
  /** 세운 소품 모델 수(가까이만, 0이면 땅 색만) */
  props: number;
  /** 그린 이동 경로의 잘린 점 수(0이면 경로 없음)와 목적지 표시 여부(setRouteUnit·setMoveTarget) */
  routePoints: number;
  moveTarget: boolean;
  /** 소품 모델을 세우는 화면 짧은 변 상한(m)·모델 수 상한(setViewOptions로 바꾼 값) */
  propSpanM: number;
  propCap: number;
  /** 가시거리 단계(0부터, render/viewDistance.ts — 프레임 시간 여유로 자동)와 그 거리(m, 화면 가운데 땅에서 소품 모델을 세우는 거리) */
  viewLevel: number;
  viewReachM: number;
  /** 격자 선을 그리는지 */
  grid: boolean;
}

/** 보기 설정(개발자 2차맵 시험). 빠진 값은 그대로 둔다 */
export interface EngineViewOptions {
  /** 격자 선(지형 칸 + 16칸) */
  grid?: boolean;
  /** 소품 모델을 세우는 화면 짧은 변 상한(m, 기본 420, 50~3,000) */
  propSpanM?: number;
  /** 소품 모델 수 상한(0~20,000). 주면 가시거리 단계 상한 대신 이 값을 쓴다 */
  propCap?: number;
}

/** 낮밤 빛 요약 */
export interface EngineLightStats {
  /** 시계 상태: 끔·기다림(낮으로 그림)·서버·기기·멈춘 시각 */
  clock: SecondMapClockState;
  /** 낮 정도(0 밤 ~ 1 낮) */
  day: number;
  /** 방향광: 항성·달·없음 */
  source: "sun" | "moon" | "none";
  /** 위를 보는 흰 면의 밝기 ÷ 낮 기준(지금 고정 빛). 채널 평균 */
  flat: number;
  /** 지역 시각(시), 항성·달 고도(°), 달 밝은 비율 — 하늘이 없으면 null */
  localHours: number | null;
  sunElevationDeg: number | null;
  moonElevationDeg: number | null;
  moonLit: number | null;
  /** 빛을 바꾼 횟수(쉬는 동안 다시 그린 원인) */
  changes: number;
}

export interface SecondMapEngine {
  /** 지형을 바꾼다(워커에서 메시를 만든 뒤 걸린다) */
  setTerrain(terrain: TerrainInput): Promise<void>;
  /**
   * 이웃 2차맵 지형(경계 너머 보기). 목록을 통째로 바꾼다(같은 id는 다시 만들지 않는다). 지형이 오기 전이면 그 뒤에 건다.
   * 카메라 목표점이 이웃 위로도 갈 수 있게 된다
   */
  setNeighbours(neighbours: readonly NeighbourTerrain[]): Promise<void>;
  /**
   * 이웃 2차맵 하나(id = setNeighbours의 id)의 탐사 칸(그 2차맵 구독의 vision). 지금 2차맵에 안개가 있으면 이웃도 이것으로 칠하고, 모르는 이웃은
   * 온통 어둡다. null이면 잊는다(docs/adr/2026-11-08-seamless-second-map.md WP-3)
   */
  setNeighbourExplored(id: string, bits: Uint8Array | null): void;
  /**
   * 옆 2차맵으로 넘기(로딩 없는 2차맵 이동, docs/adr/2026-11-08-seamless-second-map.md WP-3): 이웃 id의 지형을 지금 2차맵으로 올리고 지금 2차맵은
   * oldId 이웃으로 내린다(다시 받거나 만들지 않는다). 카메라(확대 거리 그대로)·보기 범위·누른 목적지는 같은 땅이 같은 자리에 보이게 새 틀로 옮기고,
   * 다른 이웃도 옮긴다. 유닛·건물은 비운다 — 부르는 쪽이 같은 작업 안에서(다음 프레임 전에) 새 틀의 목록을 넣는다. 그 이웃이 없으면(아직 받지 않음)
   * 아무것도 하지 않고 false. 칸 크기·높이 밝기 범위는 그 이웃을 그린 값(화면을 연 2차맵 값)을 이어 쓴다: 같은 지형 자료를 setTerrain해도 다시
   * 만들지 않는다("바뀜 (2026-11-11)")
   */
  rebase(id: string, oldId: string): boolean;
  /** 유닛 목록을 통째로 바꾼다(고른 것은 풀린다) */
  setUnits(units: readonly UnitSpawn[]): void;
  /** 서버가 보낸 새 경로 */
  setUnitPath(id: number, path: UnitPath): void;
  /** 지금 자리에 세운다(경로를 점 하나로) */
  stopUnit(id: number): void;
  /** 지금 시각의 위치(배치 칸)와 가는 중인지. 없는 유닛이면 null */
  unitState(id: number): UnitState | null;
  setBuildings(buildings: readonly BuildingFootprint[]): void;
  /** 안개: 탐사 칸(시야 칸 32×32 비트, 128바이트). null이면 끈다(S3 시야 전송) */
  setExplored(bits: Uint8Array | null): void;
  /** 고르기(엔진 안 표시만 바꾼다. onSelect는 부르지 않는다) */
  select(id: number | null): void;
  selected(): number | null;
  /**
   * 이동 경로·목적지를 보일 유닛(null이면 안 보인다). 가는 중이면 남은 경로를 땅 위 점선으로, 끝에 목적지 고리를 그린다. 화면이 내가 다룰 수
   * 있는 고른 유닛으로 정한다(사용자 요청 2026-11-09). 바꾸면 누른 목적지는 거둔다
   */
  setRouteUnit(id: number | null): void;
  /**
   * 누른 목적지(배치 칸, 지금 2차맵 틀 — 밖이면 옆 2차맵). 경로가 오기 전에도 고리를 보인다. 경로 표시 유닛이 그 명령으로 움직이다 멈추거나
   * 몇 초 안에 움직이지 않으면 스스로 거둔다. null이면 거둔다
   */
  setMoveTarget(cell: { x: number; y: number } | null): void;
  stats(): EngineStats;
  /** 지금 카메라(시험·표시용) */
  camera(): Readonly<CameraState>;
  /** 하늘(낮밤) 모드를 바꾼다(동작 줄이기 등). 0.5초에 걸쳐 옮긴다. 셰이더는 다시 만들지 않는다 */
  setSky(mode: PlanetSkyMode): void;
  /** 보기 설정(격자 선·소품 모델 거리·상한, 개발자 2차맵 시험). 게임 자료는 바꾸지 않는다 */
  setViewOptions(options: EngineViewOptions): void;
  /** 덧그림 층을 붙인다(전투 효과 등, render/engineLayers.ts). 떼는 함수를 돌려준다 */
  addLayer(layer: EngineLayer): () => void;
  /** 한 번 더 그린다(층 자료가 바뀌었을 때) */
  requestFrame(): void;
  /** 유닛 하나의 모습(키·굵기·색)을 바꾼다(쓰러짐 등). 없는 유닛이면 아무것도 하지 않는다 */
  setUnitLook(id: number, look: UnitLook): void;
  /**
   * 확대 한 단계(1 = 키우기 [+], −1 = 줄이기 [−]): 이웃 확대 단계의 대표 거리로 약 0.3초에 걸쳐 간다(화면 가운데 기준, 움직이는 중이면 그 목표에서
   * 센다). 이미 그쪽 끝이면 false(화면이 1차맵으로 넘어간다)
   */
  zoomStep(direction: 1 | -1): boolean;
  /**
   * 카메라 목표(배치 칸)와 화면 짧은 변에 보일 길이(m, 없으면 거리 그대로). 한계 안으로 자른다. 유닛을 따라가는 중이면 따라가기를 끊는다
   * (onFollowBreak)
   */
  setView(view: { x: number; y: number; spanM?: number | undefined }): void;
  /**
   * 카메라가 이 유닛을 따라간다(목표점이 그 유닛의 지금 자리로 미끄러진다, null이면 그만). 따라가는 동안 한 손가락 끌기는 카메라 돌리기이고
   * 두 손가락·휠 확대는 화면 가운데(그 유닛) 기준이다. instant면 미끄러지지 않고 바로 붙는다(동작 줄이기)
   */
  follow(unitId: number | null, options?: { readonly instant?: boolean }): void;
  /**
   * 보기 범위(배치 칸 원 여러 개 — 가운데 x·y, 반지름 r): 카메라 목표점이 그 원들 가운데 하나 안에 머물고, 가장 멀리 줄여도 가장 큰 원 지름의
   * 두 배까지만 보인다. null이면 범위 없음(2차맵·이웃 전체). 플레이어 카메라 묶기(기획 정리 630) — 운영자 모드는 null
   */
  setViewArea(area: readonly { x: number; y: number; r: number }[] | null): void;
  /** 모두 버린다: 그리기 멈춤, 입력·워커·지오메트리·재질 정리, 캔버스 떼기(렌더러는 다음 화면이 다시 쓴다) */
  dispose(): void;
}
