// 채집소 판 조회(tRPC gather.station) — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", docs/adr/2026-11-07-gather-objects.md
// "바뀜 (2026-11-08 사용자 지적: 채집소 기능)". 응답 모양은 @terra/shared/gatherStation. 읽기만 한다.
// - 레벨·반경·버프(지금·다음 레벨), 반경 안 오브젝트 합(캘 수 있음·떨어짐·남은 번수·다음 다시 자람), 채집소 창고(상한·든 무게·내 몫), 자동 옮김
//   다음 시각, 일꾼(직무 배치·노동 계약)과 상태(일함·쉼·오브젝트 없음·창고 가득·멈춤·2차맵 밖), 레벨 올리는 중·다음 레벨 비용(내 것일 때).
// - 로그인한 누구나 볼 수 있다(남의 채집소면 내 몫 물건·비용은 비어 있다). 남의 일꾼 상태는 보인다(건물 판 "안에 있는 유닛"과 같은 정도).
// - facility 채집소(농장 — 오브젝트 없음, 기획 정리 756 ②)는 버프가 수확·피로뿐이다(반경·다시 자람 null, 오브젝트 합 null). 창고·자동 옮김은 같다.
import type {
  GatherStationBuffs,
  GatherStationGoods,
  GatherStationPlots,
  GatherStationResponse,
  GatherStationUpgrade,
  GatherStationWorker,
  GatherStationWorkerRest,
  GatherStationWorkerState,
} from "@terra/shared/gatherStation";
import { buildCostAt, buildTimeAt } from "@terra/shared/facilityBuild";
import { buildingGatherTier, chosenGatherTier, plotAreaPm, plotSlots } from "@terra/shared/gatherMath";
import { haulMs } from "@terra/sim";
import { buildingLocation } from "@terra/shared/goodsPlaces";
import { storageCapacityAt } from "@terra/shared/facilityRuntime";
import { assetWeightG, materialScope, storedGrams } from "../facilities/places.ts";
import { goodsStock } from "../facilities/materials.ts";
import type { Viewer } from "../trpc/context.ts";
import type { StationRuntime, StationSite } from "./station.ts";
import { resting } from "./station.ts";
import { type StationBuffs, stationBuffs } from "./rules.ts";
import type { GatherWorld } from "./world.ts";

export function emptyStation(
  status: GatherStationResponse["status"],
  buildingId: number,
  nowMs: number,
): GatherStationResponse {
  return {
    status,
    buildingId,
    kind: null,
    facilityId: null,
    name: null,
    level: 0,
    maxLevel: 0,
    mine: false,
    mapKey: null,
    x: 0,
    y: 0,
    cityId: null,
    works: false,
    buffs: null,
    objects: null,
    storage: { capacityGrams: null, usedGrams: "0", goods: [] },
    haul: { everyMs: 0, nextAtMs: null },
    slots: 0,
    workers: [],
    fatigueMax: 0,
    upgradingUntilMs: null,
    upgrade: null,
    generatedAt: nowMs,
  };
}

/** 일꾼 하나의 상태(유닛 자리·직무 단계·마지막 정산 결과) */
function workerState(
  station: StationRuntime,
  site: StationSite,
  unit: { readonly mapKey: number; readonly phase: number } | undefined,
  unitId: number,
): GatherStationWorkerState {
  if (!unit || unit.mapKey !== site.mapKey) return "away";
  if (!site.works) return "stopped";
  if (resting(unit.phase)) return "resting";
  const status = station.status(unitId);
  if (!status || status.buildingId !== site.buildingId) return "waiting";
  return status.state;
}

/** 버프 보기: facility 채집소(오브젝트 없음)는 반경·다시 자람이 없다 */
const buffsView = (kind: StationSite["kind"], buffs: StationBuffs): GatherStationBuffs => ({
  radiusCells: kind === "objects" ? buffs.radiusCells : null,
  yieldPm: buffs.yieldPm,
  fatiguePm: buffs.fatiguePm,
  regrowPm: kind === "objects" ? buffs.regrowPm : null,
});

