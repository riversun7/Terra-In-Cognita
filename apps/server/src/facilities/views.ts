// 건물 화면 자료(tRPC facilities.overview) — docs/adr/2026-11-07-buildings-runtime.md. 읽기만 한다(게임 상태를 바꾸지 않는다).
import { EXCHANGE_LOCKS } from "@terra/shared/exchange";
import type {
  FacilitiesOverviewResponse,
  FacilityBeaconView,
  FacilityCatalogView,
  FacilityHoldingView,
  FacilityJobView,
  FacilityLandClaim,
  FacilityStackView,
  FacilityTargetView,
  FacilityView,
  GoodsPlaceView,
} from "@terra/shared/facilities";
import { placeKey, placeOfLocation, sourceOrder } from "@terra/shared/goodsPlaces";
import { buildCostAt, buildTimeAt } from "@terra/shared/facilityBuild";
import {
  advanceCondition,
  conditionStateOf,
  conditionWorks,
  durabilityPoints,
  idleMsUntil,
  maxDurabilityAt,
  repairMaterialsFor,
  repairRestorePpm,
  repairTimeMs,
  storageCapacityAt,
} from "@terra/shared/facilityRuntime";
import {
  type SocietyCoefficients,
  TEST_STAT_TABLE,
  craftScore,
  lodgingBeds,
  repairMaterials,
  repairRuleFor,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
import type { LaborWorkerEntry } from "../labor/workerEntry.ts";
import type { TerritoryService } from "../territory/service.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";
import type { FacilityCatalog, FacilityDef } from "./catalog.ts";
import { goodsStock } from "./materials.ts";
import { type PlaceWorld, buildingPlace, isStorage, storedGrams } from "./places.ts";
import type { FacilityService } from "./service.ts";
import type { JobRecord } from "./state.ts";

export interface FacilityViewSource {
  readonly service: FacilityService;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly ledger: Ledger;
  readonly holdings: WorldHoldings;
  readonly territory: () => TerritoryService | undefined;
  readonly rules: () => SocietyCoefficients;
  readonly catalog: () => FacilityCatalog;
  readonly unitBusy: (unitId: number) => boolean;
  /** 그 시설에서 일하는 유닛(노동 계약 서비스 workersAt — 직무 배치·열린 계약). 없으면 빈 목록 */
  readonly workersOf?: ((buildingId: number) => readonly LaborWorkerEntry[]) | undefined;
  /** 원자재 오브젝트를 맡는 시설 ID(팩 gather_objects의 facility — 채집소 반경 고리). 없으면 반경 없음 */
  readonly objectFacilities?: (() => ReadonlySet<string>) | undefined;
  /** 남의 공방 외주 수리를 보이나(D-564 1682 — 견적은 건물 서비스 outsourceQuote, D-570 1785). 없으면 남의 공방을 보이지 않는다 */
  readonly outsource?: boolean | undefined;
  /** 멈춘 사업장인가(적자, D-555 1504) — 외주를 받지 않는다 */
  readonly suspended?: ((buildingId: number) => boolean) | undefined;
  /** 그 숙소를 쓰는 NPC 일꾼 수(도시 경제 쉼터 계획, 질문 1047 다). 없으면 null */
  readonly lodgingOccupants?: ((buildingId: number, cityId: number | null) => number | undefined) | undefined;
  /** 빈 2차맵 알박기의 편·가문이 정한 상태(폐허 서비스 claimOf·claimLockedOf — 짓는 중 고르기 바꾸기 칸, D-577). 없으면 kind null·locked null */
  readonly claimOf?: ((ownerId: number, mapKey: number) => FacilityLandClaim | null) | undefined;
  readonly claimLockedOf?: ((ownerId: number) => "vassal" | "independent" | null) | undefined;
}

/** 내 세력 비콘 하나(영토 서비스)와 재료를 꺼내는 도시(그 세력에서 가장 가까운 도시, 질문 410 ①) */
export interface BeaconEntry {
  readonly id: number;
  readonly planetId: string;
  readonly cellKey: number;
  readonly supplyCityId?: number | null | undefined;
}

/** 화폐(지갑)·지분(사업장 지분 share:biz_<건물> — 물건이 아니다, docs/adr/2026-11-15-building-screen.md)은 자리 목록에 넣지 않는다 */
const isCash = (asset: string): boolean =>
  asset.startsWith("cur:") || asset === "s3_test_credit" || asset.startsWith("share:");

/** 그 도시의 물자 거래소 건물(다 지은 것 가운데 가장 작은 건물 ID, 없으면 null — market/exchangeBuildings.ts와 같은 고르기, 상태는 서버 명령이 본다) */
function goodsExchangeIn(world: PlaceWorld, catalog: FacilityCatalog, cityId: number | null): number | null {
  let found: number | null = null;
  for (const record of world.facilities.values())
    if (
      record.cityId === cityId &&
      record.level >= 1 &&
      catalog.facility(record.facilityId)?.exchange === "goods" &&
      (found === null || record.buildingId < found)
    )
      found = record.buildingId;
  return found;
}

/** 내 물건이 있는 자리(잔고 > 0, 화폐 빼고) — 도시 창고 → 건물 창고 → 화물 → 자리 없음 차례 */
function placesOf(
  world: PlaceWorld,
  ledger: Ledger,
  catalog: FacilityCatalog,
  ownerId: number,
): GoodsPlaceView[] {
  const byKey = new Map<
    string,
    { view: Omit<GoodsPlaceView, "lines">; lines: GoodsPlaceView["lines"][number][] }
  >();
  for (const account of ledger.accounts()) {
    if (account.ownerId !== ownerId || account.balance <= 0n || isCash(account.asset)) continue;
    const place = placeOfLocation(account.location);
    const key = placeKey(place);
    let entry = byKey.get(key);
    if (!entry) {
      let cityId: number | null = null;
      let mapKey: number | null = null;
      let storage = false;
      let sale = false;
      let facilityId: string | null = null;
      let exchange: GoodsPlaceView["exchange"];
      let exchangeId: number | null | undefined;
      if (place.kind === "city") {
        cityId = place.id;
        // 그 도시 물자 거래소 건물(D-561 — 화면 [거래소로 옮기기], docs/adr/2026-11-16-exchange-buildings.md)
        exchangeId = goodsExchangeIn(world, catalog, cityId);
      } else if (place.kind === "building" && place.id !== null) {
        const found = buildingPlace(world, place.id);
        cityId = found?.cityId ?? null;
        mapKey = found?.mapKey ?? null;
        storage = found?.ownerId === ownerId && isStorage(world, place.id);
        facilityId = world.facilities.get(place.id)?.facilityId ?? null;
        exchange = facilityId === null ? undefined : catalog.facility(facilityId)?.exchange;
        // 내 사업장 물건은 판매만(D-569 1781). 거래소 건물 창고는 맡긴 물건이라 꺼낸다
        sale = found?.ownerId === ownerId && facilityId !== null && !storage && exchange === undefined;
      } else if (place.kind === "cargo" && place.id !== null)
        for (const map of world.maps.values()) if (map.unitInfo(place.id)) mapKey = map.mapKey;
      entry = {
        view: {
          key,
          kind: place.kind,
          id: place.id,
          cityId,
          mapKey,
          storage,
          facilityId,
          sale,
          ...(exchange === undefined ? {} : { exchange }),
          ...(exchangeId === undefined ? {} : { exchangeId }),
        },
        lines: [],
      };
      byKey.set(key, entry);
    }
    const item = account.asset.startsWith("item:") ? account.asset.slice(5) : null;
    entry.lines.push({
      asset: account.asset,
      item,
      name: item === null ? null : (catalog.itemName(item) ?? null),
      qty: String(account.balance),
    });
  }
  return [...byKey.values()]
    .map((entry) => ({
      ...entry.view,
      lines: entry.lines.toSorted((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0)),
    }))
    .toSorted(sourceOrder);
}

const jobView = (job: JobRecord): FacilityJobView => ({
  id: job.id,
  kind: job.kind,
  buildingId: job.buildingId,
  beaconId: job.beaconId,
  holdingId: job.holdingId,
  targetLevel: job.targetLevel,
  restorePpm: job.restorePpm,
  unitIds: [...job.unitIds],
  materials: job.materials.map((stack) => ({ item: stack.item, qty: stack.qty })),
  startedAtMs: job.startedAtMs,
  doneAtMs: job.doneAtMs,
});

function catalogView(
  def: FacilityDef,
  catalog: FacilityCatalog,
  rules: SocietyCoefficients,
  objectFacilities: ReadonlySet<string>,
): FacilityCatalogView {
  const weightOf = (item: string) => catalog.weightOf(item);
  return {
    id: def.id,
    name: def.name,
    stage: def.stage,
    maxLevel: def.maxLevel,
    footprint: def.footprint ?? null,
    needsWaterWithin: def.needsWaterWithin ?? null,
    // 레벨 1 채집소 반경(gather/rules.ts stationBuffs Lv1 = campRadiusCells)
    gatherRadiusCells:
      def.gather && objectFacilities.has(def.id) ? Math.max(0, rules.gatherObjects.campRadiusCells) : null,
    durability: def.durability,
    levels: def.build
      ? Array.from({ length: def.maxLevel }, (_, index) => {
          const level = index + 1;
          const build = def.build;
          return {
            level,
            materials: build ? buildCostAt(build, level) : [],
            timeMs: build ? buildTimeAt(build, level, weightOf, rules.facilityBuild).ms : 0,
          };
        })
      : [],
    repairsEquipment: (def.repair?.length ?? 0) > 0,
    // 거래소 건물(D-561): 종류·잠금(유닛·증권 — 짓기 목록에서 잠금 까닭을 보인다)
    ...(def.exchange === undefined ? {} : { exchange: def.exchange }),
    ...(def.exchange === undefined || EXCHANGE_LOCKS[def.exchange] === undefined
      ? {}
      : { exchangeLock: EXCHANGE_LOCKS[def.exchange] }),
  };
}

/** 로그인한 사용자(소유 주체 ownerId)의 건물 화면 자료 */
export function facilitiesOverview(
  source: FacilityViewSource,
  input: {
    readonly userId: string;
    readonly ownerId: number | undefined;
    readonly nowMs: number;
    readonly dev: boolean;
  },
  beaconsOfFaction: readonly BeaconEntry[],
  /** 칠 수 있는 남의 시설·다른 세력 비콘(targets.ts, 질문 381) */
  targets: readonly FacilityTargetView[] = [],
): FacilitiesOverviewResponse {
  const rules = source.rules();
  const rt = rules.facilityRuntime;
  const catalog = source.catalog();
  const { service, ownerId, nowMs } = { ...input, service: source.service };
  const objectFacilities = source.objectFacilities?.() ?? new Set<string>();
  const catalogViews = catalog.facilities.map((def) => catalogView(def, catalog, rules, objectFacilities));
  const jobFor = (pick: (job: JobRecord) => boolean): FacilityJobView | null => {
    for (const job of service.jobs.values()) if (pick(job)) return jobView(job);
    return null;
  };
  const used = new Set<string>();
  const note = (stacks: readonly FacilityStackView[]) => {
    for (const stack of stacks) used.add(stack.item);
  };
  for (const view of catalogViews) for (const level of view.levels) note(level.materials);
  for (const def of catalog.facilities) for (const rule of def.repair ?? []) note(rule.materials);

  const facilities: FacilityView[] = [];
  /** 유닛 종류(사이보그 본체 표시) */
  const kindOf = (unitId: number): number | undefined => {
    for (const map of source.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.kind;
    }
    return undefined;
  };
  /** 내 유닛 → 직무 배치된 내 시설(유닛 목록이 보인다) */
  const myWork = new Map<number, number>();
  const shops: {
    buildingId: number;
    def: FacilityDef;
    works: boolean;
    outside: boolean;
    mapKey?: number;
    cityId?: number | null;
  }[] = [];
  // 외주(D-564 1682): 내 유닛이 있는 2차맵의 남의 공방도 장비 수리를 받는다(요금은 그 공방 금고)
  const myMaps = new Set<number>();
  if (ownerId !== undefined && source.outsource === true)
    for (const map of source.maps.values())
      map.forEachUnit((unit) => {
        if (unit.ownerId === ownerId) myMaps.add(map.mapKey);
      });
  for (const map of source.maps.values())
    map.forEachBuilding((building) => {
      if (
        ownerId !== undefined &&
        building.ownerId !== ownerId &&
        building.ownerId !== null &&
        myMaps.has(map.mapKey)
      ) {
        const other = service.facilities.get(building.id);
        const otherDef = other ? catalog.facility(other.facilityId) : undefined;
        if (other && otherDef?.repair && otherDef.repair.length > 0 && !source.suspended?.(building.id)) {
          const otherCondition =
            other.level >= 1 && nowMs > other.conditionAtMs
              ? advanceCondition(other.conditionPpm, nowMs - other.conditionAtMs, false, rt)
              : other.conditionPpm;
          const works = other.level >= 1 && conditionWorks(otherCondition, rt);
          shops.push({
            buildingId: building.id,
            def: otherDef,
            works,
            outside: true,
            mapKey: map.mapKey,
            cityId: other.cityId,
          });
        }
        return;
      }
      if (ownerId === undefined || building.ownerId !== ownerId) return;
      const record = service.facilities.get(building.id);
      const def = record ? catalog.facility(record.facilityId) : undefined;
      if (!record || !def) return;
      const condition =
        record.level >= 1 && nowMs > record.conditionAtMs
          ? advanceCondition(record.conditionPpm, nowMs - record.conditionAtMs, false, rt)
          : record.conditionPpm;
      const level = Math.max(1, record.level);
      const max = maxDurabilityAt(def.durability, level, rt);
      const weightOf = (item: string) => catalog.weightOf(item);
      const next = record.level >= 1 && record.level < def.maxLevel && def.build ? record.level + 1 : null;
      const current = def.build
        ? {
            materials: buildCostAt(def.build, level),
            ms: buildTimeAt(def.build, level, weightOf, rules.facilityBuild).ms,
          }
        : { materials: [], ms: 0 };
      const restore = record.level >= 1 ? repairRestorePpm(condition, 1, rt) : 0;
      const works = record.level >= 1 && conditionWorks(condition, rt);
      if (def.repair && def.repair.length > 0)
        shops.push({ buildingId: building.id, def, works, outside: false });
      facilities.push({
        buildingId: building.id,
        facilityId: def.id,
        name: def.name,
        level: record.level,
        maxLevel: def.maxLevel,
        mapKey: map.mapKey,
        x: building.x,
        y: building.y,
        conditionPpm: condition,
        state: conditionStateOf(condition, rt),
        works,
        durability: durabilityPoints(condition, max),
        maxDurability: max,
        storageKg: def.storageKg === undefined ? null : storageCapacityAt(def.storageKg, level, rt),
        storage: def.stage === "storage",
        // 창고 시설과 상한이 있는 시설(채집 시설의 임대형 몫 상한, WP8 523 ②)은 든 무게를 보인다
        storedKg:
          def.stage === "storage" || def.storageKg !== undefined
            ? Number((storedGrams(source.ledger, catalog, building.id) + 999n) / 1000n)
            : null,
        cityId: record.cityId ?? buildingPlace(service.places, building.id)?.cityId ?? null,
        // 숙소(질문 1047 다): 침대·쉬는 NPC 일꾼
        ...(def.stage === "living"
          ? {
              lodging: {
                beds: lodgingBeds(Math.max(0, record.level), rules),
                occupants:
                  source.lodgingOccupants?.(
                    building.id,
                    record.cityId ?? buildingPlace(service.places, building.id)?.cityId ?? null,
                  ) ?? null,
              },
            }
          : {}),
        job: jobFor((job) => job.buildingId === building.id && job.kind !== "equipment"),
        upgrade:
          next !== null && def.build
            ? {
                materials: buildCostAt(def.build, next),
                timeMs: buildTimeAt(def.build, next, weightOf, rules.facilityBuild).ms,
              }
            : null,
        repairStep:
          restore > 0
            ? {
                restorePpm: restore,
                materials: repairMaterialsFor(current.materials, restore),
                timeMs: repairTimeMs(current.ms, restore, 0, rt),
              }
            : null,
        idleMsToDisabled: record.level >= 1 ? idleMsUntil(condition, rt.disabledPm, rt) : null,
        repairsEquipment: (def.repair?.length ?? 0) > 0,
        gather: def.gather
          ? {
              primary: def.gather.primary,
              secondary: def.gather.secondary,
              subcategory: def.gather.subcategory,
              mode: def.gather.mode === "select" ? "select" : "roll",
            }
          : null,
        // 병원(의료 단계, D-521)도 의사 직무 배치 자리가 있다(산출 없음)
        slots:
          def.gather || def.stage === "medical"
            ? Math.max(0, record.level) * Math.max(0, def.slotsPerLevel)
            : 0,
        ...(def.stage === "medical" ? { medical: true } : {}),
        // 짓는 중 알박기 정부의 고르기(D-577 — 다 지어질 때 발효, facility_claim으로 바꾼다)
        ...(record.claim && record.level < 1
          ? {
              landClaim: {
                choice: record.claim,
                kind: source.claimOf?.(ownerId, map.mapKey) ?? null,
                locked: source.claimLockedOf?.(ownerId) ?? null,
              },
            }
          : {}),
        workers: (source.workersOf?.(building.id) ?? []).map((worker) => {
          if (worker.via === "assign") myWork.set(worker.unitId, building.id);
          return {
            unitId: worker.unitId,
            via: worker.via,
            mine: worker.workerOwnerId === ownerId,
            cyborg: kindOf(worker.unitId) === UNIT_KIND_CYBORG,
          };
        }),
      });
    });

  const territory = source.territory();
  const beaconDef = catalog.facility("territory_beacon");
  const beaconCost = beaconDef?.build
    ? {
        materials: buildCostAt(beaconDef.build, 1),
        ms: buildTimeAt(beaconDef.build, 1, (item) => catalog.weightOf(item), rules.facilityBuild).ms,
      }
    : { materials: [], ms: 0 };
  const beacons: FacilityBeaconView[] = beaconsOfFaction.flatMap((entry) => {
    const state = territory?.beaconState(entry.id, nowMs);
    if (!state) return [];
    const max = rules.territory.beaconDurability;
    const ready = state.row.readyAtMs === null || state.row.readyAtMs <= nowMs;
    const restore = ready ? repairRestorePpm(state.conditionPpm, 1, rt) : 0;
    return [
      {
        id: entry.id,
        planetId: entry.planetId,
        cellKey: entry.cellKey,
        conditionPpm: state.conditionPpm,
        state: conditionStateOf(state.conditionPpm, rt),
        durability: durabilityPoints(state.conditionPpm, max),
        maxDurability: max,
        readyAtMs: ready ? null : state.row.readyAtMs,
        job: jobFor((job) => job.beaconId === entry.id),
        repairStep:
          restore > 0
            ? {
                restorePpm: restore,
                materials: repairMaterialsFor(beaconCost.materials, restore),
                timeMs: repairTimeMs(beaconCost.ms, restore, 0, rt),
              }
            : null,
        supplyCityId: entry.supplyCityId ?? null,
      },
    ];
  });

  const units: FacilitiesOverviewResponse["units"][number][] = [];
  if (ownerId !== undefined)
    for (const map of source.maps.values())
      map.forEachUnit((unit) => {
        if (unit.ownerId !== ownerId) return;
        const busy =
          source.unitBusy(unit.id) || [...service.jobs.values()].some((job) => job.unitIds.includes(unit.id));
        const table = source.holdings.statTable() ?? TEST_STAT_TABLE;
        const primaries = source.holdings.primariesOf(unit.id);
        const assigned = myWork.get(unit.id) ?? null;
        units.push({
          id: unit.id,
          cyborg: unit.kind === UNIT_KIND_CYBORG,
          mapKey: map.mapKey,
          busy,
          craftScore: craftScore(primaries, table),
          stats: {
            str: primaries.str,
            dex: primaries.dex,
            agi: primaries.agi,
            vit: primaries.vit,
            int: primaries.int,
            wis: primaries.wis,
          },
          assignedTo: assigned,
        });
      });
  units.sort((a, b) => Number(b.cyborg) - Number(a.cyborg) || a.id - b.id);

  const holdings: FacilityHoldingView[] = [];
  if (ownerId !== undefined) {
    const holdingService = source.holdings.service;
    for (const record of holdingService.list(ownerId, nowMs).holdings) {
      const def = holdingService.defOf(record.itemId);
      if (record.durability === null || record.maxDurability === null || !def?.equip) continue;
      const lost = record.maxDurability - record.durability;
      const busy = service.holdingLocked(record.id);
      if (lost <= 0 && !busy) continue;
      const equip = def.equip;
      holdings.push({
        id: record.id,
        item: record.itemId,
        name: def.name ? { ko: def.name.ko, en: def.name.en } : null,
        tier: def.tier,
        durability: record.durability,
        maxDurability: record.maxDurability,
        equipped: record.slot !== null,
        busy,
        shops: shops
          .toSorted((a, b) => Number(a.outside) - Number(b.outside) || a.buildingId - b.buildingId)
          .flatMap((shop) => {
            const rule = repairRuleFor(shop.def.repair ?? [], {
              slot: equip.slot,
              weaponType: equip.weaponType,
            });
            if (!rule || !shop.works) return [];
            const materials = repairMaterials(rule, def.tier, lost, record.maxDurability ?? 0);
            if (!shop.outside) return [{ buildingId: shop.buildingId, materials }];
            // 외주(D-570 1785): 그 공방 일꾼이 고친다 — 일꾼이 없거나 받지 않는 공방은 보이지 않는다
            const quote = service.outsourceQuote(shop.buildingId, {
              tier: def.tier,
              lost,
              maxDurability: record.maxDurability ?? 0,
            });
            if (typeof quote === "string") return [];
            return [
              {
                buildingId: shop.buildingId,
                materials,
                fee: String(quote.fee),
                ms: quote.ms,
                workers: quote.workers.length,
                mapKey: shop.mapKey,
                cityId: shop.cityId ?? null,
              },
            ];
          }),
      });
    }
  }

  return {
    status: "ready",
    generatedAt: nowMs,
    rules: { ...rt },
    maps: [...source.maps.keys()],
    cities: service.places.cities().filter((city) => source.maps.has(city.mapKey)),
    places: ownerId === undefined ? [] : placesOf(service.places, source.ledger, catalog, ownerId),
    catalog: catalogViews,
    facilities: facilities.toSorted((a, b) => a.buildingId - b.buildingId),
    beacons,
    materials: [...used].toSorted().map((item) => ({
      item,
      name: catalog.itemName(item) ?? null,
      have: ownerId === undefined ? "0" : String(goodsStock(source.ledger, ownerId, item)),
    })),
    units,
    holdings,
    targets,
    dev: input.dev,
  };
}
