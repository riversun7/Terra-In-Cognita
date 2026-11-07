// 전투 중 생명 수치 회복(D-514)과 물건 쓰기(287: 자동 물약 D-509·D-510, 탄약 D-497) 시험
import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle } from "./battle.ts";
import type { BattleInit, BattlePotions, CombatUnitSpec } from "./battleTypes.ts";
import { TEST_COMBAT_COEFFICIENTS, armorRegenOf } from "./coefficients.ts";
import { potionHeal } from "./consumables.ts";
import { resolveOutcomes } from "./outcome.ts";
import { TEST_STAT_TABLE, computeSecondary } from "./stats.ts";
import { duel, openMap, unit } from "./testBattle.ts";
import { UNARMED } from "./catalog.ts";
import { specFromStats } from "./unitSpec.ts";

/** 한 편 유닛 사양을 바꾼다 */
function patch(init: BattleInit, side: number, extra: Partial<CombatUnitSpec>): BattleInit {
  return { ...init, units: init.units.map((spec) => (spec.side === side ? { ...spec, ...extra } : spec)) };
}

/** 혼자 선 유닛(적이 멀리 있어 맞지 않는다) — 회복만 본다 */
function alone(extra: Partial<CombatUnitSpec>): BattleInit {
  return {
    id: 1,
    kind: "normal",
    seed: 1,
    map: openMap(32),
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 11, side: 2, retreatHpPct: 0 },
    ],
    units: [
      unit(1, 1, 1, 2, 2, { sight: 1, ...extra }),
      // 시야 밖 적(시야 1, 움직이지 않게 멀리) — 전투가 끝나지 않고 틱만 간다
      unit(101, 2, 11, 29, 29, { sight: 1 }),
    ],
  };
}

const potions = (items: BattlePotions["items"], readyMs = 0): BattlePotions => ({
  items,
  thresholdPm: 400,
  cooldownMs: 30_000,
  readyMs,
});

describe("전투 중 HP·아머 회복(D-514)", () => {
  it("사양에서: HP 회복 = 2차 스탯 hp_regen, 아머 회복 = 최대 아머 × n54 ‰", () => {
    const stats = computeSecondary({ str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 }, TEST_STAT_TABLE);
    const spec = specFromStats({
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats,
      weapon: UNARMED,
      moveIntervalMs: 1000,
    });
    expect(spec.hpRegen).toBe(132);
    expect(spec.armorRegen).toBe(armorRegenOf(stats.armor_hp ?? 0, TEST_COMBAT_COEFFICIENTS));
    expect(armorRegenOf(150, TEST_COMBAT_COEFFICIENTS)).toBe(15);
    expect(armorRegenOf(150, { ...TEST_COMBAT_COEFFICIENTS, armorRegenPm: undefined })).toBe(0);
  });

  it("다친 채 들어온 유닛은 1분에 분당 회복만큼 찬다(쉴드처럼 틱마다 나눠서, 최대에서 멈춤)", () => {
    const init = alone({
      maxHp: 1000,
      armorHp: 600,
      hpRegen: 120,
      armorRegen: 60,
      start: { hp: 100, armor: 0, shield: 0 },
    });
    const battle = createBattle(init);
    battle.runToEnd([], 600);
    const me = battle.state.units.find((u) => u.id === 1);
    expect(me?.hp).toBe(220);
    expect(me?.armor).toBe(60);
    // 10분이면 HP 1,300 → 최대 1,000에서 멈춤
    battle.runToEnd([], 5400);
    expect(me?.hp).toBe(1000);
    expect(me?.armor).toBe(600);
  });

  it("쓰러진 유닛은 전투 안에서 다시 일어나지 않는다", () => {
    const init = alone({ hpRegen: 600, start: { hp: 0, armor: 0, shield: 0 } });
    const battle = createBattle(init);
    battle.runToEnd([], 600);
    const me = battle.state.units.find((u) => u.id === 1);
    expect(me).toMatchObject({ hp: 0, status: "down" });
  });

  it("맞는 중에도 회복한다: 회복이 있는 편이 같은 상대에게 더 오래 버틴다", () => {
    const plain = runBattle(duel(2, 5), []);
    const regen = runBattle(patch(duel(2, 5), 2, { hpRegen: 600 }), []);
    expect(plain.result.winner).toBeDefined();
    const hpLeft = (state: typeof plain.state, side: number): number =>
      state.units.filter((u) => u.side === side).reduce((sum, u) => sum + Math.max(0, u.hp), 0);
    expect(hpLeft(regen.state, 2) + regen.result.endTick).toBeGreaterThan(
      hpLeft(plain.state, 2) + plain.result.endTick,
    );
  });
});

