// 스탯 계산기 — docs/adr/2026-10-31-combat-core.md "스탯", 기획 D-414(2차 스탯은 저장하지 않고 계산)·D-416·D-417(성장)
// 서버·시뮬레이터·(나중의) 개발자 페이지 스탯 시뮬레이터가 같은 순수 함수를 쓴다.
// - 유닛이 저장하는 것: 1차 스탯 6개(초기값·K)·레벨·장비·버프. 2차 스탯은 가중치 표 하나로 계산한다.
// - 가중치 표: 행(2차 스탯 13개 + 활동 수치) × 1차 6열(STR·DEX·AGI·VIT·INT·WIS), 정수 ‰. 행마다 모양 하나.
//   양: 기본 + Σ(1차 × 가중치‰) ÷ 1000 + 장비 + 버프 / 확률: 상한 × 점수 ÷ (점수 + 반감 상수), 점수 = Σ(…) ÷ 1000 + 장비 + 버프.
// - 게임 상한은 없다(D-421). 확률 모양이 저절로 상한(점근선)을 넘지 않는다. 정수 넘침은 입력 범위로 막는다(아래 상수).
// - 안드로이드(D-416)는 레벨·K 없이 1차 = 몸체 + 부품 합을 그대로 넘긴다(같은 표·같은 함수).
// 원본 표는 콘텐츠 팩 `stat_rows`(임시)이고, 시험·기본값은 TEST_STAT_TABLE(같은 값)이다.

export interface Primaries {
  readonly str: number;
  readonly dex: number;
  readonly agi: number;
  readonly vit: number;
  readonly int: number;
  readonly wis: number;
}

export type StatRow =
  | {
      readonly id: string;
      readonly shape: "quantity";
      readonly base: number;
      readonly weights: readonly number[];
    }
  | {
      readonly id: string;
      readonly shape: "probability";
      /** 점근선(‰) */
      readonly cap: number;
      readonly halfConstant: number;
      readonly weights: readonly number[];
    };

/** 입력 범위(넘침 방지): 1차 스탯·장비·버프 값은 이 안이어야 한다(가장 큰 곱 = 10^7 × 10^5 × 6 < 2^53) */
export const MAX_STAT_INPUT = 10_000_000;
export const MAX_WEIGHT_PM = 100_000;

/** 1차 스탯 성장(D-417): 초기 × (1000 + 성장률‰ × K‰ × (Lv − 1) ÷ 1000) ÷ 1000 */
export function primaryAtLevel(initial: number, growthPm: number, kPm: number, level: number): number {
  const factor = 1000 + Math.floor((growthPm * kPm * (level - 1)) / 1000);
  return Math.floor((initial * factor) / 1000);
}

function check(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < -MAX_STAT_INPUT || value > MAX_STAT_INPUT)
    throw new RangeError(`${label} out of range: ${value}`);
}

/** 2차 스탯과 활동 수치(행 ID → 값). gear·buffs는 행 ID → 더하는 값 */
export function computeSecondary(
  primaries: Primaries,
  table: readonly StatRow[],
  gear: Readonly<Record<string, number>> = {},
  buffs: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const p = [primaries.str, primaries.dex, primaries.agi, primaries.vit, primaries.int, primaries.wis];
  for (const value of p) check(value, "primary");
  const out: Record<string, number> = {};
  for (const row of table) {
    let weighted = 0;
    for (let i = 0; i < 6; i++) {
      const weight = row.weights[i] ?? 0;
      if (weight < -MAX_WEIGHT_PM || weight > MAX_WEIGHT_PM)
        throw new RangeError(`weight out of range in ${row.id}`);
      weighted += (p[i] ?? 0) * weight;
    }
    // 양 모양 = 기본 + 가중합 + 장비 + 버프, 확률 모양 점수 = 가중합 + 장비(버프는 넣지 않는다, 48 §3.1)
    const extra = (gear[row.id] ?? 0) + (row.shape === "quantity" ? (buffs[row.id] ?? 0) : 0);
    check(extra, `gear+buff ${row.id}`);
    const score = Math.floor(weighted / 1000) + extra;
    if (row.shape === "quantity") out[row.id] = row.base + score;
    else out[row.id] = score <= 0 ? 0 : Math.floor((row.cap * score) / (score + row.halfConstant));
  }
  return out;
}

const q = (id: string, base: number, weights: readonly number[]): StatRow => ({
  id,
  shape: "quantity",
  base,
  weights,
});
const pr = (id: string, cap: number, halfConstant: number, weights: readonly number[]): StatRow => ({
  id,
  shape: "probability",
  cap,
  halfConstant,
  weights,
});

/**
 * 가중치 표(STR·DEX·AGI·VIT·INT·WIS 차례, ‰). HP·쉴드·MP·스태미나·회피는 기획 49 N1·N3·N14 출발값,
 * 나머지 행과 크리 배율의 DEX 몫은 [임시](D-414 "주로 쓰는 1차"를 따른 시험값).
 * 확률 모양의 상한은 ‰(예: 명중 상한 950 = 95%).
 */
export const TEST_STAT_TABLE: readonly StatRow[] = [
  q("hp", 0, [1500, 1000, 1500, 3000, 1000, 1200]),
  q("armor_hp", 0, [500, 0, 0, 1000, 0, 0]),
  q("shield_hp", 0, [200, 200, 200, 200, 1000, 3000]),
  pr("defense_rate", 700, 100, [600, 0, 0, 1200, 0, 0]),
  q("physical_attack", 0, [2000, 600, 0, 0, 0, 0]),
  q("elemental_attack", 0, [0, 0, 0, 0, 2000, 600]),
  pr("hit", 950, 20, [0, 1200, 600, 0, 0, 0]),
  pr("evade", 850, 250, [0, 0, 1000, 0, 0, 0]),
  pr("crit_chance", 500, 200, [0, 1500, 0, 0, 0, 0]),
  q("crit_multiplier", 1500, [0, 10_000, 0, 0, 0, 0]),
  q("action_speed", 50, [0, 300, 2000, 0, 0, 0]),
  q("stamina", 100, [0, 0, 700, 300, 0, 0]),
  q("mp", 0, [300, 300, 300, 300, 1500, 2000]),
  q("sight", 10, [0, 0, 50, 0, 0, 100]),
];
