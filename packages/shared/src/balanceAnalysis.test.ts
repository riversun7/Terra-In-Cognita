// 밸런스 분석 순수 계산 시험 — 점수 나누기·옮기기(총합 보존·결정성), 윌슨 구간, 상성 요약(고리·우세), 비용·입력 검사
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_BUILD_PRESETS,
  ANALYSIS_LIMITS,
  type AnalysisMatrixCell,
  type AnalysisStartInput,
  analysisCost,
  analysisProblem,
  distributePoints,
  matrixScore,
  plusPoints,
  rpsSummary,
  shiftPoints,
  verdictOf,
  wilsonInterval,
} from "./balanceAnalysis.ts";
import { newLabUnit } from "./battleLab.ts";
import { PRIMARY_STATS } from "./roster.ts";

const total = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);

describe("distributePoints", () => {
  it("합은 늘 sum, 몫이 같으면 고르게(남는 점은 화면 차례 앞부터)", () => {
    expect(distributePoints({ str: 1, vit: 1, int: 1, wis: 1, dex: 1, agi: 1 }, 60)).toEqual({
      str: 10,
      vit: 10,
      int: 10,
      wis: 10,
      dex: 10,
      agi: 10,
    });
    expect(distributePoints({ str: 1, vit: 1, int: 1, wis: 1, dex: 1, agi: 1 }, 62)).toEqual({
      str: 11,
      vit: 11,
      int: 10,
      wis: 10,
      dex: 10,
      agi: 10,
    });
  });

  it("모든 출발 분포·여러 합에서 합 보존, 몫 0인 칸은 0", () => {
    for (const preset of ANALYSIS_BUILD_PRESETS)
      for (const sum of [6, 60, 61, 120, 299, 300, 6000]) {
        const out = distributePoints(preset.weights, sum);
        expect(total(out)).toBe(sum);
        for (const stat of PRIMARY_STATS) if (preset.weights[stat] === 0) expect(out[stat]).toBe(0);
      }
  });

  it("몫이 모두 0이면 고르게", () => {
    expect(total(distributePoints({ str: 0, vit: 0, int: 0, wis: 0, dex: 0, agi: 0 }, 13))).toBe(13);
  });
});

describe("shiftPoints·plusPoints", () => {
  const base = { str: 20, vit: 10, int: 0, wis: 10, dex: 15, agi: 5 };

  it("옮겨도 총합은 같고 받은 칸만 k만큼 오르며 0 아래가 없다", () => {
    for (const stat of PRIMARY_STATS)
      for (const k of [-20, -5, 1, 7, 10, 20, 40]) {
        const out = shiftPoints(base, stat, k);
        if (out === null) continue;
        expect(total(out)).toBe(total(base));
        expect(out[stat]).toBe(base[stat] + k);
        for (const entry of PRIMARY_STATS) expect(out[entry]).toBeGreaterThanOrEqual(0);
      }
  });

  it("빼 올 점이 모자라거나 내줄 점이 모자라면 null", () => {
    expect(shiftPoints(base, "str", 41)).toBeNull();
    expect(shiftPoints(base, "int", -1)).toBeNull();
    expect(shiftPoints(base, "str", 40)).toEqual({ str: 60, vit: 0, int: 0, wis: 0, dex: 0, agi: 0 });
  });

  it("빼 오는 몫은 지금 값 몫대로(0인 칸에서는 빼지 않는다)", () => {
    const out = shiftPoints(base, "agi", 10);
    expect(out?.int).toBe(0);
    expect(out).toEqual({ str: 17, vit: 8, int: 0, wis: 8, dex: 12, agi: 15 });
  });

  it("같은 입력이면 같은 결과(결정적)", () => {
    expect(shiftPoints(base, "wis", -7)).toEqual(shiftPoints(base, "wis", -7));
  });

  it("plusPoints는 그 칸만 바꾸고 음수면 null", () => {
    expect(plusPoints(base, "int", 10)).toEqual({ ...base, int: 10 });
    expect(plusPoints(base, "agi", -6)).toBeNull();
  });
});

describe("wilsonInterval·verdictOf", () => {
  it("반반 100판이면 약 ±98‰, 판이 많을수록 좁다", () => {
    expect(wilsonInterval(500, 100)).toEqual({ lowPm: 404, highPm: 596 });
    const wide = wilsonInterval(500, 10);
    const narrow = wilsonInterval(500, 400);
    expect(wide.highPm - wide.lowPm).toBeGreaterThan(narrow.highPm - narrow.lowPm);
  });

  it("끝값(0·1000)에서도 0~1000 안, n = 0이면 전 구간", () => {
    expect(wilsonInterval(1000, 20).highPm).toBe(1000);
    expect(wilsonInterval(0, 20).lowPm).toBe(0);
    expect(wilsonInterval(700, 0)).toEqual({ lowPm: 0, highPm: 1000 });
  });

  it("구간이 500을 넘으면 판정", () => {
    expect(verdictOf(800, 40)).toBe(1);
    expect(verdictOf(200, 40)).toBe(-1);
    expect(verdictOf(550, 10)).toBe(0);
  });
});

