// 배 서비스 — 부두에서 배 만들기·타기·내리기(docs/adr/2026-11-13-boats.md 3·4절, 기획 D-540 1221 "지도 위 배부터").
// - 판정(소유·거리·자리·재료)은 여기서 하고, 칸·움직임은 2차맵(addBoat·board·disembark)이 한다. 기기는 건물·유닛·배 번호만 보낸다(서버 권위).
// - 배를 만드는 시설 = 단계 transport + 물가 조건(needsWaterWithin)이 있는 시설(부두). 다 지었고(레벨 1 이상) 일하는 부두에서만 만든다.
// - 값 = 부두 레벨 1 건설 재료 × 설정 칸 boat_cost_pm ÷ 1000. 재료 자리는 건물 짓기와 같은 차례(facilities/places.ts materialScope).
//   운영자 모드(전체 보기 + 모든 유닛 명령 권한)는 재료 없이 만든다(배 주인 = 부두 주인, 없으면 운영자 자신).
// - 타기: 유닛 몸과 배 몸 사이가 boat_board_cells 안이면 바로 탄다. 멀면 배 둘레 땅 칸으로 걸어가고 도착 때 다시 보고 탄다
//   (채집 들어가기와 같은 틀, 메모리에만 — 다시 켜면 걸어간 자리에 선다).
// - 내리기: 배가 움직이면 그 자리에 세우고 승객마다 배 둘레 boat_board_cells 안 가장 가까운 땅 칸에 내린다(가까운 칸부터 나눠 준다).
import type { BoatResultCode } from "@terra/protocol";
import {
  type BoatCoefficients,
  type CellPoint,
  type CellRect,
  PLACEMENT_SIZE,
  type SizeClass,
  anchorAt,
  anchorCenter,
  arrivalAt,
  footprintRect,
  positionAt,
} from "@terra/sim";
import { buildCostAt } from "@terra/shared/facilityBuild";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityDef } from "../facilities/catalog.ts";
import { hasGoods, spendGoods } from "../facilities/materials.ts";
import { type PlaceWorld, cityAt, materialScope } from "../facilities/places.ts";
import type { JobMaterial } from "../facilities/state.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import {
  UNIT_KIND_BOAT,
  UNIT_KIND_BOT,
  UNIT_KIND_GUARDIAN,
  UNIT_KIND_NPC_LEADER,
} from "../world/unitKinds.ts";

export type BoatCommandResult =
  | { readonly ok: true; readonly boatId?: number; readonly walking?: boolean }
  | { readonly ok: false; readonly code: BoatResultCode };

export interface BoatDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly now: () => number;
  readonly log: { error(obj: object, message: string): void };
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
}

export interface BoatService {
  build(userId: string, buildingId: number, operator: boolean): BoatCommandResult;
  board(userId: string, unitId: number, boatId: number, operator: boolean): Promise<BoatCommandResult>;
  leave(userId: string, boatId: number, operator: boolean): BoatCommandResult;
  stop(): void;
}

const fail = (code: BoatResultCode): BoatCommandResult => ({ ok: false, code });
/** setTimeout 지연 상한 */
const MAX_TIMER_MS = 0x7fff_ffff;
/** 도착 확인을 조금 늦춘다(ms) — 도착 시각 반올림 */
const ARRIVAL_SLACK_MS = 50;
/** 부두 둘레에서 배 자리를 찾는 여유(배치 칸, 물가 조건 반경에 더한다) [임시] */
const DOCK_WATER_SLACK = 6;
/** 배 크기 등급 */
const BOAT_SIZE = 2;

/** 배를 만드는 시설인가: 단계 교통 + 물가 조건 */
export function isBoatYard(def: Pick<FacilityDef, "stage" | "needsWaterWithin">): boolean {
  return def.stage === "transport" && def.needsWaterWithin !== undefined;
}

/** 배 값: 부두 레벨 1 재료 × costPm ÷ 1000(반올림, 0이면 뺀다) */
export function boatCost(def: Pick<FacilityDef, "build">, costPm: number): JobMaterial[] {
  if (!def.build) return [];
  return buildCostAt(def.build, 1)
    .map((stack) => ({ item: stack.item, qty: Math.round((stack.qty * costPm) / 1000) }))
    .filter((stack) => stack.qty > 0);
}

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

