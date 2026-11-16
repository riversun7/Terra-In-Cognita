// 거래창의 거래소 건물 칸 자료(기획 D-571 — 개인 창고 1943·거래 직무 1944, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)"·
// "바뀜 (2081·2083·2084·2086)"). market/appSource.ts가 세계 부품(원장·노동·2차맵·보유 물건·사업장 계수표)으로 만들어 views.ts에 넘긴다. 읽기만 한다.
// - 개인 창고(질문 2081): 유닛마다 작은 창고 — 내 유닛 줄(넓힌 칸), 크기 = 유닛 창고 합, 쓰는 무게, 한 칸 값(lockers.ts).
// - 거래 직무(질문 2083): 자리 = 거래소 건물마다 레벨 × 설정 칸(주인의 직무 배치·남의 노동 계약이 함께 쓴다). 나를 위해 일하는 거래 직무 유닛(직무 배치 ·
//   빌린 자리 = 임대형 · 고용 = 임금형, 계약이면 계약 ID — [빼기]는 해지)과 둘 수 있는 내 유닛(그 거래소와 같은 2차맵의 사이보그·휴먼·사이보그 유닛,
//   쉬는 것 — 배치·계약은 labor가 다시 본다), 유닛마다 주문 한도 몫 ⌊(INT + WIS) ÷ 20⌋. 내 거래소면 직무 배치, 남의 거래소면 주인이 낸 시간당 자리 값.
import type { MarketDeskUnit, MarketDeskView, MarketLockerView } from "@terra/shared/economy";
import { stationBonus } from "@terra/shared/exchange";
import type { BusinessCoefficients, LedgerBook } from "@terra/sim";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";
import type { MarketRegistry } from "./books.ts";
import { buildingCenterOf } from "./exchangeBuildings.ts";
import { LOCKER_UNIT_KINDS, type Lockers, lockerUnitsOf, lockerUsedG, ownerLockerG } from "./lockers.ts";

/** 거래 직무 유닛 한 줄(그 일의 몫을 받는 주체로) */
export interface DeskTrader {
  readonly unitId: number;
  /** 주문 한도·운반 몫을 받는 주체(직무 배치·임대형 = 유닛 주인, 임금형 = 고용주) */
  readonly ownerId: number;
  /** 노동 계약 ID(직무 배치는 없다) */
  readonly contractId?: number | undefined;
}

export interface ExchangeDeskSource {
  readonly ledger: LedgerBook;
  readonly registry: () => Pick<MarketRegistry, "openOf"> | undefined;
  readonly lockers: () => Lockers | undefined;
  readonly rules: () => BusinessCoefficients;
  readonly weightOf: (asset: string) => bigint;
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 그 건물의 거래 직무 유닛(노동 workersAt — 직무 배치·노동 계약) */
  readonly tradersAt: (buildingId: number) => readonly DeskTrader[];
  /** 그 건물의 거래 직무 자리 수(레벨 × 설정 칸). 없으면 사업장 계수표 칸 하나 */
  readonly seats?: ((buildingId: number) => number) | undefined;
  /** 그 건물에서 자리를 차지한 일꾼 수(모두). 없으면 tradersAt 수 */
  readonly takenAt?: ((buildingId: number) => number) | undefined;
  /** 주인이 낸 시간당 자리 값(노동 임대료, 없으면 null). 없으면 null */
  readonly rentOf?: ((buildingId: number) => bigint | null) | undefined;
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
    const units = lockerUnitsOf(src.maps, src.lockers(), ownerId, cityId);
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
    let steps = 0;
    for (const unit of units) steps += unit.steps;
    return {
      usedG: String(used),
      capacityG: String(ownerLockerG(rules, units)),
      steps,
      maxSteps: Math.max(0, Math.floor(rules.exchangeLockerMaxSteps)),
      stepG: String(Math.max(0, Math.floor(rules.exchangeLockerStepG))),
      stepPrice: String(Math.max(0, Math.floor(rules.exchangeLockerStepPrice))),
      unitBaseG: String(Math.max(0, Math.floor(rules.exchangeLockerG))),
      units: units.map((unit) => ({ unitId: unit.unitId, cyborg: unit.cyborg, steps: unit.steps })),
    };
  };
}

/** 그 건물 주인(2차맵 건물 주인, 없으면 undefined) */
function ownerOfBuilding(
  maps: ReadonlyMap<number, SecondMap>,
  buildingId: number,
): number | null | undefined {
  for (const map of maps.values()) {
    const owner = map.buildingOwner(buildingId);
    if (owner !== undefined) return owner;
  }
  return undefined;
}

export function deskViewOf(src: ExchangeDeskSource): (ownerId: number, buildingId: number) => MarketDeskView {
  return (ownerId, buildingId) => {
    const unitOf = (unitId: number, kind: number, contractId?: number): MarketDeskUnit => {
      const p = src.primariesOf(unitId);
      return {
        unitId,
        cyborg: kind === UNIT_KIND_CYBORG,
        bonus: stationBonus(p.int, p.wis),
        ...(contractId === undefined ? {} : { contractId }),
      };
    };
    const all = src.tradersAt(buildingId);
    const mine = new Map(
      all.filter((entry) => entry.ownerId === ownerId).map((entry) => [entry.unitId, entry.contractId]),
    );
    const traders: MarketDeskUnit[] = [];
    const candidates: MarketDeskUnit[] = [];
    const center = buildingCenterOf(src.maps, buildingId);
    for (const map of src.maps.values())
      map.forEachUnit((unit) => {
        if (!LOCKER_UNIT_KINDS.has(unit.kind)) return;
        // 나를 위해 일하는 유닛(남의 유닛을 고용했으면 그 유닛도)
        if (mine.has(unit.id)) traders.push(unitOf(unit.id, unit.kind, mine.get(unit.id)));
        else if (
          unit.ownerId === ownerId &&
          map.mapKey === center?.mapKey &&
          unit.aboard === undefined &&
          !src.unitBusy(unit.id)
        )
          candidates.push(unitOf(unit.id, unit.kind));
      });
    const own = ownerOfBuilding(src.maps, buildingId) === ownerId;
    const rent = own ? undefined : (src.rentOf?.(buildingId) ?? null);
    return {
      traders: traders.toSorted(byId),
      candidates: candidates.toSorted(byId),
      slots: src.seats?.(buildingId) ?? Math.max(0, Math.floor(src.rules().exchangeTradeSlots)),
      taken: src.takenAt?.(buildingId) ?? all.length,
      own,
      ...(rent === undefined ? {} : { rent: rent === null ? null : String(rent) }),
    };
  };
}
