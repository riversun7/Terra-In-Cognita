// 무기 1차 적정 스탯 → 2차 적정치(D-496, 질문 290 가: 착용 제한이 아니라 효율 기준). 그 1차만 가진 유닛(나머지 1차 0, 장비·버프 0,
// LV 1)의 2차 값을 그 칸의 적정치로 쓴다: 물리 칸 → physical_attack, 속성 칸 → elemental_attack, 명중 → hit, 크리 → crit_chance,
// 공격 간격 → action_speed(D-420 무기 틀 min(2, 유닛 값 ÷ 적정치)의 분모). 가중치 표·행 식은 그 세계의 실효 값을 넘긴다.
// 전투 자료(combatCatalogFrom)에 잇는 일은 WP-5다(docs/adr/2026-11-01-item-editor.md 2절). 지금은 서버 미리 보기(아이템 편집기)가 쓴다.
import { PRIMARY_CODES, type PrimaryCode } from "./equipment.ts";
import { type StatRow, computeSecondary } from "./stats.ts";

/** 1차 적정 스탯(없는 칸 = 0) */
export type PrimaryAppropriate = Readonly<Partial<Record<PrimaryCode, number | undefined>>>;

/** 셈한 2차 적정치(무기 사양의 적정치 칸 차례) */
export interface DerivedAppropriate {
  readonly physicalAttack: number;
  readonly elementalAttack: number;
  readonly hit: number;
  readonly crit: number;
  readonly speed: number;
}

/** 2차 적정치를 셈하는 행(적정치 칸 → 가중치 표 행 ID) */
export const APPROPRIATE_ROWS: Readonly<Record<keyof DerivedAppropriate, string>> = {
  physicalAttack: "physical_attack",
  elementalAttack: "elemental_attack",
  hit: "hit",
  crit: "crit_chance",
  speed: "action_speed",
};

/** 1차 적정 스탯 → 2차 적정치. 값이 범위를 넘으면 computeSecondary가 RangeError를 던진다(부르는 쪽이 받는다) */
export function appropriateFromPrimaries(
  appropriate: PrimaryAppropriate,
  table: readonly StatRow[],
): DerivedAppropriate {
  const primaries = Object.fromEntries(PRIMARY_CODES.map((code) => [code, appropriate[code] ?? 0]));
  const stats = computeSecondary(
    {
      str: primaries.str ?? 0,
      dex: primaries.dex ?? 0,
      agi: primaries.agi ?? 0,
      vit: primaries.vit ?? 0,
      int: primaries.int ?? 0,
      wis: primaries.wis ?? 0,
    },
    table,
    {},
    {},
    1,
  );
  const of = (row: string): number => stats[row] ?? 0;
  return {
    physicalAttack: of(APPROPRIATE_ROWS.physicalAttack),
    elementalAttack: of(APPROPRIATE_ROWS.elementalAttack),
    hit: of(APPROPRIATE_ROWS.hit),
    crit: of(APPROPRIATE_ROWS.crit),
    speed: of(APPROPRIATE_ROWS.speed),
  };
}
