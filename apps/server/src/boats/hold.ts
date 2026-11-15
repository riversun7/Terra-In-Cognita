// 배 창고·연료 아이템 — 기획 D-568(배 채집: 캔 것은 배 창고로, 가득 차면 항구 교역소에 팔거나 부두의 자기 창고에 보관)·D-564 1687(연료는 처음부터 아이템만),
// docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-564·D-568)".
// - 배 창고 = 원장 위치 cargoLocation(배 ID)의 배 주인 계정(유닛 화물과 같은 꼴 — 배도 유닛 ID다). 도크에 들어도(유닛 줄이 없어도) 그대로 남는다.
//   무게 상한 = 배 종류 holdKg(없으면 설정 칸 boat_hold_kg). 상한은 채집 줄이 넣을 때만 본다(gather/service.ts).
// - 배 주인이 바뀌면(빼앗기·압류 뒤 넘어감) 창고 물건도 새 주인에게 옮긴다(moveHoldOwner — 짐째 넘어간다).
// - 연료 보급(burnFuelItems): 배 종류 fuelItems 차례로 배 창고 → 그 교역 부두 도시의 내 창고에서 아이템(묶음)을 태워 통을 채운다. 쓴 것은 sink:item:<ID>
//   (건물 재료와 같은 계정). 넘치는 몫은 버린다(마지막 한 개는 통보다 조금 넘게 채울 수 있다 — 통에서 자른다).
// 원장 계정을 모두 훑는 셈(holdStacks)은 명령·판 읽기에서만 쓴다(정시 살피기·채집 한 번마다 부르지 않는다).
import { cargoLocation } from "@terra/shared/goodsPlaces";
import type { FuelItem } from "@terra/shared/naval";
import type { BoatCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { BoatTypeDef, FacilityCatalog } from "../facilities/catalog.ts";
import { goodsAsset } from "../facilities/materials.ts";
import { assetWeightG } from "../facilities/places.ts";

/** 배 창고 무게 상한(g) */
export const holdCapGrams = (
  type: Pick<BoatTypeDef, "holdKg"> | undefined,
  rules: Pick<BoatCoefficients, "holdKg">,
): number => Math.max(1, type?.holdKg ?? rules.holdKg) * 1000;

/** 배 창고에 든 물건(자산·기본 단위, 자산 차례). 원장 계정을 모두 훑는다 */
export function holdStacks(
  ledger: Ledger,
  ownerId: number,
  boatId: number,
): { readonly asset: string; readonly qty: bigint }[] {
  const location = cargoLocation(boatId);
  const out: { asset: string; qty: bigint }[] = [];
  for (const account of ledger.accounts())
    if (account.ownerId === ownerId && account.location === location && account.balance > 0n)
      out.push({ asset: account.asset, qty: account.balance });
  return out.toSorted((a, b) => a.asset.localeCompare(b.asset));
}

/** 배 창고 무게(g) */
export function holdGrams(
  ledger: Ledger,
  catalog: FacilityCatalog | undefined,
  ownerId: number,
  boatId: number,
): bigint {
  if (!catalog) return 0n;
  let total = 0n;
  for (const stack of holdStacks(ledger, ownerId, boatId))
    total += stack.qty * assetWeightG(catalog, stack.asset);
  return total;
}

/** 배 창고 물건을 새 주인에게 옮긴다(같은 위치, 거래 하나). 옮긴 자산 수 */
export function moveHoldOwner(
  ledger: Ledger,
  boatId: number,
  from: number,
  to: number,
  atMs: number,
  kind: string,
): number {
  if (from === to) return 0;
  const location = cargoLocation(boatId);
  const entries: { account: number; amount: bigint }[] = [];
  const stacks = holdStacks(ledger, from, boatId);
  for (const stack of stacks) {
    entries.push({ account: ledger.ownerAccount(from, stack.asset, location), amount: -stack.qty });
    entries.push({ account: ledger.ownerAccount(to, stack.asset, location), amount: stack.qty });
  }
  if (entries.length > 0) ledger.post({ kind, atMs, entries });
  return stacks.length;
}

/**
 * 연료 아이템을 태워 needMilli(천분의 단위)만큼 채운다. 꺼내는 자리 차례 = places(배 창고 → 도시 창고). 거래 하나.
 * 채운 양(천분의 단위, needMilli를 넘지 않는다)과 태운 묶음 수. 태울 것이 없으면 0
 */
export function burnFuelItems(
  ledger: Ledger,
  catalog: Pick<FacilityCatalog, "lotSize">,
  ownerId: number,
  fuels: readonly FuelItem[],
  places: readonly number[],
  needMilli: number,
  atMs: number,
): { readonly milli: number; readonly lots: number } {
  const need = Math.max(0, needMilli);
  let left = need;
  let lots = 0;
  const entries: { account: number; amount: bigint }[] = [];
  for (const fuel of fuels) {
    if (left <= 0) break;
    const asset = goodsAsset(fuel.item);
    const lot = catalog.lotSize.get(asset) ?? 1n;
    const perLot = Math.max(1, fuel.units) * 1000;
    let burned = 0n;
    for (const location of places) {
      if (left <= 0) break;
      const have = ledger.balanceOf(ownerId, asset, location) / lot;
      if (have <= 0n) continue;
      // 넘치더라도 마지막 한 개까지 태운다(올림 — 통에서 자른다)
      const want = BigInt(Math.ceil(left / perLot));
      const take = have < want ? have : want;
      entries.push({ account: ledger.ownerAccount(ownerId, asset, location), amount: -take * lot });
      burned += take * lot;
      lots += Number(take);
      left -= Number(take) * perLot;
    }
    if (burned > 0n) entries.push({ account: ledger.systemAccount(`sink:${asset}`, asset), amount: burned });
  }
  if (entries.length > 0) ledger.post({ kind: "boat_fuel", atMs, entries });
  // 넘친 몫(left < 0)은 버린다 — 채운 양은 need를 넘지 않는다
  return { milli: need - Math.max(0, left), lots };
}

/** 여러 배의 창고 무게(g)를 한 번 훑어 센다(배 ID → 무게, 배 주인 계정만). 판 읽기용 */
export function holdGramsOf(
  ledger: Ledger,
  catalog: FacilityCatalog | undefined,
  owners: ReadonlyMap<number, number>,
): Map<number, bigint> {
  const out = new Map<number, bigint>();
  if (!catalog || owners.size === 0) return out;
  for (const account of ledger.accounts()) {
    if (account.location === null || account.location >= 0 || account.balance <= 0n) continue;
    const boatId = -account.location;
    if (owners.get(boatId) !== account.ownerId) continue;
    out.set(boatId, (out.get(boatId) ?? 0n) + account.balance * assetWeightG(catalog, account.asset));
  }
  return out;
}
