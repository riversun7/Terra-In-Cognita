// 전투 움직임 2단계 시험 — docs/adr/2026-11-15-combat-moves.md "바뀜 (D-564·D-568)".
// 밀치기 부딪힘 피해(벽·뒤 유닛), 밀림 저항(STR·VIT·몸), 맞아도 은신 유지, 피해 방식은 계열과 따로(스킬 damage·무기 칸 damage),
// 기본 공격 MP = 무기 mpCost, 무기 사거리 예산 곡선, 리플레이에 부딪힘 피해가 지속 피해 사건으로 실려 되짚은 체력이 같다.
import { applyReplayEvent, stateFromKeyframe } from "@terra/protocol/battleReplay";
import { describe, expect, it } from "vitest";
import { createBattle } from "./battle.ts";
import { ready, spend, unitFrom } from "./battleState.ts";
import type { BattleTrace } from "./battleTrace.ts";
import type { BattleInit, CombatUnitSpec, UnitState } from "./battleTypes.ts";
import { TEST_COMBAT_CATALOG } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { DEFAULT_MOVE_COEFFICIENTS, bodyDisplaceResistPm, displaceResistPm } from "./curves.ts";
import { buildingDamage, skillAttack } from "./formula.ts";
import { MOVE_COLLISION, isStealthed } from "./moves.ts";
import { recordBattleReplay } from "./replay.ts";
import { type CombatSkill, type SkillData, resolveSkill, skillFromData } from "./skills.ts";
import { openMap, unit } from "./testBattle.ts";
import { type WeaponSpec, specFromStats } from "./unitSpec.ts";

const effects = new Map(TEST_COMBAT_CATALOG.effects.map((effect) => [effect.id, effect]));
const m = DEFAULT_MOVE_COEFFICIENTS;

/** 시험 스킬: 적 하나에 붙어서 치는 센 물리 스킬(부딪힘 피해가 0이 되지 않게)에 칸을 덮어쓴다 */
function skill(over: Partial<SkillData>): CombatSkill {
  return skillFromData(
    {
      id: "test_push",
      shape: "single",
      trigger: "active",
      resource: "stamina",
      cost: 1,
      castMs: 0,
      cooldownMs: 60_000,
      target: "enemy",
      range: 1,
      radius: 0,
      damage: "physical",
      base: "physical",
      formula: [{ part: "attack_mul", pm: 5000 }],
      conditions: [],
      effects: [],
      gradePm: [1000],
      ...over,
    },
    1,
    effects,
  );
}

function fight(units: CombatUnitSpec[], map = openMap(32)): BattleInit {
  return {
    id: 9,
    kind: "normal",
    seed: 9,
    map,
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties: [...new Set(units.map((u) => u.party))].map((id) => ({
      id,
      side: units.find((u) => u.party === id)?.side ?? 1,
      retreatHpPct: 0,
    })),
    units,
  };
}

/** 움직이지 않는 과녁(시야 0) */
const dummy = (id: number, x: number, y: number, extra: Partial<CombatUnitSpec> = {}): CombatUnitSpec =>
  unit(id, 2, 11, x, y, { sight: 0, maxHp: 5000, ...extra });

const byId = (state: { units: readonly UnitState[] }, id: number): UnitState => {
  const found = state.units.find((u) => u.id === id);
  if (!found) throw new Error(`no unit ${id}`);
  return found;
};

interface Seen {
  hit: number;
  collisions: { source: number; target: number; amount: number }[];
}

function recorder(): { trace: BattleTrace; seen: Seen } {
  const seen: Seen = { hit: 0, collisions: [] };
  const trace: BattleTrace = {
    attack() {},
    building() {},
    skill() {},
    skillHit(_who, _skill, _target, _hit, physical, elemental) {
      seen.hit += physical + elemental;
    },
    heal() {},
    dot() {},
    collision(source, target, amount) {
      seen.collisions.push({ source: source.id, target: target.id, amount });
    },
  };
  return { trace, seen };
}

/** 한 틱만 돌린 전투(시전자 1이 첫 틱에 스킬을 쓴다) */
function oneTick(units: CombatUnitSpec[], map = openMap(32)) {
  const { trace, seen } = recorder();
  const battle = createBattle(fight(units, map), TEST_COMBAT_COEFFICIENTS, trace);
  battle.step([{ tick: 0, kind: "order", party: 2, order: { kind: "hold" } }]);
  return { state: battle.state, seen };
}

