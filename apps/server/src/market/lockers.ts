// 거래소 개인 창고(기획 D-571 1943 "거래소에서 산 물건은 거래소 건물 창고 — 유닛마다 작은 한도의 개인 창고, 비용 내면 확장", D-117 대체) —
// docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)". 설정 칸 exchange_locker_*(사업장 계수표 business.exchangeLocker*).
// - 물건 자리는 예전 그대로다: 원장 계정(주인, 물건, 그 도시 물자 거래소 건물 위치). 원장 계정이 이미 주인마다라 "건물 창고 하나"가 곧 주인마다의
//   개인 창고다(지금 세계 물건은 옮기지 않고 그대로 읽힌다 — 리셋 없음).
// - 크기 = 기본(exchange_locker_g) + 넓힌 칸 수 × 한 칸(exchange_locker_step_g). 넓힌 칸 수는 exchange_lockers 줄(도시 × 주인, 건물이 바뀌어도 남는다).
// - 쓰는 무게 = 그 건물 창고의 내 물건 + 그 도시에 걸어 둔 내 팔 주문 남은 양(에스크로) + 걸어 둔 내 사기 주문 남은 양(체결되면 들어올 물건).
//   새 사기 주문과 반입(운반꾼 떠날 때)만 막는다. 돌려받기·체결은 막지 않는다(자리를 미리 셌다). 크기를 줄여 넘친 창고도 든 물건은 그대로다.
// - 넓히기 값은 그 도시 화폐로 내고 그 거래소 건물 금고로 간다(사업장 장부 수입 exchange_locker, 소득세 포함 — D-548).
// 정수 연산만 쓴다.
import { lockerCapacityG } from "@terra/shared/exchange";
import { buildingLocation } from "@terra/shared/goodsPlaces";
import type { BusinessCoefficients, LedgerBook } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { MarketRegistry } from "./books.ts";

/** 넓힌 칸 줄 하나(exchange_lockers) */
export interface LockerRow {
  readonly cityId: number;
  readonly ownerId: number;
  readonly steps: number;
  readonly updatedAtMs: number;
}

export interface Lockers {
  /** 그 도시에서 그 주인이 넓힌 칸 수(없으면 0) */
  steps(cityId: number, ownerId: number): number;
  /** 넓힌 칸 수를 바꾼다(쓰기 대기열 — 넓히기 값 거래와 같은 묶음) */
  setSteps(cityId: number, ownerId: number, steps: number, atMs: number): void;
}

export async function loadLockers(pool: QueryPool): Promise<LockerRow[]> {
  const result = await pool.query(
    `select city_id, owner_id, steps, updated_at_ms from exchange_lockers order by city_id, owner_id`,
  );
  return result.rows.map((row) => ({
    cityId: Number(row.city_id),
    ownerId: Number(row.owner_id),
    steps: Math.max(0, Number(row.steps)),
    updatedAtMs: Number(row.updated_at_ms),
  }));
}

const keyOf = (cityId: number, ownerId: number): string => `${cityId}|${ownerId}`;

export function createLockers(loaded: readonly LockerRow[], writer: WorldWriter | undefined): Lockers {
  const steps = new Map(loaded.map((row) => [keyOf(row.cityId, row.ownerId), row.steps]));
  return {
    steps: (cityId, ownerId) => steps.get(keyOf(cityId, ownerId)) ?? 0,
    setSteps(cityId, ownerId, next, atMs) {
      const value = Math.max(0, Math.trunc(next));
      steps.set(keyOf(cityId, ownerId), value);
      writer?.upsert("exchangeLockers", {
        city_id: cityId,
        owner_id: ownerId,
        steps: value,
        updated_at_ms: atMs,
      });
    },
  };
}

/** 개인 창고 크기(g) */
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
