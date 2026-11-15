// 군단 명령 2단계(기획 D-558): 집결·따라가기·대형 고르기·AI 전개 방식 8가지·지휘관 자동 승계
import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle, snapshotBattle } from "./battle.ts";
import type { BattleInit, BattleInput, CombatUnitSpec } from "./battleTypes.ts";
import { formationOffsets, formationSlots } from "./formation.ts";
import { edgeProgress } from "./orders.ts";
import { TACTICS, talentUnit } from "./tactics.ts";
import { openMap, unit } from "./testBattle.ts";

const SIZE = 32;
const cellOf = (x: number, y: number): number => y * SIZE + x;

/** 편 1(서쪽) = 파티 1·2·3, 편 2(동쪽) = 파티 11. 편 1 지휘관 = 유닛 1(정원 cap) */
function battle(cap: number, opts: { far?: number; enemy?: Partial<CombatUnitSpec>[]; seed?: number } = {}) {
  const units: CombatUnitSpec[] = [];
  for (let i = 0; i < 3; i++) units.push(unit(1 + i, 1, 1, 3, 4 + i, i === 0 ? { commandCap: cap } : {}));
  for (let i = 0; i < 3; i++) units.push(unit(11 + i, 1, 2, 3, 14 + i));
  for (let i = 0; i < 3; i++) units.push(unit(21 + i, 1, 3, 3, 24 + i));
  const enemy = opts.enemy ?? [{}, {}, {}];
  enemy.forEach((extra, i) => units.push(unit(101 + i, 2, 11, opts.far ?? 28, 14 + i, extra)));
  const init: BattleInit = {
    id: 1,
    kind: "normal",
    seed: opts.seed ?? 3,
    map: openMap(SIZE),
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 2, side: 1, retreatHpPct: 0 },
      { id: 3, side: 1, retreatHpPct: 0 },
      { id: 11, side: 2, retreatHpPct: 0 },
    ],
    units: units.map((spec) => ({ ...spec, sight: spec.sight === 12 ? 6 : spec.sight })),
    limitMs: 120_000,
  };
  return init;
}

const run = (init: BattleInit, inputs: BattleInput[], ticks: number) => {
  const b = createBattle(init);
  b.runToEnd(inputs, ticks);
  return b.state;
};

describe("대형(D-558 대형 고르기)", () => {
  it("횡대는 한 줄 8칸, 종대는 두 줄, 쐐기는 앞이 하나, 방진은 네모", () => {
    expect(formationOffsets(6, "line").every((o) => o.f === 0)).toBe(true);
    expect(new Set(formationOffsets(6, "column").map((o) => o.l)).size).toBe(2);
    expect(formationOffsets(4, "wedge").filter((o) => o.f === 0)).toHaveLength(1);
    expect(Math.min(...formationOffsets(9, "block").map((o) => o.f))).toBe(-2);
  });

  it("앞줄에는 사거리 짧은 유닛, 서쪽 편이면 앞 = 동쪽(+x)", () => {
    const init = battle(3);
    const members = createBattle({
      ...init,
      units: [unit(1, 1, 1, 0, 0, { range: 5 }), unit(2, 1, 1, 0, 1, { range: 1 })],
      parties: [{ id: 1, side: 1, retreatHpPct: 0 }],
    }).state.units;
    // 쐐기 앞(끝) = 근접 유닛 2
    const slots = formationSlots(members, "wedge", 3, { x: 10, y: 10 }, SIZE, () => true, "front");
    expect(slots[0]).toEqual({ unit: 2, cell: cellOf(10, 10) });
    expect(slots[1]?.cell).toBe(cellOf(9, 10));
  });

  it("대형 고르기: 파티 대형을 바꾸고 그 자리에서 횡대로 선다(옆으로 한 줄)", () => {
    const state = run(
      battle(3),
      [{ tick: 0, kind: "order", party: 1, order: { kind: "formation", shape: "line" } }],
      40,
    );
    const party = state.parties.find((p) => p.id === 1);
    expect(party?.shape).toBe("line");
    const members = state.units.filter((u) => u.party === 1);
    // 서쪽 편 횡대 = 같은 x, 서로 다른 y
    expect(new Set(members.map((u) => u.x)).size).toBe(1);
    expect(new Set(members.map((u) => u.y)).size).toBe(3);
  });
});

