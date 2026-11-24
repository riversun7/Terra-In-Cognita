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
//   넘어갈 때만 그 도시의 빚이 사라진다(cancelResidentDebts — D-581 2375 다·E). 도시가 폐허가 되어도 빚은 남는다(D-585 — 2427 나를 되돌림, 옛 나라가 복원하면
//   그대로, 다른 나라가 복원하면 나라가 바뀐 것이라 지운다 — 질문 2483 나, societyRuins.ts). 불이익(신용 점수 깎기)은 부르는 쪽 고리
//   SimHooks.residentTaxArrears에 붙는다(서버 apps/server/src/credit/ — docs/adr/2026-11-21-credit.md). 여기는 기록만 한다.
// - 낸 돈은 그 나라 국고(사는 도시의 주인 국고)로 간다. 나라 몫(nationSharePm)을 뺀 나머지는 그 도시 운영비로만 쓴다
//   (질문 2484 다 — D-304 이익 나눔에 넣지 않는다, simulator/societyPayouts.ts).
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
  /** 참이면 유닛 개별 지갑 대신 소유자(플레이어) 지갑에서 낸다(사이보그 본체·재산 없는 유닛 — ADR 2026-11-24-house-membership-separation.md) */
  readonly ownerWallet?: boolean | undefined;
}