const cell = (i: number, j: number, scorePm: number, runs = 100): AnalysisMatrixCell => ({
  i,
  j,
  runs,
  scorePm,
  wins: 0,
  losses: 0,
  timeoutWins: 0,
  timeoutLosses: 0,
  even: 0,
  avgMs: 0,
  medianMs: 0,
  dpsA: 0,
  dpsB: 0,
  survivalA: 0,
  survivalB: 0,
});

describe("matrixScore·rpsSummary", () => {
  it("뒤집힌 짝은 1000 − 점수, 같은 분포는 500", () => {
    const cells = [cell(0, 1, 700)];
    expect(matrixScore(cells, 0, 1)).toBe(700);
    expect(matrixScore(cells, 1, 0)).toBe(300);
    expect(matrixScore(cells, 1, 1)).toBe(500);
    expect(matrixScore(cells, 0, 2)).toBeNull();
  });

  it("가위바위보 고리 하나를 찾고 우세·열세는 없다", () => {
    // 0 > 1, 1 > 2, 2 > 0
    const cells = [cell(0, 1, 800), cell(1, 2, 800), cell(0, 2, 200)];
    const summary = rpsSummary(3, cells);
    expect(summary.cycles).toEqual([[0, 1, 2]]);
    expect(summary.dominant).toEqual([]);
    expect(summary.dominated).toEqual([]);
    expect(summary.builds.map((entry) => entry.meanPm)).toEqual([500, 500, 500]);
  });

  it("모두를 이긴 분포는 우세, 모두에게 진 분포는 열세, 순위는 승률 평균", () => {
    const cells = [cell(0, 1, 900), cell(0, 2, 850), cell(1, 2, 600, 10)];
    const summary = rpsSummary(3, cells);
    expect(summary.dominant).toEqual([0]);
    expect(summary.dominated).toEqual([]);
    expect(summary.ranking).toEqual([0, 1, 2]);
    expect(summary.builds[0]?.best).toBe(1);
    expect(summary.builds[2]?.worst).toBe(0);
    expect(summary.cycles).toEqual([]);
  });

  it("판 수가 적어 가릴 수 없는 고리는 세지 않는다", () => {
    const cells = [cell(0, 1, 600, 10), cell(1, 2, 600, 10), cell(0, 2, 400, 10)];
    expect(rpsSummary(3, cells).cycles).toEqual([]);
  });
});

const conditions = {
  template: newLabUnit("cyborg"),
  level: 1,
  mode: "sum" as const,
  elements: "keep" as const,
  skills: true,
  gear: true,
  teamSize: 1,
  limitSec: 60,
};
const build = (id: string) => ({
  id,
  label: id,
  weights: ANALYSIS_BUILD_PRESETS[0]?.weights ?? conditions.template.initial,
  unit: null,
});

describe("analysisCost·analysisProblem", () => {
  const matrix: AnalysisStartInput = {
    kind: "matrix",
    conditions,
    builds: [build("a"), build("b"), build("c"), build("d")],
    sums: [60, 120],
    runs: 20,
    seed: 1,
  };

  it("분포 상성: 짝 수 × 합 수 × 판 수, 영향도: (6 × 단계 + 1) × 판 수", () => {
    expect(analysisCost(matrix)).toEqual({ battles: 6 * 2 * 20, battleSeconds: 6 * 2 * 20 * 60 });
    expect(
      analysisCost({
        kind: "sensitivity",
        conditions,
        weights: conditions.template.initial,
        sum: 60,
        mode: "shift",
        steps: [-10, 10],
        runs: 10,
        seed: 1,
      }),
    ).toEqual({ battles: 130, battleSeconds: 7800 });
  });

  it("홀수 판·같은 합·같은 분포 ID·예산 넘침을 막는다", () => {
    expect(analysisProblem(matrix)).toBeNull();
    expect(analysisProblem({ ...matrix, runs: 21 })).toBe("invalid_settings");
    expect(analysisProblem({ ...matrix, sums: [60, 60] })).toBe("invalid_settings");
    expect(analysisProblem({ ...matrix, builds: [build("a"), build("a")] })).toBe("invalid_settings");
    expect(
      analysisProblem({
        ...matrix,
        runs: 400,
        sums: [60, 120, 300, 600],
        conditions: { ...conditions, limitSec: 120 },
      }),
    ).toBe("budget");
    expect(ANALYSIS_LIMITS.budgetSeconds).toBeGreaterThan(0);
  });

  it("영향도: 판 수 0(2차 스탯만)은 받고, plus에 음수 단계·같은 단계는 막는다", () => {
    const base = {
      kind: "sensitivity" as const,
      conditions,
      weights: conditions.template.initial,
      sum: 60,
      mode: "plus" as const,
      steps: [5, 10],
      runs: 0,
      seed: 1,
    };
    expect(analysisProblem(base)).toBeNull();
    expect(analysisProblem({ ...base, steps: [-5] })).toBe("invalid_settings");
    expect(analysisProblem({ ...base, steps: [5, 5] })).toBe("invalid_settings");
    expect(analysisProblem({ ...base, runs: 3 })).toBe("invalid_settings");
  });
});
