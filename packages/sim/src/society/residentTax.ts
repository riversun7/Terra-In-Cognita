// 주민세 — 기획 D-579(2323 답: 그 나라 도시에 사는 모든 유닛, 바탕 = 재산(주거·사업장 등 — 임금 아님), 주기는 나라가 정함(기본 후보 주 1회), 받는 곳 =
// 사는 도시 — 도시세 → 국세 2중 구조, 도시세 돈은 D-304 흐름(이자 소각 → 도시 운영비 → 남은 이익을 체제대로), 못 내면 빚으로 남고 신용 점수를 깎는다).
// docs/adr/2026-11-15-business-ledger.md "바뀜 (D-579)". 서버와 시뮬레이터가 같은 함수를 쓴다(simulator/societyPayouts.ts가 부른다).
// 바뀜(tax-2, D-581 — 질문 2372 답 "둘 다", 2375 다): 내는 쪽이 둘이다. 그 도시에 사는 사람(거주 = 집·숙소 배정)만 낸다 — 떠도는 사람(사는 곳 없음)과 다른 도시에
// 사는 유닛(외국인)은 내지 않는다.
// - 집 몫: 그 도시에 사는 유닛마다 그 유닛이 사는 집(숙소)의 몫(집 값 ÷ 그 집에 사는 사람 수 — 부르는 쪽이 셈해 준다)을 그 유닛 지갑에서 낸다(재산이 유닛 것이
//   아니어도 사는 사람이 낸다 — D-581 (a)). 집 배정이 없는 거주(숙소 없는 집)는 집 값 0.
// - 사업장 몫: 그 도시에 사는 유닛이 하나라도 있는 소유 주체가 그 도시에 가진 사업 자산(주거 아닌 건물 — 부르는 쪽 값)을 주인 지갑에서 낸다(D-581 (b)).
// - 같은 주머니(주인 = 그 나라)는 어느 몫도 내지 않는다(사업장 수입 소득세와 같은 규칙 — NPC 제 도시 휴먼).
// - 세금 = ⌊재산 값 × 세율‰ ÷ 1000⌋(한 주기 몫, 내림). 세율 0이면 아무것도 하지 않는다(부르는 쪽이 먼저 돌아간다).
// - 못 낸 몫은 빚: 시스템 계정 debt:resident:<나라>:<도시>:<주인>[:u<유닛>]:<화폐>(잔고 음수 = 갚을 돈 — 유닛 몫이면 u<유닛>)와 짝 claim:resident:<나라>:<화폐>
//   (받을 돈)에 같은 거래로 적는다(돈은 옮기지 않는다 — 두 시스템 계정 합 0). 다음 주기에는 지난 빚부터 갚는다(그 도시를 떠나도 이어 간다). 도시가 다른 나라로
//   넘어갈 때만 그 도시의 빚이 사라진다(cancelResidentDebts — D-581 2375 다·E). 도시가 폐허가 되어도 빚은 남는다(D-585 — 2427 나를 되돌림, 폐허가 복원되어도
//   그대로). 불이익(신용 점수 깎기)은 부르는 쪽 고리
//   SimHooks.residentTaxArrears에 붙는다(서버 apps/server/src/credit/ — docs/adr/2026-11-21-credit.md). 여기는 기록만 한다.
// - 낸 돈은 그 나라 국고(사는 도시의 주인 국고)로 간다. 나라 몫(nationSharePm)을 뺀 나머지가 그 도시 세금 수입으로 D-304 정산에 든다
//   ([임시] — 이 나눔은 사용자 답이 없다, D-585 3·질문 2484. 바뀜 없이 둔다).
// - 사는 곳(거주): 부르는 쪽이 정한다. 서버는 고른 거주지(D-585 — apps/server/src/residence/)가 있으면 그것, 없으면 옛 길(숙소 배정·사는 도시).
// 금액은 BigInt 정수로만 센다. 차례는 (도시 ID, 주인 ID, 유닛 ID — 사업장 몫이 먼저)로 정한다(결정적).
import { unitPurseLocation } from "@terra/shared/businessBooks";
import type { LedgerBook } from "../ledger/ledgerBook.ts";

/** 과세 단위 하나: 사는 도시·내는 주인(유닛 몫이면 그 유닛의 주인)·유닛(집 몫 — 없으면 사업장 몫)·재산 값(국고 화폐 최소 단위) */
export interface ResidentAssessment {
  readonly city: number;
  readonly payer: number;
  /** 집 몫이면 사는 유닛(그 유닛 지갑에서 낸다). 없으면 주인의 사업장 몫(주인 지갑) */
  readonly unit?: number | undefined;
  readonly property: bigint;
}

