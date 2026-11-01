import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle, snapshotBattle } from "./battle.ts";
import type { BattleInput } from "./battleTypes.ts";
import { COVER_BLOCK } from "./battleMap.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { duel, openMap, unit } from "./testBattle.ts";

describe("전투 틱(100ms, 정수, 시드 굴림)", () => {
  it("같은 시작·입력이면 결과와 끝 상태가 바이트까지 같다", () => {
    const a = runBattle(duel(6, 7), []);
    const b = runBattle(duel(6, 7), []);
    expect(b.result).toEqual(a.result);
    expect(b.finalState).toBe(a.finalState);
    expect(runBattle(duel(6, 8), []).finalState).not.toBe(a.finalState);
  });

  it("한쪽이 모두 쓰러지면 끝나고, 남은 편이 이긴다", () => {
    const base = duel(3, 2);
    // 공격 쪽을 훨씬 세게
    const init = {
      ...base,
      units: base.units.map((spec) =>
        spec.side === 1 ? { ...spec, attack: { ...spec.attack, weaponAttack: 200 } } : spec,
      ),
    };
    const { result } = runBattle(init, []);
    expect(result).toMatchObject({ winner: 1, reason: "wipe" });
    expect(result.endTick).toBeLessThan(3000);
  });

  it("제한 시간이 다 되면 수비 승이고, 공격 쪽은 쓰러진 유닛까지 퇴각 처리한다(D-210·D-231)", () => {
    const init = duel(2, 3);
    // 양쪽이 서로 닿지 못하게 가운데에 차폐 벽(지나갈 수 없음)
    for (let y = 0; y < 32; y++) {
      init.map.passable[y * 32 + 16] = 0;
      init.map.cover[y * 32 + 16] = COVER_BLOCK;
    }
    init.limitMs = 30_000;
    const { result, state } = runBattle(init, []);
    expect(result).toMatchObject({ winner: 2, reason: "timeout", endTick: 300 });
    expect(state.units.filter((u) => u.side === 1).every((u) => u.status === "retreated")).toBe(true);
  });

  it("공성: 넥서스가 무너지면 공격 쪽이 이긴다", () => {
    const map = openMap(32);
    map.buildings = [{ id: 1, cells: [16 * 32 + 16], durability: 60, nexus: true }];
    const init = {
      id: 2,
      kind: "siege" as const,
      seed: 5,
      map,
      sides: [
        { id: 1, faction: 1, defender: false, edge: 3 as const },
        { id: 2, faction: 2, defender: true, edge: 1 as const },
      ],
      parties: [{ id: 1, side: 1, retreatHpPct: 0 }],
      units: [unit(1, 1, 1, 12, 16, { attack: { ...unit(0, 0, 0, 0, 0).attack, weaponAttack: 30 } })],
    };
    const { result } = runBattle(init, []);
    expect(result).toMatchObject({ winner: 1, reason: "nexus" });
  });

  it("퇴각 명령을 받은 파티는 가장자리 2칸 구역에 다 들어가면 빠지고, 쓰러진 동료도 데리고 나간다(D-205·D-225)", () => {
    const base = duel(2, 4);
    // 공격 쪽 파티 1: 유닛 1은 처음부터 쓰러진 상태, 수비 쪽은 멀리(퇴각 구역 밖)
    const init = { ...base, units: base.units.map((spec) => (spec.side === 2 ? { ...spec, x: 27 } : spec)) };
    const inputs: BattleInput[] = [
      { tick: 0, kind: "command", unit: 1, command: { kind: "retreat" } },
      { tick: 0, kind: "command", unit: 2, command: { kind: "retreat" } },
    ];
    const battle = createBattle(init);
    const downed = battle.state.units.find((u) => u.id === 1);
    if (downed) {
      downed.status = "down";
      downed.hp = 0;
    }
    const { state } = battle.runToEnd(inputs, 400);
    const side1 = state.units.filter((u) => u.side === 1);
    expect(side1.map((u) => u.status)).toEqual(["retreated", "retreated"]);
  });

  it("퇴각 구역에 머무는 시간(C23)을 채운 뒤에야 빠진다", () => {
    const base = duel(1, 1);
    const init = {
      ...base,
      units: base.units.map((spec) => (spec.side === 1 ? { ...spec, x: 1 } : { ...spec, x: 27 })),
    };
    const at = (dwellMs: number, ticks: number) => {
      const battle = createBattle(init, { ...TEST_COMBAT_COEFFICIENTS, retreatDwellMs: dwellMs });
      battle.runToEnd([{ tick: 0, kind: "command", unit: 1, command: { kind: "retreat" } }], ticks);
      return battle.state.parties.find((p) => p.side === 1)?.retreated;
    };
    expect(at(0, 1)).toBe(true);
    expect(at(2000, 15)).toBe(false);
    expect(at(2000, 25)).toBe(true);
  });

  it("퇴각 중이 아닌 파티는 구역에 서 있거나 쫓아 들어와도 빠지지 않는다(D-434)", () => {
    const base = duel(1, 1);
    // 수비 쪽은 동쪽 가장자리 구역(x = 31)에 서서 움직이지 않고, 공격 쪽은 쫓아가 구역(x ≥ 30) 안에서 싸운다.
    // 둘 다 체력이 커서 오래 싸운다.
    const init = {
      ...base,
      units: base.units.map((spec) =>
        spec.side === 1
          ? { ...spec, x: 22, y: 10, maxHp: 100_000 }
          : { ...spec, x: 31, y: 10, maxHp: 100_000 },
      ),
    };
    const battle = createBattle(init);
    const holder = battle.state.units.find((u) => u.side === 2);
    if (holder) holder.nextMoveMs = Number.MAX_SAFE_INTEGER;
    battle.runToEnd([], 200);
    const [chaser, standing] = battle.state.units;
    expect(chaser?.x).toBeGreaterThanOrEqual(30);
    expect(standing?.x).toBeGreaterThanOrEqual(30);
    expect(battle.state.parties.every((p) => !p.retreated)).toBe(true);
    expect(battle.state.result).toBeNull();
  });

  it("같은 유닛의 명령은 1초(10틱) 안에 다시 넣으면 거절한다(D-180·C5)", () => {
    const battle = createBattle(duel(1, 1));
    const result = battle.runToEnd(
      [
        { tick: 0, kind: "command", unit: 1, command: { kind: "move", cell: 5 * 32 + 5 } },
        { tick: 5, kind: "command", unit: 1, command: { kind: "move", cell: 6 * 32 + 6 } },
        { tick: 10, kind: "command", unit: 1, command: { kind: "move", cell: 7 * 32 + 7 } },
      ],
      11,
    );
    expect(result.rejected).toBe(1);
  });

  it("스냅숏(30초 = 300틱)에서 다시 켜고 남은 입력을 넣으면 끝 상태가 바이트까지 같다", () => {
    const base = duel(6, 11);
    // 오래 싸우게 HP를 크게(스냅숏 150틱을 넘긴다)
    const init = { ...base, units: base.units.map((spec) => ({ ...spec, maxHp: 6000 })) };
    const inputs: BattleInput[] = [
      { tick: 20, kind: "command", unit: 1, command: { kind: "move", cell: 3 * 32 + 3 } },
      { tick: 200, kind: "command", unit: 101, command: { kind: "retreat" } },
    ];
    const snapshots: string[] = [];
    const full = runBattle(init, inputs, (snapshot) => snapshots.push(snapshot));
    expect(snapshots.length).toBeGreaterThan(0);
    const restored = restoreBattle(init, snapshots[0] ?? "");
    const tick = restored.state.tick;
    expect(tick).toBe(300);
    const resumed = restored.runToEnd(inputs.filter((input) => input.tick >= tick));
    expect(snapshotBattle(resumed.state)).toBe(full.finalState);
    expect(resumed.result).toEqual(full.result);
  });
});

