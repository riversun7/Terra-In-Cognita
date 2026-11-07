// 건물 재료(쌓이는 물자) — 주인 원장 계정 item:<아이템 ID>에서 빼고 넣는다(docs/adr/2026-11-07-buildings-runtime.md)
// - 원자재·가공품은 보유 물건 표가 아니라 원장 위치 계정이다(경제 ADR 3절, 보유 물건 ADR 1절 not_holdable). 수량은 레시피와 같은 묶음 단위.
// - 어느 창고에서 꺼내나: 서버에 아직 창고·필지가 없어 그 주인의 모든 자리에서 꺼낸다(위치 없음 → 창고 위치 작은 차례 → 화물). [임시]
//   (확인 대기: 건물 자리와 가까운 창고만 쓰는지, D-117 "물건마다 자리가 있다")
// - 쓴 재료는 시스템 계정 sink:item:<ID>로 간다(시뮬 생산 소비와 같은 계정 이름) → 자산마다 합 0(불변 조건 I1).
// - 개발 시험 재료는 source:item:<ID>에서 위치 없는 계정으로 준다.
import type { Ledger } from "../economy/ledger.ts";
import type { JobMaterial } from "./state.ts";

/** 아이템의 원장 자산 코드(@terra/sim itemAsset과 같다) */
export const goodsAsset = (item: string): string => `item:${item}`;

/** 꺼내는 차례: 위치 없음 → 창고(작은 위치) → 화물(음수 위치) */
function locationOrder(a: number | null, b: number | null): number {
  const rank = (location: number | null): number => (location === null ? 0 : location > 0 ? 1 : 2);
  return rank(a) - rank(b) || Math.abs(a ?? 0) - Math.abs(b ?? 0);
}

/** 주인의 그 물자 계정(잔고 > 0, 꺼내는 차례) */
function accountsOf(ledger: Ledger, ownerId: number, item: string) {
  const asset = goodsAsset(item);
  const found: { id: number; location: number | null; balance: bigint }[] = [];
  for (const account of ledger.accounts())
    if (account.ownerId === ownerId && account.asset === asset && account.balance > 0n)
      found.push({ id: account.id, location: account.location, balance: account.balance });
  return found.toSorted((a, b) => locationOrder(a.location, b.location) || a.id - b.id);
}

/** 주인이 가진 그 물자의 합(모든 자리) */
export function goodsStock(ledger: Ledger, ownerId: number, item: string): bigint {
  let total = 0n;
  for (const account of accountsOf(ledger, ownerId, item)) total += account.balance;
  return total;
}

/** 모두 있나 */
export function hasGoods(ledger: Ledger, ownerId: number, materials: readonly JobMaterial[]): boolean {
  const need = new Map<string, bigint>();
  for (const stack of materials) need.set(stack.item, (need.get(stack.item) ?? 0n) + BigInt(stack.qty));
  for (const [item, qty] of need) if (goodsStock(ledger, ownerId, item) < qty) return false;
  return true;
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
): boolean {
  const lines = materials.filter((stack) => stack.qty > 0);
  if (lines.length === 0) return true;
  if (!hasGoods(ledger, ownerId, lines)) return false;
  const need = new Map<string, bigint>();
  for (const stack of lines) need.set(stack.item, (need.get(stack.item) ?? 0n) + BigInt(stack.qty));
  const entries: { account: number; amount: bigint }[] = [];
  for (const [item, qty] of need) {
    let left = qty;
    for (const account of accountsOf(ledger, ownerId, item)) {
      if (left === 0n) break;
      const take = account.balance < left ? account.balance : left;
      entries.push({ account: account.id, amount: -take });
      left -= take;
    }
    entries.push({ account: ledger.systemAccount(`sink:${goodsAsset(item)}`, goodsAsset(item)), amount: qty });
  }
  ledger.post({ kind, atMs, entries });
  return true;
}

/** 개발 시험: 물자를 준다(위치 없는 계정) */
export function grantGoods(ledger: Ledger, ownerId: number, item: string, qty: number, atMs: number): void {
  const asset = goodsAsset(item);
  ledger.post({
    kind: "dev_grant_goods",
    atMs,
    entries: [
      { account: ledger.systemAccount(`source:${asset}`, asset), amount: -BigInt(qty) },
      { account: ledger.ownerAccount(ownerId, asset), amount: BigInt(qty) },
    ],
  });
}
