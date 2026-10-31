// 도시 지분 — docs/adr/2026-10-31-faction-society-core.md "지분", 기획 46 §1.3·§5.1·§5.3, D-130·D-338·D-344·D-346·D-349·D-409
// 도시마다 지분(1000주, D-130)을 원장 자산 `share:<도시 ID>`로 둔다(1:1 양도·배당·의결이 같은 원장으로 풀린다, D-409).
// - 발행·소각은 시스템 계정 issue:/sink:(자산마다 하나). 양도는 주체 사이 이체.
// - 독재 도시는 지배 주체가 과반(> 50%)을 늘 지킨다(D-338·D-349): 그 아래로 내려가는 양도는 거절한다.
// - 배당은 지분 비례(내림), 남는 몫은 내는 쪽에 남는다. 지배 주체 자기 몫은 옮기지 않는다.
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";

export type Regime = "dictatorship" | "democracy" | "capitalism";

export const shareAsset = (cityId: number): string => `share:${cityId}`;
const issueCode = (asset: string) => `issue:${asset}`;
const sinkCode = (asset: string) => `sink:${asset}`;

export interface Holding {
  readonly owner: number;
  readonly amount: bigint;
}

/** 그 도시 지분을 가진 주체(주체 ID 차례, 0주는 뺀다) */
export function holdingsOf(book: LedgerBook, cityId: number): Holding[] {
  const asset = shareAsset(cityId);
  const out: Holding[] = [];
  for (const account of book.accounts())
    if (
      account.ownerId !== null &&
      account.asset === asset &&
      account.location === null &&
      account.balance > 0n
    )
      out.push({ owner: account.ownerId, amount: account.balance });
  return out.toSorted((a, b) => a.owner - b.owner);
}

export function totalShares(book: LedgerBook, cityId: number): bigint {
  return holdingsOf(book, cityId).reduce((sum, h) => sum + h.amount, 0n);
}

/** 새 지분을 나눠 준다(한 거래) */
export function issueShares(
  book: LedgerBook,
  cityId: number,
  holders: readonly Holding[],
  atMs: number,
): void {
  const asset = shareAsset(cityId);
  const entries: LedgerEntry[] = [];
  let total = 0n;
  for (const holder of holders) {
    if (holder.amount <= 0n) continue;
    entries.push({ account: book.ownerAccount(holder.owner, asset), amount: holder.amount });
    total += holder.amount;
  }
  if (total === 0n) return;
  entries.push({ account: book.systemAccount(issueCode(asset), asset), amount: -total });
  book.post({ kind: "issue", atMs, entries });
}

/** 상장폐지(D-346): 모든 지분을 소각한다(한 거래). 소각한 주 수 */
export function burnShares(book: LedgerBook, cityId: number, atMs: number): bigint {
  const asset = shareAsset(cityId);
  const holders = holdingsOf(book, cityId);
  const total = holders.reduce((sum, h) => sum + h.amount, 0n);
  if (total === 0n) return 0n;
  book.post({
    kind: "burn",
    atMs,
    entries: [
      ...holders.map((h) => ({ account: book.ownerAccount(h.owner, asset), amount: -h.amount })),
      { account: book.systemAccount(sinkCode(asset), asset), amount: total },
    ],
  });
  return total;
}

/** 독재 도시의 지배 주체가 과반을 가졌나(> 50%, D-338). 지분이 없으면(상장폐지) 참 */
export function rulerHasMajority(holdings: readonly Holding[], ruler: number): boolean {
  const total = holdings.reduce((sum, h) => sum + h.amount, 0n);
  if (total === 0n) return true;
  const own = holdings.find((h) => h.owner === ruler)?.amount ?? 0n;
  return own * 2n > total;
}

export type TransferResult = "ok" | "insufficient" | "dictatorship_majority";

/** 1:1 양도(D-409). 독재 도시에서 지배 주체 과반이 깨지면 거절(D-349) */
export function transferShares(
  book: LedgerBook,
  city: { readonly id: number; readonly regime: Regime; readonly ruler: number },
  from: number,
  to: number,
  amount: bigint,
  atMs: number,
): TransferResult {
  const asset = shareAsset(city.id);
  if (amount <= 0n || book.balanceOf(from, asset) < amount) return "insufficient";
  if (city.regime === "dictatorship" && from !== to) {
    const after = holdingsOf(book, city.id).map((h) =>
      h.owner === from
        ? { ...h, amount: h.amount - amount }
        : h.owner === to
          ? { ...h, amount: h.amount + amount }
          : h,
    );
    if (!after.some((h) => h.owner === to)) after.push({ owner: to, amount });
    if (!rulerHasMajority(after, city.ruler)) return "dictatorship_majority";
  }
  book.post({
    kind: "transfer",
    atMs,
    entries: [
      { account: book.ownerAccount(from, asset), amount: -amount },
      { account: book.ownerAccount(to, asset), amount },
    ],
  });
  return "ok";
}

/**
 * 배당(D-130·D-304): total(화폐 asset)을 지분 비례로 나눈다(내림). payer 자기 몫은 옮기지 않는다. 한 거래. 옮긴 합
 */
export function payDividends(
  book: LedgerBook,
  cityId: number,
  asset: string,
  payer: number,
  total: bigint,
  atMs: number,
): bigint {
  const holdings = holdingsOf(book, cityId);
  const shares = holdings.reduce((sum, h) => sum + h.amount, 0n);
  if (shares === 0n || total <= 0n || book.balanceOf(payer, asset) < total) return 0n;
  const entries: LedgerEntry[] = [];
  let paid = 0n;
  for (const h of holdings) {
    if (h.owner === payer) continue;
    const part = (total * h.amount) / shares;
    if (part <= 0n) continue;
    entries.push({ account: book.ownerAccount(h.owner, asset), amount: part });
    paid += part;
  }
  if (paid === 0n) return 0n;
  entries.push({ account: book.ownerAccount(payer, asset), amount: -paid });
  book.post({ kind: "dividend", atMs, entries });
  return paid;
}

/** 지분 비례 배정(가장 큰 나머지, 같으면 주체 ID 작은 쪽): 복원 모금(D-339) 등 */
export function allocateShares(contributions: readonly Holding[], total: bigint): Holding[] {
  const sum = contributions.reduce((acc, c) => acc + c.amount, 0n);
  if (sum <= 0n) return [];
  const base = contributions.map((c) => ({
    owner: c.owner,
    amount: (total * c.amount) / sum,
    rest: (total * c.amount) % sum,
  }));
  let left = total - base.reduce((acc, b) => acc + b.amount, 0n);
  const order = base.toSorted((a, b) => (b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.owner - b.owner));
  for (const entry of order) {
    if (left <= 0n) break;
    entry.amount += 1n;
    left -= 1n;
  }
  return base
    .filter((b) => b.amount > 0n)
    .map((b) => ({ owner: b.owner, amount: b.amount }))
    .toSorted((a, b) => a.owner - b.owner);
}
