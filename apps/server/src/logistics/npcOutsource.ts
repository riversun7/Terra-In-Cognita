// NPC 운반을 물류센터에 맡기기 — 기획 대조 2274(D-555 1509 "NPC만으로도 그대로 똑같이 시스템이 돌아간다", D-555 1505 운반 대행, D-576 자동 맡기기 = 요금이
// 싼 곳), docs/adr/2026-11-16-logistics-center.md "바뀜 (haul-2)". npc/npcCarry.ts가 빈 일꾼 운반(거래소 운반·돌려보내기)의 운반꾼이 없을 때 부른다.
// - 고를 곳: 그 도시·2차맵의 받는 물류센터(플레이어 것 포함)를 한 단위 요금이 싼 차례로(haulService.centers auto — 플레이어 자동 맡기기와 같은 고르기).
// - 실제 운반: 그 물류센터 일꾼이 플레이어 짐과 같은 길(gather/station.ts carry, via = 그 물류센터)로 진다 — 화물 약탈·닿는 시각·합치기가 같다. 요금은 떠날 때
//   물건 주인(그 NPC 세력) 지갑 = 국고(나라 화폐 — 기획 대조 2277)에서 그 물류센터 금고로(haul_service, 소득세). 국고가 모자라면 맡기지 않는다(기다림).
// - 2차맵을 띄우지 않았거나(물류센터 일꾼이 그 2차맵에 없다) 실제 운반 길이 아직 없으면(채집 세계가 서기 전) 맡기지 않는다.
// - 닿았나 = 운반꾼 화물에 그 세력 물건이 남지 않았나(닿아 내려놓았거나 빼앗김). 옮김 셈을 끄거나 거리 0이면 바로 옮겨져 늘 닿음.
import { cargoLocation, placeOfLocation } from "@terra/shared/goodsPlaces";
import type { LedgerBook } from "@terra/sim";
import type { PlaceWorld } from "../facilities/places.ts";
import { buildingCenterOf } from "../market/exchangeBuildings.ts";
import type { CarryRequest, OutsourcedCarry } from "../npc/npcCarry.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { HaulService } from "./haulService.ts";

export function npcOutsourceOf(deps: {
  readonly haul: Pick<HaulService, "centers" | "carrier">;
  readonly places: () => Pick<PlaceWorld, "cities"> | undefined;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly ledger: Pick<LedgerBook, "balanceOf">;
}): (request: CarryRequest, nowMs: number) => OutsourcedCarry | undefined {
  return (request, nowMs) => {
    const carry = deps.haul.carrier();
    const city = deps
      .places()
      ?.cities()
      .find((entry) => entry.id === request.cityId);
    if (!carry || !city) return undefined;
    const spot = { ownerId: request.owner, cityId: city.id, mapKey: city.mapKey };
    const centers = deps.haul.centers("auto", spot);
    if (typeof centers === "string" || centers.length === 0) return undefined;
    // 걷는 길: 출발 자리(도시 창고 = 도시 칸, 건물 창고 = 그 건물 가운데) → 내려놓는 칸
    const source = placeOfLocation(request.from);
    const from =
      source.kind === "building" && source.id !== null
        ? (buildingCenterOf(deps.maps, source.id) ?? city)
        : { x: city.x, y: city.y };
    for (const centerId of centers) {
      const result = carry({
        ownerId: request.owner,
        buildingId: centerId,
        mapKey: city.mapKey,
        cityId: city.id,
        source: request.from,
        deliverTo: request.to,
        from: { x: from.x, y: from.y },
        to: { x: request.x, y: request.y },
        loads: request.stacks,
        atMs: nowMs,
        instantKind: "npc_carry",
        via: centerId,
      });
      // 국고가 모자라면 다른 곳도 같다 — 기다린다
      if (result === "insufficient_funds") return undefined;
      if (typeof result === "string") continue;
      const porter = result.porter;
      return {
        arriveAtMs: result.arriveAtMs,
        done: () =>
          porter === undefined ||
          request.stacks.every(
            (stack) => deps.ledger.balanceOf(request.owner, stack.asset, cargoLocation(porter)) <= 0n,
          ),
      };
    }
    return undefined;
  };
}
