// 전투 결과를 세계에 적용 — docs/adr/2026-10-31-combat-core.md 8절, 기획 D-099·D-145(부상)·D-173(탈취)·D-187(포로)·
// D-190(퇴각 손실 없음)·D-351(사이보그 즉시 귀환)·질문 108 기본안(D-381: 진 유닛은 같은 때 안전한 곳으로, 전쟁이면 포로)
// 전투 서비스(battles.ts)가 끝 시각에 한 번 부른다. 모든 바뀜(유닛 상태·자리, 탈취 거래)은 동기로 쓰기 대기열에 들어가고,
// 전투 서비스가 같은 묶음에 결과 기록(world_battle_results)을 더한다 → 한 커밋이라 두 번 적용되지 않는다.
// 전투에서 죽지 않는다(D-099: 사망은 수명만). 전투 유닛 ID = 세계 유닛 ID, 편의 faction = 소유 주체 ID([임시] 서버 해석).
import { type BattleInit, TEST_COMBAT_COEFFICIENTS, type UnitResult, postLoot } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { BattleOutcome } from "./battles.ts";
import type { SecondMap } from "./secondMap.ts";
import { DOWNED_INJURY, type UnitCondition, injure } from "./unitCondition.ts";

export interface BattleWorld {
  /** 세계 유닛이 있는 2차맵 */
  mapOf(unitId: number): SecondMap | undefined;
  /** 그 유닛이 돌아갈 가장 가까운 안전 도시의 시청 칸(없으면 undefined → 2차맵 가운데) */
  safeCellFor(unitId: number, ownerId: number, map: SecondMap): { x: number; y: number } | undefined;
  ownerExists(ownerId: number): boolean;
  ledger: Ledger;
}

export interface AppliedOutcome {
  /** 세계에 없는 전투 유닛(건너뜀) */
  readonly missing: number;
  readonly injured: number;
  readonly returned: number;
  readonly prisoners: number;
  /** 옮긴 화물 양(자산 합) */
  readonly looted: bigint;
}

/** 유닛 화물 위치(ledger_accounts.location, [임시] 음수 = −유닛 ID) */
export const cargoLocation = (unitId: number): number => -unitId;

export function applyBattleOutcome(
  world: BattleWorld,
  battleId: number,
  init: BattleInit,
  outcome: BattleOutcome,
  atMs: number,
): AppliedOutcome {
  const winnerSide = outcome.result.winner;
  const winnerOwner = init.sides.find((side) => side.id === winnerSide)?.faction;
  const captor = winnerOwner !== undefined && world.ownerExists(winnerOwner) ? winnerOwner : undefined;
  let missing = 0;
  let injured = 0;
  let returned = 0;
  let prisoners = 0;
  const losers: { unit: number; owner: number }[] = [];
  let receiver: number | null = null;
  for (const result of [...outcome.units].toSorted((a, b) => a.unit - b.unit)) {
    const map = world.mapOf(result.unit);
    const info = map?.unitInfo(result.unit);
    if (!map || !info) {
      missing += 1;
      continue;
    }
    const next = conditionAfter(info.condition, result, captor, info.ownerId, atMs);
    if (next !== info.condition) map.setCondition(result.unit, next);
    if (result.injured) injured += 1;
    if (result.outcome === "stays" && receiver === null) receiver = cargoLocation(result.unit);
    if (result.outcome === "returned" || result.outcome === "prisoner") {
      // 질문 108 기본안·D-351: 끝나는 때 바로 가장 가까운 안전 도시로(포로는 잡은 쪽 세력의 도시)
      const owner = next.heldBy ?? info.ownerId;
      map.relocateToSafety(result.unit, world.safeCellFor(result.unit, owner, map));
      losers.push({ unit: result.unit, owner: info.ownerId });
      if (next.heldBy !== null) prisoners += 1;
      else returned += 1;
    }
  }
  // 탈취(D-173): 진 유닛(퇴각은 손실 없음 D-190)의 화물 몫을 이긴 쪽 남은 유닛의 화물로. 전투마다 한 거래(key)
  let looted = 0n;
  if (captor !== undefined && losers.length > 0) {
    const cargo = [];
    for (const account of world.ledger.accounts())
      for (const loser of losers)
        if (
          account.ownerId === loser.owner &&
          account.location === cargoLocation(loser.unit) &&
          account.balance > 0n
        )
          cargo.push({ owner: loser.owner, asset: account.asset, location: cargoLocation(loser.unit) });
    cargo.sort((a, b) => b.location - a.location || (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0));
    looted = postLoot(world.ledger, cargo, captor, TEST_COMBAT_COEFFICIENTS.lootBp, atMs, {
      toLocation: receiver,
      key: `battle:${battleId}:loot`,
    });
  }
  return { missing, injured, returned, prisoners, looted };
}

/** 유닛 하나의 다음 상태: 쓰러졌으면 부상, 전쟁에서 진 유닛(사이보그 빼고)은 포로 */
function conditionAfter(
  condition: UnitCondition,
  result: UnitResult,
  captor: number | undefined,
  ownerId: number,
  atMs: number,
): UnitCondition {
  let next = result.injured ? injure(condition, DOWNED_INJURY, atMs) : condition;
  if (result.outcome === "prisoner" && captor !== undefined && captor !== ownerId)
    next = { ...next, heldBy: captor };
  return next;
}
