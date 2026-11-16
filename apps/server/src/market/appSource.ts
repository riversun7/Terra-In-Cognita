// 거래소 서비스·화면 자료의 월드 쪽(app.ts → 게이트웨이·tRPC 경제 화면) — docs/adr/2026-11-07-play-flow.md WP4.
// 세계가 준비되고 NPC 사회 런타임이 도시 경제를 돌릴 때만 준다(아니면 게이트웨이는 busy, 화면은 not_ready). 런타임마다 한 번 만든다.
import type { World } from "../world/world.ts";
import { assetWeightG } from "../facilities/places.ts";
import { createExchangeDirectory } from "./exchangeBuildings.ts";
import { type ExchangeDeskSource, deskViewOf, lockerViewOf } from "./exchangeDesk.ts";
import { type MarketService, createMarketService } from "./service.ts";
import { type MarketViews, createMarketViews } from "./views.ts";

export interface MarketSource {
  readonly service: MarketService;
  readonly views: MarketViews;
}

export function marketSourceOf(world: World | undefined, now: () => number): () => MarketSource | undefined {
  let built: { runtime: object; source: MarketSource | undefined } | undefined;
  return () => {
    const runtime = world?.npc;
    const persistence = world?.persistence;
    if (!world || world.status().state !== "ready" || !runtime?.economy || !persistence) return undefined;
    if (built?.runtime === runtime) return built.source;
    // 거래소 건물(기획 D-561, docs/adr/2026-11-16-exchange-buildings.md): 그 도시 거래소·거래 직무 유닛 주문 한도(D-148·D-571 1944)
    const facilities = persistence.facilities;
    const labor = persistence.labor;
    const tradersAt = (buildingId: number): { unitId: number; ownerId: number }[] =>
      labor
        .workersAt(buildingId)
        .filter((entry) => entry.via === "assign")
        .map((entry) => ({ unitId: entry.unitId, ownerId: entry.workerOwnerId }));
    const exchanges = createExchangeDirectory({
      records: () => facilities.service.facilities.values(),
      catalog: facilities.catalog,
      works: (buildingId) => facilities.service.works(buildingId),
      primariesOf: (unitId) => persistence.holdings.primariesOf(unitId),
      tradersAt,
    });
    const weightOf = (asset: string): bigint => assetWeightG(facilities.catalog(), asset);
    // 개인 창고·거래 직무 칸(D-571 1943·1944)
    const desk: ExchangeDeskSource = {
      ledger: persistence.ledger,
      registry: () => runtime.economy?.registry,
      lockers: () => runtime.economy?.lockers,
      rules: () => facilities.rules().business,
      weightOf,
      maps: world.maps,
      tradersAt,
      unitBusy: (unitId) => labor.unitBusy(unitId) || facilities.service.unitInJob(unitId),
      primariesOf: (unitId) => persistence.holdings.primariesOf(unitId),
    };
    const service = createMarketService({
      runtime,
      ledger: persistence.ledger,
      settlement: persistence.settlement,
      owners: persistence.owners,
      writer: persistence.writer,
      rules: persistence.facilities.rules,
      now,
      exchanges,
      weightOf,
      business: facilities.business,
    });
    const views = createMarketViews({
      runtime,
      ledger: persistence.ledger,
      ownerOf: (userId) => persistence.settlement.findOwnerOfUser(userId),
      homeCityOf: (userId) => persistence.cyborgs.record(userId)?.startCityId,
      exchanges,
      buildingName: (buildingId) => {
        const record = facilities.service.facilities.get(buildingId);
        return record ? facilities.catalog().facility(record.facilityId)?.name : undefined;
      },
      locker: lockerViewOf(desk),
      desk: deskViewOf(desk),
    });
    built = { runtime, source: service ? { service, views } : undefined };
    return built.source;
  };
}
