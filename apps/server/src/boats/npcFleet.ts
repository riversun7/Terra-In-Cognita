// NPC 배(기획 D-547 1497 "플레이어와 같은 규칙" — 1402·D-542 1331 나를 대체, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15)"): 바닷가 NPC 도시의
// 조선소가 배를 만들고 정박장이 배의 집이다. 그 도시 휴먼을 어부로 태워 바다 어군을 낚게 한다. 작게·설정 칸으로 막는다:
// - 정박장마다 배 상한 = 설정 칸 npc_boats_per_dock([임시] 1, 0이면 끔), 배마다 어부 = npc_boat_fishers([임시] 2, 배 자리 수 안).
// - 배 만들기·집 정박장·고치기·타기·내리기·캐기는 플레이어와 같은 서비스(buildAs·berthAs·repairAs·boardAs·leaveAs, 채집 startAs)라 재료(그 도시 창고)·시간·
//   도크·정박 자리·받기 범위·내구도·거리·채집 규칙이 같다.
// - 살피기는 FLEET_TICK_MS마다 한 번(이벤트 루프 몫이 작다 — 정박장 수 × 배 수만 본다). 그 사이 어부의 채집 줄이 스스로 돈다.
// - 정박장마다 차례: 같은 2차맵의 집 없는 그 세력 배를 이 정박장에 넣는다 → 배가 모자라면 같은 2차맵의 그 세력 조선소에서 만든다(도크가 비면) →
//   배마다: 내구도가 NPC_REPAIR_PM 아래면 조선소로 보내 고친다 → 어부 중 누가 지쳤으면 정박장으로 돌아가 모두 내린다 → 자리가 남으면 정박장 둘레의 그 세력
//   휴먼(봇, 일이 없는 것)을 태운다 → 아무도 캐지 않으면 가장 가까운 남은 어군을 모두에게 시킨다.
// [임시] 어부는 아직 도시 경제의 "어부" 일자리에서 뽑지 않는다(둘레 휴먼 — 질문 1533). 잡은 고기는 원장 도시 창고로 간다.
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
import { isBerth, isShipyard } from "./rules.ts";
import type { BoatService } from "./service.ts";

/** 살피기 간격(ms) [임시] */
export const FLEET_TICK_MS = 120_000;
/** NPC 배를 고치러 보내는 내구도(‰) [임시] */
const NPC_REPAIR_PM = 300;
/** 어부를 고르는 부두 둘레 거리(배치 칸) [임시] — 먼 휴먼은 걸어오는 데 오래 걸린다 */
const FISHER_CELLS = 48;
/** 정박장에 닿았다고 보는 거리(배치 칸) — 이 안이면 내린다 */
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
  /** 살핀 NPC 정박장 수 */
  readonly docks: number;
  readonly boats: number;
  readonly built: number;
  /** 집에 넣은 배 / 고치러 보낸 배 */
  readonly berthed: number;
  readonly repairs: number;
  readonly boarded: number;
  readonly fishing: number;
  readonly returned: number;
  readonly ms: number;
}

