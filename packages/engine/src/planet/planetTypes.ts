// 1차맵(행성) 엔진의 바깥 모양(타입) — 게임 앱은 이것만 보고 쓴다. React와 상관없다.
// ADR 2026-10-29-s2-planet-lod "렌더러": 면별 쿼드트리 LOD, 타일 = 맵 레벨의 32×32칸, 서버가 구운 타일을 받는다.
// 타일은 "타일 원천"(TileSource)에서 받는다. 게임 앱은 서버 타일(GET /api/planets/<ID>/tiles/<타일 ID>)의 이진을
// 그대로 넘기고(EncodedTile), 엔진의 메시 워커가 packages/protocol 해석기로 푼다. 시험은 풀어 둔 타일을 바로 준다.
// 타일 모양(DecodedTile)과 물 비트는 다른 꾸러미의 정의 하나를 쓴다: 타일 = protocol PlanetTileData, 물 비트 = @terra/planet.
import {
  type Face,
  MIN_FACE_LEVEL,
  WATER_COAST,
  WATER_DEPTH_MASK,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
} from "@terra/planet";
import type { PlanetTileData } from "@terra/protocol";

/** 타일 요청: 맵 레벨 mapLevel에서 면 face의 칸 [i0, i0 + size) × [j0, j0 + size) */
export interface TileRequest {
  readonly face: Face;
  readonly mapLevel: number;
  readonly i0: number;
  readonly j0: number;
  readonly size: number;
}

/**
 * 풀어 둔 타일 = packages/protocol 타일 해석기(decodePlanetTile)가 돌려주는 PlanetTileData에서 머리의 생성기 버전·
 * 정의 해시를 뺀 것. 그래서 해석기 결과를 바꾸지 않고 그대로 넘겨도 된다(필드 뜻은 PlanetTileData 주석).
 * 칸 배열은 모두 size²개, 꼭짓점 높이는 (size + 1)²개이고 행 우선(j, 그다음 i)이다. 물 비트는 WATER_BITS.
 */
export type DecodedTile = Readonly<Omit<PlanetTileData, "generatorVersion" | "definitionHash">>;

/** 받은 그대로의 서버 타일(압축을 푼 TCPT 이진). 엔진이 메시 워커에서 풀고 모양을 확인한다 */
export interface EncodedTile {
  readonly kind: "encoded";
  readonly bytes: ArrayBuffer;
}

/** 원천이 준 것이 받은 이진인지(아니면 풀어 둔 타일) */
export function isEncodedTile(tile: DecodedTile | EncodedTile): tile is EncodedTile {
  return "kind" in tile && tile.kind === "encoded";
}

/** 물 비트 — @terra/planet 정의(WATER_*)를 이름으로 묶은 것. 4~5비트는 수심 등급(1 연안, 2 대륙붕, 3 심해, 0 모름) */
export const WATER_BITS = {
  ocean: WATER_OCEAN,
  lake: WATER_LAKE,
  river: WATER_RIVER,
  coast: WATER_COAST,
} as const;
export { WATER_DEPTH_SHIFT };

/** 수심 등급(물 비트 4~5) */
export function waterDepthClass(water: number): number {
  return (water & WATER_DEPTH_MASK) >> WATER_DEPTH_SHIFT;
}

/**
 * 타일 원천: 요청 하나에 타일 하나(풀어 둔 것 또는 받은 이진). signal이 멈추면(abort) 받기를 그만두고 거절해도 된다.
 * 엔진은 동시에 budgets.concurrentFetches개까지만 부른다. 받은 타일이 요청과 다르면 실패로 센다(부모가 그린다).
 */
export type TileSource = (request: TileRequest, signal: AbortSignal) => Promise<DecodedTile | EncodedTile>;

/** 행성 설명 — 목록 정보(GET /api/planets/<ID>)에서 오는 값 */
export interface PlanetDescription {
  /** 면 레벨 F(지구 9). 1차맵 5단계 = 맵 레벨 F − 4 ~ F. 렌더러는 4 ~ MAX_RENDER_FACE_LEVEL만 그린다 */
  readonly faceLevel: number;
  /** 해수면 반지름(m, 표시용) — @terra/planet/projection의 planetRadiusMeters(F) */
  readonly radiusM: number;
  /** 바이옴 번호별 색(0xRRGGBB, 0~255번). 없는 번호는 회색으로 그린다 */
  readonly biomeColors: readonly number[];
  /**
   * 가장 높은 땅(게임 m) — 시야 거르기 경계구·지평선·누르기·먼 자르기 면에 쓴다.
   * 목록 정보에는 아직 없다(서버가 구울 때 셀 수 있다 — 타일·서버 작업과 맞출 이음매). 없으면 DEFAULT_MAX_ELEVATION_M이고,
   * 받은 타일이 그보다 높으면 엔진이 그 높이로 늘린다(낮추지는 않는다).
   */
  readonly maxElevationM?: number;
}

