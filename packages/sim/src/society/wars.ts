// 전쟁·강화 규칙 — docs/adr/2026-11-01-npc-brain-r5.md 5절, 기획 46 §4.2·§4.4·45 §10.0, D-256·D-290·D-292, 질문 194~196 가
// - 선포: 전쟁이 아닌 상대를 치면 선포. 무명분 비용 = 국고의 만분율(S3, 지금은 명분 자료가 없어 모든 NPC 선포가 무명분).
// - 교전(점령·공성·조우 전투)마다 마지막 교전 시각을 둘 다 적는다. 마지막 교전부터 S5가 지나면 백지 강화(불가침 없음).
// - 강화 조약: 전쟁을 끝내고 불가침 기간(D-292 조항). 불가침은 판단이 거른다(조약은 공격을 막지 않는다, D-329 86 — 위반 기록 층 뒤).
// 판단이 아니라 규칙이다(유저 세력도 같다). 상태는 세력마다 들고(시뮬 SimFaction·서버 거울 세계), 이 함수들이 바꾼다.
import type { NpcCoefficients } from "../npc/coefficients.ts";

export interface WarState {
  /** 전쟁 중인 상대 */
  readonly wars: Set<number>;
  /** 상대 → 마지막 교전 시각 */
  readonly lastFight: Map<number, number>;
  /** 상대 → 불가침 끝 시각 */
  readonly truces: Map<number, number>;
}

/** 무명분 선포 비용(국고 × 만분율, 내림) */
export function warCost(treasury: bigint, c: NpcCoefficients): bigint {
  return treasury <= 0n ? 0n : (treasury * BigInt(c.warCostBp)) / 10_000n;
}

/** 선포(둘 다 전쟁, 교전 시각 = 지금). 불가침이 있었으면 지운다 */
export function declareWar(a: WarState, aId: number, b: WarState, bId: number, nowMs: number): void {
  a.wars.add(bId);
  b.wars.add(aId);
  a.truces.delete(bId);
  b.truces.delete(aId);
  recordFight(a, aId, b, bId, nowMs);
}

/** 교전 시각을 둘 다 적는다(전쟁 중일 때만 뜻이 있다) */
export function recordFight(a: WarState, aId: number, b: WarState, bId: number, nowMs: number): void {
  a.lastFight.set(bId, nowMs);
  b.lastFight.set(aId, nowMs);
}

/** 전쟁을 끝낸다(백지 강화·강화 조약 공통) */
export function endWar(a: WarState, aId: number, b: WarState, bId: number): void {
  a.wars.delete(bId);
  b.wars.delete(aId);
  a.lastFight.delete(bId);
  b.lastFight.delete(aId);
}

/** 강화 조약: 전쟁을 끝내고 둘 다 불가침 */
export function makePeace(
  a: WarState,
  aId: number,
  b: WarState,
  bId: number,
  nowMs: number,
  c: NpcCoefficients,
): void {
  endWar(a, aId, b, bId);
  a.truces.set(bId, nowMs + c.truceMs);
  b.truces.set(aId, nowMs + c.truceMs);
}

/** 백지 강화가 된 상대(상대 ID 차례). 교전 기록이 없으면 지금 전쟁이 시작된 것으로 보지 않고 그대로 둔다 */
export function endedWars(a: WarState, nowMs: number, c: NpcCoefficients): number[] {
  const out: number[] = [];
  for (const other of a.wars) {
    const last = a.lastFight.get(other);
    if (last !== undefined && nowMs - last >= c.whitePeaceMs) out.push(other);
  }
  return out.toSorted((x, y) => x - y);
}

/** 불가침 중인가(끝 시각 전) */
export function inTruce(a: WarState, other: number, nowMs: number): boolean {
  const until = a.truces.get(other);
  return until !== undefined && nowMs < until;
}
