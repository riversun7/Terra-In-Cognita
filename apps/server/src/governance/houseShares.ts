// 가문 지분 계정 — 기획 D-338(사용자 선택, "국고" 대안 기각: "독재 나라 도시의 주식 1000주 = 지배 가문 계정 소유. 세금 정산 ③ = 지배 가문 계정으로
// 배당"), D-344(지배 가문 과반)·D-298(국고 지분의 의결권은 국고 — 지도자가 사적으로 갖지 않는다). 줄기 governance-2.
// - 계정 = 원장 시스템 계정 shares:house:<가문 꼬리><share_도시>(@terra/sim houseShareCode). 가문 꼬리 = 플레이어 가문 "<세력 행>:" · NPC 가문 "npc:<ID>:" —
//   가문 돈 금고(vault:house:<가문 꼬리><자산>)와 같은 꼬리라 배당(@terra/sim payCityProfit)이 그 금고로 간다. 가문은 소유 주체가 아니라(NPC 가문은 세력 행이
//   없고, 도시 없는 플레이어 가문도 주체가 없다) 시스템 계정에 둔다.
// - 독재 나라: 국고가 가진 도시 지분을 지배 가문 계정으로 옮긴다(treasurySharesToHouse — 의결 틱마다 멱등: 새 도시 발행·점령 재발행이 국고에 넣은 몫도
//   다음 틱에 옮긴다. NAS 옛 세계는 첫 틱에 모두 옮긴다). 지배 가문이 바뀌어도 이미 가진 지분은 그 가문에 남는다 [임시 질문 2432].
// - 군사 쿠데타의 몰수(D-293·D-338 — 질문 2401 일부 답: 모든 다른 주주 지분 → 지배 가문 계정): confiscateSharesToHouse. 쿠데타를 일으키는 길(조건·누가·실패)은
//   사용자에게 묻는 중이라 이 함수를 부르는 곳은 없다.
import { type HouseKey, isHouseKey } from "@terra/shared/governance";
import {
  type LedgerBook,
  type LedgerEntry,
  holdingsOf,
  houseHoldingsOf,
  houseShareCode,
  moveSharesToHouse,
  shareAsset,
} from "@terra/sim";

/** 가문 열쇠 → 가문 꼬리(p:12 → "12:", n:5 → "npc:5:") */
export function houseTailOf(key: HouseKey): string {
  return key.startsWith("n:") ? `npc:${key.slice(2)}:` : `${key.slice(2)}:`;
}

/** 가문 꼬리 → 가문 열쇠. 꼴이 틀리면 undefined */
export function houseKeyOfTail(tail: string): HouseKey | undefined {
  const npc = /^npc:(\d+):$/.exec(tail);
  const key = npc ? `n:${npc[1] ?? ""}` : /^\d+:$/.test(tail) ? `p:${tail.slice(0, -1)}` : "";
  return isHouseKey(key) ? key : undefined;
}

/** 그 도시들의 국고 지분을 지배 가문 계정으로 옮긴다(도시마다 옮긴 주 수 — 0인 도시는 뺀다). 멱등(국고에 없으면 아무것도 안 한다) */
export function treasurySharesToHouse(
  book: LedgerBook,
  cities: readonly number[],
  treasury: number,
  key: HouseKey,
  atMs: number,
): { readonly cityId: number; readonly amount: bigint }[] {
  const tail = houseTailOf(key);
  const out: { cityId: number; amount: bigint }[] = [];
  for (const cityId of cities) {
    const have = book.balanceOf(treasury, shareAsset(cityId));
    if (have <= 0n) continue;
    const moved = moveSharesToHouse(book, cityId, treasury, tail, have, atMs);
    if (moved > 0n) out.push({ cityId, amount: moved });
  }
  return out;
}

/**
 * 군사 쿠데타 몰수(질문 2401 일부 답 — D-293 점령 몰수와 같은 결, 받는 곳 = 지배 가문 계정 D-338): 그 도시들의 다른 모든 주주(주체 계정 — 국고 포함 —
 * 과 다른 가문 계정)의 지분을 지배 가문 계정으로 옮긴다(도시마다 한 거래). 옮긴 주 수 합. 부르는 곳 없음(쿠데타 길은 질문 2401).
 */
export function confiscateSharesToHouse(
  book: LedgerBook,
  cities: readonly number[],
  key: HouseKey,
  atMs: number,
): bigint {
  const tail = houseTailOf(key);
  let total = 0n;
  for (const cityId of cities) {
    const asset = shareAsset(cityId);
    const owners = holdingsOf(book, cityId);
    const houses = houseHoldingsOf(book, cityId).filter((row) => row.house !== tail);
    const seized =
      owners.reduce((sum, row) => sum + row.amount, 0n) + houses.reduce((sum, row) => sum + row.amount, 0n);
    if (seized <= 0n) continue;
    const entries: LedgerEntry[] = [
      ...owners.map((row) => ({ account: book.ownerAccount(row.owner, asset), amount: -row.amount })),
      ...houses.map((row) => ({ account: row.account, amount: -row.amount })),
      { account: book.systemAccount(houseShareCode(tail, cityId), asset), amount: seized },
    ];
    book.post({ kind: "coup_confiscate", atMs, entries });
    total += seized;
  }
  return total;
}

/** 쿠데타 충성도 벌칙(질문 2401 일부 답 — 크게 떨어짐, 설정 칸 gov_coup_satisfaction_drop): 만족도(milli)에서 뺀 값(0 아래로 안 감) */
export const coupSatisfactionAfter = (satisfactionMilli: number, dropPoints: number): number =>
  Math.max(0, satisfactionMilli - Math.max(0, Math.trunc(dropPoints)) * 1000);
