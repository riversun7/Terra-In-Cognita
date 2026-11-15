// 좌표 유닛 읽기(서 있음 + 가는 중) — service.ts에서 나눔(그 파일 1,000줄 상한). docs/adr/2026-11-15-unloaded-second-maps.md 5·6절.
// 정산(유지비)·로스터·1차맵 표시·좌표 조우(encounter.ts, D-564 1641)가 같은 목록을 읽는다.
import type { CellPoint } from "@terra/sim";
import type { ParkedBook } from "./parked.ts";
import { anchorOf } from "./route.ts";
import { coordinateOf } from "./serviceParts.ts";
import type { CoordinateUnit, Hidden, Journey } from "./serviceTypes.ts";

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
    if (!hidden || (ownerIds !== null && !ownerIds.has(journey.ownerId))) continue;
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
