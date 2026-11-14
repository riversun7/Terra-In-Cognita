// 건물 재료(쌓이는 물자) — 주인 원장 계정 item:<아이템 ID>에서 빼고 넣는다(docs/adr/2026-11-07-buildings-runtime.md)
// - 원자재·가공품은 보유 물건 표가 아니라 원장 위치 계정이다(경제 ADR 3절, 보유 물건 ADR 1절 not_holdable). 수량은 레시피와 같은 묶음 단위.
// - 어느 자리에서 꺼내나(D-516 361, "바뀜 (창고·직무)"): 부르는 쪽이 넘긴 자리 차례(scope)만 본다 — 건물 짓기·레벨업·수리·장비 수리는
//   places.ts materialScope(건물이 선 도시 창고 → 그 도시의 내 창고 시설 → 그 2차맵 내 유닛 화물), 1차맵 영토 비콘은 beaconMaterialScope
//   (그 세력에서 비콘 칸과 가장 가까운 도시 창고 → 그 도시의 내 창고 시설, 질문 410 ①). "anywhere"는 모든 자리(위치 없음 → 위치 작은
//   차례 → 화물)로, 화면의 모든 자리 합(옛 materials 칸)만 쓴다.
// - 쓴 재료는 시스템 계정 sink:item:<ID>로 간다(시뮬 생산 소비와 같은 계정 이름) → 자산마다 합 0(불변 조건 I1).
// - 개발 시험 재료는 source:item:<ID>에서 부르는 쪽이 고른 자리(짓는 칸의 도시 창고)로 준다.
import type { Ledger } from "../economy/ledger.ts";
import type { JobMaterial } from "./state.ts";

/** 아이템의 원장 자산 코드(@terra/sim itemAsset과 같다) */
export const goodsAsset = (item: string): string => `item:${item}`;

/** 재료를 꺼내는 자리: 위치 차례 목록, 또는 모든 자리 */
export type GoodsScope = "anywhere" | readonly (number | null)[];

/** 모든 자리의 묶음 차례: 위치 없음 0 → 위치 1 → 화물 2 */
const rank = (location: number | null): number => (location === null ? 0 : location > 0 ? 1 : 2);

/** 모든 자리로 꺼내는 차례: 위치 없음 → 위치(작은 값) → 화물(음수 위치) */
function locationOrder(a: number | null, b: number | null): number {
  return rank(a) - rank(b) || Math.abs(a ?? 0) - Math.abs(b ?? 0);
}

/** 주인의 그 물자 계정(잔고 > 0, 꺼내는 차례) */
function accountsOf(ledger: Ledger, ownerId: number, item: string, scope: GoodsScope) {
  const asset = goodsAsset(item);
  const found: { id: number; location: number | null; balance: bigint }[] = [];
  if (scope === "anywhere") {
    for (const account of ledger.accounts())
      if (account.ownerId === ownerId && account.asset === asset && account.balance > 0n)
        found.push({ id: account.id, location: account.location, balance: account.balance });
    return found.toSorted((a, b) => locationOrder(a.location, b.location) || a.id - b.id);
  }
  for (const location of new Set(scope)) {
    const balance = ledger.balanceOf(ownerId, asset, location);
    if (balance > 0n) found.push({ id: ledger.ownerAccount(ownerId, asset, location), location, balance });
  }
  return found;
}

/** 주인이 그 자리들에 가진 그 물자의 합(scope 없으면 모든 자리) */
export function goodsStock(
  ledger: Ledger,
  ownerId: number,
  item: string,
  scope: GoodsScope = "anywhere",
): bigint {
  let total = 0n;
  for (const account of accountsOf(ledger, ownerId, item, scope)) total += account.balance;
  return total;
}

const needOf = (materials: readonly JobMaterial[]): Map<string, bigint> => {
  const need = new Map<string, bigint>();
  for (const stack of materials)
    if (stack.qty > 0) need.set(stack.item, (need.get(stack.item) ?? 0n) + BigInt(stack.qty));
  return need;
};

