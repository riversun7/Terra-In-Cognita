// 서버가 보낸 2차맵 자료(packages/protocol) → 엔진 입력(@terra/engine) 바꾸기 — 순수 코드(시험 대상)
// 규칙은 작업 기록 2026/10/29-0205-s1-server.md "엔진 연결 메모"와 ADR 2026-10-28-s1-second-map을 따른다.
// - 위치·속도: 서버 고정소수점(배치 칸 하나 = 1024단위) ÷ 1024 = 배치 칸. 출발 시각은 서버 시계 ms 그대로.
// - 지형: 꼭짓점 높이 cm(i32) ÷ 10 → 0.1m 정수(Int16), 지표 코드는 그대로(같은 번호).
//   칸 크기는 지형 파일 2판 머리의 실제 값(mm), 1판이면 행성 격자 평균. 2판 꼭짓점 물 높이는 같은 단위로 바꿔 넘긴다.
// - 건물: rotation ÷ 90 = 엔진 4분의 1 바퀴, height(세로 칸 수) → depth. 기준 칸(왼쪽 위)·홀수 회전에 가로세로 바꿈은 같은 규칙.
// 엔진 값(상수)은 가져오지 않고 같은 값을 여기 둔다(엔진 진입점은 three를 함께 불러온다). 시험이 엔진 값과 같은지 본다.
import {
  type BuildingWire,
  POSITION_UNITS_PER_CELL,
  SECOND_MAP_CELLS,
  TERRAIN_NO_WATER,
  type TerrainData,
  type UnitMotionWire,
} from "@terra/protocol";
import type {
  BuildingFootprint,
  QuarterTurns,
  TerrainInput,
  UnitLook,
  UnitPath,
  UnitSpawn,
} from "@terra/engine";

/** 엔진 지형 칸 수(한 변) = @terra/engine TERRAIN_CELLS */
export const ENGINE_TERRAIN_CELLS = 128;
/** 엔진 배치 칸 수(한 변) = @terra/engine PLACEMENT_CELLS */
export const ENGINE_PLACEMENT_CELLS = 256;
/** 엔진 높이 단위(m) = @terra/engine HEIGHT_UNIT_M */
export const ENGINE_HEIGHT_UNIT_M = 0.1;
/**
 * 지형 칸 한 변(m, 표시용) — 1판 지형 파일(S1 임시 지형)일 때. 행성 격자 지형 칸 평균(ADR 2026-10-29-cell-key-layout,
 * PLAN 5.2: 약 11.7m, 위치마다 ±10%). 2판은 머리의 실제 칸 크기를 쓴다.
 */
export const TERRAIN_CELL_M = 11.72;
/** 엔진 "물 없음" 값 = @terra/engine NO_WATER_UNITS */
export const ENGINE_NO_WATER = -32_768;

const INT16_MIN = -32_768;
const INT16_MAX = 32_767;
/** cm → 0.1m(dm) */
const CM_PER_HEIGHT_UNIT = 10;

export class TerrainFormatError extends Error {
  override readonly name = "TerrainFormatError";
}

