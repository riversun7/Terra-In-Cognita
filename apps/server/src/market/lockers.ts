// 거래소 개인 창고(기획 D-571 1943 "거래소에서 산 물건은 거래소 건물 창고 — 유닛마다 작은 한도의 개인 창고, 비용 내면 확장", D-117 대체) —
// docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)"·"바뀜 (2081·2083·2084·2086)". 설정 칸 exchange_locker_*(사업장 계수표 business.exchangeLocker*).
// - 물건 자리는 예전 그대로다: 원장 계정(주인, 물건, 그 도시 물자 거래소 건물 위치). 물건은 주인마다 한 자리에 모여 있다.
// - 바뀜 (질문 2081, 줄기 exchange-3): 창고는 유닛(사이보그 본체·휴먼·사이보그 유닛)마다 하나다. 주인이 쓸 수 있는 크기 = 그 주인 유닛마다(기본
//   exchange_locker_g + 그 유닛 넓힌 칸 × exchange_locker_step_g)의 합(@terra/shared/exchange unitLockersG). 넓힌 칸 수는 exchange_unit_lockers 줄
//   (도시 × 유닛, 건물이 바뀌어도 남는다). 유닛이 사라지거나 주인이 바뀌면 그 창고 크기도 그 주인 몫에서 빠진다(든 물건은 그대로 — 넘치면 새 사기·반입만 막힌다).
//   유닛 = 2차맵에 있는 그 주인 유닛(배에 탄 유닛 포함) [임시].
//   바뀜(misc-574, 기획 대조 — D-571 1943 "유닛마다 작은한도 창고", D-148 "누구나 어디서든 주문"): 위치와 상관없이 주인의 모든 유닛을 센다 — 띄운 2차맵의
//   유닛에 더해 좌표 유닛(띄우지 않은 2차맵에 선 유닛·1차맵을 걷는 좌표 이동 중 유닛, travel coordinateUnits). 2차맵에 유닛이 없다고 크기가 0이 되지 않는다.
//   물건은 지금처럼 주인 단위로 한데 모인다(질문 2201 가).
// - 쓰는 무게 = 그 건물 창고의 내 물건 + 그 도시에 걸어 둔 내 팔 주문 남은 양(에스크로) + 걸어 둔 내 사기 주문 남은 양(체결되면 들어올 물건).
//   새 사기 주문과 반입(운반꾼 떠날 때)만 막는다. 돌려받기·체결은 막지 않는다(자리를 미리 셌다). 크기를 줄여 넘친 창고도 든 물건은 그대로다.
// - 넓히기 값은 그 도시 화폐로 내고 그 거래소 건물 금고로 간다(사업장 장부 수입 exchange_locker, 소득세 포함 — D-548).
// 정수 연산만 쓴다.
import { type LockerUnit, lockerCapacityG, unitLockersG } from "@terra/shared/exchange";
import { buildingLocation } from "@terra/shared/goodsPlaces";
import type { BusinessCoefficients, LedgerBook } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import type { MarketRegistry } from "./books.ts";

/** 넓힌 칸 줄 하나(exchange_unit_lockers) */
export interface LockerRow {
  readonly cityId: number;
  readonly unitId: number;
  readonly steps: number;
  readonly updatedAtMs: number;
}

export interface Lockers {
  /** 그 도시에서 그 유닛 창고를 넓힌 칸 수(없으면 0) */
  steps(cityId: number, unitId: number): number;
  /** 넓힌 칸 수를 바꾼다(쓰기 대기열 — 넓히기 값 거래와 같은 묶음) */
  setSteps(cityId: number, unitId: number, steps: number, atMs: number): void;
}

export async function loadLockers(pool: QueryPool): Promise<LockerRow[]> {
  const result = await pool.query(
    `select city_id, unit_id, steps, updated_at_ms from exchange_unit_lockers order by city_id, unit_id`,
  );
  return result.rows.map((row) => ({
    cityId: Number(row.city_id),
    unitId: Number(row.unit_id),
    steps: Math.max(0, Number(row.steps)),
    updatedAtMs: Number(row.updated_at_ms),
  }));
}

const keyOf = (cityId: number, unitId: number): string => `${cityId}|${unitId}`;

