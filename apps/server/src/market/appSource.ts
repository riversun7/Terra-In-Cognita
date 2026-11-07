// 거래소 서비스·화면 자료의 월드 쪽(app.ts → 게이트웨이·tRPC 경제 화면) — docs/adr/2026-11-07-play-flow.md WP4.
// 세계가 준비되고 NPC 사회 런타임이 도시 경제를 돌릴 때만 준다(아니면 게이트웨이는 busy, 화면은 not_ready). 런타임마다 한 번 만든다.
import type { World } from "../world/world.ts";
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
    const service = createMarketService({
      runtime,
      ledger: persistence.ledger,
      settlement: persistence.settlement,
      owners: persistence.owners,
      writer: persistence.writer,
      rules: persistence.facilities.rules,
      now,
    });
    const views = createMarketViews({
      runtime,
      ledger: persistence.ledger,
      ownerOf: (userId) => persistence.settlement.findOwnerOfUser(userId),
      homeCityOf: (userId) => persistence.cyborgs.record(userId)?.startCityId,
    });
    built = { runtime, source: service ? { service, views } : undefined };
    return built.source;
  };
}
