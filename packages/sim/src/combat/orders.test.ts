import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle, snapshotBattle } from "./battle.ts";
import type { BattleInit, BattleInput, CombatUnitSpec } from "./battleTypes.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { FORMATION_LEASH_CELLS, edgeProgress, oppositeEdgeCells } from "./orders.ts";
import { duel, openMap, unit } from "./testBattle.ts";
import { baselineHashes } from "./testOrdersBaseline.ts";

const SIZE = 32;
const cellOf = (x: number, y: number): number => y * SIZE + x;

/** 두 편 군단: 편 1 = 파티 1·2(서쪽), 편 2 = 파티 11(동쪽 멀리). 지휘 정원은 편 1 첫 유닛 */
function legionBattle(cap: number, seed = 3, far = 28): BattleInit {
  const units: CombatUnitSpec[] = [];
  for (let i = 0; i < 4; i++) units.push(unit(1 + i, 1, 1, 3, 4 + i, i === 0 ? { commandCap: cap } : {}));
  for (let i = 0; i < 4; i++) units.push(unit(11 + i, 1, 2, 3, 20 + i));
  for (let i = 0; i < 3; i++) units.push(unit(101 + i, 2, 11, far, 5 + i, { sight: 4 }));
  return {
    id: 1,
    kind: "normal",
    seed,
    map: openMap(SIZE),
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 2, side: 1, retreatHpPct: 0 },
      { id: 11, side: 2, retreatHpPct: 0 },
    ],
    units: units.map((spec) => ({ ...spec, sight: 4 })),
    limitMs: 60_000,
  };
}

const run = (init: BattleInit, inputs: BattleInput[], ticks: number) => {
  const battle = createBattle(init);
  battle.runToEnd(inputs, ticks);
  return battle.state;
};