export interface NpcFleet {
  /** 한 번 살핀다(타이머가 부른다. 시험은 바로 부른다) */
  tick(): Promise<FleetTick>;
  /** 지난 살피기에서 정박장에 든 NPC 배 수 */
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
  /** 배 ID → 걸어와 타는 중인 어부를 기다리는 끝 시각(그 전에는 새로 부르지 않는다) */
  const waiting = new Map<number, number>();
  let homed = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  /** NPC 배 시설: 다 지었고 일하는, 주인이 NPC 세력인 정박장·조선소 */
  const npcHarbors = (places: PlaceWorld) => {
    const out: {
      buildingId: number;
      map: SecondMap;
      ownerId: number;
      center: CellPoint;
      role: "berth" | "shipyard";
    }[] = [];
    const catalog = places.catalog();
    for (const record of places.facilities.values()) {
      const def = catalog.facility(record.facilityId);
      const role = isBerth(def) ? "berth" : isShipyard(def) ? "shipyard" : undefined;
      if (!role || record.level < 1 || !deps.works(record.buildingId)) continue;
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
          out.push({ buildingId: record.buildingId, map, ownerId, center, role });
        break;
      }
    }
    return out.toSorted((a, b) => a.buildingId - b.buildingId);
  };
  type NpcHarbor = ReturnType<typeof npcHarbors>[number];

  /** 그 정박장을 집으로 둔 배와 같은 2차맵의 집 없는 그 세력 배 */
  const boatsAt = (dock: NpcHarbor, boats: BoatService) => {
    const own: number[] = [];
    const loose: number[] = [];
    dock.map.forEachUnit((unit) => {
      if (unit.kind !== UNIT_KIND_BOAT || unit.ownerId !== dock.ownerId) return;
      const info = boats.info(unit.id);
      if (info?.homeId === dock.buildingId) own.push(unit.id);
      else if (info && info.homeId === null) loose.push(unit.id);
    });
    return { own: own.toSorted((a, b) => a - b), loose: loose.toSorted((a, b) => a - b) };
  };

  /** 태울 어부: 부두 둘레의 그 세력 휴먼(봇), 타지 않았고 활동 가능, 채집 줄 없음, 피로가 상한의 반 밑 — 가까운 차례 */
  const fishersNear = (dock: NpcHarbor, at: number, gather: GatherService, fatigueMax: number) => {
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
    const counts = {
      docks: 0,
      boats: 0,
      built: 0,
      berthed: 0,
      repairs: 0,
      boarded: 0,
      fishing: 0,
      returned: 0,
    };
    const places = deps.places();
    const boats = deps.boats();
    const gather = deps.gather();
    const rules = deps.rules();
    const perDock = Math.max(0, rules.boats.npcPerDock);
    if (!places || !boats || !gather || perDock === 0 || running) return { ...counts, ms: 0 };
    running = true;
    try {
      const at = now();
      const harbors = npcHarbors(places);
      const yards = harbors.filter((entry) => entry.role === "shipyard");
      for (const dock of harbors.filter((entry) => entry.role === "berth")) {
        counts.docks += 1;
        const yard = yards
          .filter((entry) => entry.map === dock.map && entry.ownerId === dock.ownerId)
          .toSorted((a, b) => chebyshev(a.center, dock.center) - chebyshev(b.center, dock.center))[0];
        const { own, loose } = boatsAt(dock, boats);
        // 집 없는 배를 넣는다(자리가 남는 만큼 — 서비스가 다시 본다)
        for (const boatId of loose) {
          if (own.length >= perDock) break;
          const result = await boats.berthAs(dock.ownerId, boatId, dock.buildingId);
          if (!result.ok) continue;
          own.push(boatId);
          counts.berthed += 1;
        }
        counts.boats += own.length;
        // 배가 모자라면 조선소에서 만든다(만드는 중인 배가 없을 때)
        if (yard && own.length + loose.length < perDock) {
          const panel = boats.dockJob(yard.buildingId);
          if (
            panel &&
            !panel.jobs.some((job) => job.kind === "build") &&
            boats.buildAs(dock.ownerId, yard.buildingId).ok
          )
            counts.built += 1;
        }
        for (const boatId of own.slice(0, perDock)) {
          const riders = dock.map.passengers(boatId);
          if (riders.some((id) => gather.acting(id))) {
            counts.fishing += 1;
            continue;
          }
          // 낡았으면 조선소로(어부는 먼저 내린다)
          const hull = boats.info(boatId)?.hullPm ?? 1000;
          if (yard && hull < NPC_REPAIR_PM) {
            if (riders.length > 0) boats.leaveAs(dock.ownerId, boatId);
            if ((await boats.repairAs(dock.ownerId, boatId, yard.buildingId)).ok) counts.repairs += 1;
            continue;
          }
          // 지친 어부가 있으면 정박장으로 돌아가 모두 내린다
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
          const capacity = boats.info(boatId)?.capacity ?? rules.boats.capacity;
          const want = Math.min(Math.max(0, rules.boats.npcFishers), Math.max(0, capacity));
          if (riders.length < want && (waiting.get(boatId) ?? 0) <= at) {
            for (const id of fishersNear(dock, at, gather, rules.fatigueMax).slice(0, want - riders.length)) {
              const boarded = await boats.boardAs(dock.ownerId, id, boatId);
              if (!boarded.ok) continue;
              counts.boarded += 1;
              if (boarded.walking === true) waiting.set(boatId, at + 2 * FLEET_TICK_MS);
            }
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
      for (const boatId of waiting.keys()) {
        let alive = false;
        for (const map of maps.values()) if (map.unitInfo(boatId)) alive = true;
        if (!alive) waiting.delete(boatId);
      }
      homed = counts.boats;
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
      return homed;
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
