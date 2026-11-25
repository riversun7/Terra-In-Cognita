import { describe, expect, it } from "vitest";
import {
  CREATURE_GRADE_STAT_BUDGET,
  CREATURE_PRIMARY_CODES,
  allocateCreatureStats,
  creatureDefaultSpread,
  canMoveCreatureClass,
  creatureClassPath,
  creatureClassSubtree,
  creatureMainElement,
  creatureStatShares,
  creatureSumTier,
  flattenCreatureClasses,
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

  it("6스탯 분포 몫은 합 1000‰, 가장 큰 스탯을 알려 준다(공식 화면 차례 STR·VIT·INT·WIS·DEX·AGI)", () => {
    expect(CREATURE_PRIMARY_CODES).toEqual(["str", "vit", "int", "wis", "dex", "agi"]);
    const shares = creatureStatShares({ str: 9, vit: 3, dex: 3, agi: 8, int: 3, wis: 3 });
    expect(Object.values(shares.sharePm).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(shares.sharePm.str).toBe(310);
    expect(shares.top).toBe("str");
    expect(creatureStatShares({ str: 5, vit: 5, dex: 5, agi: 9, int: 9, wis: 5 }).top).toBe("int");
  });

  it("스탯 합 단계: 등급 기준 예산으로 나눈다(36·48·62·72·78)", () => {
    expect([10, 36, 37, 48, 62, 63, 72, 78, 79, 100].map(creatureSumTier)).toEqual([
      0, 0, 1, 1, 2, 3, 3, 4, 5, 5,
    ]);
  });

  it("주속성: 가장 큰 칸, 강화형(홀수 칸)은 2배로 센다(D-5015)", () => {
    expect(creatureMainElement([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
    // 불 6 · 폭렬 1 · 바람 3 → 불
    expect(creatureMainElement([0, 0, 6, 1, 3, 0, 0, 0, 0, 0, 0, 0])).toBe(2);
    // 물 3 · 빙결 2 → 빙결 4 → 빙결
    expect(creatureMainElement([3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(1);
  });

  it("분류 트리: 길·아래 분류·옮길 수 있는지(대·중·소 셋까지)·트리 차례", () => {
    const classes = [
      { id: "beast" },
      { id: "humanoid" },
      { id: "fox", parent: "beast" },
      { id: "arctic_fox", parent: "fox" },
      { id: "wolf_kin", parent: "beast" },
    ];
    expect(creatureClassPath(classes, "arctic_fox").map((c) => c.id)).toEqual(["beast", "fox", "arctic_fox"]);
    expect(creatureClassPath(classes, "nope")).toEqual([]);
    expect([...creatureClassSubtree(classes, "beast")].toSorted()).toEqual([
      "arctic_fox",
      "beast",
      "fox",
      "wolf_kin",
    ]);
    expect(flattenCreatureClasses(classes).map((row) => `${row.depth}:${row.entry.id}`)).toEqual([
      "1:beast",
      "2:fox",
      "3:arctic_fox",
      "2:wolf_kin",
      "1:humanoid",
    ]);
    // 여우류(아래 한 단계)를 다른 대분류 아래로: 됨. 중분류 아래로: 깊이 넷이라 안 됨. 자기 아래로: 안 됨
    expect(canMoveCreatureClass(classes, "fox", "humanoid")).toBe(true);
    expect(canMoveCreatureClass(classes, "fox", "wolf_kin")).toBe(false);
    expect(canMoveCreatureClass(classes, "fox", "arctic_fox")).toBe(false);
    expect(canMoveCreatureClass(classes, "fox", undefined)).toBe(true);
    expect(canMoveCreatureClass(classes, "arctic_fox", "wolf_kin")).toBe(true);
    expect(canMoveCreatureClass(classes, "beast", "humanoid")).toBe(false);
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
