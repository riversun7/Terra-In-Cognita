import {
  type BattleReplay,
  type ReplayUnitState,
  admitJoined,
  applyReplayEvent,
  decodeBattleReplay,
  encodeBattleReplay,
  stateFromKeyframe,
} from "@terra/protocol/battleReplay";
import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle, snapshotBattle } from "./battle.ts";
import { unitFrom } from "./battleState.ts";
import type { BattleTrace } from "./battleTrace.ts";
import type { BattleInit, BattleInput, CombatUnitSpec, UnitState } from "./battleTypes.ts";
import { TEST_COMBAT_CATALOG } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS, msToTicks } from "./coefficients.ts";
import {
  DEFAULT_MOVE_COEFFICIENTS,
  closeShotPm,
  dotTotalPm,
  magicDistancePm,
  magicTargetsPm,
  multishotPm,
  rangeIntervalPm,
} from "./curves.ts";
import type { MotionKind, StealthCause } from "./moveParts.ts";
import { lineCells } from "./moves.ts";
import { recordBattleReplay } from "./replay.ts";
import { type CombatSkill, type SkillData, resolveSkill, skillFromData, startSkill } from "./skills.ts";
import { openMap, unit } from "./testBattle.ts";
import { movesBaselineHashes } from "./testMovesBaseline.ts";

const effects = new Map(TEST_COMBAT_CATALOG.effects.map((effect) => [effect.id, effect]));
const m = DEFAULT_MOVE_COEFFICIENTS;

/** 시험 스킬: 적 하나에 붙어서 치는 물리 스킬(쿨 3초)에 칸을 덮어쓴다 */
function skill(over: Partial<SkillData>): CombatSkill {
  return skillFromData(
    {
      id: "test_move",
      shape: "single",
      trigger: "active",
      resource: "stamina",
      cost: 1,
      castMs: 0,
      cooldownMs: 3000,
      target: "enemy",
      range: 1,
      radius: 0,
      damage: "physical",
      base: "physical",
      formula: [{ part: "attack_mul", pm: 1500 }],
      conditions: [],
      effects: [],
      gradePm: [1000],
      ...over,
    },
    1,
    effects,
  );
}

