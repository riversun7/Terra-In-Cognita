// 주민세 — 기획 D-579(2323 답: 그 나라 도시에 사는 모든 유닛, 바탕 = 재산(주거·사업장 등 — 임금 아님), 주기는 나라가 정함(기본 후보 주 1회), 받는 곳 =
// 사는 도시 — 도시세 → 국세 2중 구조, 도시세 돈은 D-304 흐름(이자 소각 → 도시 운영비 → 남은 이익을 체제대로), 못 내면 빚으로 남고 신용 점수를 깎는다).
// docs/adr/2026-11-15-business-ledger.md "바뀜 (D-579)". 서버와 시뮬레이터가 같은 함수를 쓴다(simulator/societyPayouts.ts가 부른다).
// - 과세 단위 = (내는 주인, 사는 도시): 그 도시에 사는 유닛이 하나라도 있는 소유 주체가 그 도시에 가진 재산 값으로 낸다(유닛은 재산을 갖지 않고 주인이
//   갖는다 — 유닛 지갑은 임금이라 바탕이 아니다, D-579). 같은 주머니(주인 = 그 나라)는 내지 않는다(사업장 수입 소득세와 같은 규칙) [임시 — 질문 2372].
// - 세금 = ⌊재산 값 × 세율‰ ÷ 1000⌋(한 주기 몫, 내림). 세율 0이면 아무것도 하지 않는다(부르는 쪽이 먼저 돌아간다).
// - 못 낸 몫은 빚: 시스템 계정 debt:resident:<나라>:<도시>:<주인>:<화폐>(잔고 음수 = 갚을 돈)와 짝 claim:resident:<나라>:<화폐>(받을 돈)에 같은 거래로
//   적는다(돈은 옮기지 않는다 — 두 시스템 계정 합 0). 다음 주기에는 지난 빚부터 갚는다. 불이익(신용 점수 깎기)은 신용 체계(D-138)가 생기면 부르는 쪽
//   고리(SimHooks.residentTaxArrears)에서 — 지금은 기록만 한다(빈틈 — 질문 2374).
// - 낸 돈은 그 나라 국고(사는 도시의 주인 국고)로 간다. 나라 몫(nationSharePm)을 뺀 나머지가 그 도시 세금 수입으로 D-304 정산에 든다.
// 금액은 BigInt 정수로만 센다. 차례는 (도시 ID, 주인 ID)로 정한다(결정적).
import type { LedgerBook } from "../ledger/ledgerBook.ts";

/** 과세 단위 하나: 사는 도시·내는 주인·재산 값(국고 화폐 최소 단위) */
export interface ResidentAssessment {
  readonly city: number;
  readonly payer: number;
  readonly property: bigint;
}

/** 도시 하나의 이번 주기 결과 */
export interface ResidentTaxCity {
  readonly city: number;
  /** 이번 주기 세금 합(지난 빚 뺌) */
  readonly due: bigint;
  /** 낸 합(지난 빚 갚은 몫 포함) */
  readonly paid: bigint;
  /** 도시 세금 수입으로 D-304 정산에 드는 몫 */
  readonly cityPart: bigint;
  /** 국세로 국고에 남는 몫(2중 구조의 나라 몫) */
  readonly nationPart: bigint;
}

/** 못 낸 주인 하나(빚이 남았다) */
export interface ResidentArrears {
  readonly city: number;
  readonly payer: number;
  /** 남은 빚 전체 */
  readonly owed: bigint;
  /** 이번 주기에 늘어난 빚(0 아래면 줄었다) */
  readonly added: bigint;
}

export interface ResidentTaxResult {
  readonly cities: ResidentTaxCity[];
  readonly arrears: ResidentArrears[];
}

/** 빚 시스템 계정 코드(잔고 음수 = 그 주인이 그 나라 그 도시에 갚을 주민세) */
export const residentDebtCode = (nation: number, city: number, payer: number, asset: string): string =>
  `debt:resident:${nation}:${city}:${payer}:${asset}`;

/** 받을 돈 시스템 계정 코드(그 나라가 받을 주민세 빚 합 — 빚 계정의 짝) */
export const residentClaimCode = (nation: number, asset: string): string =>
  `claim:resident:${nation}:${asset}`;

/** 빚 계정 코드 → 도시·주인(그 나라·화폐가 아니면 undefined) */
export function parseResidentDebtCode(
  code: string,
  nation: number,
  asset: string,
): { city: number; payer: number } | undefined {
  const head = `debt:resident:${nation}:`;
  const tail = `:${asset}`;
  if (!code.startsWith(head) || !code.endsWith(tail)) return undefined;
  const match = /^(\d+):(\d+)$/.exec(code.slice(head.length, code.length - tail.length));
  return match ? { city: Number(match[1]), payer: Number(match[2]) } : undefined;
}

/** (도시, 주인) 표 열쇠 */
const keyOf = (city: number, payer: number): string => `${city}|${payer}`;

