import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  MAX_STAT_INPUT,
  type Primaries,
  TEST_STAT_TABLE,
  computeSecondary,
  explainSecondary,
  primaryAtLevel,
} from "./stats.ts";

const flat: Primaries = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };

function agiOnly(agi: number): Primaries {
  return { str: 0, dex: 0, agi, vit: 0, int: 0, wis: 0 };
}

describe("스탯 계산기(D-414·D-417, 정수 ‰)", () => {
  it("1차 스탯 성장 = 초기 × (1 + 성장률 × K × (Lv − 1))", () => {
    // 초기 20, 성장률 100‰(10%), K 1000‰, Lv 11 → 20 × (1 + 0.1 × 10) = 40
    expect(primaryAtLevel(20, 100, 1000, 11)).toBe(40);
    // K 1200‰ → 20 × (1 + 0.1 × 1.2 × 10) = 44
    expect(primaryAtLevel(20, 100, 1200, 11)).toBe(44);
    expect(primaryAtLevel(20, 100, 1200, 1)).toBe(20);
  });

  it("넘침 방지: 입력 범위(10^7)를 넘는 1차 스탯·장비 값은 거절한다(게임 상한이 아니라 정수 보호)", () => {
    expect(() => computeSecondary({ ...flat, str: MAX_STAT_INPUT }, TEST_STAT_TABLE)).not.toThrow();
    expect(() => computeSecondary({ ...flat, str: MAX_STAT_INPUT + 1 }, TEST_STAT_TABLE)).toThrow(RangeError);
    expect(() => computeSecondary(flat, TEST_STAT_TABLE, { hp: MAX_STAT_INPUT + 1 })).toThrow(RangeError);
  });

  it("양 모양 = 기본 + Σ(1차 × 가중치‰) ÷ 1000 + 장비 + 버프", () => {
    const hp = TEST_STAT_TABLE.find((row) => row.id === "hp");
    if (!hp || hp.shape !== "quantity") throw new Error("fixture");
    const weighted = Math.floor(
      (flat.str * (hp.weights[0] ?? 0) +
        flat.dex * (hp.weights[1] ?? 0) +
        flat.agi * (hp.weights[2] ?? 0) +
        flat.vit * (hp.weights[3] ?? 0) +
        flat.int * (hp.weights[4] ?? 0) +
        flat.wis * (hp.weights[5] ?? 0)) /
        1000,
    );
    const stats = computeSecondary(flat, TEST_STAT_TABLE, { hp: 50 }, { hp: 5 });
    expect(stats.hp).toBe(hp.base + weighted + 55);
  });

  it("확률 모양 = 상한 × 점수 ÷ (점수 + 반감 상수): 점수가 반감 상수와 같으면 상한의 절반, 커져도 상한을 넘지 않는다", () => {
    const evade = TEST_STAT_TABLE.find((row) => row.id === "evade");
    if (!evade || evade.shape !== "probability") throw new Error("fixture");
    const scoreAt = (agi: number) => Math.floor((agi * (evade.weights[2] ?? 1)) / 1000);
    // 점수 = 반감 상수가 되는 AGI
    const agi = Math.ceil((evade.halfConstant * 1000) / (evade.weights[2] ?? 1));
    expect(scoreAt(agi)).toBe(evade.halfConstant);
    expect(computeSecondary(agiOnly(agi), TEST_STAT_TABLE).evade).toBe(Math.floor(evade.cap / 2));
    expect(computeSecondary(agiOnly(1_000_000), TEST_STAT_TABLE).evade).toBeLessThan(evade.cap);
    expect(computeSecondary(agiOnly(0), TEST_STAT_TABLE).evade).toBe(0);
  });

  it("2차 스탯 15개(D-458에서 명중·크리·행동 속도 점수를 끔, D-502 — HP 회복 D-514 더함)와 시야·제작 직무: 확률 모양은 회피·물리/속성 방어율, 나머지는 양 모양", () => {
    const shapes = Object.fromEntries(TEST_STAT_TABLE.map((row) => [row.id, row.shape]));
    expect(shapes).toEqual({
      // 생존 5
      hp: "quantity",
      armor_hp: "quantity",
      shield_hp: "quantity",
      defense_rate: "probability",
      elemental_defense_rate: "probability",
      // 공격 2
      physical_attack: "quantity",
      elemental_attack: "quantity",
      // 정확 2(명중·크리 점수는 D-502로 무기 값 × DEX 비율이 되어 껐다)
      evade: "probability",
      crit_multiplier: "quantity",
      // 속도 0(행동 속도 점수는 D-502로 무기 간격 ÷ AGI 비율이 되어 껐다)
      // 자원 6(HP 회복 D-514)
      stamina: "quantity",
      stamina_regen: "quantity",
      mp: "quantity",
      mp_regen: "quantity",
      shield_regen: "quantity",
      hp_regen: "quantity",
      // 활동 수치(48 §3.3): 시야, 직무 효율(제작 — 수리 장인 실력, D-512 323)
      sight: "quantity",
      job_crafting: "quantity",
    });
    const stats = computeSecondary(flat, TEST_STAT_TABLE);
    for (const row of TEST_STAT_TABLE) expect(Number.isInteger(stats[row.id])).toBe(true);
  });

  it("HP 회복(D-514) 출발값 = 옛 문서 초당 1 + VIT × 0.08 + WIS × 0.04를 분당으로: 새 사이보그(1차 10) 분당 132, VIT 40·WIS 40 분당 348", () => {
    expect(computeSecondary(flat, TEST_STAT_TABLE).hp_regen).toBe(60 + 48 + 24);
    const forty = { str: 40, dex: 40, agi: 40, vit: 40, int: 40, wis: 40 };
    expect(computeSecondary(forty, TEST_STAT_TABLE).hp_regen).toBe(60 + 192 + 96);
  });

  it("새 행 출발값(분당): 쉴드 재생 = 1분에 WIS만큼(L11), 스태미나 회복 = 적정 STA에서 분당 720(D-511, 1차와 상관없음)", () => {
    const wisOnly: Primaries = { str: 0, dex: 0, agi: 0, vit: 0, int: 0, wis: 35 };
    expect(computeSecondary(wisOnly, TEST_STAT_TABLE).shield_regen).toBe(35);
    // 스태미나 회복 행은 적정 STA에서의 회복(초당 12)이다. 적정 비율은 전투 사양이 곱한다(계산식 real_stamina_regen)
    const sta80: Primaries = { str: 0, dex: 0, agi: 80, vit: 80, int: 0, wis: 0 };
    expect(computeSecondary(sta80, TEST_STAT_TABLE).stamina_regen).toBe(720);
    expect(computeSecondary(wisOnly, TEST_STAT_TABLE).stamina_regen).toBe(720);
  });

  it("속성 방어율은 WIS·VIT로 오르고(D-458) STR은 보탬이 없다, 물리 방어율은 그 반대 쪽", () => {
    const base = computeSecondary(flat, TEST_STAT_TABLE);
    const wiser = computeSecondary({ ...flat, wis: 30 }, TEST_STAT_TABLE);
    const stronger = computeSecondary({ ...flat, str: 30 }, TEST_STAT_TABLE);
    expect(wiser.elemental_defense_rate).toBeGreaterThan(base.elemental_defense_rate ?? 0);
    expect(wiser.defense_rate).toBe(base.defense_rate);
    expect(stronger.elemental_defense_rate).toBe(base.elemental_defense_rate);
    expect(stronger.defense_rate).toBeGreaterThan(base.defense_rate ?? 0);
  });

  it("풀이(explainSecondary)의 값은 computeSecondary와 늘 같다 — 무작위 1차 스탯·장비·버프 2,000번", () => {
    const rng = createRng(181);
    const pick = (max: number) => rng.nextInt(max);
    for (let round = 0; round < 2000; round++) {
      const primaries: Primaries = {
        str: pick(300),
        dex: pick(300),
        agi: pick(300),
        vit: pick(300),
        int: pick(300),
        wis: pick(300),
      };
      const gear: Record<string, number> = { hp: pick(40) - 10, hit: pick(30) - 10, evade: pick(5) };
      const buffs: Record<string, number> = { hp: pick(20), evade: pick(20) };
      const values = computeSecondary(primaries, TEST_STAT_TABLE, gear, buffs);
      for (const row of explainSecondary(primaries, TEST_STAT_TABLE, gear, buffs)) {
        expect(row.value).toBe(values[row.id]);
      }
    }
  });

  it("풀이: 가중치 0인 칸은 빼고, 곱·내림·장비·확률 상한·반감을 그대로 보낸다", () => {
    const rows = explainSecondary(flat, TEST_STAT_TABLE, { hp: 3, evade: 4 }, { hp: 2, evade: 9 });
    const hp = rows.find((row) => row.id === "hp");
    const evade = rows.find((row) => row.id === "evade");
    if (!hp || !evade) throw new Error("fixture");
    // HP 가중치 [1500, 1000, 1500, 3000, 1000, 1200] × 10 → Σ 92,000 → 92, 장비 3 + 버프 2
    expect(hp.terms.map((term) => term.milli)).toEqual([15_000, 10_000, 15_000, 30_000, 10_000, 12_000]);
    expect(hp).toMatchObject({
      shape: "quantity",
      base: 0,
      weighted: 92,
      extra: 5,
      score: 97,
      cap: null,
      value: 97,
    });
    // 회피는 AGI 칸 하나(1000‰), 확률 모양은 버프를 넣지 않는다(48 §3.1)
    expect(evade.terms).toEqual([{ index: 2, value: 10, weightPm: 1000, milli: 10_000 }]);
    expect(evade).toMatchObject({ base: 0, weighted: 10, extra: 4, score: 14, cap: 850, halfConstant: 250 });
    expect(evade.value).toBe(Math.floor((850 * 14) / (14 + 250)));
  });
});
