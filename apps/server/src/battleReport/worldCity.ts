// 전투 보고서의 실제 세계 도시(기획 D-543·D-545 1383 — docs/adr/2026-11-14-battle-report.md "바뀜 (2026-11-14, 실제 도시·웨이브 수비·군단)").
// 살아 있는 세계에서 도시 하나를 **읽기만** 해서 공성 전투맵 재료를 만든다. 세계를 바꾸는 호출은 하나도 없다(쓰기 대기열·DB 쓰기·메모리 표 고침 없음):
// - 배치: 서버 정원사 웨이브와 같은 함수(facilities/siegeLayout.ts citySiegeLayout — 넥서스 = 행정 건물, 다른 건물 = 장애물, 성벽·성문, 지형).
//   행정 건물이 없으면 undefined(정원사와 같이 옛 열린 맵).
// - 수비: 그 도시 휴먼(세계 거울 SimWorld, 정원사와 같은 차례 defenseOrder, 앞에서 REPORT_WORLD_DEFENDERS명)과 주인 세력 기술 단계.
// - 수비 사양: 세계 전투를 여는 길(world/battleStart.ts)과 같은 차례 — 몸(입은 장비·버프) → 비활성·배 위 빼기 → 수호신·방어 버프(DB 읽기만)
//   → 남은 HP·아머·쉴드 → 물약·탄. 세계 유닛 ID만 이 길을 지난다(실험실·크리쳐 유닛은 그대로).
// 스냅숏 지문(reportCityInfo)은 배치 구조(내구도 빼고)와 수비 사양(자리 빼고)을 따로 적어 화면이 "저장 뒤 바뀜"을 가른다.
import { createHash } from "node:crypto";
import {
  type BattleInit,
  type SimUnit,
  type SimWorld,
  type SocietyCoefficients,
  defenseOrder,
} from "@terra/sim";
import type { SiegeLayout } from "@terra/sim/siegeArena";
import {
  REPORT_CITY_LIST_MAX,
  REPORT_WORLD_DEFENDERS,
  type ReportCityInfo,
  type ReportCityListInput,
  type ReportCityListResponse,
  type ReportCityListItem,
} from "@terra/shared/battleReportCity";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import { cityHall, citySiegeLayout } from "../facilities/siegeLayout.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import type { CityPlace } from "../npc/persist.ts";
import { defendCity, guardianBase, withoutInactive } from "../temple/cityDefense.ts";
import type { GuardianRow } from "../temple/rows.ts";
import type { BattleBodies } from "../world/battleBodies.ts";
import { afloatIn } from "../world/battleStart.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_GUARDIAN } from "../world/unitKinds.ts";
import type { World } from "../world/world.ts";
import { readGuardians } from "../temple/rows.ts";

/** 세계 유닛 시작 사양을 고치는 한 단계(세계 전투 시작 길과 같은 단계들, 읽기만) */
interface StartStep {
  battleStart(init: BattleInit, nowMs: number): BattleInit;
}

/** 살아 있는 세계에서 읽는 것(부를 때마다 지금 값). 세계가 꺼져 있으면 undefined */
export interface ReportCityWorld {
  readonly sim: SimWorld;
  readonly places: ReadonlyMap<number, CityPlace>;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly facilities: ReadonlyMap<number, FacilityRecord>;
  readonly catalog: FacilityCatalog;
  readonly rules: SocietyCoefficients;
  readonly bodies: Pick<BattleBodies, "battleStart" | "build">;
  readonly vitals: StartStep;
  readonly items: StartStep;
  /** 비활성 유닛·배 위 유닛인가(세계 전투에서 빼는 유닛) */
  readonly isInactive: (unitId: number) => boolean;
  /** 수호신 유닛이 지금 싸울 수 있나(세계에 있고 수호신 종류·부상·포로가 아님) */
  readonly guardianCanFight: (unitId: number, nowMs: number) => boolean;
  /** 그 도시 수호신 줄(DB 읽기만) */
  readonly guardians: (cityId: number) => Promise<readonly GuardianRow[]>;
}

/** 실제 도시 스냅숏(공성 재료). 만든 뒤 세계가 바뀌어도 이 값은 그대로다 */
export interface ReportCitySnapshot {
  readonly cityId: number;
  readonly name: string | null;
  readonly owner: number;
  readonly factionCode: string | null;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly atMs: number;
  readonly terrainVersion: string;
  /** 공성 배치(없으면 옛 열린 맵) */
  readonly layout: SiegeLayout | undefined;
  readonly defenderTech: number;
  /** 그 도시 휴먼 수와 수비로 드는 휴먼(앞에서 REPORT_WORLD_DEFENDERS명, 복사본) */
  readonly humans: number;
  readonly defenders: readonly SimUnit[];
  /**
   * 세계 유닛(worldIds)의 시작 사양을 세계 전투 시작 길로 고친다(읽기만). 수호신이 들면 그 ID도 worldIds에 더해 돌려준다
   */
  prepare(
    init: BattleInit,
    worldIds: ReadonlySet<number>,
  ): Promise<{ init: BattleInit; worldIds: ReadonlySet<number>; guardians: number }>;
}

