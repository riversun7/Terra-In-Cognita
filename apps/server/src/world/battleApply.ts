// 세계 전투 결과 적용을 한 곳에 모은다 — 전투 서비스(battles.ts)가 끝 시각에 한 번 부른다(docs/adr/2026-10-31-combat-core.md 8절).
// 모든 바뀜은 기다림 없이 쓰기 대기열에 들어가고, 전투 서비스가 같은 묶음에 결과 기록(world_battle_results)을 더한다 → 한 커밋이라 두 번
// 적용되지 않는다. 차례: 부상·귀환·포로·탈취(battleResults.ts) → 장비 닳기(D-496 289·N49, 퇴각은 닳지 않음 D-514 352) → 전투 중 쓴 물약·탄
// (287) → 끝 HP·아머·쉴드(D-512) → 세계 건물·영토 비콘 피해(질문 381, battleTargets.ts). 끝나면 듣는 곳(NPC 런타임 정원사 웨이브)에 알린다.
// world.ts에서 떼었다(1,000줄 상한): 보유 물건·생명 수치·건물 서비스는 전투 서비스보다 늦게 만들어져 부를 때 찾는다.
import type { BattleInit } from "@terra/sim";
import type { WorldHoldings } from "../holdings/world.ts";
import { wearOutcomeOf } from "../holdings/rules.ts";
import type { WorldVitals } from "../vitals/world.ts";
import { type BattleItems, battleStartedAt } from "./battleItems.ts";
import { type BattleWorld, applyBattleOutcome } from "./battleResults.ts";
import { type BuildingDamageSink, applyBuildingDamage } from "./battleTargets.ts";
import type { BattleOutcome } from "./battles.ts";

/** 전투가 끝났을 때 듣는 곳(공격 편이 이겼나) */
export type BattleEndedListener = (battleId: number, attackerWon: boolean) => void;

export interface BattleApply {
  /** 전투 서비스의 apply 칸(동기, 쓰기 대기열에만 쓴다) */
  readonly apply: (battleId: number, init: BattleInit, outcome: BattleOutcome, atMs: number) => void;
  /** 듣는 곳을 붙인다. 붙기 전에 끝난 전투(부팅 때 restore가 바로 적용한 것)는 모아 두었다가 붙을 때 넘긴다 */
  readonly onEnded: (listener: BattleEndedListener) => void;
}

/** 듣는 곳이 붙기 전에 모아 두는 끝난 전투 수 상한 */
const MAX_EARLY = 1000;

export function createBattleApply(parts: {
  readonly world: BattleWorld;
  readonly holdings: () => WorldHoldings;
  readonly items: () => BattleItems;
  readonly vitals: () => WorldVitals;
  /** 세계 건물 피해를 받는 곳(건물 서비스가 만들어진 뒤) */
  readonly buildings: () => BuildingDamageSink | undefined;
  readonly log: { info(obj: object, message: string): void };
}): BattleApply {
  const listeners = new Set<BattleEndedListener>();
  const early: [number, boolean][] = [];
  return {
    apply: (battleId, init, outcome, atMs) => {
      const applied = applyBattleOutcome(parts.world, battleId, init, outcome, atMs);
      const wear = parts.holdings().service.applyBattle(
        init.seed,
        outcome.units.map((unit) => ({ unit: unit.unit, outcome: wearOutcomeOf(unit) })),
      );
      // 물약 쿨은 전투 시작 실제 시각 + 판정의 쿨 끝
      const used = parts.items().apply(outcome.units, battleStartedAt(atMs, outcome.result.endTick));
      // 끝 시각부터 전투 밖 회복을 센다
      const vitalsWritten = parts.vitals().service.applyBattle(init, outcome.units, atMs);
      const sink = parts.buildings();
      const buildings = sink ? applyBuildingDamage(sink, init, outcome, atMs) : undefined;
      parts.log.info(
        {
          battleId,
          winner: outcome.result.winner,
          reason: outcome.result.reason,
          ...applied,
          looted: String(applied.looted),
          ...wear,
          potionsUsed: used.potions,
          shots: used.shots,
          vitalsWritten,
          ...(buildings && buildings.damaged + buildings.missing > 0
            ? {
                buildingsDamaged: buildings.damaged,
                buildingsRuined: buildings.ruined,
                buildingsMissing: buildings.missing,
              }
            : {}),
        },
        "battle ended",
      );
      const attacker = init.sides.find((side) => !side.defender)?.id;
      const attackerWon = outcome.result.winner === attacker;
      if (listeners.size === 0 && early.length < MAX_EARLY) early.push([battleId, attackerWon]);
      for (const listener of listeners) listener(battleId, attackerWon);
    },
    onEnded: (listener) => {
      listeners.add(listener);
      for (const [battleId, attackerWon] of early.splice(0)) listener(battleId, attackerWon);
    },
  };
}
