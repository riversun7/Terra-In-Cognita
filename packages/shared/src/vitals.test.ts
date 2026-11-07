// 생명 수치 분 단위 회복 시험 — D-512
import { describe, expect, it } from "vitest";
import { VITALS_MINUTE_MS, type VitalsSnapshot, vitalsAt, vitalsFull, vitalsNextChange } from "./vitals.ts";

const base: VitalsSnapshot = {
  values: { hp: 10, armor: 3, shield: 5 },
  max: { hp: 50, armor: 15, shield: 48 },
  regen: { hp: 0, armor: 0, shield: 10 },
  at: 1_000_000,
};

describe("vitalsAt", () => {
  it("온전한 분 수만큼만 더하고, 덜 찬 분은 시각에 남긴다", () => {
    const early = vitalsAt(base, base.at + VITALS_MINUTE_MS - 1);
    expect(early).toEqual(base);
    const later = vitalsAt(base, base.at + 2 * VITALS_MINUTE_MS + 30_000);
    expect(later.values).toEqual({ hp: 10, armor: 3, shield: 25 });
    expect(later.at).toBe(base.at + 2 * VITALS_MINUTE_MS);
    // 나눠 세도 한 번에 센 것과 같다
    const stepwise = vitalsAt(vitalsAt(base, base.at + 90_000), base.at + 150_000);
    expect(stepwise).toEqual(vitalsAt(base, base.at + 150_000));
  });

  it("최대에서 멈추고, 최대가 줄었으면 자른다. 시각을 되돌리지 않는다", () => {
    const full = vitalsAt(base, base.at + 60 * VITALS_MINUTE_MS);
    expect(full.values.shield).toBe(48);
    expect(vitalsFull(full)).toBe(false);
    const shrunk = vitalsAt({ ...base, max: { hp: 8, armor: 15, shield: 48 } }, base.at);
    expect(shrunk.values.hp).toBe(8);
    expect(vitalsAt(base, base.at - 5 * VITALS_MINUTE_MS)).toEqual(base);
  });

  it("회복이 0인 칸은 그대로다(HP·아머: 규칙 없음)", () => {
    const later = vitalsAt(base, base.at + 1_000 * VITALS_MINUTE_MS);
    expect(later.values.hp).toBe(10);
    expect(later.values.armor).toBe(3);
  });

  it("다음 바뀌는 시각: 덜 찬 칸에 회복이 있을 때만", () => {
    expect(vitalsNextChange(base)).toBe(base.at + VITALS_MINUTE_MS);
    const shieldFull = { ...base, values: { hp: 10, armor: 3, shield: 48 } };
    expect(vitalsNextChange(shieldFull)).toBeNull();
    expect(vitalsFull({ ...base, values: base.max })).toBe(true);
  });
});
