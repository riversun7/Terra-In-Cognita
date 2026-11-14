// 2차 스탯 화면 아래 판 모델(순수 함수) — 밸런스 화면에서 옮긴 것(docs/research/2026-11-14-dev-tools-overlap.md 5절):
// (가) 무기별 스태미나(D-511 일반 공격이 이어지나)·적정치(D-502) 표 — 옛 [계산식] 탭, (나) 1차 +10 대결 승률(지금 표 vs 담은 가중치 칸) — 옛 [가중치 표].
// 표본 유닛 = 이 화면의 계열·초기 합·성장·K·초점 레벨(그래프와 같은 1차). 식·가중치는 담은 값이 바로 든다(compilePrograms, 같은 해석기).
import type { BalanceEdit, BalancePrimaries, BalanceTableResponse } from "@terra/shared/balance";
import {
  type FormulaListResponse,
  type FormulaWeaponView,
  bareAppropriateScope,
  evaluateFormula,
  intervalFormulaIdOf,
  runFormulaSample,
} from "@terra/shared/formula";
import {
  SECONDARY_ARCHETYPE_WEIGHTS,
  archetypeInitialPrimaries,
  growPrimaries,
  toRuleOrderPrimaries,
} from "@terra/shared/secondaryStatsSim";
import { type SecondaryDraftState, type SimulationConfig, compilePrograms } from "./secondaryStatsModel.ts";

/** 표본 유닛의 1차(초점 레벨, 화면 차례) */
export function samplePrimaries(config: SimulationConfig): BalancePrimaries {
  const weights =
    config.archetype === "custom" ? config.customWeights : SECONDARY_ARCHETYPE_WEIGHTS[config.archetype];
  return growPrimaries(
    archetypeInitialPrimaries(weights, config.initialSum),
    config.growthPm,
    config.kPm,
    config.focusLevel,
  );
}

/** 무기 하나의 기본 공격 스태미나·적정치 */
export interface WeaponSustain {
  readonly weapon: FormulaWeaponView;
  /** 한 번 소모(밀리점, 식 stamina_cost) */
  readonly costMilli: number;
  /** 공격 간격(ms, 맨손은 bare_interval) */
  readonly intervalMs: number;
  /** 분당 회복(식 real_stamina_regen) */
  readonly regenPerMinute: number;
  /** 초당 회복 ≥ 초당 소모 */
  readonly sustained: boolean;
}

export interface SustainTable {
  /** 적정 STA(밀리점)·STA 점수·최대 스태미나 */
  readonly appropriateMilli: number;
  readonly score: number;
  readonly max: number;
  /** 맨손 적정 DEX·AGI(점, 식 bare_appropriate) */
  readonly bareAppropriate: number;
  /** 판정 차례(STR·DEX·AGI·VIT·INT·WIS) 1차 */
  readonly primaries: readonly number[];
  readonly rows: readonly WeaponSustain[];
}

/** 표본 1차·레벨에서 무기마다(판정 specFromStats와 같은 식·변수, 담은 식·가중치 포함) */
export function sustainTable(
  table: BalanceTableResponse,
  formulas: FormulaListResponse,
  drafts: SecondaryDraftState,
  primaries: BalancePrimaries,
  level: number,
): SustainTable {
  const programs = compilePrograms(table, formulas, drafts, true);
  const ordered = toRuleOrderPrimaries(primaries);
  let head = { appropriateMilli: 0, score: 0, max: 0 };
  const rows = formulas.weapons.map((weapon, index) => {
    const result = runFormulaSample(
      { primaries: ordered, level, rows: programs.rows, weapon, coefficients: formulas.coefficients },
      programs.combat,
    );
    const v = result.values;
    if (index === 0)
      head = {
        appropriateMilli: v.stamina_appropriate,
        score: result.staminaScore,
        max: Math.max(0, result.stats["stamina"] ?? 0),
      };
    const costMilli = Math.max(0, v.stamina_cost);
    const intervalMs = Math.max(1, Math.floor(v[intervalFormulaIdOf(weapon.unarmed)] / 1000));
    const regenPerMinute = Math.max(0, Math.floor(v.real_stamina_regen / 1000));
    return {
      weapon,
      costMilli,
      intervalMs,
      regenPerMinute,
      // 분당 회복 × 간격 ≥ 60 × 한 번 소모(밀리점) ⇔ 초당 회복 ≥ 소모 ÷ 간격
      sustained: regenPerMinute * intervalMs >= 60 * costMilli,
    };
  });
  return {
    ...head,
    bareAppropriate: evaluateFormula(programs.combat.bare_appropriate, bareAppropriateScope(level)) / 1000,
    primaries: ordered,
    rows,
  };
}

/** 적정 비율 글: min(상한, 1차 ÷ 적정), 적정이 없으면 "—" */
export function ratioText(stat: number, appropriate: number | undefined, capPm: number): string {
  if (appropriate === undefined || appropriate <= 0) return "—";
  return `${Math.min(capPm / 1000, stat / appropriate).toFixed(2)}×`;
}

/** 담은 가중치 칸 → 대결 입력의 담은 변경 */
export function duelEdits(drafts: SecondaryDraftState): BalanceEdit[] {
  return [...drafts.cellDrafts.entries()].map(([key, value]) => ({ key, value }));
}

/** 대결 판 수·제한 시간 고르기(BALANCE_LIMITS 안) */
export const DUEL_RUN_OPTIONS = [4, 6, 10, 20, 40] as const;
export const DUEL_LIMIT_OPTIONS = [60, 120, 180, 300] as const;
export const DUEL_COUNT_OPTIONS = [1, 2, 3] as const;
