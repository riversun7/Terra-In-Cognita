// 건축 모드 자리 계산·기기 대략 판정 — 사용자 요청 2026-11-14 "2차맵에서 건설하는 기능"(docs/adr/2026-11-14-second-map-build.md).
// 사용자 답: 누른 곳에 미리보기, 판정은 기기에서 대략만(막힌 지형·유닛 겹침은 [짓기]를 누르면 서버가 알린다).
// 기기가 보는 것: 2차맵 밖, 다른 건물과 겹침, 물가 조건(물 표), 재료, 땅 규칙(서버 미리 묻기 facilities.landRule 결과).
import type { BuildingFootprint } from "@terra/engine";

/** 2차맵 한 변 배치 칸 수 */
export const PLACEMENT_CELLS = 256;

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

/** 도 → 엔진 4분의 1 바퀴 */
export function quarterTurns(rotation: Rotation): 0 | 1 | 2 | 3 {
  return rotation === 90 ? 1 : rotation === 180 ? 2 : rotation === 270 ? 3 : 0;
}

/** 다음 회전(시계 방향 90°) */
export function nextRotation(rotation: Rotation): Rotation {
  return ROTATIONS[(ROTATIONS.indexOf(rotation) + 1) % ROTATIONS.length] ?? 0;
}

/** 돌린 크기(배치 칸): 90°·270°면 가로·세로가 바뀐다 */
export function rotatedSize(width: number, depth: number, rotation: Rotation): { sx: number; sy: number } {
  return rotation === 90 || rotation === 270 ? { sx: depth, sy: width } : { sx: width, sy: depth };
}

/** 누른 칸이 건물 가운데가 되는 왼쪽 위 칸(정수) */
export function anchorForTap(
  tap: { readonly x: number; readonly y: number },
  width: number,
  depth: number,
  rotation: Rotation,
): { x: number; y: number } {
  const { sx, sy } = rotatedSize(width, depth, rotation);
  return { x: Math.floor(tap.x) - Math.floor(sx / 2), y: Math.floor(tap.y) - Math.floor(sy / 2) };
}

export type PlacementProblem =
  /** 아직 자리를 누르지 않았다 */
  | "no_cell"
  | "out_of_bounds"
  | "overlaps_building"
  | "needs_water"
  | "insufficient_materials"
  /** 서버 땅 규칙: 다른 세력의 도시 2차맵 */
  | "foreign_city"
  /** 서버 땅 규칙: 놓을 자리가 다른 세력의 1차맵 영토(D-568) */
  | "foreign_territory";

export interface PlacementInput {
  /** 왼쪽 위 칸(돌린 뒤), 없으면 아직 안 누름 */
  readonly anchor: { readonly x: number; readonly y: number } | null;
  readonly width: number;
  readonly depth: number;
  readonly rotation: Rotation;
  /** 지금 2차맵 건물(겹침) */
  readonly buildings: readonly BuildingFootprint[];
  /** 물가 조건 상태(economy/FacilityPanel waterStateOf) */
  readonly water: "none" | "unknown" | "ok" | "dry";
  readonly affordable: boolean;
  /** 땅 규칙(모르면 null — 막지 않는다) */
  readonly landAllowed: boolean | null;
  /** 못 지을 때 서버가 준 까닭(없으면 도시 2차맵으로 친다 — 옛 서버) */
  readonly landReason?: "foreign_city" | "foreign_territory" | null | undefined;
}

/** 칸 범위가 겹치나(x0 ≤ x < x1) */
function overlaps(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** 건물 바닥 범위(엔진 footprintRect와 같은 규칙 — 회전은 4분의 1 바퀴) */
function rectOf(building: BuildingFootprint): { x0: number; y0: number; x1: number; y1: number } {
  const odd = building.rotation % 2 === 1;
  const w = odd ? building.depth : building.width;
  const d = odd ? building.width : building.depth;
  return { x0: building.cellX, y0: building.cellY, x1: building.cellX + w, y1: building.cellY + d };
}

/** 기기 대략 판정: 문제 목록(비었으면 [짓기]를 보낼 수 있다 — 막힌 지형·유닛은 서버가 본다) */
export function placementProblems(input: PlacementInput): PlacementProblem[] {
  const problems: PlacementProblem[] = [];
  if (input.landAllowed === false)
    problems.push(input.landReason === "foreign_territory" ? "foreign_territory" : "foreign_city");
  if (!input.anchor) return [...problems, "no_cell"];
  const { sx, sy } = rotatedSize(input.width, input.depth, input.rotation);
  const rect = { x0: input.anchor.x, y0: input.anchor.y, x1: input.anchor.x + sx, y1: input.anchor.y + sy };
  if (rect.x0 < 0 || rect.y0 < 0 || rect.x1 > PLACEMENT_CELLS || rect.y1 > PLACEMENT_CELLS)
    problems.push("out_of_bounds");
  if (input.buildings.some((building) => overlaps(rect, rectOf(building))))
    problems.push("overlaps_building");
  if (input.water === "dry") problems.push("needs_water");
  if (!input.affordable) problems.push("insufficient_materials");
  return problems;
}
