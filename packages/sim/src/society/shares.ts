// 도시 지분 — docs/adr/2026-10-31-faction-society-core.md "지분", 기획 46 §1.3·§5.1·§5.3, D-130·D-338·D-344·D-346·D-349·D-409
// 도시마다 지분(1000주, D-130)을 원장 자산 `share_<도시 ID>`로 둔다(1:1 양도·배당·의결이 같은 원장으로 풀린다, D-409).
// - 발행·소각은 시스템 계정 issue:/sink:(자산마다 하나). 양도는 주체 사이 이체.
// - 독재 도시는 지배 주체가 과반(> 50%)을 늘 지킨다(D-338·D-349): 그 아래로 내려가는 양도는 거절한다.
// - 배당(도시 세금 정산의 남은 이익)은 dividends.ts가 지분 비례로 나눈다(D-304·D-338).
// - 가문 지분 계정(서버만 — 기획 D-338 "독재 나라 도시의 주식 1000주 = 지배 가문 계정 소유", 줄기 governance-2): 가문은 소유 주체가 아니라(NPC 가문은
//   세력 행이 없다) 원장 시스템 계정 shares:house:<가문 꼬리><share_도시>에 둔다. 가문 꼬리 = "<플레이어 가문 세력 행>:" | "npc:<NPC 가문 ID>:"(가문 돈 금고
//   vault:house:<가문 꼬리><자산>과 같은 꼬리 — 배당은 그 금고로). 시뮬은 가문이 없어 이 계정을 만들지 않는다(시뮬 결과 그대로). 지분 합·소각·배당·점령 몰수는
//   주체 계정과 가문 계정을 함께 센다(houseHoldingsOf). 주체끼리 양도(transferShares)·독립 투표는 주체 계정만 본다.
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";

export type Regime = "dictatorship" | "democracy" | "capitalism";

/** 서버 원장 자산 형식(^[a-z][a-z0-9_]{1,47}$)을 따른다 */
export const shareAsset = (cityId: number): string => `share_${cityId}`;
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

/** 가문 지분 계정 앞머리(위 머리 주석) */
export const HOUSE_SHARE_PREFIX = "shares:house:";
/** 가문 돈 금고 앞머리(서버 factionIdentity/houseVault.ts HOUSE_VAULT_PREFIX와 같다) */
export const HOUSE_MONEY_PREFIX = "vault:house:";

/** 가문 지분 계정 코드(가문 꼬리 = "<가문 행>:" | "npc:<NPC 가문 ID>:") */
export const houseShareCode = (house: string, cityId: number): string =>
  `${HOUSE_SHARE_PREFIX}${house}${shareAsset(cityId)}`;
/** 가문 돈 금고 코드(배당이 가는 곳) */
export const houseMoneyCode = (house: string, asset: string): string =>
  `${HOUSE_MONEY_PREFIX}${house}${asset}`;

/** 가문이 가진 도시 지분 한 줄 */
export interface HouseHolding {
  /** 가문 꼬리("<가문 행>:" | "npc:<NPC 가문 ID>:") */
  readonly house: string;
  /** 원장 계정 ID(시스템 계정) */
  readonly account: number;
  readonly amount: bigint;
}

/** 그 도시 지분을 가진 가문 계정(코드 차례, 0주는 뺀다). 시뮬은 늘 빈 목록 */
export function houseHoldingsOf(book: LedgerBook, cityId: number): HouseHolding[] {
  const asset = shareAsset(cityId);
  const out: HouseHolding[] = [];
  for (const account of book.accounts()) {
    const code = account.systemCode;
    if (
      code === null ||
      account.asset !== asset ||
      account.balance <= 0n ||
      !code.startsWith(HOUSE_SHARE_PREFIX) ||
      !code.endsWith(asset)
    )
      continue;
    const house = code.slice(HOUSE_SHARE_PREFIX.length, code.length - asset.length);
    if (house.endsWith(":")) out.push({ house, account: account.id, amount: account.balance });
  }
  return out.toSorted((a, b) => (a.house < b.house ? -1 : a.house > b.house ? 1 : 0));
}

/** 주체 계정 → 가문 지분 계정으로 옮긴다(한 거래, 옮긴 주 수). 모자라면 있는 만큼 */
export function moveSharesToHouse(
  book: LedgerBook,
  cityId: number,
  from: number,
  house: string,
  amount: bigint,
  atMs: number,
  kind = "share_to_house",
): bigint {
  const asset = shareAsset(cityId);
  const have = book.balanceOf(from, asset);
  const moved = amount < have ? amount : have;
  if (moved <= 0n) return 0n;
  book.post({
    kind,
    atMs,
    entries: [
      { account: book.ownerAccount(from, asset), amount: -moved },
      { account: book.systemAccount(houseShareCode(house, cityId), asset), amount: moved },
    ],
  });
  return moved;
}

export function totalShares(book: LedgerBook, cityId: number): bigint {
  return (
    holdingsOf(book, cityId).reduce((sum, h) => sum + h.amount, 0n) +
    houseHoldingsOf(book, cityId).reduce((sum, h) => sum + h.amount, 0n)
  );
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

/** 상장폐지(D-346): 모든 지분을 소각한다(한 거래 — 가문 지분 계정도). 소각한 주 수 */
export function burnShares(book: LedgerBook, cityId: number, atMs: number): bigint {
  const asset = shareAsset(cityId);
  const holders = holdingsOf(book, cityId);
  const houses = houseHoldingsOf(book, cityId);
  const total =
    holders.reduce((sum, h) => sum + h.amount, 0n) + houses.reduce((sum, h) => sum + h.amount, 0n);
  if (total === 0n) return 0n;
  book.post({
    kind: "burn",
    atMs,
    entries: [
      ...holders.map((h) => ({ account: book.ownerAccount(h.owner, asset), amount: -h.amount })),
      ...houses.map((h) => ({ account: h.account, amount: -h.amount })),
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
