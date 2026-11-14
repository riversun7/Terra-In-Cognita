// NPC 배(기획 D-542 1331 나 — docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B3)"): 바닷가 NPC 도시의 부두가 배를 만들고 그 도시 휴먼을 어부로
// 태워 바다 어군을 낚게 한다. 작게·설정 칸으로 막는다:
// - 부두마다 배 상한 = 설정 칸 npc_boats_per_dock([임시] 1, 0이면 끔), 배마다 어부 = npc_boat_fishers([임시] 2, 배 자리 수 안).
// - 배 만들기·타기·내리기·캐기는 플레이어와 같은 서비스(배 서비스 buildAs·boardAs·leaveAs, 채집 서비스 startAs)라 재료(그 도시 창고)·시간·
//   거리·채집 규칙(사다리 굴림·티어 범위·굴림표)·넣는 곳(창고·도시, 물이 없으면 부두 도시 창고)이 같다.
// - 살피기는 FLEET_TICK_MS마다 한 번(이벤트 루프 몫이 작다 — 부두 수 × 배 수만 본다). 그 사이 어부의 채집 줄이 스스로 돈다.
// - 배마다 차례: 어부 중 누가 지쳤으면(피로 상한) 부두로 돌아가 모두 내린다(봇은 내리면 다시 집·일터를 걷는다) → 자리가 남으면 부두 둘레의
//   그 세력 휴먼(봇, 일이 없는 것)을 태운다(멀면 걸어온다) → 아무도 캐지 않으면 가장 가까운 남은 어군을 모두에게 시킨다.
// - 배 ↔ 부두 짝은 메모리(다시 켜면 부두 둘레 SPOT_CELLS 안의 그 세력 배를 다시 짝짓는다).
// [임시] 어부는 도시 경제의 일꾼 셈과 따로다(도시 경제는 휴먼이 어디 있든 같은 산출을 센다 — npc/humanPlaces.ts). 잡은 고기는 원장 도시 창고로 간다.
import {
  type CellPoint,
  type SocietyCoefficients,
  anchorAt,
  anchorCenter,
  footprintRect,
  positionAt,
} from "@terra/sim";
import type { PlaceWorld } from "../facilities/places.ts";
import type { GatherService } from "../gather/service.ts";
import type { GatherKind } from "../gather/kinds.ts";
import { seaObject } from "../gather/stand.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_BOT } from "../world/unitKinds.ts";
import { type BoatService, isBoatYard } from "./service.ts";

/** 살피기 간격(ms) [임시] */
export const FLEET_TICK_MS = 120_000;
/** 부두와 배를 짝짓는 거리(배치 칸) — 다시 켠 뒤 다시 짝짓기 */
const SPOT_CELLS = 16;
/** 어부를 고르는 부두 둘레 거리(배치 칸) [임시] — 먼 휴먼은 걸어오는 데 오래 걸린다 */
const FISHER_CELLS = 48;
/** 부두에 닿았다고 보는 거리(배치 칸) — 이 안이면 내린다 */
const HOME_CELLS = 6;

export interface NpcFleetDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
  rules(): Pick<SocietyCoefficients, "boats" | "fatigueMax">;
  places(): PlaceWorld | undefined;
  works(buildingId: number): boolean;
  /** NPC 세력의 소유 주체인가(플레이어가 아님) */
  isNpc(ownerId: number): boolean;
  boats(): BoatService | undefined;
  gather(): GatherService | undefined;
  kinds(): readonly GatherKind[];
}

/** 한 번 살핀 결과(지표·시험) */
export interface FleetTick {
  readonly docks: number;
  readonly boats: number;
  readonly built: number;
  readonly boarded: number;
  readonly fishing: number;
  readonly returned: number;
  readonly ms: number;
}

export interface NpcFleet {
  /** 한 번 살핀다(타이머가 부른다. 시험은 바로 부른다) */
  tick(): Promise<FleetTick>;
  /** 짝지은 배 수 */
  readonly boats: number;
  stop(): void;
}

