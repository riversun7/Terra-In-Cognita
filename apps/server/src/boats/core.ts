// 배 서비스 공용 부품(형·찾기 도우미) — docs/adr/2026-11-13-boats.md, docs/adr/2026-11-15-shipyard-harbor.md. service.ts·shipyard.ts·harbor.ts가 같이 쓴다.
import type { BusinessCore } from "../business/core.ts";
import type { BoatResultCode } from "@terra/protocol";
import {
  type BoatCoefficients,
  type CellPoint,
  type CellRect,
  PLACEMENT_SIZE,
  anchorAt,
  footprintRect,
  positionAt,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityDef } from "../facilities/catalog.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { BoatFacility, BoatJob, BoatState } from "./store.ts";

export type BoatCommandResult =
  | {
      readonly ok: true;
      readonly boatId?: number;
      /** 타기: 걸어가는 중 / 수리·정박·교역 부두: 배가 그리로 가는 중 */
      readonly walking?: boolean;
      /** 만들기·수리: 끝 시각(만드는 중이면 — 바로 끝났으면 없다) */
      readonly readyAtMs?: number;
    }
  | { readonly ok: false; readonly code: BoatResultCode; readonly readyAtMs?: number };

export const fail = (code: BoatResultCode): BoatCommandResult => ({ ok: false, code });

export interface BoatDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly now: () => number;
  readonly log: { error(obj: object, message: string): void; info?(obj: object, message: string): void };
  readonly ledger: Ledger;
  /** 배 계수(설정 칸 실효 값) */
  rules(): BoatCoefficients;
  /** 새 유닛 ID(세계 전체) */
  nextUnitId(): number;
  /** 사용자의 소유 주체(없으면 내 유닛 없음) */
  ownerOf(userId: string): number | undefined;
  /** 물자 자리 세계(건물 서비스가 만든다). 없으면 busy */
  places(): PlaceWorld | undefined;
  /** 그 건물이 일하나(상태 문턱) */
  works(buildingId: number): boolean;
  /** 직무 배치·노동 계약·건물 작업에 묶였나 */
  unitBusy(unitId: number): boolean;
  /** NPC 세력의 소유 주체인가(NPC 배 시설의 받기 범위 처음 값 — 1498 가). 없으면 아니다 */
  isNpc?: ((ownerId: number) => boolean) | undefined;
  /** 소유 주체 → 나라(같은 나라 받기). 없으면 나라 없음 */
  nationOf?: ((ownerId: number) => number | undefined) | undefined;
  /** 두 나라가 전쟁 중인가(평화 세력 받기). 없으면 아니다 */
  atWar?: ((a: number, b: number) => Promise<boolean>) | undefined;
  /** 정박료·교역 부두 요금 화폐(없으면 요금 없음) */
  readonly feeAsset?: string | undefined;
  /** 사업장 장부(요금 → 시설 금고·소득세, D-548·D-555). 없으면 금고로 바로(시험) */
  readonly business?: Pick<BusinessCore, "receive"> | undefined;
  /** 작업·상태 줄 쓰기(없으면 메모리에만) */
  readonly writer?: Pick<WorldWriter, "upsert" | "remove"> | undefined;
  readonly planetId?: string | undefined;
  /** 부팅 때 읽은 줄(store.ts) */
  readonly jobs?: readonly BoatJob[] | undefined;
  readonly states?: readonly BoatState[] | undefined;
  readonly facilityRows?: readonly BoatFacility[] | undefined;
  /** true면 정시 살피기 타이머를 걸지 않는다(시험이 tick을 부른다) */
  readonly manual?: boolean | undefined;
}

/** 배 크기 등급 */
export const BOAT_SIZE = 2;
/** setTimeout 지연 상한 */
export const MAX_TIMER_MS = 0x7fff_ffff;
/** 도착 확인을 조금 늦춘다(ms) — 도착 시각 반올림 */
export const ARRIVAL_SLACK_MS = 50;
/** 부두 둘레에서 배 자리를 찾는 여유(배치 칸, 물가 조건 반경에 더한다) [임시] */
export const DOCK_WATER_SLACK = 6;

