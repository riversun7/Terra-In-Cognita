// 마법 스킬 모양 시험 — 연쇄·아군 하나 회복·쉴드 회복·느리게. docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-01, 마법 스킬)"
import { SKILL_SHAPES } from "@terra/content";
import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle, snapshotBattle } from "./battle.ts";
import type { BattleInit, CombatUnitSpec } from "./battleTypes.ts";
import { TEST_COMBAT_CATALOG, skillsOf } from "./catalog.ts";
import { type SkillData, skillFromData } from "./skills.ts";
import { duel, openMap, unit } from "./testBattle.ts";

const effects = new Map(TEST_COMBAT_CATALOG.effects.map((effect) => [effect.id, effect]));

/** 시험 스킬 자료: 비용·시전·쿨 0인 속성 기반 MP 스킬 */
const magic = (extra: Partial<SkillData>): SkillData => ({
  id: "test_magic",
  shape: "projectile",
  trigger: "active",
  resource: "mp",
  cost: 0,
  castMs: 0,
  cooldownMs: 5000,
  target: "enemy",
  range: 6,
  radius: 0,
  damage: "elemental",
  base: "elemental",
  formula: [],
  conditions: [],
  effects: [],
  gradePm: [1000],
  ...extra,
});

/** 크리 없이 늘 맞는 시전자(속성 기반 → E = 실제 공격력 20) */
const caster = (skill: SkillData, extra: Partial<CombatUnitSpec> = {}): CombatUnitSpec => {
  const base = unit(1, 1, 1, 10, 10, { mpMax: 100 });
  return {
    ...base,
    attack: { ...base.attack, weaponCritPm: 0 },
    skills: [skillFromData(skill, 1, effects)],
    ...extra,
  };
};