describe("파티·군단 명령(D-545·D-549)", () => {
  it("명령 없는 옛 전투는 끝 상태까지 옛 판정과 같다(유닛 명령·퇴각·공성 포함, 지문은 바꾸기 전 코드에서 잼)", () => {
    expect(baselineHashes()).toEqual({
      duel6: "c5e2d3006297d408",
      duel6s3: "14b8ca817a660e39",
      duel12cmd: "e1bf3ad36498054b",
      siege: "c0e749fcc8103bb4",
    });
  });

  it("명령 받은 적 없는 파티·편은 상태에 명령 칸이 없다(옛 스냅숏 모양)", () => {
    const state = run(duel(6, 1), [], 20);
    expect(state.parties.every((party) => !("order" in party) && !("orderMs" in party))).toBe(true);
    expect(state.sides.every((side) => !("orderMs" in side))).toBe(true);
  });

  it("자리 지키기: 닿는 적이 없으면 움직이지 않는다", () => {
    const init = legionBattle(2);
    const before = init.units.filter((spec) => spec.party === 1).map((spec) => [spec.x, spec.y]);
    // 파티 1은 지키고, 파티 2는 전진(맞은편 가장자리로)
    const state = run(
      init,
      [
        { tick: 0, kind: "order", party: 1, order: { kind: "hold" } },
        { tick: 0, kind: "order", party: 2, order: { kind: "advance" } },
      ],
      60,
    );
    const after = state.units.filter((u) => u.party === 1).map((u) => [u.x, u.y]);
    expect(after).toEqual(before);
    // 전진한 파티는 동쪽으로 나아갔다(본 적이 없어도)
    expect(state.units.filter((u) => u.party === 2).every((u) => u.x > 3)).toBe(true);
  });

  it("칸 전진: 지금 모양 그대로 목표 칸으로 옮겨 가서 멈춘다", () => {
    const init = legionBattle(2);
    const goal = cellOf(10, 6);
    const state = run(
      init,
      [{ tick: 0, kind: "order", party: 1, order: { kind: "advance", cell: goal } }],
      200,
    );
    const members = state.units.filter((u) => u.party === 1);
    // 처음 모양: x 3, y 4~7(평균 3·5) → 목표 (10, 6) 기준 y 5~8
    expect(members.map((u) => [u.x, u.y])).toEqual([
      [10, 5],
      [10, 6],
      [10, 7],
      [10, 8],
    ]);
    const order = state.parties.find((party) => party.id === 1)?.order;
    expect(order?.kind).toBe("advance");
  });

  it("진형 지키기: 느린 동료가 있으면 빠른 유닛이 간격 넘게 앞서지 않는다", () => {
    const base = legionBattle(2);
    const init: BattleInit = {
      ...base,
      units: base.units.map((spec) => (spec.id === 4 ? { ...spec, moveIntervalMs: 2000 } : spec)),
    };
    const battle = createBattle(init);
    const inputs: BattleInput[] = [{ tick: 0, kind: "order", party: 1, order: { kind: "advance" } }];
    let widest = 0;
    for (let tick = 0; tick < 120; tick++) {
      battle.step(inputs);
      const xs = battle.state.units.filter((u) => u.party === 1).map((u) => edgeProgress(3, u.x, u.y, SIZE));
      widest = Math.max(widest, Math.max(...xs) - Math.min(...xs));
    }
    // 앞선 유닛은 간격 + 한 걸음까지만(같은 틱에 셈 뒤로 한 걸음 더 갈 수 있다)
    expect(widest).toBeLessThanOrEqual(FORMATION_LEASH_CELLS + 1);
    // 견주기: 명령 없이 AI면(본 적이 없어) 그대로 서 있다
    const idle = run(init, [], 120);
    expect(idle.units.filter((u) => u.party === 1).every((u) => u.x === 3)).toBe(true);
  });

  it("목표 공격: 파티가 그 목표를 먼저 쓰러뜨리고, 쓰러지면 명령이 끝난다", () => {
    const firstDown = (inputs: BattleInput[]): number | undefined => {
      const battle = createBattle(legionBattle(2, 5, 9));
      for (let tick = 0; tick < 600 && !battle.state.result; tick++) {
        battle.step(inputs);
        const down = battle.state.units.find((u) => u.side === 2 && u.status === "down");
        if (down) return down.id;
      }
      return undefined;
    };
    // 명령 없이는 가장 가까운 적부터(103이 아님), 목표 공격이면 103부터
    expect(firstDown([])).not.toBe(103);
    const order: BattleInput[] = [
      { tick: 1, kind: "legion", side: 1, order: { kind: "attack", target: 103 } },
    ];
    expect(firstDown(order)).toBe(103);
    const state = run(legionBattle(2, 5, 9), order, 600);
    expect(state.parties.find((party) => party.id === 1)?.order).toBeUndefined();
  });

  it("군단 명령은 지휘 정원 안 파티만 받는다(1463), 지휘관이 없으면 거절", () => {
    const one = run(legionBattle(1), [{ tick: 0, kind: "legion", side: 1, order: { kind: "advance" } }], 30);
    expect(one.parties.find((party) => party.id === 1)?.order).toEqual({ kind: "advance", legion: true });
    expect(one.parties.find((party) => party.id === 2)?.order).toBeUndefined();
    const two = run(legionBattle(2), [{ tick: 0, kind: "legion", side: 1, order: { kind: "hold" } }], 5);
    expect(two.parties.filter((party) => party.side === 1).map((party) => party.order?.kind)).toEqual([
      "hold",
      "hold",
    ]);
    const none = run(legionBattle(0), [{ tick: 0, kind: "legion", side: 1, order: { kind: "hold" } }], 5);
    expect(none.rejected).toBe(1);
    expect(none.parties.every((party) => party.order === undefined)).toBe(true);
  });

  it("군단 칸 전진은 군단 전체 모양을 지킨다(파티 사이 간격 그대로)", () => {
    const goal = cellOf(12, 13);
    const state = run(
      legionBattle(2),
      [{ tick: 0, kind: "legion", side: 1, order: { kind: "advance", cell: goal } }],
      300,
    );
    const ys = (party: number) => state.units.filter((u) => u.party === party).map((u) => u.y);
    // 처음 파티 1은 y 4~7, 파티 2는 y 20~23(간격 16) — 그대로
    expect((ys(2)[0] ?? 0) - (ys(1)[0] ?? 0)).toBe(16);
    expect(state.units.filter((u) => u.side === 1).every((u) => u.x === 12)).toBe(true);
  });

  it("유닛 명령이 파티 명령 위에 선다: 이동 명령을 끝내면 다시 파티 명령(자리 지키기)", () => {
    const state = run(
      legionBattle(2),
      [
        { tick: 0, kind: "order", party: 1, order: { kind: "hold" } },
        { tick: 2, kind: "command", unit: 2, command: { kind: "move", cell: cellOf(6, 5) } },
      ],
      120,
    );
    const moved = state.units.find((u) => u.id === 2);
    expect([moved?.x, moved?.y]).toEqual([6, 5]);
    expect(moved?.command).toBeNull();
    // 나머지는 지킨 자리 그대로
    expect(state.units.find((u) => u.id === 3)?.x).toBe(3);
  });

  it("파티 명령은 그 유닛들의 대기 명령을 비운다(1462)", () => {
    const state = run(
      legionBattle(2),
      [
        { tick: 0, kind: "command", unit: 2, command: { kind: "move", cell: cellOf(20, 5) } },
        { tick: 3, kind: "order", party: 1, order: { kind: "hold" } },
      ],
      40,
    );
    const unit2 = state.units.find((u) => u.id === 2);
    expect(unit2?.command).toBeNull();
    expect(unit2?.x).toBeLessThan(8);
  });

  it("다시 넣기 막기: 같은 파티·편에 약 1초 안 두 번째 명령은 거절(파티·편 따로)", () => {
    const lock = TEST_COMBAT_COEFFICIENTS.commandLockMs / TEST_COMBAT_COEFFICIENTS.tickMs;
    // 파티: 같은 파티 두 번째는 거절, 다른 파티는 따로
    const parties = run(
      legionBattle(2),
      [
        { tick: 0, kind: "order", party: 1, order: { kind: "hold" } },
        { tick: 1, kind: "order", party: 1, order: { kind: "advance" } },
        { tick: 1, kind: "order", party: 2, order: { kind: "hold" } },
      ],
      3,
    );
    expect(parties.rejected).toBe(1);
    // 편: 같은 편 두 번째 군단 명령은 거절(파티 명령이 서 있으면 군단 명령을 받지 않으므로 — D-574 — 편만 따로 본다)
    const state = run(
      legionBattle(2),
      [
        { tick: 2, kind: "legion", side: 1, order: { kind: "advance" } },
        { tick: 3, kind: "legion", side: 1, order: { kind: "hold" } },
        { tick: 2 + lock, kind: "legion", side: 1, order: { kind: "free" } },
      ],
      lock + 5,
    );
    expect(state.rejected).toBe(1);
    expect(state.parties.filter((party) => party.side === 1).every((party) => !party.order)).toBe(true);
  });

  it("군단 퇴각은 정원 안 파티만 퇴각시킨다", () => {
    const state = run(
      legionBattle(1),
      [{ tick: 0, kind: "legion", side: 1, order: { kind: "retreat" } }],
      300,
    );
    expect(state.parties.find((party) => party.id === 1)?.retreated).toBe(true);
    expect(state.parties.find((party) => party.id === 2)?.retreating).toBe(false);
  });

  it("명령 순위(D-574 질문 2110): 파티 명령이 서 있는 파티는 군단 명령을 받지 않고, 자유로 풀면 다시 받는다", () => {
    const lock = Math.ceil(TEST_COMBAT_COEFFICIENTS.commandLockMs / TEST_COMBAT_COEFFICIENTS.tickMs);
    const inputs: BattleInput[] = [
      { tick: 0, kind: "legion", side: 1, order: { kind: "advance" } },
      // 소유주 명령이 군단 명령을 덮는다(뒤에 내린 쪽)
      { tick: 1, kind: "order", party: 2, order: { kind: "hold" } },
      // 그 뒤 군단 명령은 파티 2를 건너뛴다
      { tick: 1 + lock, kind: "legion", side: 1, order: { kind: "hold" } },
    ];
    const held = run(legionBattle(2), inputs, 2 + lock);
    expect(held.parties.find((party) => party.id === 1)?.order).toEqual({ kind: "hold", legion: true });
    expect(held.parties.find((party) => party.id === 2)?.order).toEqual({ kind: "hold", legion: false });
    // 정원 안 모든 파티가 소유주 명령이면 군단 명령은 거절
    const both = run(
      legionBattle(2),
      [
        { tick: 0, kind: "order", party: 1, order: { kind: "hold" } },
        { tick: 0, kind: "order", party: 2, order: { kind: "hold" } },
        { tick: 1, kind: "legion", side: 1, order: { kind: "advance" } },
      ],
      3,
    );
    expect(both.rejected).toBe(1);
    // 소유주가 자유로 풀면 다음 군단 명령을 받는다
    const freed = run(
      legionBattle(2),
      [
        ...inputs,
        { tick: 1 + lock, kind: "order", party: 2, order: { kind: "free" } },
        { tick: 1 + 2 * lock, kind: "legion", side: 1, order: { kind: "advance" } },
      ],
      2 + 2 * lock,
    );
    expect(freed.parties.find((party) => party.id === 2)?.order).toEqual({ kind: "advance", legion: true });
  });

  it("군단장 분대별 명령(D-574 질문 2265 나): 정원 안 그 파티 하나만 2순위로 받고, 소유주 명령이 서 있거나 정원 밖이면 거절", () => {
    const lock = Math.ceil(TEST_COMBAT_COEFFICIENTS.commandLockMs / TEST_COMBAT_COEFFICIENTS.tickMs);
    const one = run(
      legionBattle(2),
      [{ tick: 0, kind: "legion", side: 1, party: 2, order: { kind: "hold" } }],
      3,
    );
    expect(one.parties.find((party) => party.id === 1)?.order).toBeUndefined();
    expect(one.parties.find((party) => party.id === 2)?.order).toEqual({ kind: "hold", legion: true });
    expect(one.rejected).toBe(0);
    // 소유주 명령이 서 있으면 거절(2순위), 소유주는 언제든 덮는다
    const owned = run(
      legionBattle(2),
      [
        { tick: 0, kind: "order", party: 2, order: { kind: "advance" } },
        { tick: 1, kind: "legion", side: 1, party: 2, order: { kind: "hold" } },
      ],
      3,
    );
    expect(owned.rejected).toBe(1);
    expect(owned.parties.find((party) => party.id === 2)?.order).toEqual({ kind: "advance", legion: false });
    const over = run(
      legionBattle(2),
      [
        { tick: 0, kind: "legion", side: 1, party: 2, order: { kind: "hold" } },
        { tick: 1, kind: "order", party: 2, order: { kind: "advance" } },
      ],
      3,
    );
    expect(over.parties.find((party) => party.id === 2)?.order).toEqual({ kind: "advance", legion: false });
    // 정원 밖(정원 1 = 파티 1만)이면 거절
    const outside = run(
      legionBattle(1),
      [{ tick: 0, kind: "legion", side: 1, party: 2, order: { kind: "hold" } }],
      3,
    );
    expect(outside.rejected).toBe(1);
    expect(outside.parties.find((party) => party.id === 2)?.order).toBeUndefined();
    // 다시 넣기 막기는 편 단위(같은 편의 군단 명령과 함께)
    const again = run(
      legionBattle(2),
      [
        { tick: 0, kind: "legion", side: 1, party: 1, order: { kind: "hold" } },
        { tick: 1, kind: "legion", side: 1, party: 2, order: { kind: "hold" } },
        { tick: 1 + lock, kind: "legion", side: 1, party: 2, order: { kind: "hold" } },
      ],
      2 + lock,
    );
    expect(again.rejected).toBe(1);
    expect(again.parties.find((party) => party.id === 2)?.order).toEqual({ kind: "hold", legion: true });
  });

  it("명령이 든 전투도 같은 입력이면 끝 상태가 같고, 스냅숏에서 다시 켜도 같다", () => {
    const init = legionBattle(2, 11, 12);
    const inputs: BattleInput[] = [
      { tick: 0, kind: "legion", side: 1, order: { kind: "advance" } },
      { tick: 40, kind: "order", party: 2, order: { kind: "attack", target: 101 } },
      { tick: 120, kind: "order", party: 1, order: { kind: "hold" } },
    ];
    const a = runBattle(init, inputs);
    expect(runBattle(init, inputs).finalState).toBe(a.finalState);
    const snapshots: { snapshot: string; tick: number }[] = [];
    runBattle(init, inputs, (snapshot, tick) => snapshots.push({ snapshot, tick }));
    const first = snapshots[0];
    if (first) {
      const restored = restoreBattle(init, first.snapshot);
      restored.runToEnd(inputs);
      expect(snapshotBattle(restored.state)).toBe(a.finalState);
    }
  });

  it("맞은편 가장자리 줄", () => {
    expect(oppositeEdgeCells(3, 4)).toEqual([3, 7, 11, 15]);
    expect(oppositeEdgeCells(0, 3)).toEqual([6, 7, 8]);
  });
});
