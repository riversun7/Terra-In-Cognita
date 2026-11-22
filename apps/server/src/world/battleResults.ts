// 전투 결과를 세계에 적용 — docs/adr/2026-10-31-combat-core.md 8절, 기획 D-099·D-145·D-521(부상)·D-173(탈취)·D-187(포로)·
// D-190(퇴각 손실 없음)·D-351(사이보그 즉시 귀환)·질문 108 기본안(D-381: 진 유닛은 같은 때 안전한 곳으로, 전쟁이면 포로 — 수호신은 빼고)
// 바뀜(줄기 no-teleport-a — 사용자 결정 D-591 "어떠한 경우에도 순간이동은 없다", 질문 2655): 돌아갈 곳은 그대로, 바로 옮기지 않고 실제로 걸어간다(battleReturn.ts)
// 전투 서비스(battles.ts)가 끝 시각에 한 번 부른다. 모든 바뀜(유닛 상태·자리, 탈취 거래)은 동기로 쓰기 대기열에 들어가고,
// 전투 서비스가 같은 묶음에 결과 기록(world_battle_results)을 더한다 → 한 커밋이라 두 번 적용되지 않는다.
// 전투에서 죽지 않는다(D-099: 사망은 수명만). 전투 유닛 ID = 세계 유닛 ID, 편의 faction = 소유 주체 ID([임시] 서버 해석).
// 부상(D-521, docs/adr/2026-11-08-injury.md): 유닛마다 쓰러짐(HP 0)·잃은 HP 몫으로 확률 굴림(@terra/sim combatInjuryStage, 시뮬과 같은 함수).
import {
  type BattleInit,
  TEST_COMBAT_COEFFICIENTS,
  type UnitResult,
  combatInjuryStage,
  postLoot,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { walkBack } from "./battleReturn.ts";
import type { BattleOutcome } from "./battles.ts";
import type { SecondMap } from "./secondMap.ts";
import { type UnitCondition, injure, injuryRules } from "./unitCondition.ts";
import { UNIT_KIND_GUARDIAN } from "./unitKinds.ts";

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
    // 수호신(기획 답 456 가)은 그 도시에 머문다: 다쳐도 잡히거나 옮겨지지 않는다 [임시]
    const guardian = info.kind === UNIT_KIND_GUARDIAN;
    const spec = init.units.find((unit) => unit.id === result.unit);
    const stage = spec
      ? combatInjuryStage(
          {
            seed: init.seed,
            unit: result.unit,
            maxHp: spec.maxHp,
            startHp: spec.start?.hp ?? spec.maxHp,
            endHp: result.hp,
          },
          injuryRules(),
        )
      : 0;
    const next = conditionAfter(
      info.condition,
      result,
      stage,
      guardian ? undefined : captor,
      info.ownerId,
      atMs,
    );
    if (next !== info.condition) map.setCondition(result.unit, next);
    if (stage > 0) injured += 1;
    if (result.outcome === "stays" && receiver === null) receiver = cargoLocation(result.unit);
    if (!guardian && (result.outcome === "returned" || result.outcome === "prisoner")) {
      // 질문 108 기본안·D-351이 정한 곳(가장 가까운 안전 도시, 포로는 잡은 쪽 세력의 도시)으로 실제로 걸어간다(D-591 순간이동 없음 — 질문 2655,
      // battleReturn.ts). 닿을 때까지 쓰지 못한다
      const owner = next.heldBy ?? info.ownerId;
      walkBack(map, result.unit, world.safeCellFor(result.unit, owner, map), atMs);
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

/** 유닛 하나의 다음 상태: 굴린 부상 단계(0 = 없음), 전쟁에서 진 유닛(사이보그 빼고)은 포로 */
function conditionAfter(
  condition: UnitCondition,
  result: UnitResult,
  stage: number,
  captor: number | undefined,
  ownerId: number,
  atMs: number,
): UnitCondition {
  let next = stage > 0 ? injure(condition, stage, atMs) : condition;
  if (result.outcome === "prisoner" && captor !== undefined && captor !== ownerId)
    next = { ...next, heldBy: captor };
  return next;
}
