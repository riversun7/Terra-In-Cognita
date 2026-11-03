// 행동별 소모 화면의 스태미나 기준(D-511) — 스킬 편집기 skills.list가 싣는다(docs/adr/2026-10-31-combat-core.md
// "바뀜 (274 스태미나 적정 스탯 개념)"). 보통 유닛(1차 처음 모두 10, K 1, 성장률 = 설정 칸 N5 실효 값)이 레벨마다 갖는 적정 STA·STA 점수·
// 최대·실제 회복과, 무기·타고난 무기 줄마다 그 유닛의 기본 공격 한 번 소모·공격 간격을 판정과 같은 함수(@terra/sim specFromStats)로 셈한다.
// 식을 여기에 박지 않는다: 실효 계산식·설정 칸·가중치 표(그 세계의 덮어쓰기)를 그대로 쓴다. 화면은 초당 소모와 회복을 견준다.
import type { ActionCostRow, StaminaBasisView } from "@terra/shared/skillEditor";
import {
  type CombatCatalog,
  type CombatCoefficients,
  type WeaponSpec,
  computeSecondary,
  primaryAtLevel,
  specFromStats,
  specStaminaCostMilli,
} from "@terra/sim";

/** 기준 레벨(계산식 탭 표본과 같은 두 유닛: 새 사이보그 Lv 1, Lv 30 균형형) */
export const STAMINA_BASIS_LEVELS: readonly number[] = [1, 30];
/** 보통 유닛의 1차 처음 값(새 사이보그 평균, N9 합 60 ÷ 6)·K(1000‰) */
const TYPICAL_INITIAL = 10;
const TYPICAL_K_PM = 1000;

export interface StaminaBasisDeps {
  /** 실효 전투 자료(가중치 표·장비·유닛 종류) */
  readonly combat: CombatCatalog;
  /** 설정 칸·계산식 실효 값을 얹은 계수표 */
  readonly coefficients: CombatCoefficients;
  /** 1차 성장률(‰, 설정 칸 N5 실효 값) */
  readonly growthPm: number;
}

/** 줄 → 그 줄의 무기 사양(무기 아이템 또는 유닛 종류의 타고난 무기). 없으면 undefined */
function weaponOf(row: ActionCostRow, combat: CombatCatalog): WeaponSpec | undefined {
  if (row.kind === "weapon") return combat.equipment.find((item) => item.id === row.id)?.weapon;
  if (row.kind === "natural") return combat.unitKinds.find((kind) => kind.id === row.id)?.naturalWeapon;
  return undefined;
}

/** 보통 유닛 하나의 전투 사양(레벨·무기) */
function typicalSpec(deps: StaminaBasisDeps, level: number, weapon: WeaponSpec) {
  const value = primaryAtLevel(TYPICAL_INITIAL, deps.growthPm, TYPICAL_K_PM, level);
  const primaries = { str: value, dex: value, agi: value, vit: value, int: value, wis: value };
  const spec = specFromStats(
    {
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: computeSecondary(primaries, deps.combat.statTable, {}, {}, level),
      weapon,
      moveIntervalMs: 1000,
      primaries,
      level,
    },
    deps.coefficients,
  );
  return { value, spec };
}

/** 스태미나 기준(줄 차례는 rows와 같다, 무기·타고난 무기 줄만) */
export function staminaBasisOf(deps: StaminaBasisDeps, rows: readonly ActionCostRow[]): StaminaBasisView {
  const fallback = deps.combat.unitKinds.find((kind) => kind.id === "human")?.naturalWeapon;
  const levels = fallback
    ? STAMINA_BASIS_LEVELS.map((level) => {
        const { value, spec } = typicalSpec(deps, level, fallback);
        return {
          level,
          primary: value,
          appropriateMilli: spec.staminaAppropriateMilli ?? spec.staminaScore * 1000,
          score: spec.staminaScore,
          max: spec.staminaMax,
          regenPerMinute: spec.staminaRegen,
        };
      })
    : [];
  const attacks: Record<string, { costMilli: number; intervalMs: number }[]> = {};
  for (const row of rows) {
    const weapon = weaponOf(row, deps.combat);
    if (!weapon || row.kind === "fixed" || row.kind === "skill") continue;
    attacks[row.key] = levels.map(({ level }) => {
      const { spec } = typicalSpec(deps, level, weapon);
      return {
        costMilli: specStaminaCostMilli(spec, spec.staminaCost, deps.coefficients),
        intervalMs: spec.attackIntervalMs,
      };
    });
  }
  return { levels, attacks };
}