describe("밀치기 부딪힘 피해(D-564 1587)", () => {
  const push = skill({ displace: { kind: "knockback", cells: 3 } });

  it("벽(못 지나가는 칸)에 막히면 한 방 피해 × wallPm을 방어 없이 체력에서 뺀다(아머 그대로)", () => {
    const map = openMap(32);
    map.passable[10 * 32 + 8] = 0;
    const { state, seen } = oneTick([unit(1, 1, 1, 5, 10, { skills: [push] }), dummy(101, 6, 10)], map);
    const target = byId(state, 101);
    expect([target.x, target.y]).toEqual([7, 10]);
    const amount = Math.floor((seen.hit * m.knockback.wallPm) / 1000);
    expect(amount).toBeGreaterThan(0);
    expect(seen.collisions).toEqual([{ source: 1, target: 101, amount }]);
    expect(target.hp).toBe(5000 - seen.hit - amount);
  });

  it("끝까지 밀리면 부딪힘 피해가 없다. 피해 없는 밀치기도 없다", () => {
    const free = oneTick([unit(1, 1, 1, 5, 10, { skills: [push] }), dummy(101, 6, 10)]);
    expect(byId(free.state, 101).x).toBe(9);
    expect(free.seen.collisions).toEqual([]);
    const map = openMap(32);
    map.passable[10 * 32 + 8] = 0;
    const shove = skill({ shape: "debuff", damage: "none", displace: { kind: "knockback", cells: 3 } });
    const none = oneTick([unit(1, 1, 1, 5, 10, { skills: [shove] }), dummy(101, 6, 10)], map);
    expect(byId(none.state, 101).x).toBe(7);
    expect(none.seen.collisions).toEqual([]);
  });

  it("뒤 유닛에 막히면 밀린 대상과 막은 적이 한 방 피해 × unitPm을 받는다. 시전자 편 유닛은 받지 않는다", () => {
    const enemy = oneTick([unit(1, 1, 1, 5, 10, { skills: [push] }), dummy(101, 6, 10), dummy(102, 8, 10)]);
    const amount = Math.floor((enemy.seen.hit * m.knockback.unitPm) / 1000);
    expect(amount).toBeGreaterThan(0);
    expect(byId(enemy.state, 101).x).toBe(7);
    expect(enemy.seen.collisions).toEqual([
      { source: 1, target: 101, amount },
      { source: 1, target: 102, amount },
    ]);
    expect(byId(enemy.state, 102).hp).toBe(5000 - amount);

    const { trace, seen } = recorder();
    const battle = createBattle(
      fight([
        unit(1, 1, 1, 5, 10, { skills: [push] }),
        unit(2, 1, 2, 8, 10, { sight: 0, maxHp: 5000 }),
        dummy(101, 6, 10),
      ]),
      TEST_COMBAT_COEFFICIENTS,
      trace,
    );
    battle.step([{ tick: 0, kind: "order", party: 2, order: { kind: "hold" } }]);
    expect(seen.collisions.map((row) => row.target)).toEqual([101]);
    expect(byId(battle.state, 2).hp).toBe(5000);
  });
});

