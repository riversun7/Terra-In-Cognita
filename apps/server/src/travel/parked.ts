// 좌표 유닛 장부(서 있음) — docs/adr/2026-11-15-unloaded-second-maps.md 1절·6절, 기획 D-559 1619("2차맵은 대충 계산하고 좌표로만 이동하고
// 1차맵에서만 보여주면 되지 않는가").
// - 띄우지 않은 2차맵 위에 서 있는 유닛: (2차맵 키, 배치 칸) + 유닛 저장 줄(서 있는 움직임). 걷기·시야·경로·예약이 없다(메모리 줄 하나).
// - 저장: 새 표 없음. 유닛 행(world_units)의 2차맵 키·칸이 곧 자리다(넣을 때 쓰기 대기열로 쓴다). 다시 켜면 부팅이 띄우지 않은 2차맵의 유닛
//   행을 이 장부에 다시 넣는다(adopt — 쓰지 않는다).
// - 배는 승객 줄을 함께 넣고 함께 꺼낸다(승객 줄 aboardId = 배). 승객 혼자는 꺼내지 않는다(배의 길 — D-541 1279 나).
// - 2차맵을 띄우면(보는 사람·전투) 그 2차맵의 줄을 꺼내 2차맵이 놓는다(claim). 목표 칸이 막혔으면 가까운 설 칸으로 옮긴다.
// 판정 규칙이 아니라 서버가 유닛을 어디에 들고 있는지다.
import { type CellPoint, anchorCenter } from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type TransferRow, type UnitRow, unitColumnsOf } from "../world/secondMapRows.ts";

/** 장부 한 줄 */
export interface ParkedUnit {
  /** 서 있는 움직임으로 고친 저장 줄(2차맵 키·칸 = 자리) */
  readonly row: UnitRow;
  readonly cell: CellPoint;
  /** 서기 시작한 시각 */
  readonly sinceMs: number;
}

/** 띄운 2차맵에 놓을 칸 고르기: 그 칸에 설 수 있으면 그 칸, 아니면 가까운 설 칸(없으면 null — 그 칸 그대로 둔다) */
export type PlaceFinder = (row: UnitRow, cell: CellPoint) => CellPoint | null;

export interface ParkedBook {
  /** 넣는다(배는 승객도). save면 유닛 행을 쓴다(부팅 adopt는 쓰지 않는다) */
  put(row: TransferRow, mapKey: number, cell: CellPoint, atMs: number, save?: boolean): void;
  /** 꺼낸다(배는 승객을 riders로). 승객 혼자·없으면 undefined */
  take(unitId: number): TransferRow | undefined;
  get(unitId: number): ParkedUnit | undefined;
  /** 그 2차맵의 줄을 모두 꺼낸다(2차맵을 띄울 때). place가 있으면 칸을 고친다(승객은 배 칸) */
  claim(mapKey: number, place?: PlaceFinder): UnitRow[];
  /** 그 2차맵에 그 주인의 유닛이 서 있나(보는 사람이 띄울 수 있나) */
  hasOwnerOn(mapKey: number, ownerId: number): boolean;
  /** 그 주인의 줄(유닛 ID 차례) */
  ofOwner(ownerId: number): ParkedUnit[];
  values(): IterableIterator<ParkedUnit>;
  readonly size: number;
}

/** 그 칸에 서 있는 저장 줄(움직임 = 칸 가운데에 섬, 출발 시각 = at) */
export function standingRow(
  row: TransferRow,
  mapKey: number,
  cell: CellPoint,
  atMs: number,
  aboardId?: number | null,
): UnitRow {
  const center = anchorCenter(cell.x, cell.y, row.size);
  const { riders: _riders, ...plain } = row;
  return {
    ...plain,
    mapKey,
    path: [center.x, center.y],
    pace: null,
    departAtMs: atMs,
    wakeAtMs: null,
    aboardId: aboardId === undefined ? (row.aboardId ?? null) : aboardId,
  };
}

