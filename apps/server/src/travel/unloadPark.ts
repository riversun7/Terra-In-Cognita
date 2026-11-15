// 2차맵을 내리고 띄울 때의 좌표 유닛 옮기기 — docs/adr/2026-11-15-unloaded-second-maps.md 2절·3절. service.ts가 부른다(그 파일 1,000줄 상한).
// - 내리기 전(parkMapUnits): 쉬는 유닛(걷는 중 아님·직무 없음·봇 아님)만 있는 2차맵이면 모두 그 자리의 좌표 유닛(서 있음)으로 옮긴다. 배는 승객과
//   함께 옮긴다(transferOut의 riders). 하나라도 옮길 수 없으면 아무것도 옮기지 않는다(부르기 전에 parkableMap으로 본다).
// - 띄울 때(placeFinder): 장부의 칸이 막혔으면 가장 가까운 설 칸(걷는 유닛 = 땅, 배 = 물).
// - 띄우지 않은 2차맵 탐사 기록(exploreOffMap): 2차맵 시야와 같은 원(UNIT_VISION_CELLS)을 탐사 비트에 더한다.
// 판정 규칙이 아니라 서버가 유닛을 어디에 들고 있는지다.
import {
  type CellPoint,
  JOB_NONE,
  type Point,
  UNIT_VISION_CELLS,
  VISION_CELLS,
  addCoverBits,
  arrivalAt,
  positionAt,
  stampVision,
  visionCellOf,
  visionRadius,
} from "@terra/sim";
import { VISION_BYTES } from "@terra/protocol";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_BOT } from "../world/unitKinds.ts";
import type { ParkedBook, PlaceFinder } from "./parked.ts";
import { anchorOf, standNear } from "./route.ts";

/** 그 2차맵의 유닛이 모두 쉬는 중인가(걷는 중 아님·직무 없음·봇 아님). 승객은 배를 따른다 */
export function parkableMap(map: SecondMap, atMs: number): boolean {
  let ok = true;
  map.forEachUnit((unit) => {
    if (!ok) return;
    if (unit.kind === UNIT_KIND_BOT || unit.planning || unit.job.job !== JOB_NONE) ok = false;
    else if (unit.aboard === undefined && atMs < arrivalAt(unit.motion)) ok = false;
  });
  return ok;
}

/** 남은 유닛을 모두 그 자리의 좌표 유닛으로 옮긴다. 옮긴 수(승객 포함). 쉬지 않는 유닛이 있으면 −1(아무것도 옮기지 않음) */
export function parkMapUnits(map: SecondMap, book: ParkedBook, atMs: number): number {
  if (!parkableMap(map, atMs)) return -1;
  const leaders: { id: number; cell: CellPoint }[] = [];
  map.forEachUnit((unit) => {
    if (unit.aboard === undefined)
      leaders.push({ id: unit.id, cell: anchorOf(positionAt(unit.motion, atMs), unit.size) });
  });
  let moved = 0;
  for (const leader of leaders.toSorted((a, b) => a.id - b.id)) {
    const row = map.transferOut(leader.id);
    if (!row) continue;
    book.put(row, map.mapKey, leader.cell, atMs);
    moved += 1 + (row.riders?.length ?? 0);
  }
  return moved;
}

/** 띄운 2차맵에 좌표 유닛을 놓을 칸: 서 있던 칸에 설 수 있으면 그 칸, 아니면 가장 가까운 설 칸 */
export function placeFinder(map: SecondMap): PlaceFinder {
  return (row, cell) => {
    const sea = row.domain === "sea";
    const ok = (_mapKey: number, at: CellPoint, size: typeof row.size): boolean =>
      sea ? map.isNavigable(at.x, at.y, size) : map.isStandable(at.x, at.y, size);
    if (ok(map.mapKey, cell, row.size)) return cell;
    return standNear(map.mapKey, cell, row.size, ok);
  };
}

const UNIT_RADIUS = visionRadius(UNIT_VISION_CELLS);

/**
 * 띄우지 않은 2차맵 탐사: 점들 둘레의 시야 원을 탐사 비트(없으면 빈 비트)에 더한다. 바뀌었으면 새 비트, 아니면 null.
 * 2차맵 시야(vision.ts explore)와 같은 원·같은 비트
 */
export function exploreBits(known: Uint8Array | null, points: readonly Point[]): Uint8Array | null {
  const bits = known && known.length === VISION_BYTES ? new Uint8Array(known) : new Uint8Array(VISION_BYTES);
  const cover = new Uint16Array(VISION_CELLS);
  for (const point of points) stampVision(cover, visionCellOf(point), UNIT_RADIUS);
  return addCoverBits(bits, cover) ? bits : null;
}
