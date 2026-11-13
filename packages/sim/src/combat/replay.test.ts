import {
  type BattleReplay,
  type ReplayUnitState,
  admitJoined,
  applyReplayEvent,
  decodeBattleReplay,
  encodeBattleReplay,
  replayToBase64,
  stateFromKeyframe,
} from "@terra/protocol/battleReplay";
import { describe, expect, it } from "vitest";
import { runBattle } from "./battle.ts";
import type { BattleInit, BattleInput, BattleState } from "./battleTypes.ts";
import { TEST_COMBAT_CATALOG, skillsOf } from "./catalog.ts";
import { recordBattleReplay, skillShape } from "./replay.ts";
import { demoSkirmish } from "./replayDemo.ts";
import { duel, openMap, unit } from "./testBattle.ts";

const demo = (seed: number): BattleInit =>
  demoSkirmish({ catalog: TEST_COMBAT_CATALOG, map: openMap(64), seed }).init;

/** 틱 tick 처음 상태를 처음 키프레임에서 사건만으로 되짚는다(가까운 키프레임을 쓰지 않는다) */
function fromStart(replay: BattleReplay, tick: number): ReplayUnitState[] {
  const first = replay.keyframes[0];
  if (!first) throw new Error("no keyframe");
  const state = stateFromKeyframe(first);
  for (const event of replay.events) {
    if (event.t >= tick) break;
    applyReplayEvent(state, event);
  }
  admitJoined(replay, state, tick);
  return state;
}

/** 판정 끝 상태와 되짚은 상태가 같은가(자리·자원·상태) */
function expectSameAsBattle(replay: BattleReplay, battle: BattleState): void {
  const rebuilt = fromStart(replay, replay.result.endTick);
  replay.units.forEach((unitRow, index) => {
    const real = battle.units.find((entry) => entry.id === unitRow.id);
    const mine = rebuilt[index];
    expect(real, `unit ${unitRow.id}`).toBeDefined();
    if (!real || !mine) return;
    expect({
      id: unitRow.id,
      status: mine.status,
      x: mine.x,
      y: mine.y,
      hp: mine.hp,
      armor: mine.armor,
      shield: mine.shield,
      mp: mine.mp,
      stamina: mine.stamina,
    }).toEqual({
      id: real.id,
      status: real.status,
      x: real.x,
      y: real.y,
      hp: real.hp,
      armor: real.armor,
      shield: real.shield,
      mp: Math.floor(real.mpMilli / 1000),
      stamina: Math.floor(real.staminaMilli / 1000),
    });
  });
}