/** 한 주기 세금 = ⌊재산 × 세율‰ ÷ 1000⌋. 세율은 0~1000으로 자른다 */
export function residentTaxDue(property: bigint, ratePm: number): bigint {
  const rate = Math.min(1000, Math.max(0, Math.trunc(ratePm)));
  if (property <= 0n || rate === 0) return 0n;
  return (property * BigInt(rate)) / 1000n;
}

/**
 * 그 나라의 과세 단위: 그 나라 도시마다 사는 유닛의 주인(같은 주머니 = 그 나라 자신 빼고) × 그 도시 재산 값. 재산이 0이어도 넣는다(지난 빚을 갚는다).
 * residents = 도시 → 그 도시에 사는 유닛 주인들
 */
export function residentAssessments(
  nation: number,
  cities: Iterable<number>,
  residents: ReadonlyMap<number, ReadonlySet<number>>,
  propertyOf: (payer: number, city: number) => bigint,
): ResidentAssessment[] {
  const out: ResidentAssessment[] = [];
  for (const city of [...cities].toSorted((a, b) => a - b))
    for (const payer of [...(residents.get(city) ?? [])].toSorted((a, b) => a - b))
      if (payer !== nation) out.push({ city, payer, property: propertyOf(payer, city) });
  return out;
}

/**
 * 한 나라의 주민세를 걷는다(거래 하나 — kind resident_tax). 지난 빚부터 갚고, 모자라면 남은 몫을 빚으로 적는다.
 * 빚만 남은 주인(이제 그 도시에 살지 않음)도 갚기를 이어 간다(재산 0으로 본다).
 */
export function collectResidentTax(
  book: LedgerBook,
  o: {
    readonly nation: number;
    readonly asset: string;
    readonly assessments: readonly ResidentAssessment[];
    readonly ratePm: number;
    /** 낸 돈 가운데 국세 몫(‰, 0~1000). 나머지는 도시 세금 수입 */
    readonly nationSharePm: number;
    readonly atMs: number;
  },
): ResidentTaxResult {
  // 지난 빚(그 나라·화폐) — 한 번 훑는다
  const debts = new Map<string, { city: number; payer: number; owed: bigint }>();
  for (const account of book.accounts()) {
    if (account.systemCode === null || account.balance >= 0n) continue;
    const parsed = parseResidentDebtCode(account.systemCode, o.nation, o.asset);
    if (parsed) debts.set(keyOf(parsed.city, parsed.payer), { ...parsed, owed: -account.balance });
  }
  const units = new Map<string, ResidentAssessment>();
  for (const a of o.assessments) if (a.payer !== o.nation) units.set(keyOf(a.city, a.payer), a);
  for (const [key, debt] of debts)
    if (!units.has(key)) units.set(key, { city: debt.city, payer: debt.payer, property: 0n });
  const ordered = [...units.values()].toSorted((a, b) => a.city - b.city || a.payer - b.payer);

  const share = BigInt(Math.min(1000, Math.max(0, Math.trunc(o.nationSharePm))));
  const sums = new Map<number, { due: bigint; paid: bigint; cityPart: bigint; nationPart: bigint }>();
  const arrears: ResidentArrears[] = [];
  const amounts = new Map<number, bigint>();
  const add = (account: number, amount: bigint): void => {
    amounts.set(account, (amounts.get(account) ?? 0n) + amount);
  };
  let treasury: number | undefined;
  for (const a of ordered) {
    const due = residentTaxDue(a.property, o.ratePm);
    const before = debts.get(keyOf(a.city, a.payer))?.owed ?? 0n;
    const owed = before + due;
    if (owed <= 0n) continue;
    const from = book.ownerAccount(a.payer, o.asset);
    const have = book.balance(from) + (amounts.get(from) ?? 0n);
    const pay = have <= 0n ? 0n : have < owed ? have : owed;
    if (pay > 0n) {
      treasury ??= book.ownerAccount(o.nation, o.asset);
      add(from, -pay);
      add(treasury, pay);
    }
    const left = owed - pay;
    if (left !== before) {
      // 빚 계정 잔고 = −남은 빚, 받을 돈 계정 = +빚 합(짝)
      add(book.systemAccount(residentDebtCode(o.nation, a.city, a.payer, o.asset), o.asset), before - left);
      add(book.systemAccount(residentClaimCode(o.nation, o.asset), o.asset), left - before);
    }
    if (left > 0n) arrears.push({ city: a.city, payer: a.payer, owed: left, added: left - before });
    const nationPart = (pay * share) / 1000n;
    const sum = sums.get(a.city) ?? { due: 0n, paid: 0n, cityPart: 0n, nationPart: 0n };
    sum.due += due;
    sum.paid += pay;
    sum.nationPart += nationPart;
    sum.cityPart += pay - nationPart;
    sums.set(a.city, sum);
  }
  const entries = [...amounts]
    .filter(([, amount]) => amount !== 0n)
    .map(([account, amount]) => ({ account, amount }));
  if (entries.length > 0) book.post({ kind: "resident_tax", atMs: o.atMs, entries });
  return {
    cities: [...sums].toSorted((a, b) => a[0] - b[0]).map(([city, sum]) => ({ city, ...sum })),
    arrears,
  };
}
