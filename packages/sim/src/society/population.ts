// 인구: 수명·환생·신격화·상속 — docs/adr/2026-10-31-faction-society-core.md "인구", "바뀜 (D-469 구인 카드)"
// 기획: D-469(출생 없음 — 인구는 행정 건물 구인 카드로만 는다, society/recruitment.ts. 상속자는 소유자뿐, 유닛에게 자녀·배우자가 없다,
// D-332 대체), D-021·D-395(수명·환생·신격화), S22(상속세는 그 도시 국고), D-438 4(환생 횟수는 그 유닛 것).
// 판정은 시드 굴림(0~9999)을 받는다. 환생·신격화는 시설 서비스(D-395) 전 단계라 수명이 다했을 때의 확률로 둔다([임시]).
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "./coefficients.ts";

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
 * 상속(D-469, D-332 대체): 지갑의 자산마다 상속세(S22)를 도시 국고로, 나머지를 소유자(유저 유닛 = 그 사이보그의 주체, NPC 휴먼 = 그 세력)
 * 에게. 소유자가 없으면(null) 전부 국고. 소유자가 국고 주체와 같으면 둘이 한 계정으로 간다. 한 거래. 옮긴 자산 수
 */
export function inherit(
  book: LedgerBook,
  wallet: number,
  owner: number | null,
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
    const tax = owner === null ? amount : (amount * BigInt(c.inheritanceTaxBp)) / 10_000n;
    const share = amount - tax;
    entries.push({ account: account.id, amount: -amount });
    if (owner !== null && owner === treasury)
      entries.push({ account: book.ownerAccount(owner, account.asset), amount });
    else {
      if (tax > 0n) entries.push({ account: book.ownerAccount(treasury, account.asset), amount: tax });
      if (share > 0n && owner !== null)
        entries.push({ account: book.ownerAccount(owner, account.asset), amount: share });
    }
    assets += 1;
  }
  if (entries.length > 0) book.post({ kind: "inherit", atMs, entries });
  return assets;
}
