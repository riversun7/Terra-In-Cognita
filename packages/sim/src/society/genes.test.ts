// 스탯 유전자 판정 시험(society/genes.ts, D-478·D-481·D-516, docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)")
import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { OLD_FUSION_COEFFICIENTS as C } from "./fusion.ts";
import {
  apportion,
  geneStatValues,
  incubateStats,
  mainStatIndex,
  statGeneOf,
  synthesizeStatGenes,
  twelveElements,
} from "./genes.ts";

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
/** 결과 확률만 바꾼 계수 */
const odds = (up: number, down: number, keep: number) => ({
  ...C,
  geneUpPm: up,
  geneDownPm: down,
  geneKeepPm: keep,
});

describe("나누기(가장 큰 나머지)", () => {
  it("합이 total이고 무게대로, 나머지는 큰 칸부터(같으면 앞 칸)", () => {
    expect(apportion([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(apportion([2, 1, 1], 1000)).toEqual([500, 250, 250]);
    expect(apportion([0, 0, 0], 5)).toEqual([2, 2, 1]);
    expect(sum(apportion([13, 7, 11, 2, 5, 9], 1000))).toBe(1000);
    expect(apportion([1, 2], 0)).toEqual([0, 0]);
  });
});

describe("수명이 다한 유닛 → 스탯 유전자(D-516)", () => {
  it("총합 = 1차 스탯 합, 분포 합 1000, 속성은 12칸 0~10", () => {
    const gene = statGeneOf([20, 10, 10, 10, 5, 5], [3, 0, 12, -1]);
    expect(gene.total).toBe(60);
    expect(gene.dist).toEqual([333, 167, 167, 167, 83, 83]);
    expect(sum(gene.dist)).toBe(1000);
    expect(gene.elements).toEqual([3, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(geneStatValues(gene)).toEqual([20, 10, 10, 10, 5, 5]);
    expect(mainStatIndex(gene)).toBe(0);
  });

  it("스탯이 모두 0이면 고른 분포, 속성이 없으면 0", () => {
    const gene = statGeneOf([0, 0, 0, 0, 0, 0], null);
    expect(gene.total).toBe(0);
    expect(sum(gene.dist)).toBe(1000);
    expect(gene.elements).toEqual(twelveElements(undefined));
  });
});

describe("유전자 합성(D-516: 확률로 오름·내림·그대로, 무한 증가 없음)", () => {
  const a = statGeneOf([20, 10, 10, 10, 10, 10], [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const b = statGeneOf([10, 10, 10, 10, 10, 20], [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  it("오름만이면 바탕(평균) + 걸음, 내림만이면 − 걸음, 셋 다 0이면 그대로", () => {
    const up = synthesizeStatGenes(a, b, createRng(1), odds(1000, 0, 0));
    expect(up.outcome).toBe("up");
    expect(up.gene.total).toBe(70 + 3);
    expect(up.step).toBe(3);
    const down = synthesizeStatGenes(a, b, createRng(1), odds(0, 1, 0));
    expect(down.outcome).toBe("down");
    expect(down.gene.total).toBe(67);
    const keep = synthesizeStatGenes(a, b, createRng(1), odds(0, 0, 0));
    expect(keep.outcome).toBe("keep");
    expect(keep.gene.total).toBe(70);
  });

  it("상한을 넘지 않는다, 걸음은 1 이상", () => {
    const capped = synthesizeStatGenes(a, b, createRng(1), { ...odds(1, 0, 0), geneTotalMax: 71 });
    expect(capped.gene.total).toBe(71);
    const tiny = statGeneOf([1, 0, 0, 0, 0, 0], null);
    expect(synthesizeStatGenes(tiny, tiny, createRng(1), odds(1, 0, 0)).gene.total).toBe(2);
  });

  it("분포는 평균을 다시 1000으로, 속성은 평균 ± 오차(0~10), 같은 시드면 같다", () => {
    const flat = synthesizeStatGenes(a, b, createRng(9), { ...C, geneElementVariance: 0 });
    expect(sum(flat.gene.dist)).toBe(1000);
    expect(flat.gene.dist[0]).toBe(Math.round(((a.dist[0] ?? 0) + (b.dist[0] ?? 0)) / 2));
    expect(flat.gene.elements.slice(0, 2)).toEqual([5, 2]);
    const noisy = synthesizeStatGenes(a, b, createRng(9), { ...C, geneElementVariance: 3 });
    for (const value of noisy.gene.elements) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
    }
    expect(noisy).toEqual(synthesizeStatGenes(a, b, createRng(9), { ...C, geneElementVariance: 3 }));
  });

  it("출발값(오름·내림 같은 확률)으로 오래 합성해도 총합은 상한 안에 머문다", () => {
    let gene = a;
    const rng = createRng(123);
    for (let i = 0; i < 2000; i++) gene = synthesizeStatGenes(gene, gene, rng, C).gene;
    expect(gene.total).toBeGreaterThanOrEqual(0);
    expect(gene.total).toBeLessThanOrEqual(C.geneTotalMax);
  });
});

describe("인큐베이터 적용(D-516: 총합 또는 주력 스탯)", () => {
  const gene = statGeneOf([30, 12, 12, 12, 12, 12], null);

  it("총합 = 유전자 총합을 고르게, 바탕보다 작으면 바탕", () => {
    expect(incubateStats(gene, "total", C)).toEqual([15, 15, 15, 15, 15, 15]);
    expect(incubateStats(statGeneOf([1, 1, 1, 1, 1, 1], null), "total", C)).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it("주력 = 바탕 + 분포가 가장 큰 칸만 유전자 값", () => {
    expect(incubateStats(gene, "main", C)).toEqual([30, 10, 10, 10, 10, 10]);
    expect(incubateStats(statGeneOf([2, 3, 1, 1, 1, 1], null), "main", C)).toEqual([10, 10, 10, 10, 10, 10]);
  });
});