function fight(units: CombatUnitSpec[], map = openMap(32), seed = 9): BattleInit {
  return {
    id: 9,
    kind: "normal",
    seed,
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

/** 움직이지 않는 과녁(시야 0이라 아무도 보지 않고 걷지 않는다) */
const dummy = (id: number, x: number, y: number, extra: Partial<CombatUnitSpec> = {}): CombatUnitSpec =>
  unit(id, 2, 11, x, y, { sight: 0, maxHp: 5000, ...extra });

interface Seen {
  motion: { unit: number; kind: MotionKind; from: [number, number]; to: [number, number] }[];
  stealth: { unit: number; on: boolean; cause: StealthCause }[];
  run: { unit: number; on: boolean }[];
  multishot: { unit: number; shots: number }[];
  hits: { unit: number; target: number; skill: string }[];
}

function recorder(): { trace: BattleTrace; seen: Seen } {
  const seen: Seen = { motion: [], stealth: [], run: [], multishot: [], hits: [] };
  const trace: BattleTrace = {
    attack() {},
    building() {},
    skill() {},
    skillHit(unit, skillRow, target) {
      seen.hits.push({ unit: unit.id, target: target.id, skill: skillRow.id });
    },
    heal() {},
    dot() {},
    motion(unit, kind, fromX, fromY) {
      seen.motion.push({ unit: unit.id, kind, from: [fromX, fromY], to: [unit.x, unit.y] });
    },
    stealth(unit, on, cause) {
      seen.stealth.push({ unit: unit.id, on, cause });
    },
    run(unit, on) {
      seen.run.push({ unit: unit.id, on });
    },
    multishot(unit, _skill, _target, shots) {
      seen.multishot.push({ unit: unit.id, shots });
    },
  };
  return { trace, seen };
}

const byId = (state: { units: UnitState[] }, id: number): UnitState => {
  const found = state.units.find((u) => u.id === id);
  if (!found) throw new Error(`unit ${id}`);
  return found;
};
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe("움직임 부품이 없는 전투는 그대로(docs/adr/2026-11-15-combat-moves.md 4절)", () => {
  it("시범 6 대 6 끝 상태·리플레이 사건 지문이 바꾸기 전 코드(24f91102f1)와 같다", () => {
    expect(movesBaselineHashes()).toEqual({
      demo1: "9cc8c26e47eb4d66",
      demo7: "cca9acc8145b0310",
      demo42: "c136d8944d3a50ec",
      replay3: "c53aa789a05bce41",
    });
  });

  it("안 쓰면 상태·스킬에 움직임 칸이 없다(스냅숏 모양 그대로)", () => {
    const { state } = runBattle(fight([unit(1, 1, 1, 10, 10), unit(101, 2, 11, 14, 10)]), []);
    for (const row of state.units)
      for (const key of ["running", "stealthUntilMs", "detectUntilMs", "detectCells"])
        expect(key in row, key).toBe(false);
    const plain = skill({});
    for (const key of ["move", "displace", "curves", "shots"]) expect(key in plain, key).toBe(false);
  });
});

describe("계수 곡선(ADR 3절, [임시] 출발값)", () => {
  it("사거리 간격 예산·마법 거리·대상 수·지속 피해 합·연사·가까이 쏘기", () => {
    expect([1, 2, 5, 30].map((r) => rangeIntervalPm(r, m))).toEqual([1000, 1100, 1400, 2500]);
    expect([1, 2, 5, 9, 20].map((d) => magicDistancePm(d, m))).toEqual([1200, 1150, 1000, 800, 800]);
    expect([1, 2, 3, 20].map((n) => magicTargetsPm(n, m))).toEqual([1000, 550, 525, 300]);
    expect([0, 3000, 5000, 13_000, 60_000].map((ms) => dotTotalPm(ms, m))).toEqual([500, 1000, 900, 500, 500]);
    expect([1, 2, 3, 5, 8].map((n) => multishotPm(n, m))).toEqual([1000, 850, 700, 400, 300]);
    expect([closeShotPm(6, 2, m), closeShotPm(6, 3, m), closeShotPm(1, 1, m)]).toEqual([1200, 1000, 1000]);
  });

  it("곧은 줄은 주축 한 칸씩·부축 반올림(정수)", () => {
    expect(lineCells(0, 0, 3, 0)).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(lineCells(0, 0, 4, 2)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
    ]);
    expect(lineCells(5, 5, 5, 5)).toEqual([]);
  });

  /** 굴림이 늘 5000인 흐름: 명중(시험 유닛 100%)·회피 없음·크리 없음 */
  const flat = { nextInt: () => 5000 };
  const lost = (sk: CombatSkill, tx: number, others: number[] = []): number[] => {
    const caster = unitFrom(unit(1, 1, 1, 0, 10));
    const targets = [tx, ...others].map((x, i) => unitFrom(unit(101 + i, 2, 11, x, 10, { maxHp: 5000 })));
    const first = targets[0];
    if (!first) throw new Error("target");
    resolveSkill(caster, sk, first, [caster, ...targets], flat, 0, TEST_COMBAT_COEFFICIENTS);
    return targets.map((t) => 5000 - t.hp);
  };

  it("마법 거리: 붙으면 더 세고 멀면 약하다(고른 스킬만)", () => {
    const plain = skill({ range: 12 });
    const curved = skill({ range: 12, curves: ["magic_distance"] });
    const [near] = lost(curved, 1);
    const [nearPlain] = lost(plain, 1);
    const [far] = lost(curved, 11);
    const [farPlain] = lost(plain, 11);
    expect(near).toBeGreaterThan(nearPlain ?? 0);
    expect(far).toBeLessThan(farPlain ?? 0);
  });

  it("마법 대상 수: 셋을 맞히면 대상마다 약하다, 하나면 그대로", () => {
    const plain = skill({ shape: "area", range: 12, radius: 3 });
    const curved = skill({ shape: "area", range: 12, radius: 3, curves: ["magic_targets"] });
    const three = lost(curved, 5, [6, 7]);
    const threePlain = lost(plain, 5, [6, 7]);
    three.forEach((value, i) => expect(value).toBeLessThan(threePlain[i] ?? 0));
    expect(lost(curved, 5)).toEqual(lost(plain, 5));
  });

  it("지속 피해 합: 긴 지속 피해는 세기가 준다", () => {
    const part = { effect: "burn", value: 100, chancePm: 1000, durationMs: 13_000 };
    const run = (curves: SkillData["curves"]): number => {
      const caster = unitFrom(unit(1, 1, 1, 0, 10));
      const target = unitFrom(unit(101, 2, 11, 1, 10, { maxHp: 5000 }));
      const sk = skill({ effects: [part], ...(curves ? { curves } : {}) });
      resolveSkill(caster, sk, target, [caster, target], flat, 0, TEST_COMBAT_COEFFICIENTS);
      return target.effects.find((e) => e.id === "burn")?.value ?? -1;
    };
    expect(run(undefined)).toBe(100);
    expect(run(["dot_total"])).toBe(50);
  });

  it("사거리 간격 예산: 고른 스킬은 뒤 행동 간격이 사거리만큼 길다", () => {
    const caster = unitFrom(unit(1, 1, 1, 0, 10, { skills: [skill({ range: 5, curves: ["range_interval"] })] }));
    startSkill(caster, 0, 101, 0, TEST_COMBAT_COEFFICIENTS);
    expect(caster.nextActionMs).toBe(700);
    const plain = unitFrom(unit(2, 1, 1, 0, 11, { skills: [skill({ range: 5 })] }));
    startSkill(plain, 0, 101, 0, TEST_COMBAT_COEFFICIENTS);
    expect(plain.nextActionMs).toBe(500);
  });

  it("연사: 대상에 발 수만큼 따로 맞고 한 발은 약하다", () => {
    const one = lost(skill({ shape: "projectile", range: 6 }), 3);
    const caster = unitFrom(unit(1, 1, 1, 0, 10));
    const target = unitFrom(unit(101, 2, 11, 3, 10, { maxHp: 5000 }));
    const { trace, seen } = recorder();
    resolveSkill(
      caster,
      skill({ shape: "projectile", range: 6, shots: 3 }),
      target,
      [caster, target],
      flat,
      0,
      TEST_COMBAT_COEFFICIENTS,
      trace,
    );
    expect(seen.multishot).toEqual([{ unit: 1, shots: 3 }]);
    expect(seen.hits).toHaveLength(3);
    // 한 발 700‰ × 3 = 2.1배 근처(버림 차이 안)
    expect(5000 - target.hp).toBeGreaterThan(one[0] ?? 0);
    expect(5000 - target.hp).toBeLessThan((one[0] ?? 0) * 3);
  });

  it("가까이 쏘기: 원거리 스킬이 2칸 안이면 더 세다", () => {
    const [close] = lost(skill({ shape: "projectile", range: 6, curves: ["close_shot"] }), 2);
    const [closePlain] = lost(skill({ shape: "projectile", range: 6 }), 2);
    expect(close).toBeGreaterThan(closePlain ?? 0);
  });
});

describe("이동 부품(ADR 2절)", () => {
  const dashSkill = skill({ range: 6, move: { kind: "dash", cells: 5 } });

  it("돌진: 목표 옆까지 곧게 가서 끝에 친다", () => {
    const { trace, seen } = recorder();
    const battle = createBattle(
      fight([unit(1, 1, 1, 5, 10, { skills: [dashSkill] }), dummy(101, 11, 10)]),
      TEST_COMBAT_COEFFICIENTS,
      trace,
    );
    battle.step([]);
    const user = byId(battle.state, 1);
    expect([user.x, user.y]).toEqual([10, 10]);
    expect(seen.motion).toEqual([{ unit: 1, kind: "dash", from: [5, 10], to: [10, 10] }]);
    expect(byId(battle.state, 101).hp).toBeLessThan(5000);
  });

  it("돌진: 다른 유닛에 막히면 그 앞에서 멈추고 닿지 못하면 치지 않는다", () => {
    const battle = createBattle(
      fight([
        unit(1, 1, 1, 5, 10, { skills: [dashSkill] }),
        unit(2, 1, 2, 8, 10, { sight: 0 }),
        dummy(101, 11, 10),
      ]),
    );
    // 막는 동료는 자리 지키기(파티 명령 D-549)로 서 있다
    battle.step([{ tick: 0, kind: "order", party: 2, order: { kind: "hold" } }]);
    expect([byId(battle.state, 1).x, byId(battle.state, 1).y]).toEqual([7, 10]);
    expect(byId(battle.state, 101).hp).toBe(5000);
  });

  it("도약: 막는 유닛·바위를 넘어 목표 옆에 내린다. 성벽은 넘지 않는다", () => {
    const leap = skill({ range: 6, move: { kind: "leap", cells: 6 } });
    const map = openMap(32);
    for (let y = 0; y < 32; y++) map.passable[y * 32 + 8] = 0;
    const battle = createBattle(fight([unit(1, 1, 1, 5, 10, { skills: [leap] }), dummy(101, 11, 10)], map));
    battle.step([]);
    expect(cheb(byId(battle.state, 1), byId(battle.state, 101))).toBe(1);
    expect(byId(battle.state, 101).hp).toBeLessThan(5000);

    const walled = openMap(32);
    walled.buildings = [
      { id: 7, cells: Array.from({ length: 32 }, (_, y) => y * 32 + 8), durability: 100, nexus: false, wall: true },
    ];
    const blocked = createBattle(fight([unit(1, 1, 1, 5, 10, { skills: [leap] }), dummy(101, 11, 10)], walled));
    blocked.step([]);
    expect(byId(blocked.state, 1).x).toBeLessThan(8);
    expect(byId(blocked.state, 101).hp).toBe(5000);
  });

  it("점멸: 자기 시야 안에서만 순간이동한다(toward), away는 멀어진다", () => {
    const toward = skill({ range: 10, move: { kind: "blink", cells: 8, dir: "toward" } });
    const far = createBattle(fight([unit(1, 1, 1, 5, 10, { skills: [toward] }), dummy(101, 15, 10)]));
    far.step([]);
    expect(cheb(byId(far.state, 1), byId(far.state, 101))).toBe(2);
    // 시야 3인 유닛(멀리 보는 동료가 목표를 보여 준다)은 3칸 안까지만
    const short = createBattle(
      fight([
        unit(1, 1, 1, 5, 10, { skills: [toward], sight: 3 }),
        unit(2, 1, 1, 5, 20, { sight: 20, moveIntervalMs: 1_000_000, range: 0 }),
        dummy(101, 15, 10),
      ]),
    );
    short.step([]);
    expect(cheb(byId(short.state, 1), { x: 5, y: 10 })).toBeLessThanOrEqual(3);
    expect(byId(short.state, 1).x).toBeGreaterThan(5);

    const away = skill({ shape: "move", damage: "none", range: 3, move: { kind: "blink", cells: 4, dir: "away" } });
    const flee = createBattle(fight([unit(1, 1, 1, 10, 10, { skills: [away] }), dummy(101, 11, 10)]));
    flee.step([]);
    expect(cheb(byId(flee.state, 1), byId(flee.state, 101))).toBe(5);
  });

  it("뒷걸음: 목표 반대쪽으로 가고 못 지나가는 칸에서 멈춘다", () => {
    const back = skill({ shape: "move", damage: "none", range: 2, move: { kind: "backstep", cells: 3 } });
    const map = openMap(32);
    map.passable[10 * 32 + 6] = 0;
    const battle = createBattle(fight([unit(1, 1, 1, 8, 10, { skills: [back] }), dummy(101, 9, 10)], map));
    const { trace, seen } = recorder();
    const traced = createBattle(
      fight([unit(1, 1, 1, 8, 10, { skills: [back] }), dummy(101, 9, 10)], map),
      TEST_COMBAT_COEFFICIENTS,
      trace,
    );
    battle.step([]);
    traced.step([]);
    expect([byId(battle.state, 1).x, byId(battle.state, 1).y]).toEqual([7, 10]);
    expect(seen.motion.map((row) => row.kind)).toEqual(["backstep"]);
  });

  it("밀치기·끌어오기·묶기: 맞은 대상을 옮기거나 묶는다", () => {
    const push = skill({ displace: { kind: "knockback", cells: 3 } });
    const a = createBattle(fight([unit(1, 1, 1, 5, 10, { skills: [push] }), dummy(101, 6, 10)]));
    a.step([]);
    expect([byId(a.state, 101).x, byId(a.state, 101).y]).toEqual([9, 10]);

    const pull = skill({ shape: "projectile", range: 6, displace: { kind: "pull", cells: 4 } });
    const b = createBattle(fight([unit(1, 1, 1, 5, 10, { skills: [pull] }), dummy(101, 10, 10)]));
    b.step([]);
    expect([byId(b.state, 101).x, byId(b.state, 101).y]).toEqual([6, 10]);

    const root = skill({ displace: { kind: "root", durationMs: 2000 } });
    const c = createBattle(fight([unit(1, 1, 1, 5, 10, { skills: [root] }), dummy(101, 6, 10)]));
    c.step([]);
    expect(byId(c.state, 101).effects.map((e) => [e.id, e.status, e.untilMs])).toEqual([["move_root", "root", 2000]]);
  });

  it("은신: 적 편 시야에서 빠지고, 다가온 적에게 들키면 깨진다", () => {
    const hide = skill({
      shape: "buff",
      target: "self",
      damage: "none",
      cost: 0,
      cooldownMs: 600_000,
      move: { kind: "stealth", durationMs: 60_000 },
    });
    const { trace, seen } = recorder();
    const battle = createBattle(
      fight([
        // 기본 공격을 못 하게(소모 > 최대) — 공격으로 깨지지 않고 들킴으로만
        unit(1, 1, 1, 5, 10, { skills: [hide], staminaCost: 5000 }),
        unit(101, 2, 11, 12, 10, { maxHp: 5000 }),
      ]),
      TEST_COMBAT_COEFFICIENTS,
      trace,
    );
    battle.step([]);
    battle.step([]);
    expect(byId(battle.state, 1).stealthUntilMs).toBe(60_000);
    expect(battle.state.sides.find((side) => side.id === 2)?.visible).toEqual([]);
    for (let i = 0; i < 100 && seen.stealth.length < 2; i++) battle.step([]);
    expect(seen.stealth).toEqual([
      { unit: 1, on: true, cause: "skill" },
      { unit: 1, on: false, cause: "detected" },
    ]);
    expect(cheb(byId(battle.state, 1), byId(battle.state, 101))).toBeLessThanOrEqual(1);
  });

  it("은신: 공격하면 깨진다", () => {
    const hide = skill({
      shape: "buff",
      target: "self",
      damage: "none",
      cost: 0,
      cooldownMs: 600_000,
      move: { kind: "stealth", durationMs: 60_000 },
    });
    const { trace, seen } = recorder();
    const battle = createBattle(
      fight([unit(1, 1, 1, 5, 10, { skills: [hide], range: 6 }), dummy(101, 10, 10)]),
      TEST_COMBAT_COEFFICIENTS,
      trace,
    );
    for (let i = 0; i < 20; i++) battle.step([]);
    expect(seen.stealth.slice(0, 2)).toEqual([
      { unit: 1, on: true, cause: "skill" },
      { unit: 1, on: false, cause: "attack" },
    ]);
  });

  it("NPC 편(수비·다른 세력)도 같은 부품을 같은 판정으로 쓴다", () => {
    const battle = createBattle(
      fight([dummy(1, 5, 10, { side: 1, party: 1 }), unit(101, 2, 11, 11, 10, { skills: [dashSkill] })]),
    );
    battle.step([]);
    expect([byId(battle.state, 101).x, byId(battle.state, 101).y]).toEqual([6, 10]);
  });
});

describe("달리기(ADR 1절)", () => {
  const far = 20 * 32 + 28;

  it("run 명령은 걷기보다 빨리 가고 스태미나를 쓴다. 걷기는 무료", () => {
    const { trace, seen } = recorder();
    const battle = createBattle(
      fight([unit(1, 1, 1, 2, 20, { sight: 0 }), unit(2, 1, 1, 2, 22, { sight: 0 }), dummy(101, 30, 2)]),
      TEST_COMBAT_COEFFICIENTS,
      trace,
    );
    const inputs: BattleInput[] = [
      { tick: 0, kind: "command", unit: 1, command: { kind: "move", cell: far, run: true } },
      { tick: 0, kind: "command", unit: 2, command: { kind: "move", cell: 22 * 32 + 28 } },
    ];
    battle.step(inputs);
    for (let i = 0; i < 49; i++) battle.step([]);
    const runner = byId(battle.state, 1);
    const walker = byId(battle.state, 2);
    expect(runner.x - 2).toBeGreaterThan(walker.x - 2);
    expect(runner.running).toBe(true);
    expect(runner.staminaMilli).toBeLessThan(walker.staminaMilli);
    expect(walker.staminaMilli).toBe(1000 * 1000);
    expect(seen.run).toEqual([{ unit: 1, on: true }]);
  });

  it("스태미나가 모자라면 달리기가 꺼지고, 명령이 끝나면 꺼진다", () => {
    const { trace, seen } = recorder();
    const battle = createBattle(
      fight([unit(1, 1, 1, 2, 20, { sight: 0, staminaMax: 60, staminaRegen: 0 }), dummy(101, 30, 2)]),
      TEST_COMBAT_COEFFICIENTS,
      trace,
    );
    battle.step([{ tick: 0, kind: "command", unit: 1, command: { kind: "move", cell: far, run: true } }]);
    for (let i = 0; i < 60; i++) battle.step([]);
    expect(seen.run).toEqual([
      { unit: 1, on: true },
      { unit: 1, on: false },
    ]);
    expect(byId(battle.state, 1).running).toBeUndefined();

    const short = createBattle(fight([unit(1, 1, 1, 2, 20, { sight: 0 }), dummy(101, 30, 2)]));
    short.step([{ tick: 0, kind: "command", unit: 1, command: { kind: "move", cell: 20 * 32 + 4, run: true } }]);
    for (let i = 0; i < 20; i++) short.step([]);
    expect(byId(short.state, 1).command).toBeNull();
    expect(byId(short.state, 1).running).toBeUndefined();
  });
});

/** 두 편 모두 움직임 부품을 쓰는 4 대 4(결정성·재생 시험) */
function mixedBattle(seed: number): { init: BattleInit; inputs: BattleInput[] } {
  const hide = skill({
    id: "hide",
    shape: "buff",
    target: "self",
    damage: "none",
    cost: 0,
    cooldownMs: 20_000,
    move: { kind: "stealth", durationMs: 4000 },
  });
  const kit = [
    [skill({ id: "dash", range: 6, move: { kind: "dash", cells: 5 }, displace: { kind: "knockback", cells: 2 } })],
    [skill({ id: "volley", shape: "projectile", range: 7, shots: 3, curves: ["close_shot", "range_interval"] })],
    [
      skill({ id: "blink", range: 9, move: { kind: "blink", cells: 6, dir: "toward" } }),
      skill({ id: "pull", shape: "projectile", range: 6, displace: { kind: "pull", cells: 3 } }),
    ],
    [hide, skill({ id: "leap", range: 6, move: { kind: "leap", cells: 5 }, curves: ["magic_distance"] })],
  ];
  const units: CombatUnitSpec[] = [];
  for (let i = 0; i < 4; i++) {
    units.push(unit(1 + i, 1, 1, 9, 12 + i * 2, { skills: kit[i] ?? [], maxHp: 300, range: i === 1 ? 6 : 1 }));
    units.push(
      unit(101 + i, 2, 11, 20, 12 + i * 2, { skills: kit[3 - i] ?? [], maxHp: 300, range: i === 2 ? 6 : 1 }),
    );
  }
  return {
    init: fight(units, openMap(32), seed),
    inputs: [{ tick: 3, kind: "command", unit: 1, command: { kind: "attack", target: 0, run: true } }],
  };
}

/** 처음 키프레임에서 사건만으로 되짚은 끝 상태 */
function rebuilt(replay: BattleReplay): ReplayUnitState[] {
  const first = replay.keyframes[0];
  if (!first) throw new Error("no keyframe");
  const state = stateFromKeyframe(first);
  for (const event of replay.events) applyReplayEvent(state, event);
  admitJoined(replay, state, replay.result.endTick);
  return state;
}

describe("결정성·재생(ADR 4·5절)", () => {
  it("같은 입력이면 끝 상태가 바이트까지 같고, 스냅숏에서 다시 켜도 같다", () => {
    for (const seed of [1, 2, 3]) {
      const { init, inputs } = mixedBattle(seed);
      const a = runBattle(init, inputs);
      const b = runBattle(init, inputs);
      expect(a.finalState).toBe(b.finalState);
      const snaps: { tick: number; snap: string }[] = [];
      runBattle(init, inputs, (snap, tick) => snaps.push({ tick, snap }));
      const at = snaps[0];
      if (!at) continue;
      const resumed = restoreBattle(init, at.snap).runToEnd(inputs.filter((input) => input.tick >= at.tick));
      expect(snapshotBattle(resumed.state)).toBe(a.finalState);
    }
  });

  it("리플레이 기록은 판정과 같은 끝 상태, 사건만으로 되짚은 자리·표지가 판정과 같다, 부호화가 그대로 돈다", () => {
    const { init, inputs } = mixedBattle(2);
    const plain = runBattle(init, inputs);
    const recorded = recordBattleReplay(init, { inputs });
    expect(recorded.finalState).toBe(plain.finalState);
    const kinds = new Set(recorded.replay.events.map((event) => event.k));
    for (const kind of ["motion", "stealth", "run", "multishot"] as const) expect(kinds.has(kind), kind).toBe(true);
    const motions = new Set(recorded.replay.events.flatMap((event) => (event.k === "motion" ? [event.kind] : [])));
    expect([...motions].toSorted()).toEqual(expect.arrayContaining(["dash", "knockback"]));
    const state = rebuilt(recorded.replay);
    recorded.replay.units.forEach((row, index) => {
      const real = byId(recorded.state, row.id);
      const mine = state[index];
      expect({ x: mine?.x, y: mine?.y, stealth: mine?.stealth === true, running: mine?.running === true }).toEqual({
        x: real.x,
        y: real.y,
        stealth: real.stealthUntilMs !== undefined,
        running: real.running === true,
      });
    });
    // 키프레임마다: 그 앞 사건으로 되짚은 표지가 키프레임 표지와 같다
    for (const keyframe of recorded.replay.keyframes.slice(1)) {
      const first = recorded.replay.keyframes[0];
      if (!first) continue;
      const back = stateFromKeyframe(first);
      for (const event of recorded.replay.events) {
        if (event.t >= keyframe.tick) break;
        applyReplayEvent(back, event);
      }
      keyframe.units.forEach((frame, index) => {
        expect([back[index]?.x, back[index]?.y, back[index]?.stealth === true]).toEqual([
          frame.x,
          frame.y,
          frame.stealth === true,
        ]);
      });
    }
    const decoded = decodeBattleReplay(encodeBattleReplay(recorded.replay));
    expect(decoded).toEqual(recorded.replay);
  });

  it("스냅숏 간격은 흐름장 간격의 배수다(재생 시험 전제)", () => {
    expect(msToTicks(TEST_COMBAT_COEFFICIENTS.snapshotMs, TEST_COMBAT_COEFFICIENTS) % 5).toBe(0);
  });
});
