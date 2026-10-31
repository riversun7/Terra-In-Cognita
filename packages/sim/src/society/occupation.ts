// 점령 처리 — docs/adr/2026-10-31-faction-society-core.md "점령", 기획 46 §5.1, D-186·D-293·D-297~D-299·D-339·D-342~D-348,
// 질문 105·106 기본안(D-381). 판단(무엇을 고를지)은 부르는 쪽(NPC 두뇌 = R5, 지금은 대리 판단)이고, 이 파일은 규칙만 한다.
// ① 약탈·통합(점령자 선택) ② 체제 = 점령 세력 체제 ③ 지분: 상장폐지(모두 소각 + 만족도·관계 감소) | 지분 유지(옛 통치자 몫 →
//   점령 세력의 주인). 독재 점령국은 몰수 몫으로 지배 가문이 과반이 안 되면 상장폐지만(D-346 해석). 상장폐지한 도시는 새 지분
//   (주식 수 = 설정값 delistReissueShares)을 점령국 체제대로 낸다(D-444 163): 자본주의·민주주의 = 점령 세력 국고(D-298·D-345),
//   독재 = 지배 가문 과반 + 나머지는 지배 가문이 충성 보상으로 나눔(D-338·D-344·D-349, 비율 = 설정값 delistLoyaltyPm).
//   몰수 몫도 같은 주인에게 간다(46 §5.1 "자본주의·민주주의 = 국고, 독재 = 지배 가문" 해석)
// ④ 도시 안 사유 자산 주인 모두에게 편입 제안 {대상, 기한, 상태}: 기한 동안 건물 정지·세금은 점령자, 수락 = 소유 유지 +
//   소속 변경, 거부·만료 = 위치 있는 물건(질문 105) 이전 + 적대 표시(질문 106) ⑤ 복원 모금(shares.ts allocateShares)
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "./coefficients.ts";
import {
  type Holding,
  type Regime,
  allocateShares,
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

/** 점령 세력 쪽에서 지분을 받는 주체들(③) */
export interface ShareOccupier {
  /** 점령 세력 국고 주체 */
  readonly treasury: number;
  readonly regime: Regime;
  /** 지배 가문 주체(독재 지분의 주인, D-338). 가문이 따로 없으면 국고와 같게 준다 */
  readonly rulingFamily: number;
  /** 지배 가문이 충성 보상으로 재발행 지분을 나눠 줄 가문(독재, D-344·D-349). 비면 지배 가문이 다 가진다 */
  readonly loyalists?: readonly number[] | undefined;
}

/** 몰수 몫·재발행 지분의 주인(46 §5.1): 독재 = 지배 가문, 자본주의·민주주의 = 국고 */
export function shareOwnerOf(occupier: ShareOccupier): number {
  return occupier.regime === "dictatorship" ? occupier.rulingFamily : occupier.treasury;
}

/**
 * 상장폐지 뒤 새로 내는 지분(D-444 163). 자본주의·민주주의 = 국고가 전부. 독재 = 충성 보상 몫(설정값 ‰, 내림)을 가문들에
 * 고르게(가장 큰 나머지, 같으면 주체 ID 작은 쪽) 나누고 나머지는 지배 가문. 보상 몫은 지배 가문이 과반을 지키는 만큼까지만
 */
export function reissueHolders(occupier: ShareOccupier, c: SocietyCoefficients): Holding[] {
  const total = BigInt(c.delistReissueShares);
  const owner = shareOwnerOf(occupier);
  const loyalists = [...new Set(occupier.loyalists ?? [])].filter((id) => id !== owner);
  if (occupier.regime !== "dictatorship" || loyalists.length === 0)
    return total > 0n ? [{ owner, amount: total }] : [];
  const wanted = (total * BigInt(Math.max(0, c.delistLoyaltyPm))) / 1000n;
  // 지배 가문 > 50%: 보상 몫 ≤ ⌊(전체 − 1) ÷ 2⌋
  const cap = total > 0n ? (total - 1n) / 2n : 0n;
  const reward = wanted < cap ? wanted : cap;
  const rewards = allocateShares(
    loyalists.map((id) => ({ owner: id, amount: 1n })),
    reward,
  );
  return [{ owner, amount: total - reward }, ...rewards]
    .filter((h) => h.amount > 0n)
    .toSorted((a, b) => a.owner - b.owner);
}

/**
 * 지분 처리(③): keep = 옛 통치자 몫을 점령 세력의 주인에게(자본주의·민주주의 = 국고 D-298, 독재 = 지배 가문), delist = 모두
 * 소각 후 새 주식(delistReissueShares)을 체제대로(reissueHolders, D-444). 독재 점령국은 결과에서 지배 가문이 과반이 아니면
 * delist로 바꾼다(D-346)
 */
export function settleShares(
  book: LedgerBook,
  cityId: number,
  oldRuler: number,
  occupier: ShareOccupier,
  choice: ShareChoice,
  atMs: number,
  c: SocietyCoefficients,
): ShareChoice {
  const holdings = holdingsOf(book, cityId);
  const owner = shareOwnerOf(occupier);
  let decided = choice;
  if (decided === "keep" && occupier.regime === "dictatorship") {
    const after = mergeHoldings(holdings, oldRuler, owner);
    if (!rulerHasMajority(after, owner)) decided = "delist";
  }
  if (decided === "keep") {
    const seized = holdings.find((h) => h.owner === oldRuler)?.amount ?? 0n;
    if (seized > 0n && oldRuler !== owner) {
      const asset = shareAsset(cityId);
      book.post({
        kind: "transfer",
        atMs,
        entries: [
          { account: book.ownerAccount(oldRuler, asset), amount: -seized },
          { account: book.ownerAccount(owner, asset), amount: seized },
        ],
      });
    }
    return "keep";
  }
  burnShares(book, cityId, atMs);
  issueShares(book, cityId, reissueHolders(occupier, c), atMs);
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
