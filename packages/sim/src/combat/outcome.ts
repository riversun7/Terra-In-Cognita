// 전투 결과 되돌리기 — docs/adr/2026-10-31-combat-core.md "결과", D-099·D-145(지면 부상, 사망은 수명만)·D-173(패배 탈취)·
// D-187(전쟁 포로)·D-225·D-231·D-351(사이보그 즉시 귀환)·질문 108 기본안(D-381: 진 유닛은 같은 때 가까운 안전 도시로, 전쟁이면 포로)
// 판정 밖의 정리다(같은 결과 상태 → 같은 처리). 세계(서버·시뮬)가 이 결과대로 유닛과 원장을 바꾼다.
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import type { BattleState } from "./battleTypes.ts";

/** 유닛 하나의 결과. injured = 쓰러졌었다(HP 0) → 지면 부상(D-099·D-145) */
export type UnitOutcome =
  | "stays" // 이긴 편: 그 자리에 남는다
  | "retreated" // 빠졌다(가장자리의 2차맵 자리로, 손실 없음 D-190)
  | "returned" // 진 편: 가까운 안전 도시로 바로(질문 108 기본안, 사이보그는 늘 D-351)
  | "prisoner"; // 진 편, 전쟁: 포로(D-187)

export interface UnitResult {
  readonly unit: number;
  readonly side: number;
  readonly outcome: UnitOutcome;
  readonly injured: boolean;
  /** 끝났을 때 남은 HP·아머 HP·쉴드 HP(D-512: 세계가 저장해 다음 전투·전투 밖 회복에 쓴다) */
  readonly hp: number;
  readonly armor: number;
  readonly shield: number;
}

export function resolveOutcomes(state: BattleState, options: { war: boolean }): UnitResult[] {
  const winner = state.result?.winner;
  return state.units.map((unit): UnitResult => {
    const injured = unit.hp <= 0;
    const left = {
      unit: unit.id,
      side: unit.side,
      injured,
      hp: Math.max(0, unit.hp),
      armor: Math.max(0, unit.armor),
      shield: Math.max(0, unit.shield),
    };
    if (unit.status === "retreated") return { ...left, outcome: "retreated" };
    if (unit.side === winner) return { ...left, outcome: "stays" };
    if (unit.cyborg || !options.war) return { ...left, outcome: "returned" };
    return { ...left, outcome: "prisoner" };
  });
}

export interface CargoHolding {
  readonly owner: number;
  readonly asset: string;
  readonly location: number | null;
}

/**
 * 진 쪽 화물의 일부(만분율, C19 기존 "최대 50%")를 이긴 쪽으로 옮긴다(D-173). 거래 하나, 버림.
 * 받는 곳: toLocation이 있으면 그 위치(서버: 이긴 쪽 유닛의 화물), 없으면 진 쪽 화물과 같은 위치.
 * key가 있으면 한 번만 받는 거래다(서버: 전투마다 하나). 옮긴 것이 없으면 거래를 넣지 않는다.
 */
export function postLoot(
  book: LedgerBook,
  cargo: readonly CargoHolding[],
  winnerOwner: number,
  lootBp: number,
  atMs: number,
  options: { readonly toLocation?: number | null; readonly key?: string } = {},
): bigint {
  const entries: LedgerEntry[] = [];
  let moved = 0n;
  for (const holding of cargo) {
    const take = (book.balanceOf(holding.owner, holding.asset, holding.location) * BigInt(lootBp)) / 10_000n;
    if (take <= 0n) continue;
    const to = options.toLocation === undefined ? holding.location : options.toLocation;
    entries.push({
      account: book.ownerAccount(holding.owner, holding.asset, holding.location),
      amount: -take,
    });
    entries.push({ account: book.ownerAccount(winnerOwner, holding.asset, to), amount: take });
    moved += take;
  }
  if (entries.length > 0) book.post({ kind: "loot", atMs, key: options.key, entries });
  return moved;
}