function ranged(spec: ReturnType<typeof unit>, arc = false) {
  return { ...spec, range: 8, arc };
}

function wallDuel(arc: boolean) {
  const map = openMap(32);
  // 공격 쪽(10,10)과 수비 쪽(14,10) 사이 x = 12에 차폐 벽. 둘 다 움직이지 않게 모두 지나갈 수 없게 둘러쌈
  for (let y = 0; y < 32; y++) {
    map.cover[y * 32 + 12] = COVER_BLOCK;
    map.passable[y * 32 + 12] = 0;
  }
  return {
    id: 3,
    kind: "normal" as const,
    seed: 3,
    map,
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 as const },
      { id: 2, faction: 2, defender: true, edge: 1 as const },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 2, side: 2, retreatHpPct: 0 },
    ],
    units: [
      ranged(unit(1, 1, 1, 10, 10), arc),
      unit(2, 2, 2, 14, 10, { attack: { ...unit(0, 0, 0, 0, 0).attack, weaponAttack: 0 } }),
    ],
    limitMs: 5_000,
  };
}

function arcRun(arc: boolean) {
  const init = wallDuel(arc);
  const [shooter, target] = init.units;
  if (!shooter || !target) throw new Error("fixture");
  // 벽 너머의 정찰 유닛(공격력 0)이 목표를 본다
  const spotter = unit(3, 1, 1, 13, 12, { attack: { ...unit(0, 0, 0, 0, 0).attack, weaponAttack: 0 } });
  return runBattle({ ...init, units: [shooter, target, spotter] }, []);
}

