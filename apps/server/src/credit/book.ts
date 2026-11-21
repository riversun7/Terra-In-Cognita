// 신용 점수 장부(서버 권위) — 기획 D-581(질문 2374 답), 바뀜 사용자 결정 D-584(줄기 governance-5 — "신용은 한 점수"), docs/adr/2026-11-21-credit.md.
// - 점수: 그 주체가 속한 나라에 대한 점수 하나(도시·나라 따로가 아니다). 점수 = 시작값(낮게) + 소속 기간 몫(하루마다, 상한) + 쌓인 오른 몫(사업장 운영·쿠데타 보상)
//   − 내린 몫(갚지 않은 빚·체납 + 남는 벌점), 설정 칸 범위로 자른다(@terra/shared/credit creditScore).
// - 주체: 주민세 내는 쪽과 같게 — 집 몫(유닛 지갑)이면 그 유닛, 사업장 몫·사업장 적자·유지비면 소유 주체(주인)(2441 가). 소속 기간·오른 몫은 주인 주체만 [임시 — 질문 2495].
// - 내린 몫(표 credit_marks — 까닭 하나마다 한 줄, 점수는 nation_points 칸 하나만 쓴다. city_points는 옛 줄 호환으로 0을 적는다):
//   · 주민세 빚(debt:resident:…): 하루 끝 고리 SimHooks.residentTaxArrears(withCredit) — 빚이 늘어난 주기마다 credit_resident_nation.
//   · 사업장 적자(debt:business:…): 원장 거래를 듣다가 그 계정에 빚이 생기면 한 번 credit_business_nation. 같은 주머니(주인 = 그 나라)는 깎지 않는다.
//   · 유지비 체납(upkeep:<주인> — D-150, 질문 2447 나): 정산 고리(upkeep)가 못 낸 경계 수 × credit_upkeep. 마지막 경계를 내면(체납 끝) 지운다.
//   · 쿠데타 가담(event:coup_join:<주인>:<나라>)·같은 나라 유저 공격(event:same_nation_attack:…): 한 번마다 credit_coup_join·credit_same_nation_attack. 갚는 길이 없어 남는다.
//   · 대출 연체: 대출이 아직 없다(TODO — 대출 계정이 생기면 그 빚 계정 코드로 같은 길에 붙인다).
// - 회복: 빚 계정 잔고가 0이 되면(어느 길로든 — 다 갚음·정산·도시가 넘어가거나 폐허가 되어 탕감·건물이 사라져 탕감 2445 나) 그 줄을 지운다. 일부만 갚으면 그대로(2443 가).
// - 오른 몫(표 credit_standings — 주인마다 지금 속한 나라 한 줄): 소속 훑기(sweep, credit/standing.ts가 몇 분마다)가 주인 → 나라를 알려 준다. 나라가 바뀌면 줄을 새로
//   만든다(소속 기간·오른 몫 처음부터 [임시 — 질문 2494]). 하루에 한 번 그 주인의 돌아가는(멈추지 않은) 사업장 수 × credit_business_daily를 더한다.
// - 표: 원장마다 하나(WeakMap). 사업장 장부(createBusinessCore)가 만들 때 붙인다. 고리·조회는 원장으로 찾는다.
// 점수·크기는 정수(점). 쓰기는 월드 쓰기 대기열(원장 거래와 같은 묶음).
import { parseBusinessDebtCode } from "@terra/shared/businessBooks";
import { type CreditCause, type CreditRange, creditScore, tenureRise } from "@terra/shared/credit";
import type { BusinessCoefficients, LedgerAccount, LedgerBook, ResidentArrears } from "@terra/sim";
import { observeLedger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

const DAY_MS = 86_400_000;

/** 내린 몫 한 줄 */
export interface CreditMark {
  /** 원장 빚 시스템 계정 코드 · upkeep:<주인> · event:<종류>:<주인>:<나라> */
  readonly cause: string;
  readonly kind: CreditCause;
  readonly ownerId: number;
  /** 유닛 몫이면 그 유닛(주인 자신이면 null) */
  readonly unitId: number | null;
  /** 빚이 생긴 도시(없으면 0 — 유지비·벌점) */
  readonly cityId: number;
  readonly nationId: number;
  points: number;
  count: number;
  readonly sinceMs: number;
  updatedAtMs: number;
}

/** 주인의 지금 소속(소속 기간·오른 몫) */
export interface CreditStanding {
  readonly ownerId: number;
  readonly nationId: number;
  readonly sinceMs: number;
  rise: number;
  /** 사업장 몫을 마지막으로 더한 날(⌊ms ÷ 하루⌋) */
  roseDay: number;
  updatedAtMs: number;
}

/** 주체: 주인 자신(unitId null) 또는 그 주인의 유닛 */
export interface CreditSubject {
  readonly ownerId: number;
  readonly unitId: number | null;
}

/** 설정 칸 → 범위·크기(없는 칸은 0, 범위는 출발값과 같은 기본값) */
export interface CreditRules {
  readonly range: CreditRange;
  readonly resident: number;
  readonly business: number;
  readonly upkeep: number;
  readonly tenurePerDay: number;
  readonly tenureCap: number;
  readonly businessDaily: number;
  readonly coupJoin: number;
  readonly sameNationAttack: number;
}

const nonNegative = (value: number | undefined): number => Math.max(0, Math.trunc(value ?? 0));

export function creditRulesOf(b: BusinessCoefficients): CreditRules {
  return {
    range: {
      min: Math.trunc(b.creditMin ?? 0),
      max: Math.trunc(b.creditMax ?? 1000),
      start: Math.trunc(b.creditStart ?? 100),
    },
    resident: nonNegative(b.creditResidentNation),
    business: nonNegative(b.creditBusinessNation),
    upkeep: nonNegative(b.creditUpkeep),
    tenurePerDay: nonNegative(b.creditTenurePerDay),
    tenureCap: nonNegative(b.creditTenureCap),
    businessDaily: nonNegative(b.creditBusinessDaily),
    coupJoin: nonNegative(b.creditCoupJoin),
    sameNationAttack: nonNegative(b.creditSameNationAttack),
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
  readonly standings?: readonly CreditStanding[] | undefined;
  readonly rules: () => BusinessCoefficients;
  /** 건물 주인·도시(사업장 적자 — 없으면 깎지 않는다) */
  place(buildingId: number): CreditPlace | undefined;
  /** 그 도시의 나라(국고 주인 ID). 모르면 undefined → 깎지 않는다 */
  nationOf(cityId: number): number | undefined;
  /** 주인마다 돌아가는 사업장 수(사업장 운영 오름 — 없으면 오르지 않는다) */
  readonly operating?: (() => ReadonlyMap<number, number>) | undefined;
}

/** 남는 벌점 종류 */
export type CreditEvent = "coup_join" | "same_nation_attack";

export interface CreditBook {
  /** 그 주체의 그 나라 점수(갚지 않은 빚·남는 벌점만 내린다. 소속 기간·오른 몫은 그 주인의 지금 소속 나라일 때만) */
  score(subject: CreditSubject, nationId: number, nowMs: number): number;
  /** 그 주인과 그 주인 유닛들의 남은 내린 몫(cause 차례) */
  marksOf(ownerId: number): CreditMark[];
  /** 그 주인의 지금 소속(없으면 undefined) */
  standingOf(ownerId: number): CreditStanding | undefined;
  /** 주민세 빚이 남은 주기(SimHooks.residentTaxArrears — 빚이 늘어난 것만 깎는다) */
  residentArrears(nationId: number, arrears: readonly ResidentArrears[], nowMs: number): void;
  /** 원장 거래 하나를 본다(observeLedger로 붙는다 — 시험은 바로 부른다) */
  observe(
    atMs: number,
    entries: readonly { account: number; amount: bigint }[],
    changed: readonly Readonly<LedgerAccount>[],
  ): void;
  /** 소속 훑기: 주인 → 지금 나라(하루 한 번 돌아가는 사업장 수만큼 오른 몫 — deps.operating) */
  sweep(nowMs: number, belongs: ReadonlyMap<number, number>): void;
  /** 남는 벌점 한 번(그 주인의 지금 소속 나라 — 모르면 false) */
  event(ownerId: number, kind: CreditEvent, nowMs: number): boolean;
  /** 오른 몫 더하기(쿠데타 이긴 편 보상 등 — 지금 소속 나라. 모르면 false) */
  bonus(ownerId: number, amount: number, nowMs: number): boolean;
  /**
   * 새 나라에서 처음부터(쿠데타로 떨어져 나간 새 나라 — D-585: 새 나라 신용은 처음부터, 이긴 편 참가자는 시작 가산). 그 주인 소속 줄을 그 나라로 바꾸고 오른 몫 = 가산.
   * 소속 훑기가 그 주인을 다른 나라로 보면 다시 바뀐다(그 나라에 속하지 않은 참가자는 가산이 남지 않는다 [임시 — 질문 2494])
   */
  restartAt(ownerId: number, nationId: number, bonus: number, nowMs: number): void;
  /** 정산 한 번의 유지비(못 낸 경계 수·마지막 경계를 냈나 — 모르면 undefined) */
  upkeep(ownerId: number, unpaid: number, lastPaid: boolean | null | undefined, nowMs: number): void;
  rules(): CreditRules;
  /** 메모리 불변 조건: 몫은 0 이상, 횟수 1 이상 */
  check(): string[];
}

const DEBT_HEAD = "debt:";
const UPKEEP_HEAD = "upkeep:";

export function createCreditBook(deps: CreditBookDeps): CreditBook {
  const marks = new Map<string, CreditMark>(deps.loaded.map((mark) => [mark.cause, { ...mark }]));
  const standings = new Map<number, CreditStanding>(
    (deps.standings ?? []).map((row) => [row.ownerId, { ...row }]),
  );
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
      city_points: 0,
      nation_points: mark.points,
      count: mark.count,
      since_ms: mark.sinceMs,
      updated_at_ms: mark.updatedAtMs,
    });
  const saveStanding = (row: CreditStanding): void =>
    deps.writer.upsert("creditStandings", {
      owner_id: row.ownerId,
      nation_id: row.nationId,
      since_ms: row.sinceMs,
      rise: row.rise,
      rose_day: row.roseDay,
      updated_at_ms: row.updatedAtMs,
    });
  const restore = (cause: string): void => {
    if (!marks.delete(cause)) return;
    deps.writer.remove("creditMarks", { cause });
  };
  /** 아직 남은 몫인가: 빚 계정 줄은 잔고가 음수일 때만(계정을 모르면 갚은 것으로 본다), 유지비·벌점은 줄이 있는 동안 */
  const open = (cause: string): boolean => {
    if (!cause.startsWith(DEBT_HEAD)) return true;
    const account = accountOf.get(cause);
    return account !== undefined && deps.ledger.balance(account) < 0n;
  };
  // 켤 때 이미 갚은(또는 계정이 없는) 빚 줄은 지운다
  for (const cause of marks.keys()) if (!open(cause)) restore(cause);

  const addPoints = (
    base: Omit<CreditMark, "points" | "count" | "updatedAtMs">,
    points: number,
    times: number,
    nowMs: number,
  ) => {
    if (points <= 0 || times <= 0) return;
    const mark: CreditMark = marks.get(base.cause) ?? { ...base, points: 0, count: 0, updatedAtMs: nowMs };
    mark.points += points;
    mark.count += times;
    mark.updatedAtMs = nowMs;
    marks.set(mark.cause, mark);
    save(mark);
  };

  const businessMark = (code: string, atMs: number): void => {
    const parsed = parseBusinessDebtCode(code);
    if (!parsed) return;
    const place = deps.place(parsed.buildingId);
    if (!place || place.ownerId === null || place.cityId === null) return;
    const nationId = deps.nationOf(place.cityId);
    if (nationId === undefined || nationId === place.ownerId) return;
    const rules = creditRulesOf(deps.rules());
    addPoints(
      {
        cause: code,
        kind: "business",
        ownerId: place.ownerId,
        unitId: null,
        cityId: place.cityId,
        nationId,
        sinceMs: atMs,
      },
      rules.business,
      1,
      atMs,
    );
  };

  const cutOf = (subject: CreditSubject, nationId: number): number => {
    let cut = 0;
    for (const mark of marks.values()) {
      if (mark.ownerId !== subject.ownerId || mark.unitId !== subject.unitId || mark.nationId !== nationId)
        continue;
      if (open(mark.cause)) cut += mark.points;
    }
    return cut;
  };

  return {
    score(subject, nationId, nowMs) {
      const rules = creditRulesOf(deps.rules());
      const standing = subject.unitId === null ? standings.get(subject.ownerId) : undefined;
      const own = standing?.nationId === nationId ? standing : undefined;
      return creditScore(rules.range, {
        tenure: own ? tenureRise(own.sinceMs, nowMs, rules.tenurePerDay, rules.tenureCap) : 0,
        rise: own?.rise ?? 0,
        cut: cutOf(subject, nationId),
      });
    },
    marksOf: (ownerId) =>
      [...marks.values()]
        .filter((mark) => mark.ownerId === ownerId && open(mark.cause))
        .toSorted((a, b) => (a.cause < b.cause ? -1 : a.cause > b.cause ? 1 : 0)),
    standingOf: (ownerId) => standings.get(ownerId),
    residentArrears(nationId, arrears, nowMs) {
      const rules = creditRulesOf(deps.rules());
      if (rules.resident === 0) return;
      for (const entry of arrears) {
        if (entry.added <= 0n || entry.payer === nationId) continue;
        // 빚 계정 ID는 방금 그 거래(resident_tax)를 들을 때 알았다. 못 들었으면(시험 장부) 한 번 찾는다
        if (!accountOf.has(entry.code))
          for (const account of deps.ledger.accounts())
            if (account.systemCode === entry.code) accountOf.set(entry.code, account.id);
        addPoints(
          {
            cause: entry.code,
            kind: "resident",
            ownerId: entry.payer,
            unitId: entry.unit ?? null,
            cityId: entry.city,
            nationId,
            sinceMs: nowMs,
          },
          rules.resident,
          1,
          nowMs,
        );
      }
    },
    observe(atMs, entries, changed) {
      for (const account of changed) {
        const code = account.systemCode;
        if (code === null || !code.startsWith(DEBT_HEAD)) continue;
        accountOf.set(code, account.id);
        if (account.balance >= 0n) {
          // 다 갚음·탕감 → 그 빚으로 깎은 몫을 바로 되돌린다(일부만 갚으면 여기 오지 않는다 — 2443 가)
          restore(code);
          continue;
        }
        if (marks.has(code)) continue;
        // 사업장 적자가 새로 생겼다(그 계정으로 빚이 늘어난 거래)
        const grew = entries.some((entry) => entry.account === account.id && entry.amount < 0n);
        if (grew) businessMark(code, atMs);
      }
    },
    sweep(nowMs, belongs) {
      const rules = creditRulesOf(deps.rules());
      let operating: ReadonlyMap<number, number> | undefined;
      const today = Math.floor(nowMs / DAY_MS);
      for (const [ownerId, nationId] of belongs) {
        let row = standings.get(ownerId);
        if (!row || row.nationId !== nationId) {
          // 처음 보거나 나라를 옮겼다: 소속 기간·오른 몫을 처음부터 [임시 — 질문 2494]
          row = { ownerId, nationId, sinceMs: nowMs, rise: 0, roseDay: today, updatedAtMs: nowMs };
          standings.set(ownerId, row);
          saveStanding(row);
          continue;
        }
        if (row.roseDay >= today) continue;
        row.roseDay = today;
        operating ??= deps.operating?.() ?? new Map<number, number>();
        row.rise += (operating.get(ownerId) ?? 0) * rules.businessDaily;
        row.updatedAtMs = nowMs;
        saveStanding(row);
      }
    },
    event(ownerId, kind, nowMs) {
      const nationId = standings.get(ownerId)?.nationId;
      if (nationId === undefined) return false;
      const rules = creditRulesOf(deps.rules());
      addPoints(
        {
          cause: `event:${kind}:${ownerId}:${nationId}`,
          kind,
          ownerId,
          unitId: null,
          cityId: 0,
          nationId,
          sinceMs: nowMs,
        },
        kind === "coup_join" ? rules.coupJoin : rules.sameNationAttack,
        1,
        nowMs,
      );
      return true;
    },
    bonus(ownerId, amount, nowMs) {
      const row = standings.get(ownerId);
      if (!row) return false;
      const add = Math.max(0, Math.trunc(amount));
      if (add === 0) return true;
      row.rise += add;
      row.updatedAtMs = nowMs;
      saveStanding(row);
      return true;
    },
    restartAt(ownerId, nationId, bonus, nowMs) {
      const row: CreditStanding = {
        ownerId,
        nationId,
        sinceMs: nowMs,
        rise: Math.max(0, Math.trunc(bonus)),
        roseDay: Math.floor(nowMs / DAY_MS),
        updatedAtMs: nowMs,
      };
      standings.set(ownerId, row);
      saveStanding(row);
    },
    upkeep(ownerId, unpaid, lastPaid, nowMs) {
      const cause = `${UPKEEP_HEAD}${ownerId}`;
      // 마지막 경계를 냈다 = 체납이 끝났다 → 되돌린다(D-150 체납 하나 = 줄 하나)
      if (lastPaid === true) {
        restore(cause);
        return;
      }
      const nationId = standings.get(ownerId)?.nationId;
      if (nationId === undefined || unpaid <= 0) return;
      const rules = creditRulesOf(deps.rules());
      addPoints(
        { cause, kind: "upkeep", ownerId, unitId: null, cityId: 0, nationId, sinceMs: nowMs },
        rules.upkeep * unpaid,
        unpaid,
        nowMs,
      );
    },
    rules: () => creditRulesOf(deps.rules()),
    check() {
      const issues: string[] = [];
      for (const mark of marks.values())
        if (mark.points < 0 || mark.count < 1)
          issues.push(`credit mark ${mark.cause}: points ${mark.points} count ${mark.count}`);
      for (const row of standings.values())
        if (row.rise < 0) issues.push(`credit standing ${row.ownerId}: rise ${row.rise}`);
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
