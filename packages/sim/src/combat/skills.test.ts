import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle, snapshotBattle } from "./battle.ts";
import type { BattleInit, CombatUnitSpec } from "./battleTypes.ts";
import { TEST_COMBAT_CATALOG, skillsOf } from "./catalog.ts";
import type { EffectDef } from "./effects.ts";
import { type SkillData, skillFromData } from "./skills.ts";
import { duel, openMap, unit } from "./testBattle.ts";

const effects = new Map(TEST_COMBAT_CATALOG.effects.map((effect) => [effect.id, effect]));
const data = (id: string): SkillData => {
  const found = TEST_COMBAT_CATALOG.skills.find((skill) => skill.id === id);
  if (!found) throw new Error(`fixture ${id}`);
  return found;
};

/** 두 유닛(또는 더)이 선 작은 일반 전투 */
function fight(units: CombatUnitSpec[]): BattleInit {
  return {
    id: 9,
    kind: "normal",
    seed: 9,
    map: openMap(32),
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

const byId = (battle: ReturnType<typeof createBattle>, id: number) => {
  const found = battle.state.units.find((u) => u.id === id);
  if (!found) throw new Error(`unit ${id}`);
  return found;
};

describe("스킬(부품 조합, D-426~D-428)", () => {
  it("조건(적정 스탯 이상)이 맞으면 스킬을 쓰고 자원·쿨을 쓴다. 맞으면 효과가 걸린다", () => {
    const battle = createBattle(
      fight([
        unit(1, 1, 1, 10, 10, { skills: skillsOf(TEST_COMBAT_CATALOG, ["power_strike"]), maxHp: 5000 }),
        unit(101, 2, 11, 11, 10, { maxHp: 5000 }),
      ]),
    );
    battle.step([]);
    const user = byId(battle, 1);
    expect(user.skillReadyMs[0]).toBe(5000);
    expect(user.staminaMilli).toBeLessThan(1000 * 1000);
    expect(byId(battle, 101).effects.map((e) => e.id)).toEqual(["defense_down"]);
  });

  it("조건이 맞지 않으면(유닛 공격력 < 적정치) 스킬을 쓰지 않는다", () => {
    const weak = unit(1, 1, 1, 10, 10, { skills: skillsOf(TEST_COMBAT_CATALOG, ["power_strike"]) });
    const battle = createBattle(
      fight([{ ...weak, attack: { ...weak.attack, attackStat: 5 } }, unit(101, 2, 11, 11, 10)]),
    );
    battle.step([]);
    expect(byId(battle, 1).skillReadyMs[0]).toBe(0);
  });

  it("시전 시간(800ms)이 지난 틱에 푼다. 그 전에는 피해가 없다", () => {
    const caster = unit(1, 1, 1, 10, 10, {
      skills: skillsOf(TEST_COMBAT_CATALOG, ["fire_bolt"]),
      mpMax: 100,
      range: 6,
    });
    const target = unit(101, 2, 11, 14, 10, { maxHp: 1000, moveIntervalMs: 1_000_000_000 });
    const battle = createBattle(fight([caster, target]));
    byId(battle, 101).nextMoveMs = Number.MAX_SAFE_INTEGER;
    for (let tick = 0; tick < 8; tick++) battle.step([]);
    expect(byId(battle, 1).cast).not.toBeNull();
    expect(byId(battle, 101).hp).toBe(1000);
    battle.step([]);
    expect(byId(battle, 1).cast).toBeNull();
    // 20 × 1(적정치) × 1.2(스킬 배율) = 24
    expect(byId(battle, 101).hp).toBe(976);
  });

  it("기절한 유닛은 행동하지 않고, 저항 상한 1000‰이면 걸리지 않는다(D-429)", () => {
    const sure = {
      ...data("shock_bash"),
      effects: [{ effect: "stun", value: 0, chancePm: 1000, durationMs: 1500 }],
    };
    const stunner = (stun: EffectDef) =>
      unit(1, 1, 1, 10, 10, { skills: [skillFromData(sure, 1, new Map([["stun", stun]]))], maxHp: 5000 });
    const victim = unit(101, 2, 11, 11, 10, { maxHp: 5000, primaries: [0, 0, 0, 1000, 0, 0] });
    const plain = effects.get("stun");
    if (!plain) throw new Error("fixture");
    const immune = { ...plain, resist: { cap: 1000, halfConstant: 1, weights: [0, 0, 0, 1000, 0, 0] } };
    const battle2 = createBattle(fight([stunner(immune), victim]));
    battle2.step([]);
    expect(byId(battle2, 101).effects).toEqual([]);
    // 저항이 없으면 반드시 걸리고, 기절한 동안(1.5초) 쪽은 공격하지 못한다
    const open = createBattle(fight([stunner(plain), { ...victim, primaries: [0, 0, 0, 0, 0, 0] }]));
    for (let tick = 0; tick < 15; tick++) open.step([]);
    expect(byId(open, 1).hp).toBe(5000);
    for (let tick = 0; tick < 10; tick++) open.step([]);
    expect(byId(open, 1).hp).toBeLessThan(5000);
  });

  it("아군 대상 스킬은 반지름 안 아군 모두에게 효과를 건다", () => {
    const battle = createBattle(
      fight([
        unit(1, 1, 1, 10, 10, { skills: skillsOf(TEST_COMBAT_CATALOG, ["war_cry"]) }),
        unit(2, 1, 1, 12, 10),
        unit(3, 1, 1, 10, 20),
        unit(101, 2, 11, 18, 10),
      ]),
    );
    battle.step([]);
    expect([1, 2, 3].map((id) => byId(battle, id).effects.map((e) => e.id))).toEqual([
      ["attack_up"],
      ["attack_up"],
      [],
    ]);
  });

  it("든 무기에 맞는 칸이 없는 스킬은 AI가 고르지 않고, 지속형도 걸리지 않는다(D-490). 맨손 스킬은 맨손으로 쓴다", () => {
    const strike = skillsOf(TEST_COMBAT_CATALOG, ["power_strike", "iron_skin"]);
    // 속성 칸만 든(지팡이) 유닛: 물리 기반 강타·쇠 피부를 쓸 수 없다
    const staffed = createBattle(
      fight([
        unit(1, 1, 1, 10, 10, { skills: strike, maxHp: 5000, weaponFields: ["elemental"] }),
        unit(101, 2, 11, 11, 10, { maxHp: 5000 }),
      ]),
    );
    expect(byId(staffed, 1).effects).toEqual([]);
    for (let i = 0; i < 20; i++) staffed.step([]);
    expect(byId(staffed, 1).skillReadyMs).toEqual([0, 0]);
    expect(byId(staffed, 101).effects).toEqual([]);
    // 맨손(칸 없음)이어도 맨손 스킬로 바꾸면 쓴다
    const bare = createBattle(
      fight([
        unit(1, 1, 1, 10, 10, {
          skills: [skillFromData({ ...data("power_strike"), bareHand: true }, 1, effects)],
          maxHp: 5000,
          weaponFields: [],
        }),
        unit(101, 2, 11, 11, 10, { maxHp: 5000 }),
      ]),
    );
    bare.step([]);
    expect(byId(bare, 1).skillReadyMs[0]).toBe(5000);
  });

  it("지속형 스킬은 전투 처음부터 끝까지 효과가 걸려 있다", () => {
    const battle = createBattle(
      fight([
        unit(1, 1, 1, 10, 10, { skills: skillsOf(TEST_COMBAT_CATALOG, ["iron_skin"]) }),
        unit(101, 2, 11, 20, 10),
      ]),
    );
    expect(byId(battle, 1).effects).toMatchObject([{ id: "guard", untilMs: -1, value: 50 }]);
  });

  it("체력 조건 스킬(응급 처치)은 체력이 절반 아래일 때만 쓴다", () => {
    const battle = createBattle(
      fight([
        unit(1, 1, 1, 10, 10, { skills: skillsOf(TEST_COMBAT_CATALOG, ["first_aid"]), maxHp: 1000 }),
        unit(101, 2, 11, 20, 10),
      ]),
    );
    battle.step([]);
    expect(byId(battle, 1).skillReadyMs[0]).toBe(0);
    byId(battle, 1).hp = 400;
    battle.step([]);
    expect(byId(battle, 1).hp).toBe(600);
  });

  it("속성 기반 스킬은 기본 공격(칼)이 아니라 속성 공격 사양(맨손 속성·m.atk)으로 풀고, 속성 몫은 쉴드부터(D-463 211)", () => {
    const bolt = skillFromData(
      {
        ...data("fire_bolt"),
        cost: 0,
        castMs: 0,
        effects: [],
        formula: [{ part: "element", element: 2, pm: 100 }],
      },
      1,
      effects,
    );
    const caster = unit(1, 1, 1, 10, 10, { skills: [bolt] });
    // 기본 공격(칼)은 200, 속성 공격 사양은 30(크리 없음). 시전자 속성값이 없어 가산 0 → E = 30
    const sword = { ...caster.attack, weaponAttack: 200 };
    const elemental = { ...caster.attack, kind: "elemental" as const, weaponAttack: 30, weaponCritPm: 0 };
    const battle = createBattle(
      fight([
        { ...caster, attack: sword, skillAttack: { physical: sword, elemental } },
        unit(101, 2, 11, 11, 10, { maxHp: 5000, armorHp: 1000, shieldHp: 1000 }),
      ]),
    );
    battle.step([]);
    const target = byId(battle, 101);
    expect(target.shield).toBe(970);
    expect(target.armor).toBe(1000);
    expect(target.hp).toBe(5000);
  });

  it("등급 표가 공식·효과 값에 곱해진다", () => {
    const g1 = skillFromData(data("power_strike"), 1, effects);
    const g10 = skillFromData(data("power_strike"), 10, effects);
    expect(g1.attackMulPm).toBe(1800);
    expect(g10.attackMulPm).toBe(1000 + 800 * 2);
    expect(g10.effects[0]?.value).toBe(200);
  });

  it("스킬·효과가 섞인 전투도 같은 입력이면 같고, 스냅숏에서 다시 켜도 끝 상태가 바이트까지 같다", () => {
    const base = duel(6, 21);
    const kit = ["power_strike", "shock_bash", "war_cry", "first_aid", "iron_skin"];
    const init = {
      ...base,
      units: base.units.map((spec, i) => ({
        ...spec,
        maxHp: 6000,
        skills: skillsOf(TEST_COMBAT_CATALOG, [kit[i % kit.length] ?? "iron_skin", "iron_skin"]),
      })),
    };
    const snapshots: string[] = [];
    const a = runBattle(init, [], (snapshot) => snapshots.push(snapshot));
    const b = runBattle(init, []);
    expect(a.finalState).toBe(b.finalState);
    expect(a.finalState).toContain("defense_down");
    const restored = restoreBattle(init, snapshots[0] ?? "");
    expect(restored.state.tick).toBe(300);
    expect(snapshotBattle(restored.runToEnd([]).state)).toBe(a.finalState);
  });
});