/** 모두 있나 */
export function hasGoods(
  ledger: Ledger,
  ownerId: number,
  materials: readonly JobMaterial[],
  scope: GoodsScope,
): boolean {
  for (const [item, qty] of needOf(materials))
    if (goodsStock(ledger, ownerId, item, scope) < qty) return false;
  return true;
}

/** 뺀 재료 한 줄: 어느 자리(원장 위치)에서 얼마를 뺐나(돌려주기 — 배 B3 기획 D-542 1321 나) */
export interface TakenMaterial extends JobMaterial {
  readonly location: number | null;
}

/**
 * 재료를 뺀다(거래 하나). 모자라면 false이고 아무것도 바꾸지 않는다. 같은 동기 처리 안에서 hasGoods와 함께 부르면 사이에 바뀌지 않는다
 */
export function spendGoods(
  ledger: Ledger,
  ownerId: number,
  materials: readonly JobMaterial[],
  atMs: number,
  kind: string,
  scope: GoodsScope,
): boolean {
  return spendGoodsTaken(ledger, ownerId, materials, atMs, kind, scope) !== undefined;
}

/** spendGoods와 같고, 자리마다 뺀 양을 돌려준다(모자라면 undefined, 뺄 것이 없으면 빈 목록) */
export function spendGoodsTaken(
  ledger: Ledger,
  ownerId: number,
  materials: readonly JobMaterial[],
  atMs: number,
  kind: string,
  scope: GoodsScope,
): TakenMaterial[] | undefined {
  const need = needOf(materials);
  if (need.size === 0) return [];
  if (!hasGoods(ledger, ownerId, materials, scope)) return undefined;
  const entries: { account: number; amount: bigint }[] = [];
  const taken: TakenMaterial[] = [];
  for (const [item, qty] of need) {
    let left = qty;
    for (const account of accountsOf(ledger, ownerId, item, scope)) {
      if (left === 0n) break;
      const take = account.balance < left ? account.balance : left;
      entries.push({ account: account.id, amount: -take });
      taken.push({ item, qty: Number(take), location: account.location });
      left -= take;
    }
    entries.push({
      account: ledger.systemAccount(`sink:${goodsAsset(item)}`, goodsAsset(item)),
      amount: qty,
    });
  }
  ledger.post({ kind, atMs, entries });
  return taken;
}

/**
 * 뺀 재료를 돌려준다(거래 하나): sink:item:<ID> → 주인의 그 자리. placeOf가 자리를 바꿀 수 있다(없어진 건물 창고·유닛 화물 → 다른 자리).
 * 돌려준 줄 수(0이면 아무것도 쓰지 않는다)
 */
export function refundGoods(
  ledger: Ledger,
  ownerId: number,
  taken: readonly TakenMaterial[],
  atMs: number,
  kind: string,
  placeOf: (location: number | null) => number | null = (location) => location,
): number {
  const entries: { account: number; amount: bigint }[] = [];
  let rows = 0;
  for (const stack of taken) {
    if (!Number.isSafeInteger(stack.qty) || stack.qty <= 0) continue;
    const asset = goodsAsset(stack.item);
    const qty = BigInt(stack.qty);
    entries.push({ account: ledger.systemAccount(`sink:${asset}`, asset), amount: -qty });
    entries.push({ account: ledger.ownerAccount(ownerId, asset, placeOf(stack.location)), amount: qty });
    rows += 1;
  }
  if (rows > 0) ledger.post({ kind, atMs, entries });
  return rows;
}

/** 개발 시험: 물자를 그 자리(도시 창고·화물 위치, null = 위치 없음)에 준다 */
export function grantGoods(
  ledger: Ledger,
  ownerId: number,
  item: string,
  qty: number,
  atMs: number,
  location: number | null,
): void {
  const asset = goodsAsset(item);
  ledger.post({
    kind: "dev_facility_grant",
    atMs,
    entries: [
      { account: ledger.systemAccount(`source:${asset}`, asset), amount: -BigInt(qty) },
      { account: ledger.ownerAccount(ownerId, asset, location), amount: BigInt(qty) },
    ],
  });
}