describe("집결·따라가기(D-558)", () => {
  it("군단 집결: 정원 안 파티가 그 칸 둘레에 대형으로 모인다", () => {
    const goal = cellOf(10, 15);
    const state = run(
      battle(3),
      [{ tick: 0, kind: "legion", side: 1, order: { kind: "rally", cell: goal } }],
      200,
    );
    const ours = state.units.filter((u) => u.side === 1);
    expect(ours.every((u) => Math.max(Math.abs(u.x - 10), Math.abs(u.y - 15)) <= 2)).toBe(true);
    expect(new Set(ours.map((u) => u.y * SIZE + u.x)).size).toBe(ours.length);
    expect(state.parties.find((p) => p.id === 2)?.order?.kind).toBe("rally");
  });

  it("칸 없는 군단 집결은 지휘관 자리로", () => {
    const state = run(battle(3), [{ tick: 0, kind: "legion", side: 1, order: { kind: "rally" } }], 200);
    const ours = state.units.filter((u) => u.side === 1);
    expect(ours.every((u) => Math.abs(u.y - 4) <= 2 && Math.abs(u.x - 3) <= 2)).toBe(true);
  });

  it("따라가기: 앞 파티가 전진하면 뒤 파티가 그 뒤를 따라간다(앞 파티 자신은 받지 않는다)", () => {
    const b = createBattle(battle(3, { far: 30 }));
    const inputs: BattleInput[] = [
      { tick: 0, kind: "order", party: 2, order: { kind: "advance", cell: cellOf(16, 15) } },
      { tick: 0, kind: "legion", side: 1, order: { kind: "follow", party: 2 } },
    ];
    b.runToEnd(inputs, 160);
    const xs = (party: number) => b.state.units.filter((u) => u.party === party).map((u) => u.x);
    expect(Math.min(...xs(2))).toBeGreaterThanOrEqual(15);
    // 따라간 파티는 앞 파티보다 뒤(서쪽)에, 처음 자리보다 앞(동쪽)에
    for (const party of [1, 3]) {
      expect(Math.max(...xs(party))).toBeLessThan(Math.min(...xs(2)));
      expect(Math.min(...xs(party))).toBeGreaterThan(8);
    }
    expect(b.state.parties.find((p) => p.id === 2)?.order?.kind).toBe("advance");
  });

  it("따라갈 파티가 자기 자신·다른 편이면 거절", () => {
    const state = run(
      battle(3),
      [
        { tick: 0, kind: "order", party: 1, order: { kind: "follow", party: 1 } },
        { tick: 0, kind: "order", party: 2, order: { kind: "follow", party: 11 } },
      ],
      3,
    );
    expect(state.rejected).toBe(2);
  });
});

describe("AI 전개 방식(D-558 2차)", () => {
  it("여덟 가지 모두 받고, 같은 입력이면 끝 상태가 같으며 스냅숏에서 다시 켜도 같다", () => {
    for (const tactic of TACTICS) {
      const init = battle(3, { far: 14, seed: 7 });
      const inputs: BattleInput[] = [{ tick: 0, kind: "legion", side: 1, order: { kind: "tactic", tactic } }];
      const a = runBattle(init, inputs);
      expect(a.state.rejected).toBe(0);
      expect(runBattle(init, inputs).finalState).toBe(a.finalState);
      const snaps: string[] = [];
      runBattle(init, inputs, (snapshot) => snaps.push(snapshot));
      const first = snaps[0];
      if (first) {
        const restored = restoreBattle(init, first);
        restored.runToEnd(inputs);
        expect(snapshotBattle(restored.state)).toBe(a.finalState);
      }
    }
  });

  it("수비 집중: 적이 멀면 닻 자리를 지킨다(돌격은 나아간다)", () => {
    const enemyNear = battle(3, { far: 12 });
    const hold = run(
      enemyNear,
      [{ tick: 0, kind: "order", party: 1, order: { kind: "tactic", tactic: "defend" } }],
      60,
    );
    expect(hold.units.filter((u) => u.party === 1).every((u) => u.x === 3)).toBe(true);
    const go = run(
      enemyNear,
      [{ tick: 0, kind: "order", party: 1, order: { kind: "tactic", tactic: "assault" } }],
      60,
    );
    expect(go.units.filter((u) => u.party === 1).some((u) => u.x > 3)).toBe(true);
  });

  it("지연전: 다가오는 적 앞에서 자기 가장자리 쪽으로 물러난다(퇴각 구역 앞까지)", () => {
    const init = battle(3, { far: 9 });
    const start = { ...init, units: init.units.map((s) => (s.side === 1 ? { ...s, x: 7 } : s)) };
    const state = run(
      start,
      [{ tick: 0, kind: "legion", side: 1, order: { kind: "tactic", tactic: "delay" } }],
      30,
    );
    const xs = state.units.filter((u) => u.party === 2).map((u) => u.x);
    expect(Math.min(...xs)).toBeLessThan(7);
    expect(Math.min(...xs)).toBeGreaterThan(1);
  });

  it("집중 사격: 남은 HP가 가장 적은 적부터 쓰러뜨린다", () => {
    const init = battle(3, { far: 6, enemy: [{}, { maxHp: 40 }, {}] });
    const b = createBattle(init);
    const inputs: BattleInput[] = [
      { tick: 0, kind: "legion", side: 1, order: { kind: "tactic", tactic: "focus" } },
    ];
    let first: number | undefined;
    for (let t = 0; t < 400 && !first; t++) {
      b.step(inputs);
      first = b.state.units.find((u) => u.side === 2 && u.status === "down")?.id;
    }
    expect(first).toBe(102);
  });

  it("후방 침투: 재능 계열(DEX·AGI)은 앞의 근접보다 뒤의 원거리 적을 쫓는다", () => {
    const talent = { primaries: [5, 20, 20, 5, 5, 5] };
    expect(talentUnit(talent)).toBe(true);
    expect(talentUnit({ primaries: [20, 5, 5, 20, 5, 5] })).toBe(false);
    const init = battle(3, { far: 12, enemy: [{}, { range: 5 }, {}] });
    const units = init.units.map((s) => {
      if (s.party === 1) return { ...s, ...talent, sight: 30 };
      if (s.id === 102) return { ...s, x: 29, y: 4 };
      return s;
    });
    const lead = (tactic: "infiltrate" | "assault") => {
      const b = createBattle({ ...init, units });
      b.runToEnd([{ tick: 0, kind: "order", party: 1, order: { kind: "tactic", tactic } }], 40);
      return b.state.units.find((u) => u.id === 1);
    };
    // 원거리 적(29, 4)은 같은 줄로 곧게, 가까운 근접 적(12, 14~)을 노리는 돌격은 아래로
    const sneak = lead("infiltrate");
    expect(sneak?.y).toBeLessThanOrEqual(5);
    expect(sneak?.x).toBeGreaterThan(5);
    expect(lead("assault")?.y).toBeGreaterThan(6);
  });

  it("측면 우회: 지도 절반 전에는 옆 1/3 길로 걷는다", () => {
    const state = run(
      battle(3, { far: 30 }),
      [{ tick: 0, kind: "order", party: 1, order: { kind: "tactic", tactic: "flank" } }],
      40,
    );
    const members = state.units.filter((u) => u.party === 1);
    expect(members.every((u) => u.y < Math.floor(SIZE / 3) + 1)).toBe(true);
    expect(members.some((u) => edgeProgress(3, u.x, u.y, SIZE) > 3)).toBe(true);
  });
});

