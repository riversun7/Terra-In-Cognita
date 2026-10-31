// 점령 처리 — docs/adr/2026-10-31-faction-society-core.md "점령", 기획 46 §5.1, D-186·D-293·D-297~D-299·D-339·D-342~D-348,
// 질문 105·106 기본안(D-381). 판단(무엇을 고를지)은 부르는 쪽(NPC 두뇌 = R5, 지금은 대리 판단)이고, 이 파일은 규칙만 한다.
// ① 약탈·통합(점령자 선택) ② 체제 = 점령 세력 체제 ③ 지분: 상장폐지(모두 소각 + 만족도·관계 감소) | 지분 유지(옛 통치자 몫 →
//   점령 세력 국고). 독재 점령국은 몰수 몫으로 과반이 안 되면 상장폐지만(D-346 해석). 상장폐지한 도시는 새 지분 1000주를
//   점령자에게 낸다([임시] "체제 규칙으로 새 지분", 46 §5.1 ⑤)
// ④ 도시 안 사유 자산 주인 모두에게 편입 제안 {대상, 기한, 상태}: 기한 동안 건물 정지·세금은 점령자, 수락 = 소유 유지 +
//   소속 변경, 거부·만료 = 위치 있는 물건(질문 105) 이전 + 적대 표시(질문 106) ⑤ 복원 모금(shares.ts allocateShares)
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "./coefficients.ts";
import {
  type Holding,
  type Regime,
  burnShares,
  holdingsOf,
  issueShares,
  rulerHasMajority,
  shareAsset,
} from "./shares.ts";

export type Treatment = "loot" | "integrate";
export type ShareChoice = "keep" | "delist";

export interface OccupationResult {
  /** 실제로 한 지분 처리(독재 점령국은 keep을 골라도 delist가 될 수 있다) */
  readonly shares: ShareChoice;
  /** 만족도 사건(점, 음수 = 내림) */
  readonly satisfactionShift: number;
  /** 다른 세력과의 관계 점수 변화(상장폐지 S31) */
  readonly relationShift: number;
}

/**
 * 지분 처리(③): keep = 옛 통치자 몫을 점령 세력 국고로(D-298), delist = 모두 소각 후 새 1000주를 점령자에게.
 * 독재 점령국은 결과에서 과반이 아니면 delist로 바꾼다
 */
export function settleShares(
  book: LedgerBook,
  cityId: number,
  oldRuler: number,
  occupier: number,
  occupierRegime: Regime,
  choice: ShareChoice,
  atMs: number,
  c: SocietyCoefficients,
): ShareChoice {
  const holdings = holdingsOf(book, cityId);
  let decided = choice;
  if (decided === "keep" && occupierRegime === "dictatorship") {
    const after = mergeHoldings(holdings, oldRuler, occupier);
    if (!rulerHasMajority(after, occupier)) decided = "delist";
  }
  if (decided === "keep") {
    const seized = holdings.find((h) => h.owner === oldRuler)?.amount ?? 0n;
    if (seized > 0n && oldRuler !== occupier) {
      const asset = shareAsset(cityId);
      book.post({
        kind: "transfer",
        atMs,
        entries: [
          { account: book.ownerAccount(oldRuler, asset), amount: -seized },
          { account: book.ownerAccount(occupier, asset), amount: seized },
        ],
      });
    }
    return "keep";
  }
  burnShares(book, cityId, atMs);
  issueShares(book, cityId, [{ owner: occupier, amount: BigInt(c.sharesPerCity) }], atMs);
  return "delist";
}

function mergeHoldings(holdings: readonly Holding[], from: number, to: number): Holding[] {
  const moved = holdings.find((h) => h.owner === from)?.amount ?? 0n;
  const rest = holdings.filter((h) => h.owner !== from && h.owner !== to);
  const own = (holdings.find((h) => h.owner === to)?.amount ?? 0n) + moved;
  return [...rest, { owner: to, amount: own }];
}

/** 점령 한 번의 만족도·관계 사건(①②③): 약탈·통합, 상장폐지, 독재로 바뀜(D-293·S23) */
export function occupationShifts(
  treatment: Treatment,
  shares: ShareChoice,
  regimeBefore: Regime,
  regimeAfter: Regime,
  c: SocietyCoefficients,
): OccupationResult {
  let satisfaction = treatment === "loot" ? -c.lootSatisfactionDrop : -c.integrateSatisfactionDrop;
  let relation = 0;
  if (shares === "delist") {
    satisfaction -= c.delistSatisfactionDrop;
    relation -= c.delistRelationDrop;
  }
  if (regimeAfter === "dictatorship" && regimeBefore !== "dictatorship")
    satisfaction -= c.dictatorshipSatisfactionDrop;
  return { shares, satisfactionShift: satisfaction, relationShift: relation };
}

export type OfferState = "pending" | "accepted" | "refused" | "expired";

export interface IncorporationOffer {
  readonly city: number;
  readonly owner: number;
  readonly occupier: number;
  readonly deadlineMs: number;
  state: OfferState;
}

/** 편입 제안(④): 그 도시에 위치 있는 물건을 가진 주인 모두(점령자 빼고, 주체 ID 차례) */
export function makeOffers(
  book: LedgerBook,
  cityId: number,
  occupier: number,
  exclude: ReadonlySet<number>,
  nowMs: number,
  c: SocietyCoefficients,
): IncorporationOffer[] {
  const owners = new Set<number>();
  for (const account of book.accounts())
    if (
      account.ownerId !== null &&
      account.location === cityId &&
      account.balance > 0n &&
      account.ownerId !== occupier &&
      !exclude.has(account.ownerId)
    )
      owners.add(account.ownerId);
  return [...owners]
    .toSorted((a, b) => a - b)
    .map((owner) => ({
      city: cityId,
      owner,
      occupier,
      deadlineMs: nowMs + c.offerDeadlineMs,
      state: "pending",
    }));
}

/**
 * 제안을 끝낸다. accepted = 소유 유지(소속 변경은 부르는 쪽), refused·expired = 그 도시 위치 물건 모두 점령자에게(질문 105).
 * 옮긴 거래 수(0 또는 1)
 */
export function resolveOffer(
  book: LedgerBook,
  offer: IncorporationOffer,
  answer: "accepted" | "refused" | "expired",
  atMs: number,
): number {
  if (offer.state !== "pending") return 0;
  offer.state = answer;
  if (answer === "accepted") return 0;
  const entries: LedgerEntry[] = [];
  for (const account of [...book.accounts()].toSorted((a, b) => a.id - b.id)) {
    if (account.ownerId !== offer.owner || account.location !== offer.city || account.balance <= 0n) continue;
    entries.push({ account: account.id, amount: -account.balance });
    entries.push({
      account: book.ownerAccount(offer.occupier, account.asset, offer.city),
      amount: account.balance,
    });
  }
  if (entries.length === 0) return 0;
  book.post({ kind: "seize", atMs, entries });
  return 1;
}
