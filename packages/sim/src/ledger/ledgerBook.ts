// 원장 장부(메모리) — ADR 2026-10-28-economy-ledger(8), docs/adr/2026-10-31-s3-server-stage.md 4절
// 서버(apps/server/src/economy/ledger.ts: 이 장부 + DB 쓰기 고리)와 시뮬레이터(docs/adr/2026-10-31-rules-simulator.md)가
// 같은 장부를 쓴다. 판단(거절·잔고 계산)은 여기 한 곳이고, 저장은 고리(hooks)로 바깥이 한다.
// - 복식부기: 거래 하나의 항목 합은 자산마다 0이다. 소유 주체 계정은 0 아래로 내려가지 않는다(시스템 계정은 된다).
// - 화폐와 쌓이는 자원을 같은 장부에 자산 코드로 적는다. 계정 = (소유 주체, 자산) 또는 시스템 계정(발행·소멸·매장량).
// - 틀린 거래는 LedgerError를 던지고 아무것도 바꾸지 않는다. 금액은 BigInt다.

export interface LedgerEntry {
  readonly account: number;
  readonly amount: bigint;
}

export interface LedgerPost {
  /** 예: issue, job_output, upkeep */
  readonly kind: string;
  readonly atMs: number;
  /** 있으면 한 번만 받아야 하는 거래(유지비 = 주체·경계 시각). DB는 유일 색인, 시뮬은 감사가 본다 */
  readonly key?: string | undefined;
  readonly entries: readonly LedgerEntry[];
}

export type LedgerErrorCode = "unbalanced" | "insufficient" | "unknown_account" | "empty";

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  constructor(code: LedgerErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface LedgerAccount {
  readonly id: number;
  readonly ownerId: number | null;
  readonly systemCode: string | null;
  readonly asset: string;
  balance: bigint;
}

export interface LedgerHooks {
  /** 계정을 만든 뒤 */
  accountCreated?(account: Readonly<LedgerAccount>): void;
  /** 거래를 넣은 뒤. changed = 잔고가 바뀐 계정(바뀐 뒤 잔고, 거래에 처음 나온 차례) */
  posted?(txId: number, tx: LedgerPost, changed: readonly Readonly<LedgerAccount>[]): void;
}

export interface LedgerBook {
  /** (소유 주체, 자산) 계정 ID. 없으면 만든다 */
  ownerAccount(ownerId: number, asset: string): number;
  /** 시스템 계정 ID(code는 예: "issue:s3_test_credit"). 없으면 만든다 */
  systemAccount(code: string, asset: string): number;
  /** 계정이 없으면 0 */
  balanceOf(ownerId: number, asset: string): bigint;
  balance(accountId: number): bigint;
  /** 거래를 넣고 거래 ID를 돌려준다. 틀리면 LedgerError(아무것도 바꾸지 않는다) */
  post(tx: LedgerPost): number;
  /** 모든 계정(만든 차례) */
  accounts(): IterableIterator<Readonly<LedgerAccount>>;
}

export function createLedgerBook(options: {
  /** 부팅 때 읽은 계정(잔고 포함) */
  accounts?: readonly LedgerAccount[] | undefined;
  nextAccountId: () => number;
  nextTxId: () => number;
  hooks?: LedgerHooks | undefined;
}): LedgerBook {
  const hooks = options.hooks ?? {};
  const byId = new Map<number, LedgerAccount>();
  const byOwner = new Map<string, LedgerAccount>();
  const bySystem = new Map<string, LedgerAccount>();
  const index = (account: LedgerAccount): void => {
    byId.set(account.id, account);
    if (account.ownerId !== null) byOwner.set(`${account.ownerId}:${account.asset}`, account);
    if (account.systemCode !== null) bySystem.set(account.systemCode, account);
  };
  for (const row of options.accounts ?? []) index({ ...row });

  const create = (ownerId: number | null, systemCode: string | null, asset: string): LedgerAccount => {
    const account: LedgerAccount = { id: options.nextAccountId(), ownerId, systemCode, asset, balance: 0n };
    index(account);
    hooks.accountCreated?.(account);
    return account;
  };

  return {
    ownerAccount(ownerId, asset) {
      return (byOwner.get(`${ownerId}:${asset}`) ?? create(ownerId, null, asset)).id;
    },
    systemAccount(code, asset) {
      return (bySystem.get(code) ?? create(null, code, asset)).id;
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
      const next = new Map<LedgerAccount, bigint>();
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
      for (const [account, balance] of next) account.balance = balance;
      hooks.posted?.(txId, tx, [...next.keys()]);
      return txId;
    },
    accounts() {
      return byId.values();
    },
  };
}