const addTo = (index: Map<number, Set<number>>, key: number, id: number): void => {
  const set = index.get(key);
  if (set) set.add(id);
  else index.set(key, new Set([id]));
};

const removeFrom = (index: Map<number, Set<number>>, key: number, id: number): void => {
  const set = index.get(key);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) index.delete(key);
};

export function createParkedBook(writer?: WorldWriter): ParkedBook {
  const units = new Map<number, ParkedUnit>();
  const byMap = new Map<number, Set<number>>();
  const byOwner = new Map<number, Set<number>>();

  const insert = (entry: ParkedUnit, save: boolean): void => {
    const old = units.get(entry.row.id);
    if (old) {
      removeFrom(byMap, old.row.mapKey, old.row.id);
      removeFrom(byOwner, old.row.ownerId, old.row.id);
    }
    units.set(entry.row.id, entry);
    addTo(byMap, entry.row.mapKey, entry.row.id);
    addTo(byOwner, entry.row.ownerId, entry.row.id);
    if (save) writer?.upsert("units", unitColumnsOf(entry.row));
  };

  const drop = (unitId: number): ParkedUnit | undefined => {
    const entry = units.get(unitId);
    if (!entry) return undefined;
    units.delete(unitId);
    removeFrom(byMap, entry.row.mapKey, unitId);
    removeFrom(byOwner, entry.row.ownerId, unitId);
    return entry;
  };

  /** 그 배의 승객 ID(같은 2차맵 줄 가운데 aboardId = 배) */
  const ridersOf = (boat: ParkedUnit): number[] =>
    [...(byMap.get(boat.row.mapKey) ?? [])].filter((id) => units.get(id)?.row.aboardId === boat.row.id);

  return {
    put(row, mapKey, cell, atMs, save = true) {
      insert({ row: standingRow(row, mapKey, cell, atMs), cell, sinceMs: atMs }, save);
      for (const rider of row.riders ?? [])
        insert({ row: standingRow(rider, mapKey, cell, atMs, row.id), cell, sinceMs: atMs }, save);
    },
    take(unitId) {
      const entry = units.get(unitId);
      if (!entry || (entry.row.aboardId ?? null) !== null) return undefined;
      const riders = ridersOf(entry).flatMap((id) => {
        const taken = drop(id);
        return taken ? [taken.row] : [];
      });
      drop(unitId);
      return riders.length === 0 ? entry.row : { ...entry.row, riders };
    },
    get: (unitId) => units.get(unitId),
    claim(mapKey, place) {
      const ids = [...(byMap.get(mapKey) ?? [])].toSorted((a, b) => a - b);
      const taken = ids.flatMap((id) => {
        const entry = drop(id);
        return entry ? [entry] : [];
      });
      if (!place) return taken.map((entry) => entry.row);
      // 배(또는 혼자 선 유닛)의 칸을 먼저 고르고, 승객은 그 배 칸을 따른다
      const moved = new Map<number, CellPoint>();
      for (const entry of taken) {
        if ((entry.row.aboardId ?? null) !== null) continue;
        const cell = place(entry.row, entry.cell);
        if (cell && (cell.x !== entry.cell.x || cell.y !== entry.cell.y)) moved.set(entry.row.id, cell);
      }
      return taken.map((entry) => {
        const cell = moved.get(entry.row.aboardId ?? entry.row.id);
        return cell ? standingRow(entry.row, mapKey, cell, entry.row.departAtMs) : entry.row;
      });
    },
    hasOwnerOn(mapKey, ownerId) {
      for (const id of byMap.get(mapKey) ?? []) if (units.get(id)?.row.ownerId === ownerId) return true;
      return false;
    },
    ofOwner(ownerId) {
      return [...(byOwner.get(ownerId) ?? [])]
        .toSorted((a, b) => a - b)
        .flatMap((id) => {
          const entry = units.get(id);
          return entry ? [entry] : [];
        });
    },
    values: () => units.values(),
    get size() {
      return units.size;
    },
  };
}
