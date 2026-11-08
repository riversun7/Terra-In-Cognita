// 밸런스 분석 화면 순수 코드 시험 — 서버 입력 만들기(틀·무기·합 차례), 열지도 칸·색 단계, 순위 막대·곡선·2차 변화, CSV, 입력 글, 저장 모양
import type {
  AnalysisDuelStats,
  AnalysisMatrixResult,
  AnalysisSensitivityResult,
  AnalysisUnitSummary,
} from "@terra/shared/balanceAnalysis";
import { type LabPresetView, newLabUnit } from "@terra/shared/battleLab";
import { describe, expect, it } from "vitest";
import {
  curves,
  defaultMatrixForm,
  heatGrid,
  heatOf,
  isMatrixForm,
  matrixCsv,
  matrixInputOf,
  parseSteps,
  rankedBars,
  secondaryEffects,
  sensitivityCsv,
  weightShares,
} from "./analysisModel.ts";

const sample: LabPresetView = {
  id: "sample_new_cyborg",
  name: { ko: "새 사이보그", en: "New cyborg" },
  source: "sample",
  version: 0,
  updatedBy: null,
  updatedAtMs: null,
  kind: "unit",
  data: { ...newLabUnit("cyborg"), weapon: { kind: "item", id: "test_sword", pm: 0 } },
};

const duel = (scorePm: number, runs = 100): AnalysisDuelStats => ({
  runs,
  wins: 0,
  losses: 0,
  timeoutWins: 0,
  timeoutLosses: 0,
  even: 0,
  scorePm,
  avgMs: 10_000,
  medianMs: 9000,
  dpsA: 5,
  dpsB: 4,
  survivalA: 500,
  survivalB: 400,
});

const unit = (dpsIndex: number, ehp: number): AnalysisUnitSummary => ({
  primaries: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
  maxHp: ehp,
  armorHp: 0,
  shieldHp: 0,
  realAttack: dpsIndex,
  hitPm: 900,
  critPm: 50,
  critMulPm: 1500,
  attackIntervalMs: 1000,
  evadePm: 0,
  defenseRatePm: 0,
  ehp,
  dpsIndex,
});

describe("서버 입력", () => {
  it("틀 ID를 풀고 무기 고르기를 얹으며 합은 오름차순, 분포 틀이 없으면 null", () => {
    const form = defaultMatrixForm((id) => id);
    const input = matrixInputOf(
      { ...form, sums: [300, 60], conditions: { ...form.conditions, weapon: "natural" } },
      [sample],
      null,
    );
    expect(input.sums).toEqual([60, 300]);
    expect(input.conditions.template.weapon).toEqual({ kind: "natural" });
    expect(input.builds.every((build) => build.unit === null)).toBe(true);
    // 모르는 틀은 새 사이보그
    const fallback = matrixInputOf(
      { ...form, conditions: { ...form.conditions, templateId: "nope" } },
      [],
      null,
    );
    expect(fallback.conditions.template.kind).toBe("cyborg");
  });

  it("몫 비율(합 0이면 고르게)", () => {
    expect(weightShares({ str: 1, vit: 1, int: 0, wis: 0, dex: 2, agi: 0 }).dex).toBe(500);
    expect(Math.round(weightShares({ str: 0, vit: 0, int: 0, wis: 0, dex: 0, agi: 0 }).str)).toBe(167);
  });
});

const matrix: AnalysisMatrixResult = {
  kind: "matrix",
  revision: 1,
  seed: 3,
  runs: 100,
  builds: [
    { id: "a", label: 'A, "quoted"' },
    { id: "b", label: "B" },
  ],
  tables: [
    {
      sum: 120,
      initial: [],
      units: [],
      cells: [{ ...duel(700), i: 0, j: 1 }],
    },
  ],
  dropped: [],
};

describe("열지도", () => {
  it("뒤집힌 칸은 1000 − 점수, 같은 분포는 판 0, 구간이 있다", () => {
    const table = matrix.tables[0];
    if (!table) throw new Error("table");
    const grid = heatGrid(table, 2);
    expect(grid[0]?.[1]?.score).toBe(700);
    expect(grid[1]?.[0]?.score).toBe(300);
    expect(grid[0]?.[0]?.runs).toBe(0);
    expect(grid[0]?.[1]?.lowPm).toBeLessThan(700);
  });

  it("색 단계: 반반 0, 끝 5, 쪽", () => {
    expect(heatOf(500)).toEqual({ side: "even", level: 0 });
    expect(heatOf(1000)).toEqual({ side: "win", level: 5 });
    expect(heatOf(0)).toEqual({ side: "loss", level: 5 });
    expect(heatOf(560)).toEqual({ side: "win", level: 1 });
    expect(heatOf(null).level).toBe(0);
  });

  it("CSV: 머리 + 짝마다 한 줄, 쉼표·따옴표는 감싼다", () => {
    const csv = matrixCsv(matrix).trim().split("\n");
    expect(csv).toHaveLength(2);
    expect(csv[0]?.startsWith("sum,build,opponent,runs,score_pm")).toBe(true);
    expect(csv[1]).toContain('"A, ""quoted"""');
    expect(csv[1]?.split(",").at(-1)).toBe("3");
  });
});