describe("지휘관 자동 승계(D-558 1545)", () => {
  it("군단 명령을 받은 편은 지휘관이 쓰러지면 그 틱에 작위 → 랭킹 순으로 잇고, 새 정원 밖 파티는 군단 명령을 내려놓는다", () => {
    const base = battle(3);
    const units = base.units.map((s) => {
      if (s.id === 1) return { ...s, commandCap: 3, commandRank: { title: 4, combatTier: null }, maxHp: 1 };
      if (s.id === 12) return { ...s, commandCap: 1, commandRank: { title: 1, combatTier: null } };
      if (s.id === 22) return { ...s, commandCap: 3, commandRank: { title: 0, combatTier: 0 } };
      return s;
    });
    const b = createBattle({ ...base, units });
    expect(b.state.sides[0]?.commander).toBe(1);
    b.step([{ tick: 0, kind: "legion", side: 1, order: { kind: "hold" } }]);
    expect(b.state.parties.filter((p) => p.side === 1).every((p) => p.order?.kind === "hold")).toBe(true);
    // 지휘관을 쓰러뜨린다(시험: 상태를 바로 바꾼다)
    const commander = b.state.units.find((u) => u.id === 1);
    if (commander) {
      commander.hp = 0;
      commander.status = "down";
    }
    b.step([]);
    const side = b.state.sides[0];
    // 작위 1(시민)인 유닛 12가 랭킹 등급 0인 작위 0 유닛 22보다 먼저 — 정원 1이라 자기 파티(2)만 지휘
    expect(side?.commander).toBe(12);
    expect(side?.uncommanded).toEqual([1, 3]);
    expect(b.state.parties.find((p) => p.id === 2)?.order?.kind).toBe("hold");
    expect(b.state.parties.find((p) => p.id === 1)?.order).toBeUndefined();
    expect(b.state.parties.find((p) => p.id === 3)?.order).toBeUndefined();
  });

  it("지휘관 파티가 정원 첫 자리(지휘관도 한 분대에 속한다)", () => {
    const base = battle(3);
    const units = base.units.map((s) =>
      s.id === 1 ? { ...s, commandCap: 0 } : s.id === 22 ? { ...s, commandCap: 2 } : s,
    );
    const state = createBattle({ ...base, units }).state;
    expect(state.sides[0]?.commander).toBe(22);
    expect(state.sides[0]?.uncommanded).toEqual([2]);
  });
});