/** 서버 지형(TCTR) → 엔진 지형 입력. 엔진이 받는 크기(128칸)가 아니거나 높이 폭이 int16을 넘으면 TerrainFormatError */
export function toTerrainInput(data: TerrainData): TerrainInput {
  const cells = data.terrainSize;
  const vertices = cells + 1;
  if (cells !== ENGINE_TERRAIN_CELLS) {
    throw new TerrainFormatError(`terrain must be ${ENGINE_TERRAIN_CELLS} cells per side: ${cells}`);
  }
  if (data.heights.length !== vertices * vertices || data.surface.length !== cells * cells) {
    throw new TerrainFormatError("terrain arrays do not match the terrain size");
  }
  // cm → dm(반올림). 대부분 int16(±3,276.7m)에 들어간다. 안 들어가면 가운데 높이를 기준(baseHeightM)으로 옮긴다
  const units = new Int32Array(data.heights.length);
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < units.length; i++) {
    const value = Math.round((data.heights[i] ?? 0) / CM_PER_HEIGHT_UNIT);
    units[i] = value;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  let base = 0;
  if (low < INT16_MIN || high > INT16_MAX) {
    if (high - low > INT16_MAX - INT16_MIN) throw new TerrainFormatError("terrain height range is too large");
    base = Math.round((low + high) / 2);
  }
  const heights = new Int16Array(units.length);
  for (let i = 0; i < units.length; i++) heights[i] = (units[i] ?? 0) - base;
  const cellSizeM =
    data.cellSizeMm !== undefined && data.cellSizeMm > 0 ? data.cellSizeMm / 1000 : TERRAIN_CELL_M;
  return {
    heights,
    // 같은 번호(물 0·풀 1·흙 2·바위 3·…·얕은 물 10). 모르는 번호는 엔진이 회색으로 그린다
    surface: data.surface,
    baseHeightM: base * ENGINE_HEIGHT_UNIT_M,
    cellSizeM,
    // 해수면(0m). 2판은 꼭짓점 물 높이(waterLevels)로 그린다
    waterLevelM: 0,
    waterLevels: data.waterLevels ? waterUnits(data.waterLevels, base) : undefined,
    // 소품 그림·엄폐(배치 칸 256²): 엔진이 가까이 모델을 세우고 멀리 땅 색에 섞는다. 크기가 다르면 넘기지 않는다
    ...(data.placementSize === ENGINE_PLACEMENT_CELLS ? { art: data.art, cover: data.cover } : {}),
  };
}

/** 꼭짓점 물 높이 cm → 0.1m(기준 base만큼 옮김, int16로 자름). 물 없음(TERRAIN_NO_WATER)은 엔진 "물 없음" */
function waterUnits(levels: Int32Array, base: number): Int16Array {
  const out = new Int16Array(levels.length);
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i] ?? TERRAIN_NO_WATER;
    out[i] =
      level === TERRAIN_NO_WATER
        ? ENGINE_NO_WATER
        : Math.max(INT16_MIN + 1, Math.min(INT16_MAX, Math.round(level / CM_PER_HEIGHT_UNIT) - base));
  }
  return out;
}

/**
 * 유닛 움직임 → 엔진 경로(배치 칸, 칸/초). 점 하나면 서 있다.
 * 구간 걸음 배율(프로토콜 29, docs/adr/2026-11-14-segment-speed.md)은 그대로 넘긴다(길이가 맞지 않으면 버린다 — 스키마가 이미 막는다)
 */
export function toUnitPath(wire: UnitMotionWire): UnitPath {
  const points = new Float64Array(wire.path.length);
  for (let i = 0; i < points.length; i++) points[i] = (wire.path[i] ?? 0) / POSITION_UNITS_PER_CELL;
  const path: UnitPath = {
    points,
    departAtMs: wire.departAtMs,
    speedCellsPerSec: wire.speed / POSITION_UNITS_PER_CELL,
  };
  if (wire.pace !== undefined && wire.pace.length === points.length / 2 - 1)
    path.paces = Uint16Array.from(wire.pace);
  return path;
}

/**
 * 탈것 표시 종류(프로토콜 UNIT_WIRE_KINDS — 기기 묶음에 zod 스키마를 끌어오지 않게 글자로 둔다). 서버가 유닛의 기본 빠르기로 정한다.
 * 예전에는 움직임 빠르기(2칸/초 이상)로 갈랐는데 운영자 모드 이동(빠르기 100배)이면 내 사이보그가 탈것(낮고 넓은 노란 캡슐, 모델 대상 아님)으로
 * 보였고, 도착한 뒤에도 그 움직임이 남아 다음 보통 이동까지 그대로였다(사용자 지적 2026-11-12 "내 사이보그도 갑자기 기존 노란원통 모델로 돌아가는
 * 문제", docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 유닛 겉모습)")
 */