const sensitivity: AnalysisSensitivityResult = {
  kind: "sensitivity",
  revision: 1,
  seed: 1,
  runs: 100,
  mode: "shift",
  sum: 60,
  steps: [-10, 10],
  rows: ["hp", "evade"],
  base: { initial: unit(10, 100).primaries, unit: unit(10, 100), secondary: [100, 0] },
  control: duel(510),
  points: [
    {
      stat: "str",
      step: 10,
      initial: unit(1, 1).primaries,
      unit: unit(15, 100),
      secondary: [100, 0],
      duel: duel(650),
    },
    {
      stat: "vit",
      step: 10,
      initial: unit(1, 1).primaries,
      unit: unit(9, 130),
      secondary: [130, 0],
      duel: duel(560),
    },
    { stat: "int", step: 10, initial: null, unit: null, secondary: null, duel: null },
    {
      stat: "str",
      step: -10,
      initial: unit(1, 1).primaries,
      unit: unit(5, 100),
      secondary: [100, 0],
      duel: duel(300),
    },
  ],
  dropped: [],
};

describe("영향도 자료", () => {
  it("순위 막대: 큰 차례, 값 없는 1차는 뒤, 승률은 구간을 든다", () => {
    const bars = rankedBars(sensitivity, "score", 10);
    expect(bars.slice(0, 2).map((bar) => bar.stat)).toEqual(["str", "vit"]);
    expect(bars[0]?.change).toBe(150);
    expect(bars[0]?.lowPm).toBeLessThan(150);
    expect(bars.at(-1)?.change).toBeNull();
  });

  it("사양 지표는 기준 대비 ‰ 비율", () => {
    const bars = rankedBars(sensitivity, "ehp", 10);
    expect(bars[0]).toMatchObject({ stat: "vit", change: 300, lowPm: null });
  });

  it("곡선은 0 단계(기준 0)를 넣고 없는 점은 뺀다", () => {
    const str = curves(sensitivity, "score").find((entry) => entry.stat === "str");
    expect(str?.points).toEqual([
      { step: -10, change: -200 },
      { step: 0, change: 0 },
      { step: 10, change: 150 },
    ]);
    expect(curves(sensitivity, "score").find((entry) => entry.stat === "int")?.points).toEqual([
      { step: 0, change: 0 },
    ]);
  });

  it("2차 변화: 값 차와 비율, 기준 0이면 비율 없음", () => {
    const rows = secondaryEffects(sensitivity, 10);
    const hp = rows.find((row) => row.row === "hp");
    expect(hp?.cells.find((cell) => cell.stat === "vit")).toEqual({ stat: "vit", delta: 30, pm: 300 });
    expect(rows.find((row) => row.row === "evade")?.cells[0]?.pm).toBeNull();
    expect(hp?.cells.find((cell) => cell.stat === "int")?.delta).toBeNull();
  });

  it("CSV: 기준 한 줄 + 변형마다 한 줄, 2차 열", () => {
    const lines = sensitivityCsv(sensitivity).trim().split("\n");
    expect(lines).toHaveLength(1 + 1 + 4);
    expect(lines[0]?.endsWith("hp,evade")).toBe(true);
    expect(lines[1]?.startsWith("base,0,")).toBe(true);
  });
});

describe("입력 글·저장 모양", () => {
  it("단계 글: 유니코드 빼기·쉼표·공백, 0·같은 값 뺌, plus는 음수 거절", () => {
    expect(parseSteps("−20, -10 10,20", false)).toEqual([-20, -10, 10, 20]);
    expect(parseSteps("10, 10, 0", false)).toEqual([10]);
    expect(parseSteps("-5", true)).toBeNull();
    expect(parseSteps("abc", false)).toBeNull();
    expect(parseSteps("1,2,3,4,5,6,7,8,9", false)).toBeNull();
  });

  it("저장된 분포 상성 입력 모양 검사", () => {
    const form = defaultMatrixForm((id) => id);
    expect(isMatrixForm(form)).toBe(true);
    expect(isMatrixForm({ ...form, runs: 1.5 })).toBe(false);
    expect(isMatrixForm({ ...form, builds: [{ ...form.builds[0], id: "Bad Id" }] })).toBe(false);
    expect(isMatrixForm(null)).toBe(false);
  });
});