export interface ReportCitySource {
  list(input: ReportCityListInput): ReportCityListResponse;
  snapshot(cityId: number): ReportCitySnapshot | undefined;
}

/** 시작 자료를 유닛 ID로 둘로 나눈다(파티는 그 유닛이 든 것만) */
function split(init: BattleInit, pick: (id: number) => boolean): { own: BattleInit; rest: BattleInit } {
  const ownUnits = init.units.filter((unit) => pick(unit.id));
  const restUnits = init.units.filter((unit) => !pick(unit.id));
  const ownParties = new Set(ownUnits.map((unit) => unit.party));
  return {
    own: { ...init, units: ownUnits, parties: init.parties.filter((party) => ownParties.has(party.id)) },
    rest: { ...init, units: restUnits, parties: init.parties.filter((party) => !ownParties.has(party.id)) },
  };
}

/** 나눈 둘을 다시 합친다(유닛 차례 = rest 다음 own, 파티는 ID 차례) */
function join(rest: BattleInit, own: BattleInit): BattleInit {
  const parties = new Map([...rest.parties, ...own.parties].map((party) => [party.id, party]));
  return {
    ...rest,
    units: [...rest.units, ...own.units],
    parties: [...parties.values()].toSorted((a, b) => a.id - b.id),
  };
}

export function createReportCities(deps: {
  readonly world: () => ReportCityWorld | undefined;
  readonly now: () => number;
}): ReportCitySource {
  const humansIn = (sim: SimWorld, cityId: number): SimUnit[] => {
    const out: SimUnit[] = [];
    for (const unit of sim.units.values()) if (unit.city === cityId) out.push(unit);
    return out.toSorted(defenseOrder);
  };
  return {
    list(input) {
      const w = deps.world();
      if (!w) return { available: false, cities: [] };
      const counts = new Map<number, number>();
      for (const unit of w.sim.units.values()) counts.set(unit.city, (counts.get(unit.city) ?? 0) + 1);
      const query = (input.query ?? "").trim().toLowerCase();
      const limit = Math.min(input.limit ?? REPORT_CITY_LIST_MAX, REPORT_CITY_LIST_MAX);
      const out: ReportCityListItem[] = [];
      for (const city of [...w.sim.cities.values()].toSorted((a, b) => a.id - b.id)) {
        const place = w.places.get(city.id);
        if (!place) continue;
        const name = place.name ?? null;
        if (query !== "" && String(city.id) !== query && !(name ?? "").toLowerCase().includes(query)) continue;
        const map = w.maps.get(place.mapKey);
        const hall = map
          ? cityHall(map, { records: w.facilities, catalog: w.catalog }, city.id, {
              x: place.cellX,
              y: place.cellY,
            }) !== undefined
          : false;
        out.push({
          id: city.id,
          name,
          owner: city.owner,
          factionCode: w.sim.factions.get(city.owner)?.code ?? null,
          mapKey: place.mapKey,
          cellX: place.cellX,
          cellY: place.cellY,
          humans: counts.get(city.id) ?? 0,
          loaded: map !== undefined,
          hall,
          start: city.start,
        });
        if (out.length >= limit) break;
      }
      return { available: true, cities: out };
    },

    snapshot(cityId) {
      const w = deps.world();
      const city = w?.sim.cities.get(cityId);
      const place = w?.places.get(cityId);
      const map = place ? w?.maps.get(place.mapKey) : undefined;
      if (!w || !city || !place || !map) return undefined;
      const atMs = deps.now();
      const layout = citySiegeLayout(
        map,
        cityId,
        { x: place.cellX, y: place.cellY },
        { records: w.facilities, catalog: w.catalog, rules: w.rules, at: atMs },
      );
      const humans = humansIn(w.sim, cityId);
      const faction = w.sim.factions.get(city.owner);
      return {
        cityId,
        name: place.name ?? null,
        owner: city.owner,
        factionCode: faction?.code ?? null,
        mapKey: place.mapKey,
        cellX: place.cellX,
        cellY: place.cellY,
        atMs,
        terrainVersion: String(map.terrainVersion),
        layout,
        defenderTech: Math.max(1, faction?.tech ?? 1),
        humans: humans.length,
        // 복사본(판정 재료는 스냅숏 때 값 — 세계 거울이 바뀌어도 그대로)
        defenders: humans.slice(0, REPORT_WORLD_DEFENDERS).map((unit) => ({ ...unit })),
        async prepare(init, worldIds) {
          // 세계 전투 시작 길(world/battleStart.ts)과 같은 차례. 세계 유닛만 지나간다(실험실·크리쳐 ID가 세계 유닛 ID와 겹쳐도 바뀌지 않게)
          const first = split(init, (id) => worldIds.has(id));
          const bodied = withoutInactive(w.bodies.battleStart(first.own, atMs), w.isInactive);
          const joined = join(first.rest, bodied);
          const rows = await w.guardians(cityId);
          const defended = defendCity(joined, {
            guardians: rows,
            c: w.rules.temple,
            canFight: (unitId) => w.guardianCanFight(unitId, atMs) && !w.isInactive(unitId),
            build: (row, spot) => w.bodies.build(row.unitId, spot, atMs, guardianBase(row)),
          });
          const before = new Set(joined.units.map((unit) => unit.id));
          const ids = new Set(bodied.units.map((unit) => unit.id));
          let guardians = 0;
          for (const unit of defended.units)
            if (!before.has(unit.id)) {
              ids.add(unit.id);
              guardians += 1;
            }
          const second = split(defended, (id) => ids.has(id));
          const lived = w.items.battleStart(w.vitals.battleStart(second.own, atMs), atMs);
          return { init: join(second.rest, lived), worldIds: ids, guardians };
        },
      };
    },
  };
}

