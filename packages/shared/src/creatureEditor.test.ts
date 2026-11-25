import { describe, expect, it } from "vitest";
import {
  CREATURE_GRADE_STAT_BUDGET,
  CREATURE_PRIMARY_CODES,
  allocateCreatureStats,
  creatureDefaultSpread,
  creatureStatProfile,
  creatureStatRange,
  creatureStatSumRange,
  groupCreatures,
  resolveCreatureModelUrl,
  rollCreatureStatDistribution,
  resolveCreatureImageUrl,
  simulateCreatureLoot,
  simulateCreatureWeaponRoll,
  summarizeCreatureStatDistribution,
} from "./creatureEditor.ts";

describe("creatureEditor helpers", () => {
  it("resolves creature image paths across extensions and URLs", () => {
    expect(resolveCreatureImageUrl(undefined)).toBeNull();
    expect(resolveCreatureImageUrl("")).toBeNull();
    expect(resolveCreatureImageUrl("mon_goblin.webp")).toBe("/creatures/mon_goblin.webp");
    expect(resolveCreatureImageUrl("/creatures/mon_dragon.png")).toBe("/creatures/mon_dragon.png");
    expect(resolveCreatureImageUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
  });

  it("allocates 6 primary stats deterministically matching budget, tendency, and size", () => {
    const stats = allocateCreatureStats({
      grade: "rare",
      size: "L",
      tendency: "tendency_attack",
      primaryStat: "str",
      secondaryStat: "vit",
    });
    const sum = CREATURE_PRIMARY_CODES.reduce((acc, k) => acc + stats[k], 0);
    expect(sum).toBe(CREATURE_GRADE_STAT_BUDGET.rare);
    expect(stats.str).toBeGreaterThan(stats.int);
    expect(stats.vit).toBeGreaterThan(stats.wis);
  });

  it("summarizes 6-stat distribution across a creature group", () => {
    const summary = summarizeCreatureStatDistribution([
      {
        primaries: { str: 10, vit: 12, int: 6, wis: 6, dex: 10, agi: 14 },
      },
      {
        primaries: { str: 20, vit: 18, int: 8, wis: 8, dex: 14, agi: 16 },
      },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.stats.str).toEqual({ min: 10, avg: 15, max: 20 });
    expect(summary.stats.vit).toEqual({ min: 12, avg: 15, max: 18 });
  });

  it("simulates item-style natural weapon roll within configured min~max bounds", () => {
    const weapon = {
      name: { ko: "철 발톱", en: "Iron Claw" },
      appropriate: "str" as const,
      physical: { attack: 30, min: 25, max: 40 },
      elemental: { attack: 15, min: 10, max: 20 },
      intervalMs: 1200,
      range: 1,
      stats: [{ stat: "crit_chance_pm", min: 20, max: 60 }],
    };
    const roll = simulateCreatureWeaponRoll(weapon, 777);
    expect(roll.physicalAttack).toBeGreaterThanOrEqual(25);
    expect(roll.physicalAttack).toBeLessThanOrEqual(40);
    expect(roll.elementalAttack).toBeGreaterThanOrEqual(10);
    expect(roll.elementalAttack).toBeLessThanOrEqual(20);
    expect(roll.stats[0]?.value).toBeGreaterThanOrEqual(20);
    expect(roll.stats[0]?.value).toBeLessThanOrEqual(60);
  });

  it("simulates Monte Carlo loot drops deterministically", () => {
    const drops = [
      { item: "mat_hide", chancePm: 1000, min: 2, max: 2 },
      { item: "mat_fang", chancePm: 500, min: 1, max: 3 },
    ];
    const rows = simulateCreatureLoot(drops, 100, 42);
    expect(rows[0]).toEqual({ item: "mat_hide", totalQty: 200, avgPerKill: 2 });
    expect(rows[1]?.totalQty).toBeGreaterThan(40);
    expect(rows[1]?.totalQty).toBeLessThan(260);
  });

  it("스탯 오차 기본값: 10 이하 ±1, 20 이하 ±2, 그 위 ±3 — 적어 둔 오차가 있으면 그 값", () => {
    expect([1, 10, 11, 20, 21, 60].map(creatureDefaultSpread)).toEqual([1, 1, 2, 2, 3, 3]);
    const primaries = { str: 1, dex: 10, agi: 15, vit: 20, int: 25, wis: 30 };
    expect(creatureStatRange({ primaries }, "str")).toEqual({ min: 1, max: 2, spread: 1 });
    expect(creatureStatRange({ primaries }, "agi")).toEqual({ min: 13, max: 17, spread: 2 });
    expect(creatureStatRange({ primaries }, "wis")).toEqual({ min: 27, max: 33, spread: 3 });
    const custom = { primaries, primarySpread: { str: 0, dex: 3, agi: 0, vit: 5, int: 1, wis: 2 } };
    expect(creatureStatRange(custom, "dex")).toEqual({ min: 7, max: 13, spread: 3 });
    expect(creatureStatRange(custom, "agi")).toEqual({ min: 15, max: 15, spread: 0 });
    expect(creatureStatSumRange({ primaries })).toEqual({ min: 90, base: 101, max: 113 });
  });

  it("스탯 성향: 묶음 몫이 40% 이상이면 그 성향, 아니면 균형", () => {
    expect(creatureStatProfile({ str: 20, vit: 18, dex: 6, agi: 6, int: 4, wis: 4 }).lean).toBe("physical");
    expect(creatureStatProfile({ str: 4, vit: 6, dex: 6, agi: 6, int: 20, wis: 16 }).lean).toBe("magic");
    expect(creatureStatProfile({ str: 6, vit: 5, dex: 14, agi: 18, int: 4, wis: 4 }).lean).toBe("finesse");
    const even = creatureStatProfile({ str: 10, vit: 10, dex: 10, agi: 10, int: 10, wis: 10 });
    expect(even.lean).toBe("balanced");
    expect(even.sharePm.physical + even.sharePm.finesse + even.sharePm.magic).toBe(1000);
    expect(creatureStatProfile({ str: 9, vit: 3, dex: 3, agi: 8, int: 3, wis: 3 }).top).toEqual([
      "str",
      "agi",
    ]);
  });

  it("랜덤 분포 뽑기: 합 = 총합, 고정한 스탯은 그대로, 같은 시드면 같은 분포", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rolled = rollCreatureStatDistribution({
        budget: 48,
        size: "L",
        tendency: "tendency_magic",
        focus: ["int"],
        locked: { vit: 12 },
        seed,
      });
      const sum = CREATURE_PRIMARY_CODES.reduce((acc, code) => acc + rolled[code], 0);
      expect(sum).toBe(48);
      expect(rolled.vit).toBe(12);
      for (const code of CREATURE_PRIMARY_CODES) expect(rolled[code]).toBeGreaterThanOrEqual(1);
    }
    const a = rollCreatureStatDistribution({ budget: 36, size: "M", seed: 7 });
    const b = rollCreatureStatDistribution({ budget: 36, size: "M", seed: 7 });
    const c = rollCreatureStatDistribution({ budget: 36, size: "M", seed: 8 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // 고정 값이 총합을 넘으면 나머지는 1씩
    const over = rollCreatureStatDistribution({ budget: 10, size: "M", locked: { str: 30 }, seed: 1 });
    expect(over).toEqual({ str: 30, dex: 1, agi: 1, vit: 1, int: 1, wis: 1 });
  });

  it("그룹 묶기: 변종은 대표 아래로, 대표가 목록에 없으면 root = null", () => {
    const rows = [
      { id: "slime" },
      { id: "wolf" },
      { id: "metal_slime", variantOf: "slime" },
      { id: "fire_drake", variantOf: "drake" },
    ];
    const groups = groupCreatures(rows, (row) => row);
    expect(groups.map((g) => [g.rootId, g.root?.id ?? null, g.variants.map((v) => v.id)])).toEqual([
      ["slime", "slime", ["metal_slime"]],
      ["wolf", "wolf", []],
      ["drake", null, ["fire_drake"]],
    ]);
  });

  it("모델 경로: 파일 이름은 /creatures/models/ 아래, 경로·URL은 그대로", () => {
    expect(resolveCreatureModelUrl(undefined)).toBeNull();
    expect(resolveCreatureModelUrl("wolf.glb")).toBe("/creatures/models/wolf.glb");
    expect(resolveCreatureModelUrl("/models/wolf.glb")).toBe("/models/wolf.glb");
  });
});
