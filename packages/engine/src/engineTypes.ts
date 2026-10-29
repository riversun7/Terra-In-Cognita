// 2차맵 엔진의 바깥 모양(타입) — 게임 앱은 이것만 보고 쓴다. React와 상관없다(stack ADR: 엔진은 React와 나눈다).
// 엔진 안의 고빈도 상태(유닛 위치 등)는 타입 배열에 두고, 바깥에는 요약(stats)만 준다(PLAN 5.7).
import type { BuildingFootprint } from "./buildings/footprint.ts";
import type { CameraState } from "./camera/cameraMath.ts";
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
  onStatus?: (status: EngineStatus) => void;
  /** 유닛을 눌러 골랐을 때(엔진이 고른 표시를 한다) */
  onSelect?: (unitId: number | null) => void;
  /** 유닛이 아닌 땅을 눌렀을 때 — 배치 칸 좌표 */
  onGroundTap?: (cell: { x: number; y: number }) => void;
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
}

export interface SecondMapEngine {
  /** 지형을 바꾼다(워커에서 메시를 만든 뒤 걸린다) */
  setTerrain(terrain: TerrainInput): Promise<void>;
  /** 유닛 목록을 통째로 바꾼다(고른 것은 풀린다) */
  setUnits(units: readonly UnitSpawn[]): void;
  /** 서버가 보낸 새 경로 */
  setUnitPath(id: number, path: UnitPath): void;
  /** 지금 자리에 세운다(경로를 점 하나로) */
  stopUnit(id: number): void;
  /** 지금 시각의 위치(배치 칸)와 가는 중인지. 없는 유닛이면 null */
  unitState(id: number): UnitState | null;
  setBuildings(buildings: readonly BuildingFootprint[]): void;
  /** 고르기(엔진 안 표시만 바꾼다. onSelect는 부르지 않는다) */
  select(id: number | null): void;
  selected(): number | null;
  stats(): EngineStats;
  /** 지금 카메라(시험·표시용) */
  camera(): Readonly<CameraState>;
  /** 모두 버린다: 그리기 멈춤, 입력·워커·지오메트리·재질 정리, 캔버스 떼기(렌더러는 다음 화면이 다시 쓴다) */
  dispose(): void;
}
