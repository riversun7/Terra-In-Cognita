// 배 시설 판의 항구 칸(기획 D-570 1821·1823, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-570)") — service.ts panelOf가 쓴다(1,000줄 상한 때문에 나눔).
// - 항구 옆 물자 거래소 건물(port.ts exchangeNear) — 내리기·싣기 물건 자리.
// - 내 배 줄마다: 함포 칸(규격·단 장비)·달 수 있는 포획 장비(이름·최대 티어)·이 항구에서 실을 수 있는 배 주인 물건(거래소 건물 창고 + 도시 창고, 묶음 수).
//   원장 계정은 배 주인 묶음으로 한 번만 훑는다(cargo.ts loadableOf).
import type { HarborItemView } from "@terra/shared/harbor";
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { cityAt } from "../facilities/places.ts";
import { loadableOf } from "./cargo.ts";
import type { BoatDeps, FoundBuilding } from "./core.ts";
import type { Harbor } from "./harbor.ts";
import { exchangeNear } from "./port.ts";
import type { FacilityRecord } from "../facilities/state.ts";

/** 배 한 줄의 항구 칸 */
export interface PortRowView {
  readonly slots?: readonly { readonly caliber: string; readonly gear: string | null }[];
  readonly gearOptions?: readonly HarborItemView[];
  readonly loadable?: readonly HarborItemView[];
}

/** 그 배 시설의 항구 칸 만들기(거래소 건물과 배 줄 칸) */
export function portView(
  deps: BoatDeps,
  harbor: Harbor,
  found: FoundBuilding,
  record: FacilityRecord,
  boats: readonly { readonly boatId: number; readonly ownerId: number }[],
): { readonly exchangeId: number | null; readonly row: (boatId: number, ownerId: number) => PortRowView } {
  const places = deps.places();
  const catalog = places?.catalog();
  const cityId = places
    ? (record.cityId ?? cityAt(places, found.map.mapKey, found.rect.x, found.rect.y))
    : null;
  const exchangeId =
    cityId === null ? null : exchangeNear(deps, found, cityId, Math.max(0, deps.rules().exchangeReachCells));
  const locations =
    cityId === null
      ? []
      : [...(exchangeId === null ? [] : [buildingLocation(exchangeId)]), cityLocation(cityId)];
  const goods = loadableOf(deps.ledger, catalog, new Set(boats.map((boat) => boat.ownerId)), locations);
  const named = (item: string): { readonly name?: { readonly ko: string; readonly en: string } } => {
    const name = catalog?.itemName(item);
    return name ? { name: { ko: name.ko, en: name.en } } : {};
  };
  return {
    exchangeId,
    row(boatId, ownerId) {
      const state = harbor.stateOf(boatId);
      const type = harbor.typeOf(state);
      const guns = type?.naval?.guns ?? [];
      const out: {
        slots?: { caliber: string; gear: string | null }[];
        gearOptions?: HarborItemView[];
        loadable?: HarborItemView[];
      } = {};
      if (guns.length > 0)
        out.slots = guns.map((gun, slot) => ({ caliber: gun.caliber, gear: state?.gear[slot] ?? null }));
      if (type?.catchGear && guns.length > 0)
        out.gearOptions = type.catchGear.map((row) => ({
          item: row.item,
          maxTier: row.maxTier,
          ...named(row.item),
        }));
      out.loadable = (goods.get(ownerId) ?? []).map((row) => ({
        item: row.item,
        lots: row.lots,
        ...named(row.item),
      }));
      return out;
    },
  };
}