export function createLockers(loaded: readonly LockerRow[], writer: WorldWriter | undefined): Lockers {
  const steps = new Map(loaded.map((row) => [keyOf(row.cityId, row.unitId), row.steps]));
  return {
    steps: (cityId, unitId) => steps.get(keyOf(cityId, unitId)) ?? 0,
    setSteps(cityId, unitId, next, atMs) {
      const value = Math.max(0, Math.trunc(next));
      steps.set(keyOf(cityId, unitId), value);
      writer?.upsert("exchangeUnitLockers", {
        city_id: cityId,
        unit_id: unitId,
        steps: value,
        updated_at_ms: atMs,
      });
    },
  };
}

/** 개인 창고를 받는 유닛 종류(사이보그 본체·휴먼·사이보그 유닛 — 거래 직무와 같다) */
export const LOCKER_UNIT_KINDS: ReadonlySet<number> = new Set([
  UNIT_KIND_CYBORG,
  UNIT_KIND_HUMAN,
  UNIT_KIND_CYBORG_UNIT,
]);

/** 띄운 2차맵에서 쓰는 몫(SecondMap이 맞는다) */
export interface LockerMap {
  forEachUnit(
    visit: (unit: { readonly id: number; readonly ownerId: number; readonly kind: number }) => void,
  ): void;
}

/** 띄우지 않은 곳의 유닛(좌표 유닛 — travel 서비스 coordinateUnits가 맞는다) */
export interface LockerCoords {
  coordinateUnits(
    ownerIds: ReadonlySet<number> | null,
  ): readonly { readonly unitId: number; readonly ownerId: number; readonly kind: number }[];
}

/**
 * 그 주인의 개인 창고 유닛(띄운 2차맵 + 좌표 유닛 — 어디에 있든, 사이보그 본체 먼저·유닛 ID 차례). steps = 그 도시에서 넓힌 칸. coords가 없으면
 * 띄운 2차맵만(시험·옛 길)
 */
export function lockerUnitsOf(
  maps: ReadonlyMap<number, LockerMap>,
  lockers: Pick<Lockers, "steps"> | undefined,
  ownerId: number,
  cityId: number,
  coords?: LockerCoords,
): LockerUnit[] {
  const out: LockerUnit[] = [];
  const seen = new Set<number>();
  const add = (unitId: number, kind: number, owner: number): void => {
    if (owner !== ownerId || !LOCKER_UNIT_KINDS.has(kind) || seen.has(unitId)) return;
    seen.add(unitId);
    out.push({ unitId, cyborg: kind === UNIT_KIND_CYBORG, steps: lockers?.steps(cityId, unitId) ?? 0 });
  };
  for (const map of maps.values()) map.forEachUnit((unit) => add(unit.id, unit.kind, unit.ownerId));
  for (const unit of coords?.coordinateUnits(new Set([ownerId])) ?? [])
    add(unit.unitId, unit.kind, unit.ownerId);
  return out.toSorted((a, b) => Number(b.cyborg) - Number(a.cyborg) || a.unitId - b.unitId);
}

/** 주인이 쓸 수 있는 개인 창고 크기(g) = 유닛 창고 크기의 합(질문 2081) */
export function ownerLockerG(rules: BusinessCoefficients, units: readonly LockerUnit[]): bigint {
  return unitLockersG(
    rules.exchangeLockerG,
    rules.exchangeLockerStepG,
    units.map((unit) => unit.steps),
  );
}

/** 유닛 하나의 개인 창고 크기(g) */
export function lockerCapacityOf(rules: BusinessCoefficients, steps: number): bigint {
  return lockerCapacityG(rules.exchangeLockerG, rules.exchangeLockerStepG, steps);
}

/**
 * 개인 창고에 지금 쓰는 무게(g): 그 거래소 건물 창고의 내 물자 + 그 도시 내 걸린 주문(팔기 = 에스크로 물건, 사기 = 들어올 물건) 남은 양.
 * weightOf = 자산 한 기본 단위 무게(g, 물자가 아니면 0)
 */
export function lockerUsedG(input: {
  readonly ledger: LedgerBook;
  readonly registry: Pick<MarketRegistry, "openOf">;
  readonly weightOf: (asset: string) => bigint;
  readonly ownerId: number;
  readonly cityId: number;
  readonly exchangeBuildingId: number;
}): bigint {
  const here = buildingLocation(input.exchangeBuildingId);
  let used = 0n;
  for (const account of input.ledger.accounts())
    if (account.ownerId === input.ownerId && account.location === here && account.balance > 0n)
      used += account.balance * input.weightOf(account.asset);
  for (const { book, order } of input.registry.openOf(input.ownerId)) {
    if (book.cityId !== input.cityId) continue;
    const lot = book.market.config.lotSize ?? 1n;
    used += order.remaining * lot * input.weightOf(book.asset);
  }
  return used;
}
