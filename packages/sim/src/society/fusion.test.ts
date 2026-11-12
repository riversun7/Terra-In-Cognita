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
    // 휴먼 STR 4 DEX 8 AGI 12 VIT 16 INT 20 WIS 24, 안드로이드 모두 10
    const human = [4, 8, 12, 16, 20, 24];
    const donor = [10, 10, 10, 10, 10, 10];
    // 옛 식: STR ⌊7 + 1.2⌋ = 8, DEX ⌊7 + 2.4⌋ = 9, AGI ⌊7 + 3.6⌋ = 10, VIT ⌊11.2 + 3⌋ = 14, INT ⌊14 + 3⌋ = 17, WIS ⌊16.8 + 3⌋ = 19
    expect(fuseStats(human, donor, 1000, C)).toEqual([8, 9, 10, 14, 17, 19]);
  });

  it("보너스 배율은 칸마다 곱해 반올림한다(옛 Math.round): ×1.05·×1.15", () => {
    const human = [4, 8, 12, 16, 20, 24];
    const donor = [10, 10, 10, 10, 10, 10];
    // ×1.05: 8.4 → 8, 9.45 → 9, 10.5 → 11, 14.7 → 15, 17.85 → 18, 19.95 → 20
    expect(fuseStats(human, donor, 1050, C)).toEqual([8, 9, 11, 15, 18, 20]);
    // ×1.15: 9.2 → 9, 10.35 → 10, 11.5 → 12, 16.1 → 16, 19.55 → 20, 21.85 → 22
    expect(fuseStats(human, donor, 1150, C)).toEqual([9, 10, 12, 16, 20, 22]);
    expect(fuseStatRange(human, donor, C)).toEqual({
      min: [8, 9, 11, 15, 18, 20],
      max: [9, 10, 12, 16, 20, 22],
    });
  });

  it("합이 절대 상한 100을 넘으면 칸 비례로 줄인다(D-534)", () => {
    // 섞은 값 [17, 20, 23, 34, 41, 48](합 183) → 합 100
    const fused = fuseStats([10, 20, 30, 40, 50, 60], [20, 20, 20, 20, 20, 20], 1000, C);
    expect(fused).toEqual([9, 11, 13, 19, 22, 26]);
    expect(fused.reduce((a, b) => a + b, 0)).toBe(100);
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
