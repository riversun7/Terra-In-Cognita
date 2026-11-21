// 옛 도시 연맹 기금 되돌리기 — 기획 답(질문 2505 나, docs/questions/2026-11-22-league-fix.md): 팩 136~138 서버가 모은 옛 연맹 기금(원장 시스템 계정
// league:city:<도시>:<화폐>)에 남은 돈을 그 분담금을 낸 가문 금고로 되돌린다. D-522(시험 세계 — 유저 손실을 막는 이전 규칙은 두지 않는다)와 함께 읽어
// 리셋 없이 한 번 옮기는 정리로 둔다. docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (npc-invest-2)".
// - 서버를 켤 때 세계가 준비되면 한 번 돈다(factionIdentity/attach.ts). 기금 잔고가 0보다 큰 계정만 본다 → 되돌린 뒤 잔고가 0이라 다시 켜도 아무것도
//   하지 않는다(멱등). 거래 열쇠 league_refund:<기금 계정 ID>도 DB에서 두 번 들어가지 않게 막는다.
// - 나누기: 그 기금으로 들어온 옛 분담금 거래(kind league_dues — 항목 둘: 가문 금고 −, 기금 +)를 가문 금고마다 더한 합의 비율. 내림한 나머지는 나머지가 큰
//   금고부터(같으면 작은 계정 ID) 1씩. 원장 거래 하나(league_refund)로 기금 −잔고, 금고마다 +몫 — 합이 0이다.
// - 분담금 기록을 찾지 못한 기금(기록 없음)은 그대로 두고 수를 알린다.
// 정수(BigInt)만 쓴다.
import type { Ledger } from "../economy/ledger.ts";

/** 옛 연맹 기금 계정 앞머리(옛 apps/server/src/npc/houseLeague.ts leagueFundCode) */
export const OLD_LEAGUE_FUND_PREFIX = "league:city:";

interface QueryPool {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface LeagueRefundReport {
  /** 되돌린 기금 수 */
  readonly funds: number;
  /** 되돌린 돈 합(화폐가 섞여도 최소 단위 합 — 기록용) */
  readonly amount: bigint;
  /** 분담금 기록을 찾지 못해 남긴 기금 수 */
  readonly unattributed: number;
}

/** 금고마다 낸 합의 비율로 나눈다(나머지는 나머지가 큰 차례, 같으면 작은 계정 ID) */
export function splitRefund(
  balance: bigint,
  paid: readonly { readonly account: number; readonly amount: bigint }[],
): { readonly account: number; readonly amount: bigint }[] {
  const positive = paid.filter((entry) => entry.amount > 0n).toSorted((a, b) => a.account - b.account);
  let total = 0n;
  for (const entry of positive) total += entry.amount;
  if (balance <= 0n || total <= 0n) return [];
  const shares = positive.map((entry) => ({
    account: entry.account,
    amount: (balance * entry.amount) / total,
    rest: (balance * entry.amount) % total,
  }));
  let left = balance;
  for (const share of shares) left -= share.amount;
  const order = shares.toSorted((a, b) =>
    a.rest === b.rest ? a.account - b.account : a.rest > b.rest ? -1 : 1,
  );
  for (let i = 0; left > 0n && order.length > 0; i += 1) {
    const share = order[i % order.length];
    if (share) share.amount += 1n;
    left -= 1n;
  }
  return shares.filter((share) => share.amount > 0n).map(({ account, amount }) => ({ account, amount }));
}

/** 옛 연맹 기금을 낸 가문 금고로 되돌린다(위 머리 주석) */
export async function refundOldLeagueFunds(
  pool: QueryPool,
  ledger: Pick<Ledger, "accounts" | "post">,
  nowMs: number,
): Promise<LeagueRefundReport> {
  const funds = [...ledger.accounts()]
    .filter(
      (account) => account.systemCode?.startsWith(OLD_LEAGUE_FUND_PREFIX) === true && account.balance > 0n,
    )
    .map((account) => ({ id: account.id, balance: account.balance }))
    .toSorted((a, b) => a.id - b.id);
  let refunded = 0;
  let amount = 0n;
  let unattributed = 0;
  for (const fund of funds) {
    const result = await pool.query(
      `select v.account_id::text as account, sum(-v.amount)::text as paid
         from ledger_entries f
         join ledger_transactions t on t.id = f.tx_id and t.kind = 'league_dues'
         join ledger_entries v on v.tx_id = f.tx_id and v.account_id <> f.account_id and v.amount < 0
        where f.account_id = $1 and f.amount > 0
        group by v.account_id`,
      [fund.id],
    );
    const paid = result.rows.map((row) => ({
      account: Number(row.account),
      amount: BigInt(typeof row.paid === "string" ? row.paid : "0"),
    }));
    // 그 사이(쿼리를 기다리는 동안) 잔고가 바뀌었을 수 있다 — 지금 잔고로 다시 읽는다
    const live = [...ledger.accounts()].find((account) => account.id === fund.id)?.balance ?? 0n;
    const shares = splitRefund(live, paid);
    if (shares.length === 0) {
      if (live > 0n) unattributed += 1;
      continue;
    }
    ledger.post({
      kind: "league_refund",
      atMs: nowMs,
      key: `league_refund:${fund.id}`,
      entries: [
        { account: fund.id, amount: -live },
        ...shares.map((share) => ({ account: share.account, amount: share.amount })),
      ],
    });
    refunded += 1;
    amount += live;
  }
  return { funds: refunded, amount, unattributed };
}