describe("밀림 저항(D-564 1588)", () => {
  it("STR·VIT 점수(상태이상 저항 모양) + 몸 저항(L·XL·보스), 1000에서 자른다", () => {
    expect(displaceResistPm([0, 0, 0, 0, 0, 0], 0, m)).toBe(0);
    // VIT 100 → 점수 100 → 600 × 100 ÷ 200
    expect(displaceResistPm([0, 0, 0, 100, 0, 0], 0, m)).toBe(300);
    // STR 100 + VIT 100 → 점수 150 → 600 × 150 ÷ 250
    expect(displaceResistPm([100, 0, 0, 100, 0, 0], 0, m)).toBe(360);
    expect(bodyDisplaceResistPm("M", false, m)).toBe(0);
    expect(bodyDisplaceResistPm("L", false, m)).toBe(250);
    expect(bodyDisplaceResistPm("XL", true, m)).toBe(800);
    expect(displaceResistPm([0, 0, 0, 100, 0, 0], 800, m)).toBe(1000);
  });

  it("저항이 밀치기·끌어오기 칸 수와 묶기 지속을 줄인다. 몸 저항 1000이면 밀리지 않는다", () => {
    const tough = { primaries: [0, 0, 0, 100, 0, 0] };
    const push = skill({ displace: { kind: "knockback", cells: 3 } });
    // 저항 300‰ → ⌊3 × 700 ÷ 1000⌋ = 2칸
    expect(
      byId(oneTick([unit(1, 1, 1, 5, 10, { skills: [push] }), dummy(101, 6, 10, tough)]).state, 101).x,
    ).toBe(8);
    const pull = skill({ shape: "projectile", range: 6, displace: { kind: "pull", cells: 4 } });
    // 4 × 700 ÷ 1000 = 2칸
    expect(
      byId(oneTick([unit(1, 1, 1, 5, 10, { skills: [pull] }), dummy(101, 10, 10, tough)]).state, 101).x,
    ).toBe(8);
    const root = skill({ displace: { kind: "root", durationMs: 2000 } });
    const rooted = byId(
      oneTick([unit(1, 1, 1, 5, 10, { skills: [root] }), dummy(101, 6, 10, tough)]).state,
      101,
    );
    expect(rooted.effects.map((e) => [e.id, e.untilMs])).toEqual([["move_root", 1400]]);
    const boss = oneTick([
      unit(1, 1, 1, 5, 10, { skills: [push] }),
      dummy(101, 6, 10, { displaceResistPm: 1000 }),
    ]);
    expect(byId(boss.state, 101).x).toBe(6);
  });

  it("크기·보스는 사양에 몸 저항 칸으로 실린다(없으면 칸이 없다)", () => {
    const body = {
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: { hp: 100 },
      weapon: TEST_WEAPON,
      moveIntervalMs: 1000,
    };
    expect(specFromStats({ ...body, size: "XL", boss: true }).displaceResistPm).toBe(800);
    expect("displaceResistPm" in specFromStats(body)).toBe(false);
  });
});

describe("은신은 맞아도 풀리지 않는다(D-564 1583)", () => {
  it("범위 스킬에 맞아도 은신 그대로", () => {
    const hider = unitFrom(unit(101, 2, 11, 6, 10, { maxHp: 5000 }));
    hider.stealthUntilMs = 60_000;
    const caster = unitFrom(unit(1, 1, 1, 5, 10));
    const blast = skill({ shape: "area", radius: 2 });
    const visible = unitFrom(unit(102, 2, 11, 7, 10, { maxHp: 5000 }));
    resolveSkill(
      caster,
      blast,
      visible,
      [caster, hider, visible],
      { nextInt: () => 9999 },
      0,
      TEST_COMBAT_COEFFICIENTS,
    );
    expect(hider.hp).toBeLessThan(5000);
    expect(isStealthed(hider)).toBe(true);
  });
});

/** 무기 하나(물리 칸, 적정 없음) */
const TEST_WEAPON: WeaponSpec = {
  physical: { attack: 20 },
  hitPm: 1000,
  critPm: 0,
  intervalMs: 1000,
  range: 1,
  arc: false,
  staminaCost: 1,
  mpCost: 0,
};

