import { describe, expect, it } from "vitest";
import { TEST_COMBAT_CATALOG } from "./catalog.ts";
import {
  type EffectDef,
  type EffectHolder,
  applyEffect,
  hasStatus,
  modifiersOf,
  statusResistPm,
  tickEffects,
} from "./effects.ts";

const def = (id: string): EffectDef => {
  const found = TEST_COMBAT_CATALOG.effects.find((effect) => effect.id === id);
  if (!found) throw new Error(`fixture ${id}`);
  return found;
};

const holder = (hp = 100): EffectHolder => ({ hp, maxHp: 100, status: "alive", effects: [], command: null });

describe("효과 사전(D-425)", () => {
  it("지속 피해는 주기마다 깎고, 끝나면 사라진다. 겹침은 최대까지 곱한다", () => {
    const unit = holder();
    applyEffect(unit, def("burn"), 5, 3000, 0);
    applyEffect(unit, def("burn"), 5, 3000, 0);
    tickEffects(unit, 1000);
    expect(unit.hp).toBe(90);
    tickEffects(unit, 2000);
    expect(unit.hp).toBe(80);
    tickEffects(unit, 3000);
    expect(unit.effects).toEqual([]);
    expect(unit.hp).toBe(80);
  });

  it("지속 피해로 쓰러질 수 있다", () => {
    const unit = holder(4);
    applyEffect(unit, def("burn"), 5, 3000, 0);
    tickEffects(unit, 1000);
    expect(unit.status).toBe("down");
    expect(unit.hp).toBe(0);
  });

  it("버프는 더하고 디버프는 뺀다. ignore는 다시 걸어도 그대로", () => {
    const unit = holder();
    applyEffect(unit, def("attack_up"), 200, 6000, 0);
    applyEffect(unit, def("defense_down"), 100, 4000, 0);
    applyEffect(unit, def("guard"), 50, 0, 0);
    applyEffect(unit, def("guard"), 999, 0, 0);
    expect(modifiersOf(unit)).toMatchObject({ attackPm: 200, defenseRatePm: -50 });
  });

  it("한 번 회복은 바로 적용하고 최대 체력을 넘지 않는다", () => {
    const unit = holder(50);
    applyEffect(unit, def("mend"), 300, 0, 0);
    expect(unit.hp).toBe(80);
    applyEffect(unit, def("mend"), 300, 0, 0);
    expect(unit.hp).toBe(100);
    expect(unit.effects).toEqual([]);
  });

  it("상태이상 저항은 1차 스탯 가중합의 확률 모양이다(D-429)", () => {
    const stun = def("stun");
    expect(statusResistPm(stun, [0, 0, 0, 0, 0, 0])).toBe(0);
    // 점수 = VIT 100 × 1000‰ ÷ 1000 = 100 = 반감 상수 → 상한 600(N3)의 절반
    expect(statusResistPm(stun, [0, 0, 0, 100, 0, 0])).toBe(300);
    expect(statusResistPm(stun, [0, 0, 0, 10_000_000, 0, 0])).toBeLessThan(600);
    expect(statusResistPm(def("burn"), [0, 0, 0, 100, 0, 0])).toBe(0);
  });

  it("기절은 끝나는 시각까지 남는다", () => {
    const unit = holder();
    applyEffect(unit, def("stun"), 0, 1500, 0);
    tickEffects(unit, 1400);
    expect(hasStatus(unit, "stun")).toBe(true);
    tickEffects(unit, 1500);
    expect(hasStatus(unit, "stun")).toBe(false);
  });
});