export function stationView(
  gather: GatherWorld,
  viewer: Viewer,
  buildingId: number,
  nowMs: number,
): GatherStationResponse {
  const world = gather.places();
  if (!world) return emptyStation("not_ready", buildingId, nowMs);
  const station = gather.station;
  const site = station.site(buildingId);
  if (!site) {
    const exists = [...world.maps.values()].some((map) => map.buildingOwner(buildingId) !== undefined);
    return emptyStation(exists ? "not_station" : "unknown_building", buildingId, nowMs);
  }
  const record = world.facilities.get(buildingId);
  const catalog = world.catalog();
  const def = catalog.facility(site.facilityId);
  const rules = gather.rules();
  const ownerId = gather.ownerOf(viewer.id);
  const mine = ownerId !== undefined && site.ownerId === ownerId;

  // 반경 안 오브젝트 합
  let objects: GatherStationResponse["objects"] = null;
  if (site.kind === "objects") {
    const kinds = gather.kinds();
    const list = station.objectsIn(site, nowMs);
    let ready = 0;
    let usesLeft = 0;
    let usesMax = 0;
    let nextRegrowAtMs: number | null = null;
    for (const entry of list) {
      usesLeft += entry.usesLeft;
      usesMax += entry.uses;
      if (entry.usesLeft > 0) ready += 1;
      else if (entry.regrowAtMs > 0 && (nextRegrowAtMs === null || entry.regrowAtMs < nextRegrowAtMs))
        nextRegrowAtMs = entry.regrowAtMs;
    }
    objects = {
      kinds: site.kindIndexes.map((index) => kinds[index]?.id ?? "").filter((id) => id !== ""),
      total: list.length,
      ready,
      depleted: list.length - ready,
      usesLeft,
      usesMax,
      nextRegrowAtMs,
    };
  }

  // 채집소 창고: 상한·든 무게(모든 주인)·내 몫
  const here = buildingLocation(buildingId);
  const goods: GatherStationGoods[] = [];
  if (ownerId !== undefined)
    for (const account of gather.storage()?.ledger.accounts() ?? [])
      if (account.location === here && account.ownerId === ownerId && account.balance > 0n) {
        const item = account.asset.startsWith("item:") ? account.asset.slice(5) : null;
        goods.push({
          asset: account.asset,
          item,
          name: item === null ? null : (catalog.itemName(item) ?? null),
          qty: account.balance.toString(),
          grams: (account.balance * assetWeightG(catalog, account.asset)).toString(),
        });
      }
  const ledger = gather.storage()?.ledger;
  const capacity =
    def?.storageKg === undefined
      ? null
      : BigInt(storageCapacityAt(def.storageKg, Math.max(1, site.level), rules.facilityRuntime)) * 1000n;

  // 일꾼 쉼터(질문 1088 가): 숙소(레벨)·집과 회복 배율
  const restView = (unitId: number): GatherStationWorkerRest | null => {
    const rest = gather.workerRest.restOf(unitId);
    if (!rest || rest.place.kind === "homeless") return null;
    return {
      kind: rest.place.kind,
      level: rest.place.kind === "lodging" ? rest.place.level : 0,
      recoveryPm: rest.recoveryPm,
    };
  };
  // 일꾼(직무 배치·노동 계약)
  const units = new Map<number, { mapKey: number; phase: number; fatigue: number }>();
  for (const map of world.maps.values())
    map.forEachUnit((unit) => {
      units.set(unit.id, { mapKey: map.mapKey, phase: unit.job.phase, fatigue: unit.job.fatigue });
    });
  const workers: GatherStationWorker[] = gather.workersAt(buildingId).map((entry) => {
    const unit = units.get(entry.unitId);
    const status = station.status(entry.unitId);
    const atStation = status?.buildingId === buildingId ? status : undefined;
    return {
      unitId: entry.unitId,
      via: entry.via,
      mine: ownerId !== undefined && entry.workerOwnerId === ownerId,
      state: workerState(station, site, unit, entry.unitId),
      lots: atStation?.lots ?? 0,
      fatigue: unit?.fatigue ?? 0,
      settledAtMs: atStation?.settledAtMs ?? null,
      rest: restView(entry.unitId),
    };
  });

  // 레벨 올리는 중·다음 레벨 비용(내 것, 다 지었고 더 올릴 수 있을 때)
  let upgradingUntilMs: number | null = null;
  // 면적 모듈 붙이기(D-569 1765)는 따로 적는다(plots.buildingUntilMs)
  let plottingUntilMs: number | null = null;
  for (const job of gather.jobs().values())
    if (job.buildingId === buildingId && job.kind === "plot")
      plottingUntilMs = Math.max(plottingUntilMs ?? 0, job.doneAtMs);
    else if (job.buildingId === buildingId && job.kind !== "equipment")
      upgradingUntilMs = Math.max(upgradingUntilMs ?? 0, job.doneAtMs);
  let upgrade: GatherStationUpgrade | null = null;
  if (
    mine &&
    ownerId !== undefined &&
    ledger &&
    def?.build &&
    site.level >= 1 &&
    site.level < site.maxLevel
  ) {
    const next = site.level + 1;
    const scope = materialScope(world, ownerId, site.mapKey, site.cityId);
    upgrade = {
      level: next,
      materials: buildCostAt(def.build, next).map((stack) => ({
        item: stack.item,
        name: catalog.itemName(stack.item) ?? null,
        qty: stack.qty,
        have: Number(goodsStock(ledger, ownerId, stack.item, scope)),
      })),
      timeMs: buildTimeAt(def.build, next, (item) => catalog.weightOf(item), rules.facilityBuild).ms,
      buffs: buffsView(site.kind, stationBuffs(rules.gatherObjects, next)),
    };
  }

  // 건물 채집소 면적 모듈·기르는 티어(D-566 1721·D-567)
  let plots: GatherStationPlots | null = null;
  if (def?.gather?.mode === "select") {
    const building = rules.buildingGather;
    const count = Math.max(0, record?.plots ?? 0);
    const slots = plotSlots(site.level, building);
    const maxTier = buildingGatherTier(Math.max(1, site.level));
    const tier = chosenGatherTier(Math.max(1, site.level), record?.gatherTier);
    const scope =
      mine && ownerId !== undefined ? materialScope(world, ownerId, site.mapKey, site.cityId) : undefined;
    plots = {
      count,
      slots,
      areaPm: plotAreaPm(count, building),
      perPlotPm: building.plotAreaPm,
      tier,
      recommendedStat: building.statPerTier * tier,
      materials:
        scope && ledger && ownerId !== undefined && def.build && site.level >= 1 && count < slots
          ? buildCostAt(def.build, 1).map((stack) => ({
              item: stack.item,
              name: catalog.itemName(stack.item) ?? null,
              qty: stack.qty,
              have: Number(goodsStock(ledger, ownerId, stack.item, scope)),
            }))
          : null,
      maxTier,
      chosenTier: record?.gatherTier ?? null,
      statPerTier: building.statPerTier,
      timeMs: def.build
        ? buildTimeAt(def.build, 1, (item) => catalog.weightOf(item), rules.facilityBuild).ms
        : 0,
      buildingUntilMs: plottingUntilMs,
    };
  }

  const haulEvery = Math.max(0, Math.floor(rules.gatherObjects.stationHaulMs));
  const route = station.haulRoute(buildingId);
  // 지금 든 내 몫 무게(옮김 시간 셈)
  let myGrams = 0n;
  for (const line of goods) myGrams += BigInt(line.grams);
  return {
    status: "ok",
    buildingId,
    kind: site.kind,
    facilityId: site.facilityId,
    name: def ? { ko: def.name.ko, en: def.name.en } : null,
    level: site.level,
    maxLevel: site.maxLevel,
    mine,
    mapKey: site.mapKey,
    x: site.x,
    y: site.y,
    cityId: site.cityId,
    works: site.works,
    buffs: buffsView(site.kind, site.buffs),
    objects,
    storage: {
      capacityGrams: capacity === null ? null : capacity.toString(),
      usedGrams: ledger ? storedGrams(ledger, catalog, buildingId).toString() : "0",
      goods: goods.toSorted((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0)),
    },
    haul: {
      everyMs: haulEvery,
      nextAtMs: site.cityId !== null ? station.nextHaulAt(nowMs) : null,
      // 옮김 거리(질문 1050 가): 칸·창고까지인지·지금 든 내 몫을 나르는 시간·나르는 중이면 닿는 시각
      cells: route ? route.cells : null,
      toStore: route ? route.storeId !== null : false,
      tripMs: route ? haulMs(myGrams, route.cells, route.carriers, rules) : null,
      arriveAtMs: station.trip(buildingId)?.arriveAtMs ?? null,
      porterUnitId: station.trip(buildingId)?.porter ?? null,
    },
    slots: Math.max(0, record?.level ?? 0) * Math.max(0, site.slotsPerLevel),
    workers: workers.toSorted((a, b) => a.unitId - b.unitId),
    fatigueMax: rules.fatigueMax,
    upgradingUntilMs,
    upgrade,
    plots,
    generatedAt: nowMs,
  };
}