/** 행성 설명에 가장 높은 땅이 없을 때 쓰는 값(게임 m). 지구 에베레스트 8,849m ÷ 12 ≈ 737m보다 조금 높게 */
export const DEFAULT_MAX_ELEVATION_M = 1000;

/**
 * 렌더러가 그리는 면 레벨 상한. 자료 없는 마디(맵 레벨 5 ~ F−5)는 늘 나누므로 가장 거친 1차맵 단계(맵 레벨 F−4)가
 * 화면을 덮는다. 면 레벨 11은 그 단계가 면마다 16개(행성 96개)라 보이는 타일 상한(160)을 넘지 않는다.
 * 12부터는 그 단계만으로 상한을 넘는다(고르기만 돌려 잰 값: 면 레벨 12, 가장 먼 거리에서 198개). 더 거친 자료를 ADR로 정할 때까지
 * 받지 않는다. 생성기는 4~10을 만든다(ADR 36 "행성 정의").
 */
export const MAX_RENDER_FACE_LEVEL = 11;

/** 행성 설명이 틀린 이유(문장, 화면에 쓰지 않는다). 맞으면 null */
export function planetDescriptionProblem(planet: PlanetDescription): string | null {
  const { faceLevel, radiusM, maxElevationM } = planet;
  if (!(Number.isInteger(faceLevel) && faceLevel >= MIN_FACE_LEVEL && faceLevel <= MAX_RENDER_FACE_LEVEL)) {
    return `face level must be an integer in [${MIN_FACE_LEVEL}, ${MAX_RENDER_FACE_LEVEL}]: ${faceLevel}`;
  }
  if (!(Number.isFinite(radiusM) && radiusM > 0)) return `planet radiusM must be > 0: ${radiusM}`;
  if (maxElevationM !== undefined && !(Number.isFinite(maxElevationM) && maxElevationM >= 0)) {
    return `planet maxElevationM must be >= 0: ${maxElevationM}`;
  }
  return null;
}

/** 그리는 레이어: 지형(고도·해수면·바이옴 색), 기후(기온·습도 색) */
export type PlanetLayer = "terrain" | "climate";

/** 상한(ADR 36 출발값) */
export interface PlanetBudgets {
  /** 한 화면에 그리는 타일 수 */
  visibleTiles: number;
  /** 동시에 받는 타일 수 */
  concurrentFetches: number;
  /** 한 프레임에 GPU로 올리는 새 타일 수 */
  uploadsPerFrame: number;
  /**
   * 타일 메모리 추정 상한(바이트) — 넘으면 오래 안 쓴 타일부터 버린다.
   * GPU 추정(정점 배열 + 칸 텍스처)에 JS에 남는 것을 더해 센다: three는 올린 뒤에도 그 배열을 들고 있고(컨텍스트 복구 때
   * 다시 올린다), 엔진은 누르기용으로 풀어 둔 타일을 들고 있다. 그래서 올린 타일 하나가 약 108KB다(GPU 50KB + JS 58KB).
   */
  memoryBytes: number;
}

export const DEFAULT_PLANET_BUDGETS: PlanetBudgets = {
  visibleTiles: 160,
  concurrentFetches: 6,
  uploadsPerFrame: 4,
  memoryBytes: 64 * 1024 * 1024,
};

export type PlanetStatus =
  /** 첫 표시(맵 레벨 F−4·F−3 타일 + 첫 프레임) 전 */
  | { kind: "loading" }
  | { kind: "ready" }
  /** WebGL 컨텍스트를 잃었다(iOS 앱 전환 등). 돌아오면 다시 그린다 */
  | { kind: "context-lost" }
  /** 이 기기에서 WebGL을 쓸 수 없다 */
  | { kind: "unsupported"; message: string }
  | { kind: "error"; message: string };

/** 처음 볼 곳 */
export interface PlanetView {
  latDeg: number;
  lonDeg: number;
  /** 목표점에서 카메라까지(m). 없으면 행성 전체가 보이는 거리 */
  distanceM?: number;
}

/** 누른 칸 — 그곳을 덮은 가장 고운 받은 타일의 칸 */
export interface PickedCell {
  readonly face: Face;
  readonly mapLevel: number;
  /** 1차맵 단계(1 거침 ~ 5 고움) */
  readonly primaryLevel: number;
  readonly i: number;
  readonly j: number;
  /** 셀 키(ADR 34) */
  readonly cellKey: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 칸 꼭짓점 4개의 평균 높이(게임 m) */
  readonly heightM: number;
  readonly biome: number;
  readonly water: number;
  readonly temperatureC: number;
  readonly humidity: number;
  readonly forest: number;
  readonly river: number;
}