describe("자동 물약(287, D-510)", () => {
  it("물약 합 = 한 번 + 주기 줄 틱 수 × 양", () => {
    expect(potionHeal({ id: 1, count: 1, instant: 30 })).toBe(30);
    expect(
      potionHeal({
        id: 2,
        count: 1,
        instant: 10,
        over: [{ effect: "regen", amount: 5, tickMs: 1000, durationMs: 4500 }],
      }),
    ).toBe(30);
  });

  it("HP가 문턱 아래면 모자란 만큼을 가장 덜 넘치게 채우는 물약을 마시고, 쿨 30초 동안 다시 마시지 않는다", () => {
    const init = alone({
      maxHp: 100,
      start: { hp: 30, armor: 0, shield: 0 },
      potions: potions([
        { id: 7, count: 2, instant: 100 },
        { id: 8, count: 2, instant: 80 },
        { id: 9, count: 1, instant: 20 },
      ]),
    });
    const battle = createBattle(init);
    battle.step([]);
    const me = battle.state.units.find((u) => u.id === 1);
    // 모자란 70: 80이 가장 덜 넘침
    expect(me?.hp).toBe(100);
    expect(me?.potionsLeft).toEqual([2, 1, 1]);
    expect(me?.potionReadyMs).toBe(30_000);
    // 문턱(40%) 위면 마시지 않는다
    if (me) me.hp = 50;
    battle.runToEnd([], 10);
    expect(me?.potionsLeft).toEqual([2, 1, 1]);
    // 쿨 중에는 문턱 아래여도 마시지 않는다
    if (me) me.hp = 10;
    battle.runToEnd([], 100);
    expect(me?.potionsLeft).toEqual([2, 1, 1]);
    // 쿨이 끝나면 마신다(모자란 90: 100이 덮는 것 가운데 가장 작다)
    battle.runToEnd([], 200);
    expect(me?.potionsLeft).toEqual([1, 1, 1]);
    const outcome = resolveOutcomes(battle.state, { war: false }).find((entry) => entry.unit === 1);
    expect(outcome?.potions).toEqual([
      { id: 7, used: 1 },
      { id: 8, used: 1 },
    ]);
    expect(outcome?.potionReadyMs).toBe(me?.potionReadyMs);
  });

  it("전투 밖 물약 쿨이 남았으면 그 시각까지 마시지 않는다, 물약이 없으면 그대로", () => {
    const init = alone({
      start: { hp: 10, armor: 0, shield: 0 },
      potions: potions([{ id: 7, count: 1, instant: 50 }], 5_000),
    });
    const battle = createBattle(init);
    battle.runToEnd([], 49);
    const me = battle.state.units.find((u) => u.id === 1);
    expect(me?.hp).toBe(10);
    battle.runToEnd([], 2);
    expect(me?.hp).toBe(60);
    if (me) me.hp = 5;
    battle.runToEnd([], 400);
    expect(me?.hp).toBe(5);
    expect(resolveOutcomes(battle.state, { war: false })[0]?.potions).toEqual([{ id: 7, used: 1 }]);
  });

  it("주기 회복 물약은 걸린 효과로 틱마다 채운다", () => {
    const init = alone({
      maxHp: 200,
      start: { hp: 20, armor: 0, shield: 0 },
      potions: potions([
        {
          id: 3,
          count: 1,
          instant: 0,
          over: [{ effect: "regen", amount: 10, tickMs: 1000, durationMs: 5500 }],
        },
      ]),
    });
    const battle = createBattle(init);
    battle.step([]);
    const me = battle.state.units.find((u) => u.id === 1);
    expect(me?.effects.map((e) => e.id)).toEqual(["regen"]);
    battle.runToEnd([], 60);
    expect(me?.hp).toBe(70);
    expect(me?.effects).toEqual([]);
  });

  it("물약이 없는 사양은 옛 끝 상태와 같고, 물약 상태는 스냅숏에서 다시 켜도 같다", () => {
    const init = duel(2, 3);
    const plain = runBattle(init, []);
    const empty = runBattle(patch(init, 1, { potions: undefined, ammo: undefined }), []);
    expect(JSON.stringify(empty.state)).toBe(JSON.stringify(plain.state));
    const withPotions = patch(init, 2, { potions: potions([{ id: 5, count: 3, instant: 40 }]) });
    const run = runBattle(withPotions, []);
    const snapshot = JSON.stringify(createBattle(withPotions).state);
    expect(JSON.stringify(restoreBattle(withPotions, snapshot).runToEnd([]).state)).toBe(
      JSON.stringify(run.state),
    );
    // 물약을 든 편은 마셨고 결과에 칸 ID·수가 있다
    const used = resolveOutcomes(run.state, { war: false }).flatMap((entry) => entry.potions ?? []);
    expect(used.length).toBeGreaterThan(0);
  });
});

describe("탄약(287, D-497)", () => {
  it("기본 공격 한 번에 1발 쓰고, 0이면 기본 공격을 하지 않는다", () => {
    const init = patch(duel(1, 2), 1, { ammo: 3, range: 6 });
    const run = runBattle(init, [], undefined, TEST_COMBAT_COEFFICIENTS);
    const shooter = run.state.units.find((u) => u.id === 1);
    expect(shooter?.ammoLeft).toBe(0);
    const outcome = resolveOutcomes(run.state, { war: false }).find((entry) => entry.unit === 1);
    expect(outcome?.shots).toBe(3);
    // 탄이 0으로 들어오면 한 번도 치지 못한다: 상대가 이긴다
    const empty = runBattle(patch(duel(1, 2), 1, { ammo: 0, range: 6 }), []);
    expect(empty.result.winner).toBe(2);
    expect(resolveOutcomes(empty.state, { war: false }).find((entry) => entry.unit === 1)?.shots).toBe(0);
  });

  it("탄을 쓰지 않는 무기(사양에 칸 없음)는 결과에 쏜 수가 없다", () => {
    const run = runBattle(duel(1, 2), []);
    expect(resolveOutcomes(run.state, { war: false }).every((entry) => entry.shots === undefined)).toBe(true);
  });
});
