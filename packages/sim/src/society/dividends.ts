// 도시 세금 정산·배당 — docs/adr/2026-10-31-faction-society-core.md "바뀜 (2026-11-01)", 기획 46 §5.3, D-130·D-298·D-303·D-304·
// D-338·D-349
// 도시 세금은 ① 발행 이자분 소각 ② 도시 운영비 ③ 남은 이익 차례로 나눈다(D-304). 주기는 설정값(dividendEveryMs, D-130 7일).
// - 이자는 화폐를 찍는 나라마다 붙는다(D-303). 나라 세금으로 먼저 내므로 기간 이자를 그 나라 도시들에 세금 비례로 나눈다
//   (가장 큰 나머지, 같으면 도시 ID 작은 쪽). 세금보다 이자가 크면 모자란 몫은 국고가 낸다(46 §5.3, D-444 166 가로 받음).
// - 운영비는 그 도시의 남은 세금 안에서만 뺀다(넘는 몫은 국고가 낸다, 다음 기간으로 넘기지 않는다). 지금 있는 운영비부터 넣고
//   시장 급여·유지비(D-252)는 생기면 더한다(D-444 166).
// - 남은 이익: 자본주의 = 지분 비례(국고가 가진 몫은 국고에 남는다, D-298), 독재 = 지분 비례이고 국고가 가진 몫은 지배 가문
//   금고로(D-338, 충성 지분을 받은 가문 D-349는 지분대로), 민주주의 = 국고(지분과 별개, D-304).
// 이 파일은 계산과 이체만 한다. 이자 소각 자체는 화폐 발행 쪽(중앙은행 centralBank.ts)이 날마다 하고, 부르는 쪽이 그 양을 넘긴다.
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import { type Regime, holdingsOf } from "./shares.ts";

export interface CityRevenue {
  readonly city: number;
  /** 그 기간 그 도시에서 걷은 세금(국고 화폐 최소 단위) */
  readonly revenue: bigint;
  /** 그 기간 도시 운영비(도시 예산 D-252: 급여·유지비·공공 건물) */
  readonly operating: bigint;
}

export interface CityTaxSettlement {
  readonly city: number;
  readonly revenue: bigint;
  /** ① 세금에서 낸 이자분 */
  readonly interest: bigint;
  /** ② 세금에서 낸 운영비 */
  readonly operating: bigint;
  /** ③ 남은 이익(0 이상) */
  readonly profit: bigint;
}

export interface TaxSettlement {
  readonly cities: CityTaxSettlement[];
  /** 세금으로 못 낸 이자(국고가 낸 몫) */
  readonly interestShortfall: bigint;
}

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** 기간 정산(한 나라의 도시들, 도시 ID 차례로 돌려준다). interest = 그 기간 그 나라가 낸 발행 이자 */
export function settleCityTaxes(cities: readonly CityRevenue[], interest: bigint): TaxSettlement {
  const sorted = cities.toSorted((a, b) => a.city - b.city);
  const total = sorted.reduce((sum, c) => sum + (c.revenue > 0n ? c.revenue : 0n), 0n);
  const share = new Map<number, bigint>();
  if (total > 0n && interest > 0n) {
    const parts = sorted.map((c) => {
      const revenue = c.revenue > 0n ? c.revenue : 0n;
      return { city: c.city, amount: (interest * revenue) / total, rest: (interest * revenue) % total };
    });
    let left = interest - parts.reduce((sum, p) => sum + p.amount, 0n);
    const order = parts.toSorted((a, b) => (b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.city - b.city));
    for (const part of order) {
      if (left <= 0n) break;
      if (part.rest === 0n) continue;
      part.amount += 1n;
      left -= 1n;
    }
    for (const part of parts) share.set(part.city, part.amount);
  }
  let paidInterest = 0n;
  const out = sorted.map((c) => {
    const revenue = c.revenue > 0n ? c.revenue : 0n;
    const paid = min(share.get(c.city) ?? 0n, revenue);
    const operating = min(c.operating > 0n ? c.operating : 0n, revenue - paid);
    paidInterest += paid;
    return { city: c.city, revenue, interest: paid, operating, profit: revenue - paid - operating };
  });
  return { cities: out, interestShortfall: interest > paidInterest ? interest - paidInterest : 0n };
}

export type ProfitRecipient = "shareholders" | "treasury";

/** ③ 남은 이익을 받는 곳(D-304): 자본주의·독재 = 주주, 민주주의 = 국고 */
export function profitRecipient(regime: Regime): ProfitRecipient {
  return regime === "democracy" ? "treasury" : "shareholders";
}

export interface CityProfitPayment {
  readonly city: number;
  /** 국고 화폐 자산 */
  readonly asset: string;
  readonly regime: Regime;
  /** 세금이 들어 있는 국고 주체 */
  readonly treasury: number;
  /** 지배 가문 금고 주체(독재). 가문이 따로 없으면 국고와 같게 준다 */
  readonly rulingFamily: number;
  readonly profit: bigint;
  readonly atMs: number;
}

/**
 * ③ 남은 이익을 나눈다(한 거래): 국고 잔고까지만, 지분 비례 내림, 남는 몫은 국고. 국고에서 나간 합을 돌려준다.
 * 민주주의는 옮기지 않는다(0). 지분이 없는 도시(상장폐지 직후)도 0
 */
export function payCityProfit(book: LedgerBook, p: CityProfitPayment): bigint {
  if (profitRecipient(p.regime) === "treasury" || p.profit <= 0n) return 0n;
  const balance = book.balanceOf(p.treasury, p.asset);
  const total = min(p.profit, balance);
  const holdings = holdingsOf(book, p.city);
  const shares = holdings.reduce((sum, h) => sum + h.amount, 0n);
  if (shares === 0n || total <= 0n) return 0n;
  const parts = new Map<number, bigint>();
  for (const h of holdings) {
    const part = (total * h.amount) / shares;
    if (part <= 0n) continue;
    // 국고 몫: 자본주의는 국고에 남고(D-298), 독재는 지배 가문 금고로(D-338)
    const to = h.owner === p.treasury ? (p.regime === "dictatorship" ? p.rulingFamily : p.treasury) : h.owner;
    if (to === p.treasury) continue;
    parts.set(to, (parts.get(to) ?? 0n) + part);
  }
  const entries: LedgerEntry[] = [];
  let paid = 0n;
  for (const [owner, part] of [...parts].toSorted((a, b) => a[0] - b[0])) {
    entries.push({ account: book.ownerAccount(owner, p.asset), amount: part });
    paid += part;
  }
  if (paid === 0n) return 0n;
  entries.push({ account: book.ownerAccount(p.treasury, p.asset), amount: -paid });
  book.post({ kind: "dividend", atMs: p.atMs, entries });
  return paid;
}