/** 카메라 요약(표시·시험용) */
export interface PlanetCameraView {
  latDeg: number;
  lonDeg: number;
  /** 목표점에서 카메라까지(m) */
  distanceM: number;
  /** 카메라의 해수면 위 높이(m) */
  altitudeM: number;
  /** 화면 위쪽의 방위(°, 북 0, 동 90) */
  headingDeg: number;
  /** 내려다보는 각에서 기운 정도(°, 0 = 바로 아래) */
  tiltDeg: number;
}

export interface PlanetEngineOptions {
  planet: PlanetDescription;
  tileSource: TileSource;
  layer?: PlanetLayer;
  /** 고도 과장 배율(화면 설정, 판정과 무관). 기본 6 */
  exaggeration?: number;
  /** 화면 오차 문턱(CSS px): 칸 하나가 이보다 크게 보이면 타일을 나눈다. 기본 4 */
  maxScreenErrorPx?: number;
  budgets?: Partial<PlanetBudgets>;
  /** 픽셀 비율 상한(기본: 휴대폰 1.5, 그 밖 2) */
  maxPixelRatio?: number;
  initialView?: PlanetView;
  onStatus?: (status: PlanetStatus) => void;
  /** 칸을 눌렀을 때(타일이 없는 곳이나 행성 밖이면 null) */
  onPick?: (cell: PickedCell | null) => void;
  /** [시험용] 틈 찾기: 바탕 구와 하늘을 자홍색으로 칠한다. 타일 사이에 틈이 있으면 자홍색 점이 보인다 */
  debugCracks?: boolean;
}

export interface PlanetStats {
  /** 지금까지 그린 프레임 수(화면이 멈춰 있으면 늘지 않는다) */
  renderedFrames: number;
  /** 최근 1초 동안 그린 프레임 수 */
  framesLastSecond: number;
  /** 최근 1초, 엔진 한 프레임(고르기·올리기·그리기 명령) 화면 스레드 시간 p95·최대(ms) */
  renderP95Ms: number;
  renderMaxMs: number;
  drawCalls: number;
  triangles: number;
  /** 마지막 프레임에 그린 타일 수(상한 budgets.visibleTiles) */
  tilesDrawn: number;
  /** 화면 오차로 고른 타일 수(아직 안 온 것 포함) */
  tilesSelected: number;
  /** GPU에 올린 타일 수 */
  tilesLoaded: number;
  /** 받는 중·만드는 중·올리기를 기다리는 타일 수 */
  tilesPending: number;
  fetching: number;
  building: number;
  uploadQueue: number;
  /** 지금까지 상한에 걸린 횟수: 타일 수(더 나누지 못한 고르기), 받기(자리가 없어 기다린 요청), 올리기(다음 프레임으로 미룬 타일), 메모리(버린 타일) */
  budgetHits: { tiles: number; fetches: number; uploads: number; memory: number };
  budgets: PlanetBudgets;
  /** 받지 못한 타일 수(누적) */
  tileErrors: number;
  /** GPU 메모리 추정(바이트) */
  gpuBytes: number;
  /** 타일 메모리 추정(바이트, 상한 budgets.memoryBytes): GPU 추정 + JS에 남는 배열·풀어 둔 타일 */
  memoryBytes: number;
  /** 시야 거르기·누르기에 쓰는 가장 높은 땅(게임 m): 행성 설명 값과 받은 타일 중 높은 것 */
  maxElevationM: number;
  /** 화면 가운데에 그린 타일의 1차맵 단계(1~5, 없으면 0)와 맵 레벨 */
  primaryLevel: number;
  mapLevel: number;
  /** 보이는 곳 중 그릴 타일이 없어 바탕 구가 보이는 곳이 있다 */
  incomplete: boolean;
  /** 엔진을 만든 때부터 첫 표시까지(ms) */
  firstDisplayMs: number | null;
  exaggeration: number;
  layer: PlanetLayer;
  pixelRatio: number;
  contextLost: boolean;
  camera: PlanetCameraView;
}

export interface PlanetEngine {
  setLayer(layer: PlanetLayer): void;
  /** 고도 과장 배율(1 ~ 50으로 묶는다) */
  setExaggeration(value: number): void;
  /** 화면 점(CSS px)의 칸. 고르기 표시도 바꾼다 */
  pickAt(point: { x: number; y: number }): PickedCell | null;
  /** 그곳으로 카메라를 옮긴다(움직임 없이) */
  lookAt(view: PlanetView): void;
  stats(): PlanetStats;
  /** 모두 버린다: 그리기 멈춤, 받기 취소, 입력·워커·지오메트리·재질 정리, 캔버스 떼기(렌더러는 다음 화면이 다시 쓴다) */
  dispose(): void;
}