function fight(units: CombatUnitSpec[]): BattleInit {
  return {
    id: 7,
    kind: "normal",
    seed: 7,
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

/** 전투를 만들고 시전자(ID 1) 말고는 움직이지 않게 묶는다 */
function frozen(units: CombatUnitSpec[]) {
  const battle = createBattle(fight(units));
  for (const state of battle.state.units) if (state.id !== 1) state.nextMoveMs = Number.MAX_SAFE_INTEGER;
  const byId = (id: number) => {
    const found = battle.state.units.find((u) => u.id === id);
    if (!found) throw new Error(`unit ${id}`);
    return found;
  };
  return { battle, byId };
}

/** y = 10 줄에 선 적(체력 1000) */
const enemy = (id: number, x: number): CombatUnitSpec => unit(id, 2, 11, x, 10, { maxHp: 1000 });

describe("연쇄 스킬(chain)", () => {
  it("첫 대상에서 튐 거리 안 가장 가까운 적으로 차례로 튀고(최대 대상 수), 튈 때마다 피해가 줄어든다", () => {
    const chain = magic({ shape: "chain", chain: { targets: 3, jump: 2, falloffPm: 500 } });
    const { battle, byId } = frozen([
      caster(chain),
      enemy(101, 13),
      enemy(102, 15),
      enemy(103, 17),
      enemy(104, 25),
    ]);
    battle.step([]);
    // 20 → 10(×500‰) → 5. 네 번째 적은 최대 대상 수(3) 밖이고 튐 거리 밖이다
    expect([101, 102, 103, 104].map((id) => byId(id).hp)).toEqual([980, 990, 995, 1000]);
  });

  it("튐 거리 안에 다음 적이 없으면 거기서 멈춘다", () => {
    const chain = magic({ shape: "chain", chain: { targets: 3, jump: 2, falloffPm: 500 } });
    const { battle, byId } = frozen([
      caster(chain),
      unit(101, 2, 11, 13, 10, { maxHp: 1000 }),
      unit(102, 2, 11, 16, 10, { maxHp: 1000 }),
    ]);
    battle.step([]);
    expect([101, 102].map((id) => byId(id).hp)).toEqual([980, 1000]);
  });
});

describe("아군 하나 대상 스킬(대상 ally, 반지름 0, 사거리 ≥ 1)", () => {
  const heal = magic({
    shape: "heal",
    target: "ally",
    range: 5,
    damage: "none",
    formula: [{ part: "heal", pm: 250 }],
    conditions: [{ part: "target_hp_below", pct: 70 }],
  });
  /** 시전자(가득)·아군 셋(2·3은 사거리 안, 4는 밖)·멀리 보이는 적 하나 */
  function party(hp: readonly [number, number, number]) {
    const made = frozen([
      caster(heal, { maxHp: 1000 }),
      unit(2, 1, 1, 12, 10, { maxHp: 1000 }),
      unit(3, 1, 1, 11, 10, { maxHp: 1000 }),
      unit(4, 1, 1, 20, 10, { maxHp: 1000 }),
      unit(101, 2, 11, 10, 18),
    ]);
    made.byId(2).hp = hp[0];
    made.byId(3).hp = hp[1];
    made.byId(4).hp = hp[2];
    return made;
  }

  it("사거리 안에서 체력 비율이 가장 낮은 아군 하나만 고친다(사거리 밖은 더 다쳐도 고르지 않는다)", () => {
    const { battle, byId } = party([500, 600, 100]);
    battle.step([]);
    expect([2, 3, 4].map((id) => byId(id).hp)).toEqual([750, 600, 100]);
    expect(byId(1).skillReadyMs[0]).toBe(5000);
  });

  it("조건(대상 체력 70% 아래)이 맞지 않으면 쓰지 않는다", () => {
    const { battle, byId } = party([800, 900, 100]);
    battle.step([]);
    expect([2, 3, 4].map((id) => byId(id).hp)).toEqual([800, 900, 100]);
    expect(byId(1).skillReadyMs[0]).toBe(0);
  });
});

describe("쉴드 회복(공식 부품 shield)", () => {
  it("쉴드가 빈 아군 가운데 쉴드 비율이 가장 낮은 하나에게 최대 쉴드 HP의 ‰만큼 채운다(최대에서 멈춤)", () => {
    const ward = magic({
      shape: "buff",
      target: "ally",
      range: 5,
      damage: "none",
      formula: [{ part: "shield", pm: 500 }],
    });
    const { battle, byId } = frozen([
      caster(ward, { shieldHp: 1000 }),
      unit(2, 1, 1, 12, 10, { shieldHp: 1000 }),
      unit(3, 1, 1, 11, 10, { shieldHp: 400 }),
      unit(101, 2, 11, 10, 18),
    ]);
    byId(1).nextMoveMs = Number.MAX_SAFE_INTEGER;
    byId(2).shield = 100;
    byId(3).shield = 300;
    battle.step([]);
    expect([1, 2, 3].map((id) => byId(id).shield)).toEqual([1000, 600, 300]);
    // 쿨(5초) 뒤에는 600/1000 = 600‰ 대 300/400 = 750‰ → 2가 또 받고 최대에서 멈춘다
    for (let tick = 1; tick <= 50; tick++) battle.step([]);
    expect([2, 3].map((id) => byId(id).shield)).toEqual([1000, 300]);
  });
});

/** 이동 명령을 받은 유닛 하나가 2초(20틱) 동안 간 칸 수. chillPm이 있으면 그만큼 느리게 하는 디버프를 건다 */
function stepsIn2s(chillPm: number): number {
  const battle = createBattle(fight([unit(1, 1, 1, 2, 10), unit(101, 2, 11, 30, 30)]));
  const walker = battle.state.units.find((u) => u.id === 1);
  if (!walker) throw new Error("walker");
  if (chillPm > 0)
    walker.effects.push({
      id: "chill",
      kind: "debuff",
      stat: "move_speed",
      valueMode: "permille",
      status: null,
      tickMs: 0,
      value: chillPm,
      stacks: 1,
      untilMs: -1,
      nextTickMs: 0,
    });
  battle.step([{ tick: 0, kind: "command", unit: 1, command: { kind: "move", cell: 10 * 32 + 25 } }]);
  for (let tick = 1; tick < 20; tick++) battle.step([]);
  return walker.x - 2;
}

describe("느리게(효과 move_speed)", () => {
  it("이동 간격 = 간격 × 1000 ÷ (1000 − 느리게 ‰): 500‰이면 두 배 느리다", () => {
    // 간격 500ms: 0·500·1000·1500ms에 한 칸씩 = 4칸, 500‰ 느리게면 1000ms 간격 = 2칸
    expect(stepsIn2s(0)).toBe(4);
    expect(stepsIn2s(500)).toBe(2);
  });
});

describe("마법 자료(팩과 같은 TEST_COMBAT_CATALOG)", () => {
  const magicIds = [
    "frost_bolt",
    "chain_lightning",
    "flame_burst",
    "stone_spike",
    "light_heal",
    "radiant_ward",
    "dark_curse",
  ];

  it("마법 스킬은 모두 속성 기반·MP이고, 일곱 모양(SKILL_SHAPES, 움직임 move 빼고)을 모두 쓴다", () => {
    const skills = TEST_COMBAT_CATALOG.skills.filter((skill) => magicIds.includes(skill.id));
    expect(skills.map((skill) => skill.id)).toEqual(magicIds);
    for (const skill of skills) expect([skill.base, skill.resource]).toEqual(["elemental", "mp"]);
    const shapes = new Set(TEST_COMBAT_CATALOG.skills.map((skill) => skill.shape));
    // move(움직이기만 하는 스킬, docs/adr/2026-11-15-combat-moves.md)는 팩에 아직 없다(생성기 3단계가 만든다)
    expect([...SKILL_SHAPES].filter((shape) => !shapes.has(shape))).toEqual(["move"]);
  });

  it("속성 지팡이는 속성 공격력 칸만 있고(D-465), 옵션 계수는 그 계열 기본형 칸 하나, 장비 스킬은 마법 스킬이다", () => {
    const staffs = TEST_COMBAT_CATALOG.equipment.filter(
      (item) => item.id.endsWith("_staff") && item.id !== "test_staff",
    );
    // 계열 기본형 칸(50 §2.1): 물 0 · 불 2 · 바람 4 · 땅 6 · 빛 8 · 어둠 10
    const slotOf = {
      water_staff: 0,
      fire_staff: 2,
      wind_staff: 4,
      earth_staff: 6,
      light_staff: 8,
      dark_staff: 10,
    };
    expect(staffs.map((item) => item.id).toSorted()).toEqual(Object.keys(slotOf).toSorted());
    for (const item of staffs) {
      expect(item.weapon?.physical).toBeUndefined();
      expect(item.weapon?.elemental?.attack).toBeGreaterThan(0);
      const slots = (item.weapon?.skillElementsPm ?? []).flatMap((pm, i) => (pm > 0 ? [i] : []));
      expect(slots).toEqual([Reflect.get(slotOf, item.id)]);
      for (const id of item.skills) expect(magicIds).toContain(id);
    }
  });

  it("마법 스킬을 섞은 전투도 같은 입력이면 같고, 스냅숏에서 다시 켜도 끝 상태가 바이트까지 같다", () => {
    const base = duel(6, 33);
    const init = {
      ...base,
      units: base.units.map((spec, i) => ({
        ...spec,
        maxHp: 3000,
        shieldHp: 200,
        mpMax: 200,
        mpRegen: 600,
        range: 3,
        skills: skillsOf(TEST_COMBAT_CATALOG, [magicIds[i % magicIds.length] ?? "frost_bolt", "dark_curse"]),
      })),
    };
    const snapshots: string[] = [];
    const a = runBattle(init, [], (snapshot) => snapshots.push(snapshot));
    const b = runBattle(init, []);
    expect(a.finalState).toBe(b.finalState);
    const restored = restoreBattle(init, snapshots[0] ?? "");
    expect(snapshotBattle(restored.runToEnd([]).state)).toBe(a.finalState);
  });
});
