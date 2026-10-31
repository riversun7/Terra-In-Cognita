// 스탯 → 전투 유닛 사양 — docs/adr/2026-10-31-combat-core.md "스탯"
// 2차 스탯(stats.ts computeSecondary 결과)과 무기에서 전투 사양을 만든다. 서버·시뮬·(나중의) 개발자 페이지 전투 시뮬레이터가 같이 쓴다.
// 공격 간격 = 무기 간격 × 1000 ÷ min(2000, 행동 속도 × 1000 ÷ 무기 적정 속도)(D-418 행동 속도, D-420 같은 틀).
import type { CombatUnitSpec } from "./battleTypes.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS, staminaScore } from "./coefficients.ts";
import { ELEMENT_COUNT } from "./formula.ts";
import type { CombatSkill } from "./skills.ts";
import type { Primaries } from "./stats.ts";

export interface WeaponSpec {
  readonly kind: "physical" | "elemental";
  readonly attack: number;
  readonly attackAppropriate: number;
  readonly hitPm: number;
  readonly hitAppropriate: number;
  readonly critPm: number;
  readonly critAppropriate: number;
  /** 기본 공격 간격(ms)과 적정 행동 속도 */
  readonly intervalMs: number;
  readonly speedAppropriate: number;
  readonly range: number;
  readonly arc: boolean;
  /** 공격 한 번에 드는 스태미나(걷기 말고 모든 행동, D-418)·MP(속성) */
  readonly staminaCost: number;
  readonly mpCost: number;
  readonly skillElementsPm?: readonly number[] | undefined;
}

export interface UnitBody {
  readonly id: number;
  readonly side: number;
  readonly party: number;
  readonly x: number;
  readonly y: number;
  /** 2차 스탯(행 ID → 값) */
  readonly stats: Readonly<Record<string, number>>;
  readonly weapon: WeaponSpec;
  /** 한 칸 가는 시간(ms, C28 전투 속도. [임시] 1칸/초 이하 = 1000 이상) */
  readonly moveIntervalMs: number;
  readonly elements?: readonly number[] | undefined;
  readonly resistPm?: readonly number[] | undefined;
  readonly defenseFlat?: number | undefined;
  readonly penetrationPm?: number | undefined;
  readonly eye?: number | undefined;
  readonly air?: boolean | undefined;
  readonly commandCap?: number | undefined;
  readonly cyborg?: boolean | undefined;
  readonly buildingMulPm?: number | undefined;
  /** 1차 스탯(장비 포함, 상태이상 저항 D-429) */
  readonly primaries?: Primaries | undefined;
  readonly skills?: readonly CombatSkill[] | undefined;
}

const ZERO = Array.from({ length: ELEMENT_COUNT }, () => 0);

export function specFromStats(
  body: UnitBody,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
): CombatUnitSpec {
  const p = body.primaries;
  const primaries = p ? [p.str, p.dex, p.agi, p.vit, p.int, p.wis] : [0, 0, 0, 0, 0, 0];
  const s = (id: string): number => body.stats[id] ?? 0;
  const w = body.weapon;
  const speedRatio = Math.min(
    2000,
    Math.floor((Math.max(1, s("action_speed")) * 1000) / Math.max(1, w.speedAppropriate)),
  );
  return {
    id: body.id,
    side: body.side,
    party: body.party,
    x: body.x,
    y: body.y,
    maxHp: Math.max(1, s("hp")),
    armorHp: Math.max(0, s("armor_hp")),
    shieldHp: Math.max(0, s("shield_hp")),
    attack: {
      kind: w.kind,
      weaponAttack: w.attack,
      attackStat: w.kind === "physical" ? s("physical_attack") : s("elemental_attack"),
      attackAppropriate: w.attackAppropriate,
      weaponHitPm: w.hitPm,
      hitStat: s("hit"),
      hitAppropriate: w.hitAppropriate,
      weaponCritPm: w.critPm,
      critStat: s("crit_chance"),
      critAppropriate: w.critAppropriate,
      critMulPm: s("crit_multiplier"),
      agi: primaries[2],
      penetrationPm: body.penetrationPm ?? 0,
      skillMulPm: 1000,
      buffPm: 1000,
      elements: body.elements ?? ZERO,
      skillElementsPm: w.skillElementsPm ?? ZERO,
    },
    defense: {
      defenseRatePm: s("defense_rate"),
      defenseFlat: body.defenseFlat ?? 0,
      evadePm: s("evade"),
      agi: primaries[2],
      elements: body.elements ?? ZERO,
      resistPm: body.resistPm ?? ZERO,
    },
    range: w.range,
    arc: w.arc,
    attackIntervalMs: Math.max(1, Math.floor((w.intervalMs * 1000) / Math.max(1, speedRatio))),
    moveIntervalMs: body.moveIntervalMs,
    staminaMax: Math.max(0, s("stamina")),
    staminaCost: w.staminaCost,
    // 1차가 없으면(시험) 적정 점수로 본다: 소모·회복 배율 1
    staminaScore: p ? staminaScore(primaries, c) : c.stamina.appropriateScore,
    mpMax: Math.max(0, s("mp")),
    mpCost: w.mpCost,
    sight: Math.max(0, s("sight")),
    eye: body.eye ?? 16 * 180,
    air: body.air ?? false,
    commandCap: body.commandCap ?? 0,
    cyborg: body.cyborg ?? false,
    buildingMulPm: body.buildingMulPm ?? 1000,
    primaries,
    skills: body.skills ?? [],
  };
}
