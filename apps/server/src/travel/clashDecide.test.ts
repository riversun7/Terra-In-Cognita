// 조우 AI 판단(D-570 1904, encounter-4 — AI 작전 D-5039·D-5040, D-144, D-573) — 전쟁·전력 비·① 교전·⑦ 퇴각·짐·플레이어 정책·빠져나가기
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
  engage: 5,
  retreatPct: 0,
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
    expect(decideClash(side({ power: 500, engage: 10 }), side({}), true, rules)).toBe("fight");
    expect(decideClash(side({ power: 1100, engage: 0 }), side({}), true, rules)).toBe("avoid");
  });

  it("① 교전 굴림: 교전 n이면 굴림(‰)이 n × 100 미만일 때만 건다", () => {
    expect(decideClash(side({ engage: 6 }), side({}), true, rules, 599)).toBe("fight");
    expect(decideClash(side({ engage: 6 }), side({}), true, rules, 600)).toBe("avoid");
    expect(decideClash(side({ engage: 0, power: 9000 }), side({}), true, rules, 0)).toBe("avoid");
  });

  it("⑦ 퇴각 기준: 편 남은 HP %가 선 아래면 걸지 않는다", () => {
    expect(decideClash(side({ retreatPct: 50, hpPct: 49, power: 9000 }), side({}), true, rules)).toBe(
      "avoid",
    );
    expect(decideClash(side({ retreatPct: 50, hpPct: 50, power: 9000 }), side({}), true, rules)).toBe(
      "fight",
    );
  });

  it("플레이어 정책: 2(기본) = 작전대로, 0 = 늘 회피, 1 = 옛 판단(교전 5, 굴림 없음). 먼저 걸 유닛이 없으면(오프라인 D-144) 회피", () => {
    expect(rules.playerPolicy).toBe(2);
    expect(decideClash(side({ player: true, power: 9000 }), side({}), true, rules)).toBe("fight");
    expect(
      decideClash(side({ player: true, power: 9000 }), side({}), true, { ...rules, playerPolicy: 0 }),
    ).toBe("avoid");
    expect(
      decideClash(
        side({ player: true, engage: 0, power: 9000 }),
        side({}),
        true,
        { ...rules, playerPolicy: 1 },
        999,
      ),
    ).toBe("fight");
    expect(decideClash(side({ player: true, starters: 0, power: 9000 }), side({}), true, rules)).toBe(
      "avoid",
    );
    expect(decideClash(side({ deciders: 0, power: 9000 }), side({}), true, rules)).toBe("avoid");
  });
});

describe("resolveClash", () => {
  it("둘 다 회피면 null, 한쪽만 걸면 그쪽이 공격 편, 둘 다 걸면 전력 비가 큰 쪽", () => {
    expect(resolveClash(side({ engage: 0 }), side({ deciders: 0 }), true, rules)).toBe(null);
    expect(resolveClash(side({ engage: 0 }), side({ power: 2000 }), true, rules)).toMatchObject({
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

  it("D-573: 판단 끝에 회피한 수비 편이 더 빠르면 빠져나가고(escaped), 아니면 퇴각 시도(flee). 판단 유닛 없는 편은 맞선다", () => {
    const attacker = side({ power: 3000, speed: 500 });
    expect(resolveClash(attacker, side({ engage: 0, speed: 600 }), true, rules)).toMatchObject({
      attacker: 0,
      flee: true,
      escaped: true,
    });
    expect(resolveClash(attacker, side({ engage: 0, speed: 500 }), true, rules)).toMatchObject({
      flee: true,
      escaped: false,
    });
    expect(resolveClash(side({ engage: 0, speed: 600 }), attacker, true, rules)).toMatchObject({
      attacker: 1,
      escaped: true,
    });
    expect(resolveClash(attacker, side({ deciders: 0, speed: 9000 }), true, rules)).toMatchObject({
      flee: false,
      escaped: false,
    });
    // 빠르기를 모르면 빠져나가지 못한다
    expect(resolveClash(side({ power: 3000 }), side({ engage: 0, speed: 600 }), true, rules)).toMatchObject({
      escaped: false,
    });
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