export const VEHICLE_WIRE_KIND = "vehicle";
/** 배 표시 종류(프로토콜 27 UNIT_WIRE_KINDS, docs/adr/2026-11-13-boats.md). 기기는 배 모델(characters/unitBodies.ts boat)로 그린다 */
export const BOAT_WIRE_KIND = "boat";
/** 배 칠(파란 몸) — 세계 색은 화면 테마와 상관없다(D-070) */
const BOAT_COLOR = 0x6f9fd8;
/**
 * [임시] 크기 등급(통과 폭 1·2·3칸)별 겉모습 — S1 임시 도형(캡슐). 키·굵기는 기획 D-095(일반 0.5~3m, 대형 최대 약 12m) 안에서 고른 값.
 * 진짜 모델·크기는 유닛 자료가 생기면 바꾼다. 가까우면 모델(unitModels.ts)이 캡슐 대신 그린다
 */
const SIZE_LOOKS: Record<UnitMotionWire["size"], { heightM: number; radiusM: number }> = {
  1: { heightM: 1.8, radiusM: 0.3 },
  2: { heightM: 6, radiusM: 1.6 },
  3: { heightM: 12, radiusM: 3 },
};
/** 걷는 유닛 색(파스텔) — 세계 색은 화면 테마와 상관없다(D-070) */
const WALKER_COLORS = [0xff9aa2, 0x8fc8ff, 0xb7a6ff, 0x8fe0bd] as const;
const VEHICLE_COLOR = 0xffcf75;

export function unitLook(wire: Pick<UnitMotionWire, "id" | "size" | "kind">): UnitLook {
  const base = SIZE_LOOKS[wire.size];
  if (wire.kind === BOAT_WIRE_KIND) {
    // 배: 낮고 길게(가까우면 배 모델이 캡슐 대신 그린다)
    return {
      heightM: base.heightM * 0.6,
      radiusM: base.radiusM * 2,
      color: BOAT_COLOR,
      form: "boat",
      sizeClass: wire.size,
    };
  }
  if (wire.kind === VEHICLE_WIRE_KIND) {
    // 탈것: 낮고 넓게
    return {
      heightM: base.heightM * 0.8,
      radiusM: base.radiusM * 2.5,
      color: VEHICLE_COLOR,
      form: "vehicle",
      sizeClass: wire.size,
    };
  }
  return {
    ...base,
    color: WALKER_COLORS[wire.id % WALKER_COLORS.length] ?? WALKER_COLORS[0],
    form: "walker",
    sizeClass: wire.size,
  };
}

/** 엔진에 처음 놓을 때: 겉모습 + 경로의 첫 점(배치 칸). 경로는 toUnitPath로 바로 이어 넣는다 */
export function toUnitSpawn(wire: UnitMotionWire): UnitSpawn {
  return {
    id: wire.id,
    look: unitLook(wire),
    x: (wire.path[0] ?? 0) / POSITION_UNITS_PER_CELL,
    y: (wire.path[1] ?? 0) / POSITION_UNITS_PER_CELL,
  };
}

const QUARTER_TURNS: Record<BuildingWire["rotation"], QuarterTurns> = { 0: 0, 90: 1, 180: 2, 270: 3 };
const BUILDING_COLORS = [0xf6e7c8, 0xf9d2c4, 0xdbe8f4, 0xe4f2d6, 0xf3dfee] as const;

/** 건물 → 엔진 바닥 모양. [임시] 높이·색은 서버가 보내지 않아 ID로 정한다(4~14m) */
export function toFootprint(wire: BuildingWire): BuildingFootprint {
  return {
    id: wire.id,
    cellX: wire.x,
    cellY: wire.y,
    width: wire.width,
    depth: wire.height,
    rotation: QUARTER_TURNS[wire.rotation],
    heightM: 4 + ((wire.id * 7) % 11),
    color: BUILDING_COLORS[wire.id % BUILDING_COLORS.length] ?? BUILDING_COLORS[0],
  };
}

/** 누른 곳(배치 칸, 실수) → 이동 목표(그 칸의 가운데, 고정소수점). 2차맵 밖은 가장자리 칸으로 */
export function targetUnits(cell: number): number {
  const index = Math.min(SECOND_MAP_CELLS - 1, Math.max(0, Math.floor(Number.isFinite(cell) ? cell : 0)));
  return index * POSITION_UNITS_PER_CELL + POSITION_UNITS_PER_CELL / 2;
}
