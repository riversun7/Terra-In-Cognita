import { describe, expect, it } from "vitest";
import {
  CREATURE_GRADE_STAT_BUDGET,
  CREATURE_PRIMARY_CODES,
  allocateCreatureStats,
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
});
