// 원장(메모리 캐시 + 쓰기 대기열) — ADR 2026-10-28-economy-ledger(8), docs/adr/2026-10-31-s3-server-stage.md 4절
// - 복식부기: 거래 하나의 항목 합은 자산마다 0이다. 소유 주체 계정은 0 아래로 내려가지 않는다(시스템 계정은 된다).
// - 화폐와 쌓이는 자원을 같은 원장에 자산 코드로 적는다. 계정 = (소유 주체, 자산) 또는 시스템 계정(발행·소멸·매장량).
// - 잔고는 메모리에 캐시하고, 거래·항목·계정 잔고를 같은 쓰기 묶음에 넣는다(한 번의 동기 처리 = 한 트랜잭션).
//   거래·항목은 추가만 된다(DB 트리거). 금액은 BigInt다.
import type { AccountRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

export interface LedgerEntry {
  readonly account: number;
  readonly amount: bigint;
}

export interface LedgerPost {
  /** 예: issue, job_output, upkeep */
  readonly kind: string;
  readonly atMs: number;
  /** 있으면 DB가 한 번만 받는다(유지비 = 주체·경계 시각) */
  readonly key?: string | undefined;
  readonly entries: readonly LedgerEntry[];
}

export class LedgerError extends Error {
  constructor(readonly code: "unbalanced" | "insufficient" | "unknown_account" | "empty") {
    super(code);
  }
}

export interface Ledger {
  /** (소유 주체, 자산) 계정 ID. 없으면 만든다 */
  ownerAccount(ownerId: number, asset: string): number;
  /** 시스템 계정 ID(code는 예: "issue:s3_test_credit"). 없으면 만든다 */
  systemAccount(code: string, asset: string): number;
  /** 계정이 없으면 0 */
  balanceOf(ownerId: number, asset: string): bigint;
  balance(accountId: number): bigint;
  /** 거래를 넣는다. 틀리면 LedgerError(아무것도 바꾸지 않는다) */
  post(tx: LedgerPost): void;
}

interface Account {
  readonly id: number;
  readonly ownerId: number | null;
  readonly systemCode: string | null;
  readonly asset: string;
  balance: bigint;
}

export function createLedger(options: {
  writer: WorldWriter;
  nextAccountId: () => number;
  nextTxId: () => number;
  accounts: readonly AccountRow[];
}): Ledger {
  const { writer } = options;
  const byId = new Map<number, Account>();
  const byOwner = new Map<string, Account>();
  const bySystem = new Map<string, Account>();
  const index = (account: Account): void => {
    byId.set(account.id, account);
    if (account.ownerId !== null) byOwner.set(`${account.ownerId}:${account.asset}`, account);
    if (account.systemCode !== null) bySystem.set(account.systemCode, account);
  };
  for (const row of options.accounts) index({ ...row });

  const save = (account: Account): void =>
    writer.upsert("accounts", {
      id: account.id,
      owner_id: account.ownerId,
      system_code: account.systemCode,
      asset: account.asset,
      balance: account.balance,
    });

  const create = (ownerId: number | null, systemCode: string | null, asset: string): Account => {
    const account: Account = { id: options.nextAccountId(), ownerId, systemCode, asset, balance: 0n };
    index(account);
    save(account);
    return account;
  };

  return {
    ownerAccount(ownerId, asset) {
      return (byOwner.get(`${ownerId}:${asset}`) ?? create(ownerId, null, asset)).id;
    },
    systemAccount(code, asset) {
      const found = bySystem.get(code);
      if (found) return found.id;
      return create(null, code, asset).id;
    },
    balanceOf(ownerId, asset) {
      return byOwner.get(`${ownerId}:${asset}`)?.balance ?? 0n;
    },
    balance(accountId) {
      return byId.get(accountId)?.balance ?? 0n;
    },
    post(tx) {
      if (tx.entries.length === 0) throw new LedgerError("empty");
      const sums = new Map<string, bigint>();
      const next = new Map<Account, bigint>();
      for (const entry of tx.entries) {
        const account = byId.get(entry.account);
        if (!account) throw new LedgerError("unknown_account");
        if (entry.amount === 0n) throw new LedgerError("unbalanced");
        sums.set(account.asset, (sums.get(account.asset) ?? 0n) + entry.amount);
        next.set(account, (next.get(account) ?? account.balance) + entry.amount);
      }
      for (const sum of sums.values()) if (sum !== 0n) throw new LedgerError("unbalanced");
      for (const [account, balance] of next) {
        if (account.systemCode === null && balance < 0n) throw new LedgerError("insufficient");
      }
      const txId = options.nextTxId();
      writer.append("transactions", {
        id: txId,
        kind: tx.kind,
        at_ms: tx.atMs,
        idempotency_key: tx.key ?? null,
      });
      for (const entry of tx.entries)
        writer.append("entries", { tx_id: txId, account_id: entry.account, amount: entry.amount });
      for (const [account, balance] of next) {
        account.balance = balance;
        save(account);
      }
    },
  };
}
