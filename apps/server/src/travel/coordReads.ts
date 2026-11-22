// 좌표 유닛 읽기(서 있음 + 가는 중) — service.ts에서 나눔(그 파일 1,000줄 상한). docs/adr/2026-11-15-unloaded-second-maps.md 5·6절.
// 정산(유지비)·로스터·1차맵 표시·좌표 조우(encounter.ts, D-564 1641)가 같은 목록을 읽는다.
import type { CellPoint } from "@terra/sim";
import type { ParkedBook } from "./parked.ts";
import { anchorOf } from "./route.ts";
import { coordinateOf } from "./serviceParts.ts";
import type { CoordinateUnit, Hidden, HiddenPlace, Journey } from "./serviceTypes.ts";

/** 가는 중인 좌표 유닛의 지금 자리(곧은 선 위). 틀이 없으면 null */
export type HiddenPlaceOf = (
  journey: Journey,
  hidden: Hidden,
) => { readonly index: number; readonly mapKey: number; readonly cell: CellPoint } | null;

/** 그 주인들의(null = 모두) 좌표 유닛 — 서 있음 + 가는 중, 승객 포함, 유닛 ID 차례 */
export function coordinateRows(
  parked: ParkedBook,
  journeys: ReadonlyMap<number, Journey>,
  placeOf: HiddenPlaceOf,
  ownerIds: ReadonlySet<number> | null,
): CoordinateUnit[] {
  const out: CoordinateUnit[] = [];
  if (ownerIds === null)
    for (const spot of parked.values()) out.push(coordinateOf(spot.row, spot.row.mapKey, spot.cell, false));
  else
    for (const ownerId of ownerIds)
      for (const spot of parked.ofOwner(ownerId))
        out.push(coordinateOf(spot.row, spot.row.mapKey, spot.cell, false));
  for (const journey of journeys.values()) {
    const hidden = journey.hidden;
    // NPC 이동(npcJourney.ts)은 좌표 유닛 목록에 넣지 않는다(정산·좌표 조우 밖 [임시 — 질문 2696])
    if (!hidden || journey.npc === true || (ownerIds !== null && !ownerIds.has(journey.ownerId))) continue;
    const place = placeOf(journey, hidden);
    const mapKey = place?.mapKey ?? journey.route[hidden.hop.from] ?? 0;
    const cell = place?.cell ?? anchorOf(hidden.exit, hidden.size);
    out.push(coordinateOf(hidden.row, mapKey, cell, true));
    for (const rider of hidden.row.riders ?? []) out.push(coordinateOf(rider, mapKey, cell, true));
  }
  return out.toSorted((a, b) => a.unitId - b.unitId);
}

/** 이 서비스가 든 유닛인가(좌표 유닛 장부·가는 중인 좌표 이동의 행과 승객) */
export function carriesUnit(
  parked: ParkedBook,
  journeys: ReadonlyMap<number, Journey>,
  unitId: number,
): boolean {
  if (parked.get(unitId)) return true;
  for (const journey of journeys.values()) {
    const row = journey.hidden?.row;
    if (row && (row.id === unitId || row.riders?.some((rider) => rider.id === unitId))) return true;
  }
  return false;
}

/** 가는 중인 길이 지금 그 2차맵을 걷거나 곧 그 2차맵에 나타나나(held = 좌표 조우 전투가 끝날 때까지 붙잡은 2차맵 — 지난 것은 지운다) */
export function touchesMap(
  held: Map<number, number>,
  journeys: ReadonlyMap<number, Journey>,
  nowMs: number,
  mapKey: number,
): boolean {
  const until = held.get(mapKey);
  if (until !== undefined) {
    if (nowMs < until) return true;
    held.delete(mapKey);
  }
  // 목적지만 노리는 것은 붙잡지 않는다(내려가면 좌표 유닛으로 닿는다 — ADR 2026-11-15 3절)
  for (const journey of journeys.values()) {
    if (!journey.hidden && journey.route[journey.leg] === mapKey) return true;
    if (journey.hidden && journey.route[journey.hidden.hop.to] === mapKey) return true;
  }
  return false;
}

/** 건너뛰는 중인 유닛의 지금 자리(아니면 undefined) */
export function hiddenAtOf(
  journeys: ReadonlyMap<number, Journey>,
  placeOf: HiddenPlaceOf,
  unitId: number,
): HiddenPlace | undefined {
  const journey = journeys.get(unitId);
  if (!journey?.hidden) return undefined;
  const place = placeOf(journey, journey.hidden);
  return place ? { mapKey: place.mapKey, cellX: place.cell.x, cellY: place.cell.y } : undefined;
}

/** 좌표 유닛(서 있음)의 자리(아니면 undefined) */
export function parkedAtOf(parked: ParkedBook, unitId: number): HiddenPlace | undefined {
  const spot = parked.get(unitId);
  return spot ? { mapKey: spot.row.mapKey, cellX: spot.cell.x, cellY: spot.cell.y } : undefined;
}

/** 좌표 유닛 지표(1분 지표 한 줄): 좌표 유닛(서 있음 + 가는 중)·서 있음·닿음·내린 2차맵에서 옮긴 수 */
export function coordMetrics(
  parked: ParkedBook,
  journeys: ReadonlyMap<number, Journey>,
  counts: { readonly parks: number; readonly lands: number },
): Record<string, number> {
  let moving = 0;
  for (const journey of journeys.values()) if (journey.hidden) moving += 1;
  return {
    coordUnits: parked.size + moving,
    coordParked: parked.size,
    coordLands: counts.lands,
    mapParks: counts.parks,
  };
}
