// 시험 도우미: 작은 전투맵·유닛 사양을 만든다(판정 코드가 아닌 시험 전용)
import type { BattleInit, CombatUnitSpec } from "./battleTypes.ts";
import type { BattleMapInput } from "./battleMap.ts";

export function openMap(size = 32): BattleMapInput {
  const cells = size * size;
  return {
    size,
    passable: new Uint8Array(cells).fill(1),
    cover: new Uint8Array(cells),
    height: new Int32Array(cells),
    buildings: [],
  };
}

const ZERO = Array.from({ length: 12 }, () => 0);

export function unit(
  id: number,
  side: number,
  party: number,
  x: number,
  y: number,
  extra: Partial<CombatUnitSpec> = {},
): CombatUnitSpec {
  return {
    id,
    side,
    party,
    x,
    y,
    maxHp: 100,
    armorHp: 0,
    shieldHp: 0,
    attack: {
      kind: "physical",
      weaponAttack: 20,
      attackStat: 10,
      attackAppropriate: 10,
      weaponHitPm: 1000,
      hitStat: 10,
      hitAppropriate: 10,
      weaponCritPm: 100,
      critStat: 10,
      critAppropriate: 10,
      critMulPm: 1500,
      penetrationPm: 0,
      skillMulPm: 1000,
      buffPm: 1000,
      elements: ZERO,
      skillElementsPm: ZERO,
    },
    defense: {
      defenseRatePm: 100,
      defenseFlat: 1,
      elementalDefenseRatePm: 0,
      evadePm: 0,
      elements: ZERO,
      resistPm: ZERO,
    },
    range: 1,
    arc: false,
    attackIntervalMs: 500,
    moveIntervalMs: 500,
    staminaMax: 1000,
    staminaCost: 1,
    staminaScore: 80,
    staminaRegen: 180,
    mpMax: 0,
    mpCost: 0,
    mpRegen: 0,
    shieldRegen: 0,
    sight: 12,
    eye: 16 * 180,
    air: false,
    commandCap: 0,
    cyborg: false,
    buildingMulPm: 1000,
    primaries: [0, 0, 0, 0, 0, 0],
    skills: [],
    ...extra,
  };
}

/** 두 편(1 공격 = 서쪽, 2 수비 = 동쪽)이 마주 선 일반 전투 */
export function duel(perSide: number, seed = 1, size = 32): BattleInit {
  const units: CombatUnitSpec[] = [];
  for (let i = 0; i < perSide; i++) {
    units.push(unit(1 + i, 1, 1 + Math.floor(i / 6), 10, 8 + i, i === 0 ? { commandCap: 2 } : {}));
    units.push(unit(101 + i, 2, 11 + Math.floor(i / 6), 21, 8 + i, i === 0 ? { commandCap: 2 } : {}));
  }
  const parties = [...new Set(units.map((u) => u.party))].map((id) => ({
    id,
    side: id < 10 ? 1 : 2,
    retreatHpPct: 0,
  }));
  return {
    id: 1,
    kind: "normal",
    seed,
    map: openMap(size),
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties,
    units,
  };
}
