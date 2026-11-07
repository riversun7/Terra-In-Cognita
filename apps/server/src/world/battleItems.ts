// 세계 전투의 물건(287) — docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, D-514·287 — 전투 중 물건 쓰기)".
// 세계가 여는 전투(NPC 런타임 startBattle) 시작 자료의 세계 유닛마다, 그 유닛이 든 보유 물건에서 판정 사양 칸을 붙인다:
// - 자동 물약(D-510): 든 물약(물약 쿨 종류, 회복 줄이 있는 것)·HP 문턱(설정 칸 d510_potion_hp_threshold — 유닛 AI 작전 슬라이더 D-5039가
//   생기면 그 값)·물약 쿨(D-509, 전투 밖에서 걸린 쿨이 남았으면 그만큼 늦게).
// - 탄약(D-497): 든 무기(무기 칸)가 탄약 종류를 쓰면 입은 그 종류 탄약의 내구도 = 남은 탄(없으면 0 → 기본 공격을 못 함).
// 전투가 끝날 때(결과 적용과 같은 동기 처리 = 결과 기록과 한 커밋) 마신 물약을 수량에서 빼고 물약 쿨을 그 끝(실제 시각)까지 걸고,
// 쏜 탄을 탄약 내구도에서 뺀다(보유 물건 서비스 applyBattleUse·spendAmmo). 판정은 sim 한 벌(consumables.ts)이라 서버가 권위다.
// 생명 수치(남은 HP, src/vitals/ battleStart) 다음에 붙인다(물약 ‰ 회복은 그 전투 최대 HP 기준).
import { type BattleInit, TEST_COMBAT_COEFFICIENTS, type UnitResult } from "@terra/sim";
import type { HoldingService } from "../holdings/service.ts";

export interface BattleItems {
  /** 시작 자료의 세계 유닛에 물약·탄 칸을 붙인다. 붙일 것이 없으면 같은 객체 */
  battleStart(init: BattleInit, nowMs: number): BattleInit;
  /** 전투 끝: 쓴 물약·탄을 보유 물건에서 뺀다. 뺀 물약 수·쏜 탄 수 */
  apply(units: readonly UnitResult[], startedAtMs: number): { potions: number; shots: number };
}

/** 빨리감기 전투의 시작 실제 시각 = 끝 시각 − 끝 틱 × 틱(100ms, 기술 상수 — D-189 실시간으로 끝나는 시각에 적용) */
export function battleStartedAt(atMs: number, endTick: number): number {
  return atMs - endTick * TEST_COMBAT_COEFFICIENTS.tickMs;
}

export function createBattleItems(input: {
  readonly holdings: Pick<HoldingService, "battleKit" | "applyBattleUse">;
  /** 세계 유닛이 있는가(크리쳐처럼 세계에 없는 전투 유닛은 건너뛴다) */
  readonly exists: (unitId: number) => boolean;
}): BattleItems {
  return {
    battleStart(init, nowMs) {
      let changed = false;
      const units = init.units.map((spec) => {
        if (!input.exists(spec.id)) return spec;
        const kit = input.holdings.battleKit(spec.id, spec.maxHp, nowMs);
        if (kit.potions === undefined && kit.ammo === undefined) return spec;
        changed = true;
        return {
          ...spec,
          ...(kit.potions ? { potions: kit.potions } : {}),
          ...(kit.ammo === undefined ? {} : { ammo: kit.ammo }),
        };
      });
      return changed ? { ...init, units } : init;
    },

    apply(units, startedAtMs) {
      let potions = 0;
      let shots = 0;
      for (const result of [...units].toSorted((a, b) => a.unit - b.unit)) {
        if (!input.exists(result.unit)) continue;
        if (!result.potions && !result.shots) continue;
        potions += input.holdings.applyBattleUse(result.unit, {
          shots: result.shots,
          potions: result.potions,
          potionReadyAtMs:
            result.potionReadyMs === undefined ? undefined : startedAtMs + result.potionReadyMs,
        });
        shots += result.shots ?? 0;
      }
      return { potions, shots };
    },
  };
}
