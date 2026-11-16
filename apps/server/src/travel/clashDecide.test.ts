// 조우 AI 판단(D-570 1904) — 전쟁·전력 비·성향·짐·플레이어 기본 회피
import { START_ENCOUNTER } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  type ClashSideView,
  clashPower,
  clashThreshold,
  decideClash,
  powerRatioPm,
  resolveClash,
} from "./clashDecide.ts";

const side = (patch: Partial<ClashSideView>): ClashSideView => ({
  deciders: 1,
  player: false,
  aggression: 500,
  power: 1000,
  carries: false,
  ...patch,
});
const rules = START_ENCOUNTER;

describe("decideClash", () => {
  it("전쟁 상대: 전력 비 ≥ 전쟁 문턱이면 전투, 아니면 회피", () => {
    expect(decideClash(side({ power: 800 }), side({ power: 1000 }), true, rules)).toBe("fight");
    expect(decideClash(side({ power: 799 }), side({ power: 1000 }), true, rules)).toBe("avoid");
  });

  it("전쟁이 아니면 짐이 있는 상대만 약탈(약탈 문턱), 짐이 없으면 회피", () => {
    expect(decideClash(side({ power: 1500 }), side({ carries: true }), false, rules)).toBe("loot");
    expect(decideClash(side({ power: 1499 }), side({ carries: true }), false, rules)).toBe("avoid");
    expect(decideClash(side({ power: 9000 }), side({ carries: false }), false, rules)).toBe("avoid");
  });

  it("성향: 공격 성향이 높을수록 문턱이 낮다(500 = 그대로)", () => {
    expect(clashThreshold(1000, 500, 1000)).toBe(1000);
    expect(clashThreshold(1000, 1000, 1000)).toBe(500);
    expect(clashThreshold(1000, 0, 1000)).toBe(1500);
    expect(clashThreshold(1000, 0, 0)).toBe(1000);
    expect(decideClash(side({ power: 500, aggression: 1000 }), side({}), true, rules)).toBe("fight");
    expect(decideClash(side({ power: 1100, aggression: 0 }), side({}), true, rules)).toBe("avoid");
  });

  it("플레이어는 기본(정책 0) 늘 회피, 정책 1이면 성향 500 NPC처럼. 판단하는 유닛이 없으면 회피", () => {
    expect(decideClash(side({ player: true, power: 9000 }), side({}), true, rules)).toBe("avoid");
    expect(
      decideClash(side({ player: true, power: 9000 }), side({}), true, { ...rules, playerPolicy: 1 }),
    ).toBe("fight");
    expect(decideClash(side({ deciders: 0, power: 9000 }), side({}), true, rules)).toBe("avoid");
  });
});

describe("resolveClash", () => {
  it("둘 다 회피면 null, 한쪽만 걸면 그쪽이 공격 편, 둘 다 걸면 전력 비가 큰 쪽", () => {
    expect(resolveClash(side({ player: true }), side({ deciders: 0 }), true, rules)).toBe(null);
    expect(resolveClash(side({ player: true }), side({ power: 2000 }), true, rules)).toMatchObject({
      attacker: 1,
      choice: "fight",
      choices: ["avoid", "fight"],
    });
    expect(resolveClash(side({ power: 900 }), side({ power: 1000 }), true, rules)).toMatchObject({
      attacker: 1,
    });
    expect(resolveClash(side({ power: 1000 }), side({ power: 1000 }), true, rules)).toMatchObject({
      attacker: 0,
    });
    expect(
      resolveClash(side({ power: 3000 }), side({ player: true, carries: true }), false, rules),
    ).toMatchObject({ attacker: 0, choice: "loot" });
  });

  it("전력 비·몸 전력", () => {
    expect(powerRatioPm(3, 2)).toBe(1500);
    expect(powerRatioPm(0, 0)).toBe(0);
    expect(powerRatioPm(1, 0)).toBe(Number.MAX_SAFE_INTEGER);
    const spec = {
      maxHp: 100,
      armorHp: 20,
      shieldHp: 30,
      attack: { statAttack: 10, weaponAttack: 5 },
      attackIntervalMs: 1500,
    };
    expect(clashPower(spec)).toBe(Math.floor((150 * 15 * 1000) / 1500));
    expect(clashPower({ ...spec, start: { hp: 50, armor: 0, shield: 0 } })).toBe(500);
  });
});