/** 지금 몸 기준 칸 */
const cellOf = (map: SecondMap, unitId: number, nowMs: number): CellPoint | undefined => {
  const info = map.unitInfo(unitId);
  return info ? anchorAt(positionAt(info.motion, nowMs), info.size) : undefined;
};

const chebyshev = (a: CellPoint, b: CellPoint): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function createNpcFleet(deps: NpcFleetDeps, options: { readonly timer?: boolean } = {}): NpcFleet {
  const { maps, now, log } = deps;
  /** 배 ID → 부두 건물 ID */
  const homes = new Map<number, number>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  /** NPC 부두: 다 지었고 일하는 배 만드는 시설, 주인이 NPC 세력 */
  const npcDocks = (places: PlaceWorld) => {
    const out: { buildingId: number; map: SecondMap; ownerId: number; center: CellPoint }[] = [];
    const catalog = places.catalog();
    for (const record of places.facilities.values()) {
      const def = catalog.facility(record.facilityId);
      if (!def || !isBoatYard(def) || record.level < 1 || !deps.works(record.buildingId)) continue;
      for (const map of maps.values()) {
        let found: { ownerId: number | null; center: CellPoint } | undefined;
        map.forEachBuilding((building) => {
          if (building.id !== record.buildingId) return;
          const rect = footprintRect(building.placement);
          found = {
            ownerId: building.ownerId,
            center: { x: rect.x + (rect.width >> 1), y: rect.y + (rect.height >> 1) },
          };
        });
        if (!found) continue;
        const { ownerId, center } = found;
        if (ownerId !== null && deps.isNpc(ownerId))
          out.push({ buildingId: record.buildingId, map, ownerId, center });
        break;
      }
    }
    return out;
  };

  /** 그 부두의 배(짝, 없으면 둘레의 짝 없는 그 세력 배를 짝짓는다) */
  const boatsOf = (dock: ReturnType<typeof npcDocks>[number], at: number): number[] => {
    const out: number[] = [];
    dock.map.forEachUnit((unit) => {
      if (unit.kind !== UNIT_KIND_BOAT || unit.ownerId !== dock.ownerId) return;
      const home = homes.get(unit.id);
      if (home === dock.buildingId) out.push(unit.id);
      else if (home === undefined) {
        const cell = cellOf(dock.map, unit.id, at);
        if (cell && chebyshev(cell, dock.center) <= SPOT_CELLS) {
          homes.set(unit.id, dock.buildingId);
          out.push(unit.id);
        }
      }
    });
    return out.toSorted((a, b) => a - b);
  };

  /** 태울 어부: 부두 둘레의 그 세력 휴먼(봇), 타지 않았고 활동 가능, 채집 줄 없음, 피로가 상한의 반 밑 — 가까운 차례 */
  const fishersNear = (
    dock: ReturnType<typeof npcDocks>[number],
    at: number,
    gather: GatherService,
    fatigueMax: number,
  ) => {
    const found: { id: number; d: number }[] = [];
    dock.map.forEachUnit((unit) => {
      if (unit.kind !== UNIT_KIND_BOT || unit.ownerId !== dock.ownerId || unit.aboard !== undefined) return;
      if (unit.job.fatigue * 2 >= fatigueMax) return;
      const info = dock.map.unitInfo(unit.id);
      if (!info || unavailable(info.condition, at) || gather.acting(unit.id)) return;
      const cell = anchorAt(positionAt(unit.motion, at), unit.size);
      const d = chebyshev(cell, dock.center);
      if (d <= FISHER_CELLS) found.push({ id: unit.id, d });
    });
    return found.toSorted((a, b) => a.d - b.d || a.id - b.id).map((entry) => entry.id);
  };

  /** 배에서 가장 가까운 남은 바다 어군(어군만 — 난파선·고래는 NPC가 고르지 않는다 [임시]) */
  const schoolNear = (map: SecondMap, boatId: number, at: number, gather: GatherService) => {
    const here = cellOf(map, boatId, at);
    const objects = gather.objectsAt(map.mapKey, at);
    if (!here || !objects) return undefined;
    const kinds = deps.kinds();
    let best: { id: number; d: number } | undefined;
    for (const object of objects) {
      const kind = kinds[object.kind];
      if (!kind || object.route === undefined || !kind.direct || !seaObject(kind, true)) continue;
      const d = chebyshev(here, object);
      if (!best || d < best.d || (d === best.d && object.id < best.id)) best = { id: object.id, d };
    }
    return best?.id;
  };

  const tick = async (): Promise<FleetTick> => {
    const started = performance.now();
    const counts = { docks: 0, boats: 0, built: 0, boarded: 0, fishing: 0, returned: 0 };
    const places = deps.places();
    const boats = deps.boats();
    const gather = deps.gather();
    const rules = deps.rules();
    const perDock = Math.max(0, rules.boats.npcPerDock);
    if (!places || !boats || !gather || perDock === 0 || running) return { ...counts, ms: 0 };
    running = true;
    try {
      const at = now();
      for (const dock of npcDocks(places)) {
        counts.docks += 1;
        const own = boatsOf(dock, at);
        counts.boats += own.length;
        if (own.length < perDock && boats.dockJob(dock.buildingId) === undefined) {
          const made = boats.buildAs(dock.ownerId, dock.buildingId);
          if (made.ok) counts.built += 1;
        }
        for (const boatId of own.slice(0, perDock)) {
          const riders = dock.map.passengers(boatId);
          if (riders.some((id) => gather.acting(id))) {
            counts.fishing += 1;
            continue;
          }
          // 지친 어부가 있으면 부두로 돌아가 모두 내린다
          const tired = riders.some(
            (id) => (dock.map.unitInfo(id)?.job.fatigue ?? 0) >= Math.max(1, rules.fatigueMax),
          );
          if (tired) {
            const spot = boats.launchSpotOf(dock.buildingId);
            const here = cellOf(dock.map, boatId, at);
            if (spot && here && chebyshev(here, spot) <= HOME_CELLS) {
              if (boats.leaveAs(dock.ownerId, boatId).ok) counts.returned += 1;
            } else if (spot) await dock.map.moveUnit(boatId, anchorCenter(spot.x, spot.y, 2));
            continue;
          }
          const want = Math.min(Math.max(0, rules.boats.npcFishers), Math.max(0, rules.boats.capacity));
          if (riders.length < want)
            for (const id of fishersNear(dock, at, gather, rules.fatigueMax).slice(0, want - riders.length)) {
              const boarded = await boats.boardAs(dock.ownerId, id, boatId);
              if (boarded.ok) counts.boarded += 1;
            }
          const aboard = dock.map.passengers(boatId);
          const school = aboard.length > 0 ? schoolNear(dock.map, boatId, at, gather) : undefined;
          if (school === undefined) continue;
          for (const id of aboard) {
            const result = await gather.startAs(dock.ownerId, {
              unitId: id,
              mapKey: dock.map.mapKey,
              objectId: school,
            });
            if (result.ok) counts.fishing += 1;
          }
        }
      }
      for (const boatId of homes.keys()) {
        let alive = false;
        for (const map of maps.values()) if (map.unitInfo(boatId)) alive = true;
        if (!alive) homes.delete(boatId);
      }
    } catch (error) {
      log.error({ err: error }, "npc fleet tick failed");
    } finally {
      running = false;
    }
    return { ...counts, ms: Math.round((performance.now() - started) * 100) / 100 };
  };

  if (options.timer !== false) {
    timer = setInterval(() => {
      void tick().then((result) => {
        if (result.docks > 0) log.info(result, "npc fleet tick");
      });
    }, FLEET_TICK_MS);
    timer.unref();
  }

  return {
    tick,
    get boats() {
      return homes.size;
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