describe("전투 리플레이 기록기", () => {
  it("기록해도 판정 결과·끝 상태가 바이트까지 같다(6 대 6 시범, 시드 여러 개)", () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const init = demo(seed);
      const plain = runBattle(init, []);
      const recorded = recordBattleReplay(init);
      expect(recorded.result).toEqual(plain.result);
      expect(recorded.finalState).toBe(plain.finalState);
    }
  });

  it("명령·참전 입력이 있어도 결과가 같고, 참전 유닛은 들어온 틱부터 산다", () => {
    const init = duel(3, 5, 32);
    const join: BattleInput = {
      tick: 40,
      kind: "join",
      side: { id: 1, faction: 1, defender: false, edge: 3 },
      party: { id: 7, side: 1, retreatHpPct: 0 },
      units: [unit(50, 1, 7, 2, 10), unit(51, 1, 7, 2, 12)],
    };
    const inputs: BattleInput[] = [
      { tick: 3, kind: "command", unit: 1, command: { kind: "move", cell: 10 * 32 + 14 } },
      { tick: 12, kind: "command", unit: 101, command: { kind: "retreat" } },
      join,
    ];
    const plain = runBattle(init, inputs);
    const recorded = recordBattleReplay(init, { inputs });
    expect(recorded.result).toEqual(plain.result);
    expect(recorded.finalState).toBe(plain.finalState);
    const index = recorded.replay.units.findIndex((row) => row.id === 50);
    expect(recorded.replay.units[index]?.joinTick).toBe(40);
    expect(fromStart(recorded.replay, 40)[index]?.status).toBe("absent");
    expect(fromStart(recorded.replay, 41)[index]?.status).not.toBe("absent");
    expectSameAsBattle(recorded.replay, recorded.state);
  });

  it("사건만 적용해 되짚은 끝 상태가 판정 끝 상태와 같다", () => {
    for (const seed of [1, 9]) {
      const recorded = recordBattleReplay(demo(seed));
      expectSameAsBattle(recorded.replay, recorded.state);
    }
  });

  it("앞 키프레임 + 사건 = 다음 키프레임", () => {
    // 키프레임 간격 25틱(속성 공격력 INT + ⌊WIS ÷ 2⌋ 뒤로 시연 전투가 짧아져 50틱이면 키프레임이 둘뿐이다, 2026-11-13)
    const { replay } = recordBattleReplay(demo(3), { keyframeTicks: 25 });
    expect(replay.keyframes.length).toBeGreaterThan(2);
    for (const keyframe of replay.keyframes.slice(1)) {
      const rebuilt = fromStart(replay, keyframe.tick);
      keyframe.units.forEach((frame, index) => {
        const mine = rebuilt[index];
        expect(mine).toBeDefined();
        if (!mine) return;
        expect({
          status: mine.status,
          x: mine.x,
          y: mine.y,
          facing: mine.facing,
          hp: mine.hp,
          armor: mine.armor,
          shield: mine.shield,
          mp: mine.mp,
          stamina: mine.stamina,
          effects: [...mine.effects]
            .map(([effect, value]) => ({ effect, ...value }))
            .toSorted((a, b) => a.effect - b.effect),
          cast: mine.cast
            ? { skill: mine.cast.skill, target: mine.cast.target, endTick: mine.cast.endTick }
            : null,
        }).toEqual({
          status: frame.status,
          x: frame.x,
          y: frame.y,
          facing: frame.facing,
          hp: frame.hp,
          armor: frame.armor,
          shield: frame.shield,
          mp: frame.mp,
          stamina: frame.stamina,
          effects: [...frame.effects].toSorted((a, b) => a.effect - b.effect),
          cast: frame.cast,
        });
      });
    }
  });

  it("시범 전투에 스킬·투사체·효과·쓰러짐·시야 사건이 든다", () => {
    const kinds = new Set<string>();
    const shapes = new Set<string>();
    for (const seed of [1, 2, 3]) {
      const { replay } = recordBattleReplay(demo(seed));
      for (const event of replay.events) kinds.add(event.k);
      for (const skill of replay.skills) shapes.add(skill.shape);
      expect(replay.events.at(-1)).toEqual({
        k: "end",
        t: replay.result.endTick,
        winner: replay.result.winner,
        reason: replay.result.reason,
      });
    }
    for (const kind of [
      "move",
      "attack",
      "cast",
      "skill",
      "skillHit",
      "projectile",
      "effectOn",
      "effectOff",
      "down",
      "vitals",
      "vision",
      "end",
    ])
      expect(kinds, kind).toContain(kind);
    expect([...shapes].toSorted()).toEqual([
      "area",
      "buff",
      "chain",
      "debuff",
      "heal",
      "projectile",
      "strike",
    ]);
  });

  it("이진으로 바꿔도 같고 6 대 6 한 판이 작다", () => {
    const { replay } = recordBattleReplay(demo(1));
    const bytes = encodeBattleReplay(replay);
    expect(decodeBattleReplay(bytes)).toEqual(replay);
    expect(replayToBase64(bytes).length).toBe(Math.ceil(bytes.length / 3) * 4);
    // 잰 값(바이트·gzip)은 서버 시험(apps/server/src/battleReplay/battleReplay.test.ts)이 적는다
    expect(bytes.length).toBeLessThan(18_000);
  });

  it("스킬 그림 모양은 스킬 자료의 모양 칸에서 정한다(ID가 아니다, single = strike)", () => {
    const skills = skillsOf(TEST_COMBAT_CATALOG, [
      "power_strike",
      "fire_bolt",
      "war_cry",
      "first_aid",
      "iron_skin",
      "stone_spike",
      "flame_burst",
      "chain_lightning",
      "light_heal",
      "radiant_ward",
      "dark_curse",
    ]);
    expect(skills.map((skill) => skillShape(skill))).toEqual([
      "strike",
      "projectile",
      "buff",
      "heal",
      "buff",
      "strike",
      "area",
      "chain",
      "heal",
      "buff",
      "debuff",
    ]);
    const [strike] = skills;
    if (!strike) throw new Error("catalog");
    // 같은 자료에 ID만 다르면 같은 모양
    expect(skillShape({ ...strike, id: "anything_else" })).toBe("strike");
  });
});
