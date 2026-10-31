// 원장 감사(메모리 불변 조건) — docs/adr/2026-10-31-s3-server-stage.md 2절 I1·I2·I6을 메모리에서 본다
// 서버는 같은 조건을 DB 질의로 본다(apps/server/src/world/invariants.ts, 문구가 같다). 시뮬레이터는 DB가 없어서
// 장부 고리로 항목을 따로 더해 두고(장부의 잔고 계산과 다른 길) 정한 간격·끝에 견준다. 메모리는 계정당 BigInt 하나 +
// 중복 방지 키 집합이다(항목 자체는 들고 있지 않다).
import type { LedgerAccount, LedgerHooks } from "./ledgerBook.ts";

export const INVARIANT_I1_ASSETS = "I1 assets whose entries do not sum to zero";
export const INVARIANT_I1_TRANSACTIONS = "I1 transactions not balanced per asset";
export const INVARIANT_I2_BALANCE = "I2 accounts whose balance differs from their entries";
export const INVARIANT_I2_NEGATIVE = "I2 owner accounts below zero";
export const INVARIANT_I6_KEYS = "I6 duplicate idempotency keys";
export const INVARIANT_I1_SYSTEM_KIND =
  "I1 system accounts touched by a transaction kind that may not create or destroy";

export interface LedgerAudit {
  /** 장부에 넘길 고리 */
  readonly hooks: LedgerHooks;
  /** 지금까지 본 거래 수 */
  readonly transactions: number;
  /** 계정들(장부의 accounts())을 항목 합과 견준다. 위반 문장 목록(없으면 빈 배열) */
  check(accounts: Iterable<Readonly<LedgerAccount>>): string[];
}

/**
 * initial: 장부가 처음 잔고를 가진 계정(부팅 값)이면 그 잔고를 항목 합의 시작으로 둔다.
 * systemRule: 시스템 계정(발행·소멸·생산원·에스크로 등)을 건드려도 되는 거래 종류인지(있으면 본다). 물건·돈은 정한 사건으로만
 * 생기고 사라진다는 것을 거래마다 본다.
 */
export function createLedgerAudit(
  initial: Iterable<Readonly<LedgerAccount>> = [],
  systemRule?: (code: string, kind: string) => boolean,
): LedgerAudit {
  const sums = new Map<number, bigint>();
  const assetOf = new Map<number, string>();
  for (const account of initial) {
    sums.set(account.id, account.balance);
    assetOf.set(account.id, account.asset);
  }
  const keys = new Set<string>();
  let duplicateKeys = 0;
  let unbalancedTx = 0;
  let badKinds = 0;
  let transactions = 0;

  const hooks: LedgerHooks = {
    accountCreated(account) {
      assetOf.set(account.id, account.asset);
    },
    posted(_txId, tx, changed) {
      transactions += 1;
      for (const account of changed) assetOf.set(account.id, account.asset);
      if (
        systemRule &&
        changed.some((account) => account.systemCode !== null && !systemRule(account.systemCode, tx.kind))
      )
        badKinds += 1;
      const perAsset = new Map<string, bigint>();
      for (const entry of tx.entries) {
        sums.set(entry.account, (sums.get(entry.account) ?? 0n) + entry.amount);
        const asset = assetOf.get(entry.account) ?? "";
        perAsset.set(asset, (perAsset.get(asset) ?? 0n) + entry.amount);
      }
      for (const sum of perAsset.values()) {
        if (sum !== 0n) {
          unbalancedTx += 1;
          break;
        }
      }
      if (tx.key !== undefined) {
        if (keys.has(tx.key)) duplicateKeys += 1;
        else keys.add(tx.key);
      }
    },
  };

  return {
    hooks,
    get transactions() {
      return transactions;
    },
    check(accounts) {
      const problems: string[] = [];
      const assetTotals = new Map<string, bigint>();
      for (const [id, sum] of sums) {
        const asset = assetOf.get(id) ?? "";
        assetTotals.set(asset, (assetTotals.get(asset) ?? 0n) + sum);
      }
      let badAssets = 0;
      for (const total of assetTotals.values()) if (total !== 0n) badAssets += 1;
      let badBalances = 0;
      let negative = 0;
      for (const account of accounts) {
        if (account.balance !== (sums.get(account.id) ?? 0n)) badBalances += 1;
        if (account.systemCode === null && account.balance < 0n) negative += 1;
      }
      const add = (label: string, n: number): void => {
        if (n > 0) problems.push(`${label}: ${n}`);
      };
      add(INVARIANT_I1_ASSETS, badAssets);
      add(INVARIANT_I1_TRANSACTIONS, unbalancedTx);
      add(INVARIANT_I2_BALANCE, badBalances);
      add(INVARIANT_I2_NEGATIVE, negative);
      add(INVARIANT_I6_KEYS, duplicateKeys);
      add(INVARIANT_I1_SYSTEM_KIND, badKinds);
      return problems;
    },
  };
}
