// 배 창고 내리기(boat_unload) — 기획 D-568 "배창고가 가득차면 항구 교역소에 팔거나 부두의 자신창고에 보관", docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-564·D-568)".
// - 교역 부두(누구 것이든): 시간을 사고 둘레에 대어 있을 때(연료 보급과 같은 조건) 배 창고 물건을 그 부두 도시의 내 창고로 내린다. 거래소는 도시 내 창고의
//   물건만 판다(market/service.ts) — 내린 물건을 그 도시 거래소에 내놓는다(D-564 1628 "거래소로 실어 나른 물건만"). 바로 시장가로 파는 것은 질문(1824).
// - 내 배 시설(정박장·조선소·교역 부두): 둘레에 대어 있으면 그 시설 도시의 내 창고로 보관한다(요금·시간 사기 없음 — 제 부두).
// - 내린 물건은 거래 하나로 옮긴다(배 창고 → 도시 창고, 같은 주인). 창고 시설(무게 상한)로는 내리지 않는다 — 도시 창고는 상한이 없다(질문 411).
import { cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { cityAt } from "../facilities/places.ts";
import { type BoatCommandResult, type BoatDeps, facilityOf, fail, findBuilding, mapOfUnit } from "./core.ts";
import type { Harbor } from "./harbor.ts";
import { holdStacks } from "./hold.ts";
import { isTradeDock } from "./rules.ts";
import { UNIT_KIND_BOAT } from "../world/unitKinds.ts";

export interface Cargo {
  /** 배 창고를 그 시설 도시의 내 창고로 내린다(me = 부르는 소유 주체). 옮긴 기본 단위 합은 결과에 싣지 않는다 */
  unload(me: number | undefined, boatId: number, buildingId: number, operator: boolean): BoatCommandResult;
}

export function createCargo(deps: BoatDeps, harbor: Harbor): Cargo {
  const { maps, now } = deps;
  return {
    unload(me, boatId, buildingId, operator) {
      const map = mapOfUnit(maps, boatId);
      const boat = map?.unitInfo(boatId);
      if (!map || !boat) return fail("unknown_unit");
      if (!operator && boat.ownerId !== me) return fail("forbidden");
      if (boat.kind !== UNIT_KIND_BOAT) return fail("not_boat");
      const state = harbor.stateOf(boatId);
      if (!state) return fail("unknown_unit");
      const found = findBuilding(maps, buildingId);
      if (!found) return fail("unknown_building");
      if (found.map !== map) return fail("wrong_map");
      const places = deps.places();
      const fac = facilityOf(places, buildingId);
      if (!places || !fac?.def.harbor) return fail("not_dock");
      const at = now();
      const owned = found.ownerId === boat.ownerId;
      // 남의 시설은 교역 부두만, 시간을 사고 대어 있을 때(제 시설은 대어 있기만 하면)
      if (!owned) {
        if (!isTradeDock(fac.def)) return fail("forbidden");
        if (state.tradeId !== buildingId || (state.tradeUntilMs ?? 0) <= at) return fail("not_moored");
      }
      if (!harbor.near(boatId, found, deps.rules().harborReachCells, at)) return fail("not_moored");
      const cityId = fac.record.cityId ?? cityAt(places, found.map.mapKey, found.rect.x, found.rect.y);
      if (cityId === null) return fail("not_ready");
      const stacks = holdStacks(deps.ledger, boat.ownerId, boatId);
      if (stacks.length === 0) return fail("hold_empty");
      const from = cargoLocation(boatId);
      const to = cityLocation(cityId);
      const entries: { account: number; amount: bigint }[] = [];
      for (const stack of stacks) {
        entries.push({
          account: deps.ledger.ownerAccount(boat.ownerId, stack.asset, from),
          amount: -stack.qty,
        });
        entries.push({ account: deps.ledger.ownerAccount(boat.ownerId, stack.asset, to), amount: stack.qty });
      }
      deps.ledger.post({ kind: "boat_unload", atMs: at, entries });
      return { ok: true, boatId };
    },
  };
}