describe("시선·엄폐·지휘가 판정을 바꾼다", () => {
  it("차폐 너머는 보이지 않아 쏘지 못하고(시간 초과), 곡사도 보이지 않는 유닛은 목표로 고르지 못한다", () => {
    const flat = runBattle(wallDuel(false), []);
    expect(flat.result.reason).toBe("timeout");
    expect(flat.state.units.find((u) => u.id === 2)?.hp).toBe(100);
    const arc = runBattle(wallDuel(true), []);
    expect(arc.state.units.find((u) => u.id === 2)?.hp).toBe(100);
  });

  it("수풀 속 적은 1칸 안에서만 보인다", () => {
    const init = wallDuel(false);
    // 벽을 치우고 수비 쪽 자리를 수풀로
    init.map.cover.fill(0);
    init.map.passable.fill(1);
    init.map.cover[10 * 32 + 14] = 1;
    const battle = createBattle(init);
    battle.step([]);
    expect(battle.state.sides.find((s) => s.id === 1)?.visible).toEqual([]);
    const [shooter, target] = init.units;
    if (!shooter || !target) throw new Error("fixture");
    init.map.cover[10 * 32 + 11] = 1;
    const near = createBattle({ ...init, units: [shooter, { ...target, x: 11 }] });
    near.step([]);
    expect(near.state.sides.find((s) => s.id === 1)?.visible).toEqual([2]);
  });

  it("곡사는 같은 편이 본 목표에게 차폐를 넘어 쏘고, 직사는 못 쏜다(질문 96)", () => {
    // 정찰 유닛도 최소 피해 1씩 넣으므로 두 경우를 견준다: 곡사 쪽만 쏜 몫이 더해진다
    const flatHp = arcRun(false).state.units.find((u) => u.id === 2)?.hp ?? 0;
    const arcHp = arcRun(true).state.units.find((u) => u.id === 2)?.hp ?? 0;
    expect(arcHp).toBeLessThan(flatHp - 20);
  });

  it("지휘관 파티가 빠지면 남은 유닛 가운데 지휘 정원이 가장 큰 유닛이 잇는다(같으면 작은 ID, D-331)", () => {
    const base = duel(1, 5);
    const init = {
      ...base,
      units: [
        unit(1, 1, 1, 10, 10, { commandCap: 3 }),
        unit(2, 1, 2, 10, 12, { commandCap: 2 }),
        unit(3, 1, 3, 10, 14, { commandCap: 2 }),
        unit(101, 2, 11, 27, 10),
      ],
      parties: [
        { id: 1, side: 1, retreatHpPct: 0 },
        { id: 2, side: 1, retreatHpPct: 0 },
        { id: 3, side: 1, retreatHpPct: 0 },
        { id: 11, side: 2, retreatHpPct: 0 },
      ],
    };
    const battle = createBattle(init);
    expect(battle.state.sides[0]?.commander).toBe(1);
    battle.runToEnd([{ tick: 0, kind: "command", unit: 1, command: { kind: "retreat" } }], 80);
    expect(battle.state.parties.find((p) => p.id === 1)?.retreated).toBe(true);
    expect(battle.state.sides[0]?.commander).toBe(2);
    // 새 정원 2 안에 남은 파티 2·3이 다 든다
    expect(battle.state.sides[0]?.uncommanded).toEqual([]);
  });
});