/** 지문(sha256 앞 16자) */
const hashOf = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/** 스냅숏 + 그 스냅숏으로 만든 시작 자료 → 결과에 적을 정보 */
export function reportCityInfo(
  snapshot: ReportCitySnapshot,
  init: BattleInit,
  worldIds: ReadonlySet<number>,
  guardians: number,
): ReportCityInfo {
  const layout = snapshot.layout;
  const layoutHash = hashOf({
    terrain: snapshot.terrainVersion,
    layout: layout
      ? {
          mapCells: layout.mapCells,
          nexus: layout.nexus,
          nexusSourceId: layout.nexusSourceId,
          gates: layout.gates ?? null,
          buildings: layout.buildings.map((b) => [b.sourceId, b.x, b.y, b.width, b.height, b.wall === true]),
        }
      : null,
  });
  const nexus = init.map.buildings.find((building) => building.nexus);
  const walls = init.map.buildings.filter((building) => building.wall === true || building.gateSide !== undefined);
  // 수비 사양: 세계 유닛만, 자리·편·파티 빼고 ID 차례
  const defense = init.units
    .filter((unit) => worldIds.has(unit.id))
    .toSorted((a, b) => a.id - b.id)
    .map(({ x: _x, y: _y, side: _side, party: _party, ...rest }) => rest);
  return {
    cityId: snapshot.cityId,
    name: snapshot.name,
    owner: snapshot.owner,
    factionCode: snapshot.factionCode,
    mapKey: snapshot.mapKey,
    cellX: snapshot.cellX,
    cellY: snapshot.cellY,
    atMs: snapshot.atMs,
    hall: layout !== undefined,
    layoutHash,
    buildings: init.map.buildings.length,
    walls: walls.length,
    // 행정 건물이 없으면(열린 맵) 넥서스는 보고서 설정 값이라 도시 상태가 아니다 → 0
    nexusDurability: layout && nexus ? nexus.durability : 0,
    wallDurability: walls.reduce((sum, building) => sum + building.durability, 0),
    humans: snapshot.humans,
    defenders: defense.length,
    guardians,
    defenseHash: hashOf(defense),
  };
}

/** 살아 있는 세계 → 도시 읽기(세계가 준비됐고 NPC 사회 런타임·DB가 있을 때만) */
export function worldReportCities(world: World, now: () => number): ReportCitySource {
  return createReportCities({
    now,
    world: () => {
      const npc = world.npc;
      const p = world.persistence;
      if (world.status().state !== "ready" || !npc || !p) return undefined;
      const unitInfo = (unitId: number) => {
        for (const map of world.maps.values()) {
          const info = map.unitInfo(unitId);
          if (info) return info;
        }
        return undefined;
      };
      return {
        sim: npc.world,
        places: npc.places,
        maps: world.maps,
        facilities: p.facilities.service.facilities,
        catalog: p.facilities.catalog(),
        rules: p.facilities.rules(),
        bodies: p.bodies,
        vitals: p.vitals.service,
        items: p.items,
        isInactive: (unitId) => p.fusion.temple.isInactive(unitId) || afloatIn(world.maps, unitId),
        guardianCanFight: (unitId, nowMs) => {
          const info = unitInfo(unitId);
          return info !== undefined && info.kind === UNIT_KIND_GUARDIAN && !unavailable(info.condition, nowMs);
        },
        guardians: (cityId) => readGuardians(p.pool, { cityId }),
      };
    },
  });
}
