// 거래소 반입 전 개인 창고 자리 확인(기획 D-571 1943, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)") — gather/world.ts가 물자 거래소
// 건물 넣기(storage_move in → 운반꾼) 앞에서 부른다. 도시 경제(거래소 모음·개인 창고 줄)가 아직 없으면 보지 않는다(undefined).
// 자리는 떠날 때만 본다: 나르는 중에 다른 짐·사기 체결로 넘쳐도 닿은 짐은 넣는다(이미 맡은 물건 — 넘치면 다음 넣기·사기를 막는다).
// 크기 = 그 주인 유닛 창고의 합(질문 2081, lockers.ts ownerLockerG — 어디에 있든 모든 유닛, misc-574).
import { lockerFits } from "@terra/shared/exchange";
import type { WorldFacilities } from "../facilities/world.ts";
import { assetWeightG } from "../facilities/places.ts";
import type { World } from "../world/world.ts";
import { type LockerCoords, lockerUnitsOf, lockerUsedG, ownerLockerG } from "./lockers.ts";

/** 들어갈 자리가 있으면 true, 없으면 false, 볼 수 없으면(경제·건물·도시 없음) undefined */
export function exchangeRoom(
  world: Pick<World, "npc" | "maps"> & {
    readonly persistence?: { readonly travel?: LockerCoords | undefined } | undefined;
  },
  facilities: Pick<WorldFacilities, "service" | "catalog" | "rules">,
  ownerId: number,
  buildingId: number,
  asset: string,
  qty: bigint,
): boolean | undefined {
  const runtime = world.npc;
  const econ = runtime?.economy;
  const cityId = facilities.service.facilities.get(buildingId)?.cityId ?? null;
  if (!runtime || !econ || cityId === null) return undefined;
  const catalog = facilities.catalog();
  const weightOf = (code: string): bigint => assetWeightG(catalog, code);
  const used = lockerUsedG({
    ledger: runtime.world.book,
    registry: econ.registry,
    weightOf,
    ownerId,
    cityId,
    exchangeBuildingId: buildingId,
  });
  const capacity = ownerLockerG(
    facilities.rules().business,
    lockerUnitsOf(world.maps, econ.lockers, ownerId, cityId, world.persistence?.travel),
  );
  return lockerFits(used, qty * weightOf(asset), capacity);
}