describe("피해 두 몫과 회복(D-458·D-459)", () => {
  const FIRE = 2;
  const fireCells = (value: number) => Array.from({ length: 12 }, (_, i) => (i === FIRE ? value : 0));
  /** 붙어 선 두 유닛: 1은 화염의 검(물리 40, 불 × 5% 옵션)을 든 불 5, 2는 맞기만 한다(크리 없음) */
  const pair = () => {
    const striker = unit(1, 1, 1, 10, 10);
    const target = unit(101, 2, 11, 11, 10, { maxHp: 100, armorHp: 1000, shieldHp: 1000 });
    return {
      ...duel(1),
      units: [
        {
          ...striker,
          attack: {
            ...striker.attack,
            weaponAttack: 40,
            weaponCritPm: 0,
            elements: fireCells(5),
            skillElementsPm: fireCells(50),
          },
        },
        { ...target, attack: { ...target.attack, weaponHitPm: 0 } },
      ],
    };
  };

  it("물리 몫은 아머 HP부터, 속성 몫은 쉴드 HP부터 깎는다(HP는 그대로)", () => {
    const battle = createBattle(pair());
    for (let i = 0; i < 30; i++) battle.step([]);
    const target = battle.state.units.find((u) => u.id === 101);
    if (!target) throw new Error("target");
    // 한 번에 P = 40 × (1 − 방어율 100‰) − 고정 1 = 35, E = 40 × 25% = 10
    const armorLost = 1000 - target.armor;
    const shieldLost = 1000 - target.shield;
    expect(armorLost).toBeGreaterThan(0);
    expect(armorLost % 35).toBe(0);
    expect(shieldLost).toBe((armorLost / 35) * 10);
    expect(target.hp).toBe(100);
  });

  it("쉴드 재생·스태미나·MP 회복은 2차 스탯(분당)대로 차고 최대에서 멈춘다", () => {
    // 서로 보이지 않게 멀리 둔다(싸우지 않는다)
    const init = {
      ...duel(1),
      units: [
        unit(1, 1, 1, 0, 0, {
          shieldHp: 20,
          shieldRegen: 35,
          staminaMax: 1000,
          staminaRegen: 180,
          mpMax: 1000,
          mpRegen: 120,
        }),
        unit(101, 2, 11, 31, 31),
      ],
    };
    const battle = createBattle(init);
    const me = battle.state.units.find((u) => u.id === 1);
    if (!me) throw new Error("unit");
    me.shield = 0;
    me.staminaMilli = 0;
    me.mpMilli = 0;
    for (let i = 0; i < 300; i++) battle.step([]);
    // 30초: 쉴드 35/분 → 17, 스태미나 180/분 → 90, MP 120/분 → 60
    expect(me.shield).toBe(17);
    expect(me.staminaMilli).toBe(90_000);
    expect(me.mpMilli).toBe(60_000);
    for (let i = 0; i < 300; i++) battle.step([]);
    // 최대 20에서 멈춘다
    expect(me.shield).toBe(20);
    expect(battle.state.result).toBeNull();
  });

  it("피격 뒤 쉴드 재생 지연(D-463 212, 출발값 0): 맞은 시각부터 지연이 지나야 다시 찬다", () => {
    // 출발값 0: 맞아도 곧바로 찬다(위 시험과 같은 뜻)
    expect(TEST_COMBAT_COEFFICIENTS.shieldRegenDelayMs).toBe(0);
    const init = {
      ...duel(1),
      units: [unit(1, 1, 1, 0, 0, { shieldHp: 1000, shieldRegen: 600 }), unit(101, 2, 11, 31, 31)],
    };
    const delayed = createBattle(init, { ...TEST_COMBAT_COEFFICIENTS, shieldRegenDelayMs: 2000 });
    const me = delayed.state.units.find((u) => u.id === 1);
    if (!me) throw new Error("unit");
    me.shield = 0;
    me.lastHitMs = 0;
    // 분당 600 = 틱(100ms)마다 1. 2초(20틱) 동안은 차지 않는다
    for (let i = 0; i < 20; i++) delayed.step([]);
    expect(me.shield).toBe(0);
    for (let i = 0; i < 10; i++) delayed.step([]);
    expect(me.shield).toBe(10);
  });

  it("맞으면 맞은 시각을 적는다(물리·속성 몫이 있을 때)", () => {
    const battle = createBattle(pair());
    battle.step([]);
    const target = battle.state.units.find((u) => u.id === 101);
    expect(target?.lastHitMs).toBe(0);
  });
});
