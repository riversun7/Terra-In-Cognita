// 인구: 출생·수명·환생·신격화·상속 — docs/adr/2026-10-31-faction-society-core.md "인구"
// 기획: 질문 120 기본안(도시 출생: 빈 휴먼 주거 + 도시 평균 만족도 문턱 이상이면 주기마다 확률, S39), D-021·D-395(수명·환생·
// 신격화), D-332(상속: 지갑 → 상속자, 상속세 S22는 도시 국고, 없으면 전부 국고), D-438 4(환생 횟수는 그 유닛 것).
// 판정은 시드 굴림(0~9999)을 받는다. 환생·신격화는 시설 서비스(D-395) 전 단계라 수명이 다했을 때의 확률로 둔다([임시]).
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "./coefficients.ts";

/** 출생 한 번을 굴릴 수 있나(빈 주거 + 만족도 문턱) */
export function canBirth(
  population: number,
  housing: number,
  averageMilli: number,
  c: SocietyCoefficients,
): boolean {
  return population < housing && averageMilli >= c.birthSatisfactionMin * 1000;
}

/** 출생 굴림(0~9999) */
export function birthRoll(roll: number, c: SocietyCoefficients): boolean {
  return roll < c.birthPm * 10;
}

/** 수명(T4 범위 안 균등, 굴림 0~9999) */
export function lifespanMs(roll: number, c: SocietyCoefficients): number {
  return c.lifespanMinMs + Math.floor(((c.lifespanMaxMs - c.lifespanMinMs) * roll) / 10_000);
}

export type DeathFate = "reborn" | "deified" | "dead";

/** 수명이 다했을 때(굴림 0~9999): 환생(D-395·D-021) → 신격화 → 사망 */
export function deathFate(roll: number, c: SocietyCoefficients): DeathFate {
  if (roll < c.rebirthPm * 10) return "reborn";
  if (roll < (c.rebirthPm + c.deifyPm) * 10) return "deified";
  return "dead";
}

/**
 * 상속(D-332): 지갑의 자산마다 상속세(S22)를 도시 국고로, 나머지를 상속자에게 고르게(내림, 남는 몫은 국고).
 * 상속자가 없으면 전부 국고. 한 거래. 옮긴 자산 수
 */
export function inherit(
  book: LedgerBook,
  wallet: number,
  heirs: readonly number[],
  treasury: number,
  atMs: number,
  c: SocietyCoefficients,
): number {
  const entries: LedgerEntry[] = [];
  let assets = 0;
  const accounts = [...book.accounts()]
    .filter((a) => a.ownerId === wallet && a.location === null && a.balance > 0n)
    .toSorted((a, b) => a.id - b.id);
  for (const account of accounts) {
    const amount = account.balance;
    const tax = heirs.length === 0 ? amount : (amount * BigInt(c.inheritanceTaxBp)) / 10_000n;
    const share = heirs.length === 0 ? 0n : (amount - tax) / BigInt(heirs.length);
    const toTreasury = amount - share * BigInt(heirs.length);
    entries.push({ account: account.id, amount: -amount });
    if (toTreasury > 0n)
      entries.push({ account: book.ownerAccount(treasury, account.asset), amount: toTreasury });
    if (share > 0n)
      for (const heir of heirs)
        entries.push({ account: book.ownerAccount(heir, account.asset), amount: share });
    assets += 1;
  }
  if (entries.length > 0) book.post({ kind: "inherit", atMs, entries });
  return assets;
}
