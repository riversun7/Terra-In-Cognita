// 신용 점수 장부(서버 권위) — 기획 D-581(질문 2374 답), docs/adr/2026-11-21-credit.md.
// - 주체: 도시 주민·나라 주민. 주민세 내는 쪽과 같게 — 집 몫(유닛 지갑)이면 그 유닛, 사업장 몫·사업장 적자면 소유 주체(주인). 범위: 도시 신용과 나라 신용을 따로.
// - 깎은 몫: 갚지 않은 빚(원장 빚 시스템 계정) 하나마다 한 줄(표 credit_marks). 점수 = 시작값 − 그 범위 깎은 몫 합, 설정 칸 범위로 자른다(@terra/shared/credit).
//   · 주민세 빚(debt:resident:… — @terra/sim residentTax.ts): 하루 끝 고리 SimHooks.residentTaxArrears(withCredit)로 받는다. 빚이 늘어난 주기마다
//     credit_resident_city·_nation을 더한다(같은 빚이면 같은 줄에 쌓는다).
//   · 사업장 적자(debt:business:… — business/core.ts advance): 원장 거래를 듣다가 그 계정에 빚이 생기면(그 계정 줄이 없을 때) 한 번 credit_business_city·_nation.
//     건물 주인(그때)·건물이 선 도시·그 도시 국고 주인으로 적는다. 같은 주머니(주인 = 그 나라 — NPC 제 도시 사업장)는 깎지 않는다(주민세·소득세와 같은 규칙).
//   · 대출 연체: 대출이 아직 없다(TODO — 대출 계정이 생기면 그 빚 계정 코드로 같은 길에 붙인다).
// - 회복: 빚 계정 잔고가 0이 되면(어느 길로든 — 다음 주기에 갚음·사업장 넣기·정산·도시가 넘어가거나 폐허가 되어 탕감) 그 줄을 지운다 = 그 빚으로 깎은 몫을 바로
//   모두 되돌린다(D-581 "갚으면 바로 회복"). 원장 거래를 듣고(economy/ledger.ts observeLedger), 점수를 셀 때도 빚 계정이 아직 음수인 줄만 센다(듣기 전에 갚은
//   빚 — 켤 때 등 — 도 점수에 들지 않는다). 켤 때 이미 갚은 줄은 지운다.
// - 표: 원장마다 하나(WeakMap — business/withhold.ts와 같은 꼴). 사업장 장부(createBusinessCore)가 만들 때 붙인다. 고리·조회는 원장으로 찾는다.
// 점수·깎는 크기는 정수(점). 쓰기는 월드 쓰기 대기열(원장 거래와 같은 묶음).
import { parseBusinessDebtCode } from "@terra/shared/businessBooks";
import { type CreditCause, type CreditRange, creditScore } from "@terra/shared/credit";
import type { BusinessCoefficients, LedgerAccount, LedgerBook, ResidentArrears } from "@terra/sim";
import { observeLedger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 깎은 몫 한 줄(갚지 않은 빚 하나) */
export interface CreditMark {
  /** 원장 빚 시스템 계정 코드 */
  readonly cause: string;
  readonly kind: CreditCause;
  readonly ownerId: number;
  /** 유닛 몫이면 그 유닛(주인 자신이면 null) */
  readonly unitId: number | null;
  readonly cityId: number;
  readonly nationId: number;
  cityPoints: number;
  nationPoints: number;
  count: number;
  readonly sinceMs: number;
  updatedAtMs: number;
}

/** 주체: 주인 자신(unitId null) 또는 그 주인의 유닛 */
export interface CreditSubject {
  readonly ownerId: number;
  readonly unitId: number | null;
}

/** 범위: 도시 신용(도시 ID) 또는 나라 신용(국고 주인 ID) */
export type CreditScope = { readonly city: number } | { readonly nation: number };

/** 설정 칸 → 범위·깎는 크기(없는 칸은 출발값과 같은 기본값) */
export interface CreditRules {
  readonly range: CreditRange;
  readonly residentCity: number;
  readonly residentNation: number;
  readonly businessCity: number;
  readonly businessNation: number;
}

const nonNegative = (value: number | undefined, fallback: number): number =>
  Math.max(0, Math.trunc(value ?? fallback));

export function creditRulesOf(b: BusinessCoefficients): CreditRules {
  return {
    range: {
      min: Math.trunc(b.creditMin ?? 0),
      max: Math.trunc(b.creditMax ?? 1000),
      start: Math.trunc(b.creditStart ?? 1000),
    },
    residentCity: nonNegative(b.creditResidentCity, 0),
    residentNation: nonNegative(b.creditResidentNation, 0),
    businessCity: nonNegative(b.creditBusinessCity, 0),
    businessNation: nonNegative(b.creditBusinessNation, 0),
  };
}

/** 사업장 자리(건물 주인·도시) — business/core.ts BusinessPlace와 같은 꼴 */
export interface CreditPlace {
  readonly ownerId: number | null;
  readonly cityId: number | null;
}

export interface CreditBookDeps {
  readonly ledger: Pick<LedgerBook, "accounts" | "balance">;
  readonly writer: Pick<WorldWriter, "upsert" | "remove">;
  readonly loaded: readonly CreditMark[];
  readonly rules: () => BusinessCoefficients;
  /** 건물 주인·도시(사업장 적자 — 없으면 깎지 않는다) */
  place(buildingId: number): CreditPlace | undefined;
  /** 그 도시의 나라(국고 주인 ID). 모르면 undefined → 깎지 않는다 */
  nationOf(cityId: number): number | undefined;
}

export interface CreditBook {
  /** 그 주체·범위의 점수(갚지 않은 빚만 센다) */
  score(subject: CreditSubject, scope: CreditScope): number;
  /** 그 주인과 그 주인 유닛들의 갚지 않은 깎은 몫(cause 차례) */
  marksOf(ownerId: number): CreditMark[];
  /** 주민세 빚이 남은 주기(SimHooks.residentTaxArrears — 빚이 늘어난 것만 깎는다) */
  residentArrears(nationId: number, arrears: readonly ResidentArrears[], nowMs: number): void;
  /** 원장 거래 하나를 본다(observeLedger로 붙는다 — 시험은 바로 부른다) */
  observe(
    atMs: number,
    entries: readonly { account: number; amount: bigint }[],
    changed: readonly Readonly<LedgerAccount>[],
  ): void;
  rules(): CreditRules;
  /** 메모리 불변 조건: 깎은 몫은 0 이상, 횟수 1 이상 */
  check(): string[];
}

const DEBT_HEAD = "debt:";

export function createCreditBook(deps: CreditBookDeps): CreditBook {
  const marks = new Map<string, CreditMark>(deps.loaded.map((mark) => [mark.cause, { ...mark }]));
  /** 빚 계정 코드 → 계정 ID(점수를 셀 때 잔고를 본다) */
  const accountOf = new Map<string, number>();
  if (marks.size > 0)
    for (const account of deps.ledger.accounts())
      if (account.systemCode !== null && marks.has(account.systemCode))
        accountOf.set(account.systemCode, account.id);

  const save = (mark: CreditMark): void =>
    deps.writer.upsert("creditMarks", {
      cause: mark.cause,
      kind: mark.kind,
      owner_id: mark.ownerId,
      unit_id: mark.unitId,
      city_id: mark.cityId,
      nation_id: mark.nationId,
      city_points: mark.cityPoints,
      nation_points: mark.nationPoints,
      count: mark.count,
      since_ms: mark.sinceMs,
      updated_at_ms: mark.updatedAtMs,
    });
  const restore = (cause: string): void => {
    if (!marks.delete(cause)) return;
    deps.writer.remove("creditMarks", { cause });
  };
  /** 갚지 않은 빚인가(계정을 모르면 갚은 것으로 본다) */
  const open = (cause: string): boolean => {
    const account = accountOf.get(cause);
    return account !== undefined && deps.ledger.balance(account) < 0n;
  };
  // 켤 때 이미 갚은(또는 계정이 없는) 줄은 지운다
  for (const cause of [...marks.keys()]) if (!open(cause)) restore(cause);

  const businessMark = (code: string, atMs: number): void => {
    const parsed = parseBusinessDebtCode(code);
    if (!parsed) return;
    const place = deps.place(parsed.buildingId);
    if (!place || place.ownerId === null || place.cityId === null) return;
    const nationId = deps.nationOf(place.cityId);
    if (nationId === undefined || nationId === place.ownerId) return;
    const rules = creditRulesOf(deps.rules());
    if (rules.businessCity === 0 && rules.businessNation === 0) return;
    const mark: CreditMark = {
      cause: code,
      kind: "business",
      ownerId: place.ownerId,
      unitId: null,
      cityId: place.cityId,
      nationId,
      cityPoints: rules.businessCity,
      nationPoints: rules.businessNation,
      count: 1,
      sinceMs: atMs,
      updatedAtMs: atMs,
    };
    marks.set(code, mark);
    save(mark);
  };

  const sumOf = (subject: CreditSubject, scope: CreditScope): number => {
    let cut = 0;
    for (const mark of marks.values()) {
      if (mark.ownerId !== subject.ownerId || mark.unitId !== subject.unitId) continue;
      if ("city" in scope ? mark.cityId !== scope.city : mark.nationId !== scope.nation) continue;
      if (!open(mark.cause)) continue;
      cut += "city" in scope ? mark.cityPoints : mark.nationPoints;
    }
    return cut;
  };

  return {
    score: (subject, scope) => creditScore(creditRulesOf(deps.rules()).range, sumOf(subject, scope)),
    marksOf: (ownerId) =>
      [...marks.values()]
        .filter((mark) => mark.ownerId === ownerId && open(mark.cause))
        .toSorted((a, b) => (a.cause < b.cause ? -1 : a.cause > b.cause ? 1 : 0)),
    residentArrears(nationId, arrears, nowMs) {
      const rules = creditRulesOf(deps.rules());
      if (rules.residentCity === 0 && rules.residentNation === 0) return;
      for (const entry of arrears) {
        if (entry.added <= 0n || entry.payer === nationId) continue;
        // 빚 계정 ID는 방금 그 거래(resident_tax)를 들을 때 알았다. 못 들었으면(시험 장부) 한 번 찾는다
        if (!accountOf.has(entry.code))
          for (const account of deps.ledger.accounts())
            if (account.systemCode === entry.code) accountOf.set(entry.code, account.id);
        const found = marks.get(entry.code);
        const mark: CreditMark = found ?? {
          cause: entry.code,
          kind: "resident",
          ownerId: entry.payer,
          unitId: entry.unit ?? null,
          cityId: entry.city,
          nationId,
          cityPoints: 0,
          nationPoints: 0,
          count: 0,
          sinceMs: nowMs,
          updatedAtMs: nowMs,
        };
        mark.cityPoints += rules.residentCity;
        mark.nationPoints += rules.residentNation;
        mark.count += 1;
        mark.updatedAtMs = nowMs;
        marks.set(entry.code, mark);
        save(mark);
      }
    },
    observe(atMs, entries, changed) {
      for (const account of changed) {
        const code = account.systemCode;
        if (code === null || !code.startsWith(DEBT_HEAD)) continue;
        accountOf.set(code, account.id);
        if (account.balance >= 0n) {
          // 다 갚음·탕감 → 그 빚으로 깎은 몫을 바로 되돌린다
          restore(code);
          continue;
        }
        if (marks.has(code)) continue;
        // 사업장 적자가 새로 생겼다(그 계정으로 빚이 늘어난 거래)
        const grew = entries.some((entry) => entry.account === account.id && entry.amount < 0n);
        if (grew) businessMark(code, atMs);
      }
    },
    rules: () => creditRulesOf(deps.rules()),
    check() {
      const issues: string[] = [];
      for (const mark of marks.values())
        if (mark.cityPoints < 0 || mark.nationPoints < 0 || mark.count < 1)
          issues.push(
            `credit mark ${mark.cause}: points ${mark.cityPoints}/${mark.nationPoints} count ${mark.count}`,
          );
      return issues;
    },
  };
}

const books = new WeakMap<object, CreditBook>();

/** 그 원장의 신용 장부(붙기 전이면 undefined — 깎지 않고, 점수는 모두 시작값) */
export function creditBookOf(ledger: object): CreditBook | undefined {
  return books.get(ledger);
}

/** 신용 장부를 만들어 원장에 붙이고 원장 거래를 듣는다(마지막에 붙인 것이 이긴다 — 세계 하나에 사업장 장부 하나) */
export function attachCreditBook(deps: CreditBookDeps & { readonly ledger: LedgerBook }): CreditBook {
  const book = createCreditBook(deps);
  books.set(deps.ledger, book);
  observeLedger(deps.ledger, (_txId, tx, changed) => {
    // 다른 장부가 다시 붙었으면 옛 장부는 듣지 않는다
    if (books.get(deps.ledger) === book) book.observe(tx.atMs, tx.entries, changed);
  });
  return book;
}
