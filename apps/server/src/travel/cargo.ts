// 조우 판단이 보는 유닛 짐(원장 유닛 화물 위치 −유닛 ID, world/battleResults.ts cargoLocation) — 약탈 거리(clashDecide.ts)·조우 뒤 짐 정리(afterEncounter.ts).
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import { assetWeightG } from "../facilities/places.ts";
import { cargoLocation } from "../world/battleResults.ts";

/** 짐(잔고 > 0인 화물 계정)이 있는 유닛 ID. 원장 계정을 한 번 훑는다 */
export function cargoCarriers(ledger: Pick<Ledger, "accounts">, unitIds: Iterable<number>): Set<number> {
  const wanted = new Map<number, number>();
  for (const unitId of unitIds) wanted.set(cargoLocation(unitId), unitId);
  const out = new Set<number>();
  if (wanted.size === 0) return out;
  for (const account of ledger.accounts()) {
    if (account.location === null || account.balance <= 0n) continue;
    const unitId = wanted.get(account.location);
    if (unitId !== undefined) out.add(unitId);
  }
  return out;
}

/** 그 주인의 그 유닛 화물 무게(g, 아이템만) */
export function cargoGrams(
  ledger: Pick<Ledger, "accounts">,
  catalog: FacilityCatalog,
  ownerId: number,
  unitId: number,
): bigint {
  const location = cargoLocation(unitId);
  let total = 0n;
  for (const account of ledger.accounts())
    if (account.ownerId === ownerId && account.location === location && account.balance > 0n)
      total += account.balance * assetWeightG(catalog, account.asset);
  return total;
}
