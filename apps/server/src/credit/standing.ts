// 신용 소속 훑기(줄기 governance-5 — 사용자 결정 D-584 "신용은 그 사람이 속한 나라에 대한 점수 하나, 그 나라에 속한 기간에 따라 저절로 오른다") —
// docs/adr/2026-11-21-credit.md "바뀜 (governance-5)". 나라 의결 틱(governance/attach.ts, 1분마다)이 부른다.
// - 주인 → 나라: 사용자 주인(세력 주인이 아님)마다 그 사람의 나라 = 가문 소속 나라(world/houseTies.ts memberNationOf) → 없으면 사이보그 시민권
//   (governance/port.ts viewerNation과 같은 규칙). 세력 행 → 그 나라 국고 주인 ID(거울 세계 세력 ID — 주민세 빚이 적는 나라와 같은 ID).
// - 신용 장부(credit/book.ts sweep)가 나라가 바뀐 주인의 소속 줄을 새로 만들고, 하루 한 번 사업장 운영 몫을 더한다.
import type { World } from "../world/world.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import { creditBookOf } from "./book.ts";

type CreditWorld = Pick<World, "status" | "npc" | "persistence">;

/** 사용자 주인 → 나라(국고 주인 ID). 세계가 준비되지 않았으면 빈 표 */
export function creditBelongs(world: CreditWorld | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (world?.status().state !== "ready" || !world.npc || !world.persistence) return out;
  const { npc, persistence } = world;
  const ties = houseTiesOf(persistence);
  for (const [ownerId, row] of persistence.owners) {
    if (row.userId === null || row.factionId !== null) continue;
    const nationRow = ties?.memberNationOf(row.userId) ?? persistence.cyborgs.record(row.userId)?.factionId;
    if (nationRow === undefined || nationRow === null) continue;
    const nationOwner = npc.houses.ownerOfRow(nationRow);
    if (nationOwner !== undefined) out.set(ownerId, nationOwner);
  }
  return out;
}

/** 한 번 훑는다(장부가 없으면 아무것도 하지 않는다) */
export function sweepCreditStandings(world: CreditWorld | undefined, nowMs: number): void {
  const ledger = world?.persistence?.ledger;
  const book = ledger ? creditBookOf(ledger) : undefined;
  if (!book) return;
  book.sweep(nowMs, creditBelongs(world));
}

/** 사용자의 주인 ID(사용자 주인이 없으면 undefined) — 쿠데타 신용 고리가 쓴다 */
export function creditOwnerOfUser(world: CreditWorld | undefined, userId: string): number | undefined {
  for (const [ownerId, row] of world?.persistence?.owners ?? [])
    if (row.userId === userId && row.factionId === null) return ownerId;
  return undefined;
}
