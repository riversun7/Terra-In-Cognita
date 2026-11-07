// 사이보그 유닛 융합·유전자 아이템 규칙 시험(society/fusion.ts, docs/adr/2026-11-07-cyborg-fusion-genes.md) — 옛 craftCyborg 값
import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  OLD_FUSION_COEFFICIENTS as C,
  type GeneItem,
  fuseStatRange,
  fuseStats,
  fusionBonusPm,
  geneItemOf,
  partsDonorStats,
  sixStats,
  upkeepWeightPm,
} from "./fusion.ts";

describe("융합 스탯(옛 craftCyborg)", () => {
  it("STR·DEX·AGI = ⌊부품 0.7 + 휴먼 0.3⌋, VIT·INT·WIS = ⌊휴먼 0.7 + 부품 0.3⌋, 보너스 1000‰이면 섞은 값 그대로", () => {
    // 휴먼 STR 10 DEX 20 AGI 30 VIT 40 INT 50 WIS 60, 안드로이드 모두 20
    const human = [10, 20, 30, 40, 50, 60];
    const donor = [20, 20, 20, 20, 20, 20];
    // 옛 식: STR ⌊20×0.7 + 10×0.3⌋ = 17, DEX 20, AGI ⌊14 + 9⌋ = 23, VIT ⌊28 + 6⌋ = 34, INT ⌊35 + 6⌋ = 41, WIS ⌊42 + 6⌋ = 48
    expect(fuseStats(human, donor, 1000, C)).toEqual([17, 20, 23, 34, 41, 48]);
  });

  it("보너스 배율은 칸마다 곱해 반올림한다(옛 Math.round): ×1.05·×1.15", () => {
    const human = [10, 20, 30, 40, 50, 60];
    const donor = [20, 20, 20, 20, 20, 20];
    // 17 × 1.05 = 17.85 → 18, 20 × 1.05 = 21, 23 × 1.05 = 24.15 → 24, 34 × 1.05 = 35.7 → 36, 41 × 1.05 = 43.05 → 43, 48 × 1.05 = 50.4 → 50
    expect(fuseStats(human, donor, 1050, C)).toEqual([18, 21, 24, 36, 43, 50]);
    // ×1.15: 19.55 → 20, 23, 26.45 → 26, 39.1 → 39, 47.15 → 47, 55.2 → 55
    expect(fuseStats(human, donor, 1150, C)).toEqual([20, 23, 26, 39, 47, 55]);
    expect(fuseStatRange(human, donor, C)).toEqual({
      min: [18, 21, 24, 36, 43, 50],
      max: [20, 23, 26, 39, 47, 55],
    });
  });

  it("몫 설정 칸을 바꾸면 따른다(몸 쪽 부품 1000‰ = 부품 값, 마음 쪽 휴먼 0‰ = 부품 값)", () => {
    const rules = { ...C, physicalDonorPm: 1000, mentalHumanPm: 0 };
    expect(fuseStats([1, 2, 3, 4, 5, 6], [9, 9, 9, 9, 9, 9], 1000, rules)).toEqual([9, 9, 9, 9, 9, 9]);
  });

  it("부품 쪽 스탯(안드로이드 대신)은 칸마다 partsStat, 모자란 칸·음수는 0", () => {
    expect(partsDonorStats(C)).toEqual([10, 10, 10, 10, 10, 10]);
    expect(sixStats([5, -1, 2.5])).toEqual([5, 0, 0, 0, 0, 0]);
  });

  it("보너스 굴림은 [최소, 최대] 안이고 같은 시드면 같다, 범위가 없으면 최소", () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      const value = fusionBonusPm(createRng(seed), C);
      expect(value).toBeGreaterThanOrEqual(1050);
      expect(value).toBeLessThanOrEqual(1150);
      seen.add(value);
    }
    expect(seen.size).toBeGreaterThan(50);
    expect(fusionBonusPm(createRng(7), C)).toBe(fusionBonusPm(createRng(7), C));
    expect(fusionBonusPm(createRng(7), { ...C, bonusMaxPm: 900 })).toBe(1050);
  });
});

describe("유전자 아이템·유지비", () => {
  const genes: GeneItem[] = [
    { item: "gene_stat_human", kind: "stat", species: "human", drops: ["death"] },
    { item: "gene_skill_human", kind: "skill", species: "human", drops: ["death"] },
    { item: "gene_skill_creature", kind: "skill", species: "creature", drops: [] },
    { item: "gene_stat_creature", kind: "stat", species: "creature", drops: ["death"] },
  ];

  it("그 종·종류의 유전자 아이템, 얻는 길을 주면 그 길이 있는 것만", () => {
    expect(geneItemOf(genes, "human", "stat", "death")).toBe("gene_stat_human");
    expect(geneItemOf(genes, "human", "skill", "death")).toBe("gene_skill_human");
    expect(geneItemOf(genes, "creature", "skill", "death")).toBeUndefined();
    expect(geneItemOf(genes, "creature", "skill")).toBe("gene_skill_creature");
    expect(geneItemOf(genes, "android", "stat")).toBeUndefined();
  });

  it("유지비 무게: 보통 유닛 1000‰, 사이보그 유닛 upkeepPm(출발값 3000‰)", () => {
    expect(upkeepWeightPm(2, 0, C)).toBe(2000);
    expect(upkeepWeightPm(2, 1, C)).toBe(5000);
  });
});