/** 유닛 몸 네모(지금 자리) */
function bodyRect(map: SecondMap, unitId: number, nowMs: number): CellRect | undefined {
  const info = map.unitInfo(unitId);
  if (!info) return undefined;
  const cell = anchorAt(positionAt(info.motion, nowMs), info.size);
  return { x: cell.x, y: cell.y, width: info.size, height: info.size };
}

export function createBoatService(deps: BoatDeps): BoatService {
  const { maps, now, ledger } = deps;
  /** 걸어가서 탈 유닛 → 확인 타이머(새 명령이 오면 버린다) */
  const walks = new Map<number, ReturnType<typeof setTimeout>>();

  const mapOfUnit = (unitId: number): SecondMap | undefined => {
    for (const map of maps.values()) if (map.unitInfo(unitId)) return map;
    return undefined;
  };

  const cancelWalk = (unitId: number): void => {
    const timer = walks.get(unitId);
    if (timer !== undefined) clearTimeout(timer);
    walks.delete(unitId);
  };

  /** 타기 조건(거리 빼고). null이면 된다 */
  const boardProblem = (
    map: SecondMap,
    unitId: number,
    boatId: number,
    me: number | undefined,
    operator: boolean,
  ): BoatResultCode | null => {
    const unit = map.unitInfo(unitId);
    const boat = map.unitInfo(boatId);
    if (!unit) return "unknown_unit";
    if (!boat) return mapOfUnit(boatId) ? "wrong_map" : "unknown_unit";
    if (!operator && (unit.ownerId !== me || boat.ownerId !== me)) return "forbidden";
    if (boat.kind !== UNIT_KIND_BOAT) return "not_boat";
    if (unit.aboard !== undefined) return "already_aboard";
    if (
      unit.kind === UNIT_KIND_BOAT ||
      unit.kind === UNIT_KIND_BOT ||
      unit.kind === UNIT_KIND_GUARDIAN ||
      unit.kind === UNIT_KIND_NPC_LEADER ||
      unavailable(unit.condition, now()) ||
      deps.unitBusy(unitId)
    )
      return "unavailable";
    if (map.passengers(boatId).length >= deps.rules().capacity) return "boat_full";
    return null;
  };

  /** 지금 닿으면 태운다. 탔으면 true */
  const boardIfNear = (map: SecondMap, unitId: number, boatId: number): boolean => {
    const at = now();
    const unitRect = bodyRect(map, unitId, at);
    const boatRect = bodyRect(map, boatId, at);
    if (!unitRect || !boatRect || rectGap(unitRect, boatRect) > deps.rules().boardCells) return false;
    return map.board(unitId, boatId);
  };

  return {
    build(userId, buildingId, operator) {
      const places = deps.places();
      if (!places) return fail("busy");
      const me = deps.ownerOf(userId);
      let found: { map: SecondMap; rect: CellRect; ownerId: number | null } | undefined;
      for (const map of maps.values()) {
        map.forEachBuilding((building) => {
          if (building.id === buildingId)
            found = { map, rect: footprintRect(building.placement), ownerId: building.ownerId };
        });
        if (found) break;
      }
      if (!found) return fail("unknown_building");
      if (!operator && (me === undefined || found.ownerId !== me)) return fail("forbidden");
      const record = places.facilities.get(buildingId);
      const def = record ? places.catalog().facility(record.facilityId) : undefined;
      if (!record || !def || !isBoatYard(def)) return fail("not_dock");
      if (record.level < 1 || !deps.works(buildingId)) return fail("not_ready");
      const owner = operator ? (found.ownerId ?? me) : me;
      if (owner === undefined) return fail("forbidden");
      const { map, rect } = found;
      const reach = (def.needsWaterWithin ?? 1) + DOCK_WATER_SLACK;
      const [spot] = ringCells(rect, reach, BOAT_SIZE, (x, y) => map.isNavigable(x, y, BOAT_SIZE));
      if (!spot) return fail("no_water");
      const at = now();
      const rules = deps.rules();
      const materials = operator ? [] : boatCost(def, rules.costPm);
      const scope = materialScope(
        places,
        owner,
        map.mapKey,
        record.cityId ?? cityAt(places, map.mapKey, rect.x, rect.y),
      );
      if (!hasGoods(ledger, owner, materials, scope)) return fail("insufficient_materials");
      const boatId = deps.nextUnitId();
      if (!map.addBoat({ id: boatId, ownerId: owner, speed: rules.speed, cellX: spot.x, cellY: spot.y }))
        return fail("internal_error");
      spendGoods(ledger, owner, materials, at, "boat_build", scope);
      return { ok: true, boatId };
    },

    async board(userId, unitId, boatId, operator) {
      const map = mapOfUnit(unitId);
      if (!map) return fail("unknown_unit");
      const me = deps.ownerOf(userId);
      const problem = boardProblem(map, unitId, boatId, me, operator);
      if (problem) return fail(problem);
      cancelWalk(unitId);
      if (boardIfNear(map, unitId, boatId)) return { ok: true };
      // 멀다: 배 둘레 땅 칸(유닛에서 가까운 것)으로 걸어간 뒤 도착 때 다시 본다
      const at = now();
      const boatRect = bodyRect(map, boatId, at);
      const unit = map.unitInfo(unitId);
      if (!boatRect || !unit) return fail("unknown_unit");
      const from = anchorAt(positionAt(unit.motion, at), unit.size);
      const shore = ringCells(
        boatRect,
        deps.rules().boardCells,
        unit.size,
        (x, y) => map.isStandable(x, y, unit.size),
        64,
      ).toSorted((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
      const target = shore[0];
      if (!target) return fail("no_path");
      const moved = await map.moveUnit(unitId, anchorCenter(target.x, target.y, unit.size));
      if (!moved.ok) return fail(moved.code === "busy" ? "busy" : "no_path");
      const motion = map.unitInfo(unitId)?.motion;
      if (!motion) return fail("unknown_unit");
      const delay = Math.min(MAX_TIMER_MS, Math.max(0, arrivalAt(motion) - now()) + ARRIVAL_SLACK_MS);
      const timer = setTimeout(() => {
        walks.delete(unitId);
        // 그사이 다른 명령으로 움직임이 바뀌었으면 타지 않는다
        if (map.unitInfo(unitId)?.motion !== motion) return;
        if (boardProblem(map, unitId, boatId, me, operator) !== null) return;
        boardIfNear(map, unitId, boatId);
      }, delay);
      timer.unref?.();
      walks.set(unitId, timer);
      return { ok: true, walking: true };
    },

    leave(userId, boatId, operator) {
      const map = mapOfUnit(boatId);
      if (!map) return fail("unknown_unit");
      const boat = map.unitInfo(boatId);
      if (!boat) return fail("unknown_unit");
      if (!operator && boat.ownerId !== deps.ownerOf(userId)) return fail("forbidden");
      if (boat.kind !== UNIT_KIND_BOAT) return fail("not_boat");
      const riders = map.passengers(boatId);
      if (riders.length === 0) return fail("empty");
      // 움직이면 그 자리에 세운다(승객도 같이 선다)
      if (now() < arrivalAt(boat.motion)) map.halt(boatId);
      const boatRect = bodyRect(map, boatId, now());
      if (!boatRect) return fail("unknown_unit");
      // 몸 크기마다 내릴 땅 칸(가까운 칸부터 승객에게 나눠 준다 — 유닛끼리는 막지 않으니 모자라면 겹친다)
      const shores = new Map<SizeClass, CellPoint[]>();
      const shoreFor = (size: SizeClass): CellPoint[] => {
        let cells = shores.get(size);
        if (!cells) {
          const fits = (x: number, y: number): boolean => map.isStandable(x, y, size);
          cells = ringCells(boatRect, deps.rules().boardCells, size, fits, riders.length);
          shores.set(size, cells);
        }
        return cells;
      };
      const plan = riders.map((riderId, index) => {
        const cells = shoreFor(map.unitInfo(riderId)?.size ?? 1);
        return { riderId, cell: cells[index % Math.max(1, cells.length)] };
      });
      if (plan.some((step) => step.cell === undefined)) return fail("no_shore");
      for (const { riderId, cell } of plan) if (cell) map.disembark(riderId, cell.x, cell.y);
      return { ok: true };
    },

    stop() {
      for (const timer of walks.values()) clearTimeout(timer);
      walks.clear();
    },
  };
}
