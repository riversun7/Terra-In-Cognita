// 거래창의 거래소 건물 칸 자료(기획 D-571 — 개인 창고 1943·거래 직무 1944, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)").
// market/appSource.ts가 세계 부품(원장·노동·2차맵·보유 물건·사업장 계수표)으로 만들어 views.ts에 넘긴다. 읽기만 한다.
// - 개인 창고: 쓰는 무게·크기·넓힌 칸·한 칸 값(lockers.ts).
// - 거래 직무: 이 거래소의 내 거래 직무 유닛과 둘 수 있는 내 유닛(그 거래소와 같은 2차맵의 사이보그·휴먼·사이보그 유닛, 쉬는 것 — 배치는
//   labor_assign이 다시 본다), 유닛마다 주문 한도 몫 ⌊(INT + WIS) ÷ 20⌋.
import type { MarketDeskUnit, MarketDeskView, MarketLockerView } from "@terra/shared/economy";
import { stationBonus } from "@terra/shared/exchange";
import type { BusinessCoefficients, LedgerBook } from "@terra/sim";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import type { MarketRegistry } from "./books.ts";
import { buildingCenterOf } from "./exchangeBuildings.ts";
import { type Lockers, lockerCapacityOf, lockerUsedG } from "./lockers.ts";

/** 거래 직무를 받을 수 있는 유닛 종류(노동 직무 배치와 같다) */
const DESK_KINDS: ReadonlySet<number> = new Set([UNIT_KIND_CYBORG, UNIT_KIND_HUMAN, UNIT_KIND_CYBORG_UNIT]);

export interface ExchangeDeskSource {
  readonly ledger: LedgerBook;
  readonly registry: () => Pick<MarketRegistry, "openOf"> | undefined;
  readonly lockers: () => Lockers | undefined;
  readonly rules: () => BusinessCoefficients;
  readonly weightOf: (asset: string) => bigint;
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 그 건물의 직무 배치 유닛(노동 workersAt의 assign — 유닛·주인) */
  readonly tradersAt: (
    buildingId: number,
  ) => readonly { readonly unitId: number; readonly ownerId: number }[];
  /** 유닛이 일·작업 중인가(노동 계약·직무 배치·건물 작업·비활성) */
  readonly unitBusy: (unitId: number) => boolean;
  readonly primariesOf: (unitId: number) => { readonly int: number; readonly wis: number };
}

const byId = (a: MarketDeskUnit, b: MarketDeskUnit): number => a.unitId - b.unitId;

export function lockerViewOf(
  src: ExchangeDeskSource,
): (ownerId: number, cityId: number, buildingId: number) => MarketLockerView {
  return (ownerId, cityId, buildingId) => {
    const rules = src.rules();
    const steps = src.lockers()?.steps(cityId, ownerId) ?? 0;
    const registry = src.registry();
    const used = registry
      ? lockerUsedG({
          ledger: src.ledger,
          registry,
          weightOf: src.weightOf,
          ownerId,
          cityId,
          exchangeBuildingId: buildingId,
        })
      : 0n;
    return {
      usedG: String(used),
      capacityG: String(lockerCapacityOf(rules, steps)),
      steps,
      maxSteps: Math.max(0, Math.floor(rules.exchangeLockerMaxSteps)),
      stepG: String(Math.max(0, Math.floor(rules.exchangeLockerStepG))),
      stepPrice: String(Math.max(0, Math.floor(rules.exchangeLockerStepPrice))),
    };
  };
}

export function deskViewOf(src: ExchangeDeskSource): (ownerId: number, buildingId: number) => MarketDeskView {
  return (ownerId, buildingId) => {
    const unitOf = (unitId: number, kind: number): MarketDeskUnit => {
      const p = src.primariesOf(unitId);
      return { unitId, cyborg: kind === UNIT_KIND_CYBORG, bonus: stationBonus(p.int, p.wis) };
    };
    const mine = new Set(
      src
        .tradersAt(buildingId)
        .filter((entry) => entry.ownerId === ownerId)
        .map((entry) => entry.unitId),
    );
    const traders: MarketDeskUnit[] = [];
    const candidates: MarketDeskUnit[] = [];
    const center = buildingCenterOf(src.maps, buildingId);
    for (const map of src.maps.values())
      map.forEachUnit((unit) => {
        if (unit.ownerId !== ownerId || !DESK_KINDS.has(unit.kind)) return;
        if (mine.has(unit.id)) traders.push(unitOf(unit.id, unit.kind));
        else if (map.mapKey === center?.mapKey && unit.aboard === undefined && !src.unitBusy(unit.id))
          candidates.push(unitOf(unit.id, unit.kind));
      });
    return {
      traders: traders.toSorted(byId),
      candidates: candidates.toSorted(byId),
      slots: Math.max(0, Math.floor(src.rules().exchangeTradeSlots)),
    };
  };
}