/** 그 도시에 사는 유닛 하나(거주 = 집·숙소 배정)와 그 유닛 몫의 집 값 */
export interface ResidentHome {
  readonly unit: number;
  readonly owner: number;
  /** 그 유닛이 사는 집의 몫(집 값 ÷ 그 집에 사는 사람 수). 숙소 없는 집이면 0 */
  readonly housing: bigint;
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
  /** 집 몫이면 그 유닛(없으면 사업장 몫) */
  readonly unit?: number | undefined;
  /** 남은 빚 전체 */
  readonly owed: bigint;
  /** 이번 주기에 늘어난 빚(0 아래면 줄었다) */
  readonly added: bigint;
  /** 빚 계정 코드(residentDebtCode — 신용 체계가 이 코드로 깎은 몫을 기억하고, 계정이 0이 되면 되돌린다. credit ADR) */
  readonly code: string;
}

export interface ResidentTaxResult {
  readonly cities: ResidentTaxCity[];
  readonly arrears: ResidentArrears[];
}

/** 빚 시스템 계정 코드(잔고 음수 = 그 주인(유닛 몫이면 그 유닛)이 그 나라 그 도시에 갚을 주민세) */
export const residentDebtCode = (
  nation: number,
  city: number,
  payer: number,
  asset: string,
  unit?: number,
): string => `debt:resident:${nation}:${city}:${payer}${unit === undefined ? "" : `:u${unit}`}:${asset}`;

/** 받을 돈 시스템 계정 코드(그 나라가 받을 주민세 빚 합 — 빚 계정의 짝) */
export const residentClaimCode = (nation: number, asset: string): string =>
  `claim:resident:${nation}:${asset}`;

/** 빚 계정 코드 → 도시·주인(·유닛). 그 나라·화폐가 아니면 undefined */
export function parseResidentDebtCode(
  code: string,
  nation: number,
  asset: string,
): { city: number; payer: number; unit?: number } | undefined {
  const head = `debt:resident:${nation}:`;
  const tail = `:${asset}`;
  if (!code.startsWith(head) || !code.endsWith(tail)) return undefined;
  const match = /^(\d+):(\d+)(?::u(\d+))?$/.exec(code.slice(head.length, code.length - tail.length));
  if (!match) return undefined;
  const out = { city: Number(match[1]), payer: Number(match[2]) };
  return match[3] === undefined ? out : { ...out, unit: Number(match[3]) };
}

/** (도시, 주인, 유닛) 표 열쇠 */
const keyOf = (city: number, payer: number, unit: number | undefined): string =>
  `${city}|${payer}|${unit ?? ""}`;

/** 한 주기 세금 = ⌊재산 × 세율‰ ÷ 1000⌋. 세율은 0~1000으로 자른다 */
export function residentTaxDue(property: bigint, ratePm: number): bigint {
  const rate = Math.min(1000, Math.max(0, Math.trunc(ratePm)));
  if (property <= 0n || rate === 0) return 0n;
  return (property * BigInt(rate)) / 1000n;
}

/**
 * 그 나라의 과세 단위(D-581): 그 나라 도시마다 사는 유닛(같은 주머니 = 그 나라 자신의 유닛 빼고)의 집 몫, 그리고 사는 유닛이 있는 주인마다 그 도시 사업장 몫.
 * 재산이 0이어도 넣는다(지난 빚을 갚는다). homesOf = 도시 → 그 도시에 사는 유닛들, businessOf = (주인, 도시) → 사업 자산 값
 */
export function residentAssessments(
  nation: number,
  cities: Iterable<number>,
  homesOf: (city: number) => readonly ResidentHome[],
  businessOf: (payer: number, city: number) => bigint,
): ResidentAssessment[] {
  const out: ResidentAssessment[] = [];
  for (const city of [...cities].toSorted((a, b) => a - b)) {
    const homes = homesOf(city).filter((home) => home.owner !== nation);
    for (const payer of [...new Set(homes.map((home) => home.owner))].toSorted((a, b) => a - b)) {
      out.push({ city, payer, property: businessOf(payer, city) });
      for (const home of homes.filter((entry) => entry.owner === payer).toSorted((a, b) => a.unit - b.unit))
        out.push({ city, payer, unit: home.unit, property: home.housing });
    }
  }
  return out;
}