/** 그 도시에 사는 유닛 하나(거주 = 집·숙소 배정)와 그 유닛 몫의 집 값 */
export interface ResidentHome {
  readonly unit: number;
  readonly owner: number;
  /** 그 유닛이 사는 집의 몫(집 값 ÷ 그 집에 사는 사람 수). 숙소 없는 집이면 0 */
  readonly housing: bigint;
  /** 참이면 소유자(플레이어) 지갑에서 낸다(사이보그 본체·재산 없는 유닛) */
  readonly ownerWallet?: boolean | undefined;
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
        out.push({
          city,
          payer,
          unit: home.unit,
          property: home.housing,
          ...(home.ownerWallet === true ? { ownerWallet: true } : {}),
        });
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
    // 집 몫은 사는 유닛의 지갑(사이보그 본체·재산 없는 유닛은 ownerWallet = true → 소유자 지갑), 사업장 몫은 주인 지갑
    const from =
      a.unit === undefined || a.ownerWallet === true
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

// 도시 운영비 금고(바뀜 gov-fix-2 — 질문 2537 기획 답: 주민세 도시 몫은 다시 켜도 남아야 한다). 주민세 도시 몫(국세 몫을 뺀 것 — 질문 2484 다·D-588 2)을 걷는 날
// 국고에서 시스템 계정 cityfund:<나라>:<도시>:<화폐>로 옮기고(city_fund), 도시 세금 정산 때 그 기간 그 도시 운영비(국고가 이미 낸 연구 시설 짓기 값)만큼 금고 → 국고로
// 되돌린다(city_fund_draw — 운영비를 금고가 낸 셈). D-304 이익 나눔에는 넣지 않는다. 원장 계정이라 서버를 다시 켜도 남는다. 도시가 다른 나라로 넘어가면 남은 몫을 옛 나라
// 국고로 돌려준다(city_fund_refund — 예전 메모리 몫이 국고 몫이 되던 것과 같다). 폐허가 되어도 금고는 남고(옛 나라가 복원하면 다시 쓴다), 다른 나라가 복원하면
// 옛 나라 국고로 돌려준다(societyRuins.ts — 빚 지우기와 같은 때).

/** 도시 운영비 금고 계정 코드 */
export function cityFundCode(nation: number, city: number, asset: string): string {
  return `cityfund:${nation}:${city}:${asset}`;
}

/** 도시 운영비 금고 계정 찾기(코드 → 계정 ID). 계정을 만들지 않으려고 한 번 훑는다(정산 주기마다 한 번) */
export function cityFundIndex(book: LedgerBook): Map<string, number> {
  const out = new Map<string, number>();
  for (const account of book.accounts())
    if (account.systemCode?.startsWith("cityfund:") === true) out.set(account.systemCode, account.id);
  return out;
}

/** 주민세 도시 몫을 국고 → 그 도시 운영비 금고(0 이하면 아무것도 안 함) */
export function depositCityFund(
  book: LedgerBook,
  nation: number,
  city: number,
  asset: string,
  amount: bigint,
  atMs: number,
): void {
  if (amount <= 0n) return;
  book.post({
    kind: "city_fund",
    atMs,
    entries: [
      { account: book.ownerAccount(nation, asset), amount: -amount },
      { account: book.systemAccount(cityFundCode(nation, city, asset), asset), amount },
    ],
  });
}

/** 운영비 cost를 금고에서 메운다(금고 → 국고, 있는 만큼). 메운 양. account = cityFundIndex로 찾은 계정(없으면 0) */
export function drawCityFund(
  book: LedgerBook,
  nation: number,
  account: number | undefined,
  asset: string,
  cost: bigint,
  atMs: number,
): bigint {
  if (account === undefined || cost <= 0n) return 0n;
  const fund = book.balance(account);
  const covered = fund < cost ? fund : cost;
  if (covered <= 0n) return 0n;
  book.post({
    kind: "city_fund_draw",
    atMs,
    entries: [
      { account, amount: -covered },
      { account: book.ownerAccount(nation, asset), amount: covered },
    ],
  });
  return covered;
}

/** 그 나라의 그 도시 운영비 금고를 모두(화폐마다) 나라 국고로 돌려준다(도시의 나라가 바뀜). 돌려준 양(화폐 → 양) */
export function refundCityFund(
  book: LedgerBook,
  nation: number,
  city: number,
  atMs: number,
): Map<string, bigint> {
  const head = `cityfund:${nation}:${city}:`;
  const refunded = new Map<string, bigint>();
  const entries: { account: number; amount: bigint }[] = [];
  for (const account of book.accounts()) {
    if (account.balance <= 0n || account.systemCode?.startsWith(head) !== true) continue;
    entries.push({ account: account.id, amount: -account.balance });
    refunded.set(account.asset, (refunded.get(account.asset) ?? 0n) + account.balance);
  }
  for (const [asset, amount] of [...refunded].toSorted((a, b) => (a[0] < b[0] ? -1 : 1)))
    entries.push({ account: book.ownerAccount(nation, asset), amount });
  if (entries.length > 0) book.post({ kind: "city_fund_refund", atMs, entries });
  return refunded;
}

/** 화폐 바꿈 창구 계정 코드(도시 운영비 금고 화폐 바꿈 — convertCityFunds) */
export function cityFundFxCode(asset: string): string {
  return `cityfund_fx:${asset}`;
}

/**
 * 나라 화폐가 바뀐 뒤 도시 운영비 금고(바뀜 gov-fix-3 — 질문 2576 다 사용자 답 "옛 화폐 금고를 바꾼 비율로 새 화폐 금고로 옮긴다", 국고로 돌려주지 않는다):
 * 금고 화폐가 그 나라 지금 화폐(currencyOf)와 다르면 convert(옛 양, 옛 화폐, 새 화폐)만큼 새 화폐 금고로 옮긴다. 원장은 화폐마다 맞춘다 — 옛 화폐는 창구
 * cityfund_fx:<옛 화폐>로 가고 새 화폐는 창구 cityfund_fx:<새 화폐>에서 나온다(시스템 계정이라 음수가 될 수 있다 — 발행 계정과 같은 꼴, [임시] 기술 선택).
 * 바꾼 양이 0 이하(비율을 모름·너무 적음)면 옮기지 않고 옛 금고에 남긴다(지금 화폐 금고만 정산이 쓴다). 지금 화폐를 모르는 나라(사라진 나라 등)는 건너뛴다.
 * 옮긴 금고 수
 */
export function convertCityFunds(
  book: LedgerBook,
  currencyOf: (nation: number) => string | undefined,
  convert: (amount: bigint, from: string, to: string) => bigint,
  atMs: number,
): number {
  const stale: { account: number; nation: number; city: number; from: string; to: string; amount: bigint }[] =
    [];
  for (const account of book.accounts()) {
    const code = account.systemCode;
    if (account.balance <= 0n || code?.startsWith("cityfund:") !== true) continue;
    const [, nationText, cityText] = code.split(":");
    const nation = Number(nationText);
    const city = Number(cityText);
    const to = Number.isInteger(nation) ? currencyOf(nation) : undefined;
    if (to === undefined || to === account.asset || !Number.isInteger(city)) continue;
    stale.push({ account: account.id, nation, city, from: account.asset, to, amount: account.balance });
  }
  let moved = 0;
  for (const fund of stale.toSorted((a, b) => a.account - b.account)) {
    const amount = convert(fund.amount, fund.from, fund.to);
    if (amount <= 0n) continue;
    book.post({
      kind: "city_fund_convert",
      atMs,
      entries: [
        { account: fund.account, amount: -fund.amount },
        { account: book.systemAccount(cityFundFxCode(fund.from), fund.from), amount: fund.amount },
        { account: book.systemAccount(cityFundFxCode(fund.to), fund.to), amount: -amount },
        { account: book.systemAccount(cityFundCode(fund.nation, fund.city, fund.to), fund.to), amount },
      ],
    });
    moved += 1;
  }
  return moved;
}
