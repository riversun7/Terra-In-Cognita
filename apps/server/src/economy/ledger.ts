// 원장(메모리 장부 + 쓰기 대기열) — ADR 2026-10-28-economy-ledger(8), docs/adr/2026-10-31-s3-server-stage.md 4절
// 판단(복식부기 거절·잔고 계산)은 @terra/sim의 원장 장부 한 벌이다(시뮬레이터와 같은 코드, docs/adr/2026-10-31-rules-simulator.md).
// 서버는 장부 고리로 거래·항목·계정 잔고를 같은 쓰기 묶음에 넣는다(한 번의 동기 처리 = 한 트랜잭션).
// 거래·항목은 추가만 된다(DB 트리거). 금액은 BigInt다.
import { type LedgerAccount, type LedgerBook, createLedgerBook } from "@terra/sim";
import type { AccountRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

export { LedgerError, type LedgerEntry, type LedgerPost } from "@terra/sim";

/** 서버 원장 = 공용 장부(저장은 고리로) */
export type Ledger = LedgerBook;

export function createLedger(options: {
  writer: WorldWriter;
  nextAccountId: () => number;
  nextTxId: () => number;
  accounts: readonly AccountRow[];
}): Ledger {
  const { writer } = options;
  const save = (account: Readonly<LedgerAccount>): void =>
    writer.upsert("accounts", {
      id: account.id,
      owner_id: account.ownerId,
      system_code: account.systemCode,
      asset: account.asset,
      balance: account.balance,
    });
  return createLedgerBook({
    accounts: options.accounts,
    nextAccountId: options.nextAccountId,
    nextTxId: options.nextTxId,
    hooks: {
      accountCreated: save,
      posted(txId, tx, changed) {
        writer.append("transactions", {
          id: txId,
          kind: tx.kind,
          at_ms: tx.atMs,
          idempotency_key: tx.key ?? null,
        });
        for (const entry of tx.entries)
          writer.append("entries", { tx_id: txId, account_id: entry.account, amount: entry.amount });
        for (const account of changed) save(account);
      },
    },
  });
}