/**
 * 도시가 다른 나라로 넘어갈 때 그 도시의 옛 나라 주민세 빚을 지운다(D-581 2375 다 — 빚은 사라진다). 빚 계정과 짝(받을 돈)을 같은 거래로 되돌린다(돈은
 * 옮기지 않는다). 지운 빚 합(화폐마다)
 */
export function cancelResidentDebts(
  book: LedgerBook,
  nation: number,
  city: number,
  atMs: number,
): Map<string, bigint> {
  const cancelled = new Map<string, bigint>();
  const head = `debt:resident:${nation}:${city}:`;
  const entries: { account: number; amount: bigint }[] = [];
  for (const account of book.accounts()) {
    if (account.balance >= 0n || account.systemCode?.startsWith(head) !== true) continue;
    if (!parseResidentDebtCode(account.systemCode, nation, account.asset)) continue;
    entries.push({ account: account.id, amount: -account.balance });
    cancelled.set(account.asset, (cancelled.get(account.asset) ?? 0n) - account.balance);
  }
  for (const [asset, amount] of [...cancelled].toSorted((a, b) => (a[0] < b[0] ? -1 : 1)))
    entries.push({ account: book.systemAccount(residentClaimCode(nation, asset), asset), amount: -amount });
  if (entries.length > 0) book.post({ kind: "resident_tax_cancel", atMs, entries });
  return cancelled;
}

/**
 * 한 나라의 주민세를 걷는다(거래 하나 — kind resident_tax). 지난 빚부터 갚고, 모자라면 남은 몫을 빚으로 적는다.
 * 빚만 남은 주인·유닛(이제 그 도시에 살지 않음)도 갚기를 이어 간다(재산 0으로 본다).
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
  const debts = new Map<string, { city: number; payer: number; unit?: number; owed: bigint }>();
  for (const account of book.accounts()) {
    if (account.systemCode === null || account.balance >= 0n) continue;
    const parsed = parseResidentDebtCode(account.systemCode, o.nation, o.asset);
    if (parsed)
      debts.set(keyOf(parsed.city, parsed.payer, parsed.unit), { ...parsed, owed: -account.balance });
  }
  const units = new Map<string, ResidentAssessment>();
  for (const a of o.assessments) if (a.payer !== o.nation) units.set(keyOf(a.city, a.payer, a.unit), a);
  for (const [key, debt] of debts)
    if (!units.has(key))
      units.set(key, { city: debt.city, payer: debt.payer, unit: debt.unit, property: 0n });
  // 사업장 몫(유닛 없음)이 그 주인의 집 몫보다 먼저
  const ordered = [...units.values()].toSorted(
    (a, b) => a.city - b.city || a.payer - b.payer || (a.unit ?? -1) - (b.unit ?? -1),
  );

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
    const before = debts.get(keyOf(a.city, a.payer, a.unit))?.owed ?? 0n;
    const owed = before + due;
    if (owed <= 0n) continue;
    // 집 몫은 사는 유닛의 지갑(유닛 주인, 화폐, 유닛 지갑 위치 — simulator/humanPurse.ts와 같은 계정 꼴), 사업장 몫은 주인 지갑
    const from =
      a.unit === undefined
        ? book.ownerAccount(a.payer, o.asset)
        : book.ownerAccount(a.payer, o.asset, unitPurseLocation(a.unit));
    const have = book.balance(from) + (amounts.get(from) ?? 0n);
    const pay = have <= 0n ? 0n : have < owed ? have : owed;
    if (pay > 0n) {
      treasury ??= book.ownerAccount(o.nation, o.asset);
      add(from, -pay);
      add(treasury, pay);
    }
    const left = owed - pay;
    const code = residentDebtCode(o.nation, a.city, a.payer, o.asset, a.unit);
    if (left !== before) {
      // 빚 계정 잔고 = −남은 빚, 받을 돈 계정 = +빚 합(짝)
      add(book.systemAccount(code, o.asset), before - left);
      add(book.systemAccount(residentClaimCode(o.nation, o.asset), o.asset), left - before);
    }
    if (left > 0n)
      arrears.push({
        city: a.city,
        payer: a.payer,
        ...(a.unit === undefined ? {} : { unit: a.unit }),
        owed: left,
        added: left - before,
        code,
      });
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
