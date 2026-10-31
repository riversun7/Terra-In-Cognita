// 유지비 = 생필품 — docs/adr/2026-10-31-economy-core.md 3절, 기획 D-150(유닛마다 필요한 생필품의 합)·질문 112 기본안(D-381:
// 실제 1시간마다, 못 내면 만족도만 떨어진다)
// - 정시 경계마다, 주기(시간)가 그 경계를 나누는 생필품만 낸다. 유닛 하나 몫 = 생필품마다 perUnit.
// - 나눠 주기(기술 기본안): 가진 만큼 유닛 몫을 채우고(⌊재고 ÷ perUnit⌋명), 못 받은 유닛 몫을 모자람으로 센다.
//   만족도(R4)가 생기면 모자람 → 만족도 하락으로 잇는다. 지금은 세기만 한다.
// - 쓴 생필품은 소멸 계정으로 간다(일반 자원은 쓰면 사라진다, D-112). 한 경계 = 장부 거래 하나.
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import { HOUR_MS } from "./production.ts";

export interface NecessitySpec {
  readonly asset: string;
  readonly perUnit: bigint;
  readonly periodHours: number;
}

export interface UpkeepPaid {
  /** 생필품마다 못 받은 유닛 수의 합 */
  readonly shortUnits: number;
  /** 생필품마다 받은 유닛 수의 합 */
  readonly servedUnits: number;
}

/** 경계 시각 boundaryMs(정시)에 낼 생필품 */
export function dueNecessities(specs: readonly NecessitySpec[], boundaryMs: number): NecessitySpec[] {
  if (boundaryMs % HOUR_MS !== 0) return [];
  const hour = boundaryMs / HOUR_MS;
  return specs.filter((spec) => hour % spec.periodHours === 0);
}

/** 한 곳(도시 창고)의 유닛 units명이 경계 하나의 생필품을 낸다 */
export function payNecessities(
  book: LedgerBook,
  owner: number,
  location: number,
  units: number,
  due: readonly NecessitySpec[],
  consume: (asset: string) => number,
  atMs: number,
): UpkeepPaid {
  let shortUnits = 0;
  let servedUnits = 0;
  if (units <= 0) return { shortUnits, servedUnits };
  const entries: LedgerEntry[] = [];
  for (const spec of due) {
    const have = book.balanceOf(owner, spec.asset, location);
    const fed = BigInt(units) < have / spec.perUnit ? BigInt(units) : have / spec.perUnit;
    const served = Number(fed);
    servedUnits += served;
    shortUnits += units - served;
    if (fed > 0n) {
      entries.push({ account: book.ownerAccount(owner, spec.asset, location), amount: -fed * spec.perUnit });
      entries.push({ account: consume(spec.asset), amount: fed * spec.perUnit });
    }
  }
  if (entries.length > 0) book.post({ kind: "upkeep", atMs, entries });
  return { shortUnits, servedUnits };
}