/** 두 칸 네모 사이 체비쇼프 틈(겹치면 0, 붙어 있으면 0) */
export function rectGap(a: CellRect, b: CellRect): number {
  const dx = Math.max(0, b.x - (a.x + a.width - 1) - 1, a.x - (b.x + b.width - 1) - 1);
  const dy = Math.max(0, b.y - (a.y + a.height - 1) - 1, a.y - (b.y + b.height - 1) - 1);
  return Math.max(dx, dy);
}

/**
 * 네모 rect 둘레를 거리 1부터 maxRing까지 고리마다 차례로 돌며 accept가 받는 기준 칸을 모은다(고리 안에서는 위 → 아래, 왼쪽 → 오른쪽 —
 * 같은 입력이면 같은 차례). size = 그 칸에 세울 몸 크기(기준 칸이 몸 왼쪽 위라 왼쪽·위 고리는 size − 1칸 더 나간다). limit개를 모으면 멈춘다
 */
export function ringCells(
  rect: CellRect,
  maxRing: number,
  size: number,
  accept: (x: number, y: number) => boolean,
  limit = 1,
): CellPoint[] {
  const out: CellPoint[] = [];
  for (let ring = 1; ring <= maxRing && out.length < limit; ring++) {
    const x0 = rect.x - ring - (size - 1);
    const y0 = rect.y - ring - (size - 1);
    const x1 = rect.x + rect.width - 1 + ring;
    const y1 = rect.y + rect.height - 1 + ring;
    for (let y = y0; y <= y1 && out.length < limit; y++) {
      for (let x = x0; x <= x1 && out.length < limit; x++) {
        const edge = y === y0 || y === y1 || x === x0 || x === x1;
        if (!edge || x < 0 || y < 0 || x >= PLACEMENT_SIZE || y >= PLACEMENT_SIZE) continue;
        if (accept(x, y)) out.push({ x, y });
      }
    }
  }
  return out;
}

/** 배 시설 둘레에서 배가 설 물 칸(가까운 고리부터, index번째 — 정박장은 배마다 다른 자리, 겹쳐도 된다). 없으면 undefined */
export function waterSpot(
  map: SecondMap,
  rect: CellRect,
  def: Pick<FacilityDef, "needsWaterWithin"> | undefined,
  index = 0,
): CellPoint | undefined {
  const cells = ringCells(
    rect,
    (def?.needsWaterWithin ?? 1) + DOCK_WATER_SLACK,
    BOAT_SIZE,
    (x, y) => map.isNavigable(x, y, BOAT_SIZE),
    index + 1,
  );
  return cells[index] ?? cells[0];
}

/** 유닛 몸 네모(지금 자리) */
export function bodyRect(map: SecondMap, unitId: number, nowMs: number): CellRect | undefined {
  const info = map.unitInfo(unitId);
  if (!info) return undefined;
  const cell = anchorAt(positionAt(info.motion, nowMs), info.size);
  return { x: cell.x, y: cell.y, width: info.size, height: info.size };
}

/** 건물이 선 2차맵·칸·주인 */
export interface FoundBuilding {
  readonly map: SecondMap;
  readonly rect: CellRect;
  readonly ownerId: number | null;
}

export function findBuilding(
  maps: ReadonlyMap<number, SecondMap>,
  buildingId: number,
): FoundBuilding | undefined {
  for (const map of maps.values()) {
    if (map.buildingOwner(buildingId) === undefined) continue;
    let found: FoundBuilding | undefined;
    map.forEachBuilding((building) => {
      if (building.id === buildingId)
        found = { map, rect: footprintRect(building.placement), ownerId: building.ownerId };
    });
    if (found) return found;
  }
  return undefined;
}

/** 시설 줄·정의(없으면 undefined) */
export function facilityOf(
  places: PlaceWorld | undefined,
  buildingId: number,
): { readonly record: FacilityRecord; readonly def: FacilityDef } | undefined {
  const record = places?.facilities.get(buildingId);
  const def = record ? places?.catalog().facility(record.facilityId) : undefined;
  return record && def ? { record, def } : undefined;
}

/** 그 유닛이 있는 2차맵 */
export function mapOfUnit(maps: ReadonlyMap<number, SecondMap>, unitId: number): SecondMap | undefined {
  for (const map of maps.values()) if (map.unitInfo(unitId)) return map;
  return undefined;
}
