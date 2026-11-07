// 생명 수치 분 단위 회복 시험 — D-512
import { describe, expect, it } from "vitest";
import {
  VITALS_MINUTE_MS,
  type VitalsSnapshot,
  vitalsAt,
  vitalsFull,
  vitalsNextChange,
  vitalsRegenNow,
} from "./vitals.ts";

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

describe("회복 구간(D-514: 부상 중 느린 회복·주기 회복 물건)", () => {
  const M = VITALS_MINUTE_MS;
  // 3분 동안 느림(HP 2/분), 그다음 5분까지 물건으로 빠름(HP 20/분), 그 뒤 보통(HP 10/분)
  const phased: VitalsSnapshot = {
    values: { hp: 0, armor: 0, shield: 0 },
    max: { hp: 1000, armor: 100, shield: 100 },
    regen: { hp: 10, armor: 1, shield: 0 },
    at: 0,
    phases: [
      { until: 3 * M, regen: { hp: 2, armor: 0, shield: 0 } },
      { until: 5 * M, regen: { hp: 20, armor: 1, shield: 0 } },
    ],
  };

  it("분 경계마다 그 경계를 포함하는 구간의 회복을 쓴다", () => {
    expect(vitalsAt(phased, 3 * M).values.hp).toBe(6);
    expect(vitalsAt(phased, 5 * M).values.hp).toBe(46);
    expect(vitalsAt(phased, 7 * M).values).toEqual({ hp: 66, armor: 4, shield: 0 });
  });

  it("나눠 세도 같고, 지난 구간은 뺀다", () => {
    const step = vitalsAt(vitalsAt(vitalsAt(phased, 2.5 * M), 4 * M + 1), 7 * M);
    expect(step).toEqual(vitalsAt(phased, 7 * M));
    expect(vitalsAt(phased, 4 * M).phases).toEqual([phased.phases?.[1]]);
    expect(vitalsAt(phased, 5 * M).phases).toBeUndefined();
  });

  it("다음 경계의 회복과 다음 바뀌는 시각: 지금 구간 회복이 0이어도 뒤에 있으면 다시 본다", () => {
    expect(vitalsRegenNow(phased).hp).toBe(2);
    expect(vitalsRegenNow(vitalsAt(phased, 3 * M)).hp).toBe(20);
    const stalled: VitalsSnapshot = {
      ...phased,
      regen: { hp: 10, armor: 0, shield: 0 },
      phases: [{ until: 2 * M, regen: { hp: 0, armor: 0, shield: 0 } }],
    };
    expect(vitalsNextChange(stalled)).toBe(M);
  });
});
