// 경제 화면이 읽는 월드 원장·거래소 — 로그인한 사용자의 소유 주체와 그 주체의 계정 잔고(읽기만), 실제 거래소 화면 자료(market/views.ts),
// 도시 이름(창고 곳 이름).
// 월드 원장은 메모리 장부 + 쓰기 대기열이다(src/economy/ledger.ts). 장부를 바꾸지 않고 계정만 훑는다(주체 정산도 하지 않는다:
// 시험 자원 산출은 정시 정산 뒤에 보인다, src/world/settlement.ts).
import type { MarketViews } from "../market/views.ts";
import type { World } from "../world/world.ts";
import type { EconomyAccountRow, EconomyWorldSource } from "./services.ts";

export function worldEconomySource(world: World, market?: () => MarketViews | undefined): EconomyWorldSource {
  return {
    ownerOf: (userId) => world.persistence?.settlement.findOwnerOfUser(userId),
    accountsOf(ownerId) {
      const ledger = world.persistence?.ledger;
      if (!ledger) return [];
      const rows: EconomyAccountRow[] = [];
      for (const account of ledger.accounts()) {
        if (account.ownerId === ownerId)
          rows.push({ asset: account.asset, location: account.location, balance: account.balance });
      }
      return rows;
    },
    market,
    // 도시 이름 = NPC 런타임 도시 자리의 이름(켤 때 world_cities.name, 실행 중에 세운 마을도 — 기획 답 601 나)
    cityName: (cityId) => world.npc?.places.get(cityId)?.name,
    cityNames: () =>
      [...(world.npc?.places ?? new Map<number, { readonly name?: string | undefined }>())]
        .flatMap(([id, place]) => (place.name === undefined ? [] : [{ id, name: place.name }]))
        .toSorted((a, b) => a.id - b.id),
  };
}
