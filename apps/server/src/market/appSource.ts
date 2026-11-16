// 거래소 서비스·화면 자료의 월드 쪽(app.ts → 게이트웨이·tRPC 경제 화면) — docs/adr/2026-11-07-play-flow.md WP4.
// 세계가 준비되고 NPC 사회 런타임이 도시 경제를 돌릴 때만 준다(아니면 게이트웨이는 busy, 화면은 not_ready). 런타임마다 한 번 만든다.
import type { World } from "../world/world.ts";
import { assetWeightG } from "../facilities/places.ts";
import { createExchangeDirectory } from "./exchangeBuildings.ts";
import { fxFeeOf } from "./fxFee.ts";
import { fxFeeHook } from "./fxFeeHook.ts";
import { workerFor } from "../labor/workerEntry.ts";
import { type DeskTrader, type ExchangeDeskSource, deskViewOf, lockerViewOf } from "./exchangeDesk.ts";
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
    // 거래 직무 유닛(질문 2083): 주인의 직무 배치·남의 임대형(빌린 자리 — 임차인 몫)·임금형(고용 — 고용주 몫), 그 일의 몫을 받는 주체로 센다
    const tradersAt = (buildingId: number): DeskTrader[] =>
      labor.workersAt(buildingId).map((entry) => ({
        unitId: entry.unitId,
        ownerId: workerFor(entry),
        ...(entry.contractId === undefined ? {} : { contractId: entry.contractId }),
      }));
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
      // 자리 수(레벨 × 설정 칸)·차지한 자리(모든 일꾼)·주인이 낸 자리 값(질문 2083)
      seats: (buildingId) =>
        Math.max(0, facilities.service.facilities.get(buildingId)?.level ?? 0) *
        Math.max(0, Math.floor(facilities.rules().business.exchangeTradeSlots)),
      takenAt: (buildingId) => labor.workersAt(buildingId).length,
      rentOf: (buildingId) => labor.rentOf(buildingId),
      unitBusy: (unitId) => labor.unitBusy(unitId) || facilities.service.unitInJob(unitId),
      primariesOf: (unitId) => persistence.holdings.primariesOf(unitId),
      coords: () => persistence.travel,
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
      maps: world.maps,
      coords: () => persistence.travel,
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
      // 환전 이용료(질문 2086): 경제 런타임 환전 회차와 같은 고르기(fxFeeHook.ts)
      fxFeeOf: fxFeeHook(
        {
          fxExchanges: () => exchanges.citiesWith("fx"),
          fxFeeBp: (buildingId) =>
            fxFeeOf(
              (id, item) => facilities.business.price(id, item),
              facilities.rules().business,
              buildingId,
            ).charged,
          business: facilities.business,
        },
        persistence.ledger,
        (cityId) => {
          const owner = runtime.world.cities.get(cityId)?.owner;
          return owner === undefined ? undefined : runtime.economy?.economy.currencyOf.get(owner);
        },
      )?.of,
    });
    built = { runtime, source: service ? { service, views } : undefined };
    return built.source;
  };
}