describe("피해 방식은 계열과 따로(D-568)", () => {
  it("스킬은 피해 종류가 정한다: STR 기반(물리 칸) 속성 피해는 쉴드부터, INT 기반 물리 피해는 아머부터", () => {
    const base = unitFrom(unit(1, 1, 1, 5, 10)).attack;
    const elementalStr = skill({ damage: "elemental", base: "physical" });
    expect(skillAttack(base, elementalStr).kind).toBe("elemental");
    expect(skillAttack(base, skill({ damage: "physical", base: "elemental" })).kind).toBe("physical");
    expect(skillAttack(base, skill({ shape: "debuff", damage: "none", base: "elemental" })).kind).toBe(
      "elemental",
    );

    const caster = unitFrom(unit(1, 1, 1, 5, 10));
    const target = unitFrom(unit(101, 2, 11, 6, 10, { maxHp: 5000, armorHp: 500, shieldHp: 500 }));
    resolveSkill(
      caster,
      elementalStr,
      target,
      [caster, target],
      { nextInt: () => 9999 },
      0,
      TEST_COMBAT_COEFFICIENTS,
    );
    expect(target.armor).toBe(500);
    expect(target.shield).toBeLessThan(500);
  });

  it("무기 칸의 damage가 기본 공격 피해 방식을 정한다(스탯 공격력·적정은 칸 종류 그대로). 속성 피해는 건물 피해 0", () => {
    const body = {
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: { hp: 100, physical_attack: 30, elemental_attack: 5 },
      moveIntervalMs: 1000,
      primaries: { str: 40, dex: 10, agi: 10, vit: 10, int: 1, wis: 1 },
    };
    const sword = specFromStats({
      ...body,
      weapon: { ...TEST_WEAPON, physical: { attack: 20, damage: "elemental" }, appropriate: { str: 20 } },
    });
    expect(sword.attack.kind).toBe("elemental");
    expect(sword.attack.statAttack).toBe(30);
    expect(sword.attack.attackPrimary).toBe(40);
    expect(buildingDamage(sword.attack, 1000, TEST_COMBAT_COEFFICIENTS)).toBe(0);
    const mace = specFromStats({
      ...body,
      weapon: { ...TEST_WEAPON, physical: undefined, elemental: { attack: 20, damage: "physical" } },
    });
    expect(mace.attack.kind).toBe("physical");
    expect(mace.attack.statAttack).toBe(5);
    expect(mace.attack.attackPrimary).toBe(1);
    // 옛 자료(damage 없음)는 칸 종류 그대로
    expect(specFromStats({ ...body, weapon: TEST_WEAPON }).attack.kind).toBe("physical");
  });

  it("기본 공격 MP는 무기 mpCost만큼(피해 방식과 상관없다)", () => {
    const user = unitFrom(unit(1, 1, 1, 5, 10, { mpMax: 10, mpCost: 3 }));
    expect(user.attack.kind).toBe("physical");
    expect(ready(user, 0, TEST_COMBAT_COEFFICIENTS)).toBe(true);
    spend(user, 0, TEST_COMBAT_COEFFICIENTS);
    expect(user.mpMilli).toBe(7000);
    user.mpMilli = 2000;
    user.nextActionMs = 0;
    expect(ready(user, 0, TEST_COMBAT_COEFFICIENTS)).toBe(false);
    const free = unitFrom(unit(2, 1, 1, 5, 11));
    spend(free, 0, TEST_COMBAT_COEFFICIENTS);
    expect(free.mpMilli).toBe(0);
  });

  it("무기 곡선 range_interval: 공격 간격 × 사거리 예산(D-564 1594). 고르지 않으면 그대로", () => {
    const body = { id: 1, side: 1, party: 1, x: 0, y: 0, stats: { hp: 100 }, moveIntervalMs: 1000 };
    const plain = specFromStats({ ...body, weapon: { ...TEST_WEAPON, range: 4 } });
    const budget = specFromStats({
      ...body,
      weapon: { ...TEST_WEAPON, range: 4, curves: ["range_interval"] },
    });
    expect(budget.attackIntervalMs).toBe(Math.floor((plain.attackIntervalMs * 1300) / 1000));
  });
});

describe("리플레이(부딪힘 피해 = 지속 피해 사건 move_collision)", () => {
  it("사건만으로 되짚은 체력이 판정과 같다", () => {
    const map = openMap(32);
    map.passable[10 * 32 + 8] = 0;
    const push = skill({ displace: { kind: "knockback", cells: 3 }, cooldownMs: 3000 });
    const init = fight([unit(1, 1, 1, 5, 10, { skills: [push], maxHp: 5000 }), dummy(101, 6, 10)], map);
    init.limitMs = 5000;
    const recorded = recordBattleReplay(init, {});
    const replay = recorded.replay;
    const collision = replay.effects.findIndex((effect) => effect.id === MOVE_COLLISION);
    expect(collision).toBeGreaterThanOrEqual(0);
    expect(replay.events.some((event) => event.k === "dot" && event.effect === collision)).toBe(true);
    const first = replay.keyframes[0];
    if (!first) throw new Error("no keyframe");
    const state = stateFromKeyframe(first);
    for (const event of replay.events) applyReplayEvent(state, event);
    replay.units.forEach((row, index) => {
      const real = byId(recorded.state, row.id);
      expect([state[index]?.hp, state[index]?.armor]).toEqual([real.hp, real.armor]);
    });
  });
});
