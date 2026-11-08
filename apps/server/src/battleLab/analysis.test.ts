// 밸런스 분석 계획·일 시험 — 같은 시드면 같은 결과(묶음 차례·워커와 무관), 짝 칸·영향도 변형 모양, 조건(스킬·장비·인원·성장),
// 일 서비스(진행·취소·바쁨·주인만·예산·감사 기록·속도 제한)
import {
  type AnalysisMatrixInput,
  type AnalysisSensitivityInput,
  ANALYSIS_BUILD_PRESETS,
} from "@terra/shared/balanceAnalysis";
import { type LabUnit, newLabUnit } from "@terra/shared/battleLab";
import { TEST_COMBAT_CATALOG, TEST_COMBAT_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { matrixPlan, sensitivityPlan, unitFor } from "./analysis.ts";
import { runBatch } from "./analysisBatch.ts";
import { createAnalysisService } from "./analysisJobs.ts";
import { tsWorkerUrl } from "../testWorkers.ts";
import { BatchRunError, type BatchRunner, inlineBatchRunner, workerBatchRunner } from "./analysisRunner.ts";
import { flatArena } from "./arena.ts";
import type { LabRules } from "./build.ts";

const rules: LabRules = {
  catalog: TEST_COMBAT_CATALOG,
  coefficients: TEST_COMBAT_COEFFICIENTS,
  growthPm: 100,
  maxLevel: 50,
};

const template: LabUnit = { ...newLabUnit("human"), weapon: { kind: "item", id: "test_sword", pm: 500 } };
const weightsOf = (id: string) => {
  const preset = ANALYSIS_BUILD_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error(id);
  return preset.weights;
};

const conditions = {
  template,
  level: 10,
  mode: "sum" as const,
  elements: "keep" as const,
  skills: true,
  gear: true,
  teamSize: 1,
  limitSec: 30,
};

const matrixInput = (patch: Partial<AnalysisMatrixInput> = {}): AnalysisMatrixInput => ({
  conditions,
  builds: ["balanced", "str", "dex_agi"].map((id) => ({ id, label: id, weights: weightsOf(id), unit: null })),
  sums: [120],
  runs: 4,
  seed: 7,
  ...patch,
});

const batchOf = (plan: ReturnType<typeof matrixPlan>) => ({
  cells: plan.cells,
  map: flatArena(),
  coefficients: TEST_COMBAT_COEFFICIENTS,
  limitMs: plan.limitMs,
  runs: plan.runs,
});

describe("분포 상성 계획", () => {
  it("짝 i < j마다 칸 하나, 같은 시드면 같은 결과, 칸 차례를 바꿔 돌려도 칸마다 같은 값", () => {
    const plan = matrixPlan(matrixInput(), rules, 3);
    expect(plan.cells).toHaveLength(3);
    const first = plan.assemble(runBatch(batchOf(plan)));
    const second = plan.assemble(runBatch(batchOf(matrixPlan(matrixInput(), rules, 3))));
    expect(second).toEqual(first);
    // 칸 하나만 따로 돌려도 같다(칸 시드가 차례와 무관)
    const reversed = runBatch({ ...batchOf(plan), cells: plan.cells.toReversed() }).toReversed();
    expect(plan.assemble(reversed)).toEqual(first);
    if (first.kind !== "matrix") throw new Error("matrix");
    const table = first.tables[0];
    expect(table?.cells.map((cell) => [cell.i, cell.j])).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    for (const cell of table?.cells ?? []) {
      expect(cell.runs).toBe(4);
      expect(cell.wins + cell.losses + cell.timeoutWins + cell.timeoutLosses + cell.even).toBe(4);
    }
    // 나눈 1차 합 = 총합(mode sum: 성장 끔)
    for (const unit of table?.units ?? [])
      expect(Object.values(unit.primaries).reduce((a, b) => a + b, 0)).toBe(120);
    expect(first.revision).toBe(3);
  });

  it("다른 시드는 다른 칸 시드", () => {
    const a = matrixPlan(matrixInput(), rules, 0);
    const b = matrixPlan(matrixInput({ seed: 8 }), rules, 0);
    expect(a.cells.map((cell) => cell.seed)).not.toEqual(b.cells.map((cell) => cell.seed));
  });

  it("합 여러 개 = 표 여러 장, mode level은 처음 합을 나눈 뒤 성장(합이 커진다)", () => {
    const plan = matrixPlan(
      matrixInput({ sums: [60, 120], conditions: { ...conditions, mode: "level", level: 30 } }),
      rules,
      0,
    );
    expect(plan.cells).toHaveLength(6);
    const result = plan.assemble([]);
    if (result.kind !== "matrix") throw new Error("matrix");
    const grown = result.tables[0]?.units[0]?.primaries;
    expect(Object.values(grown ?? {}).reduce((a, b) => a + b, 0)).toBeGreaterThan(60);
    expect(Object.values(result.tables[0]?.initial[0] ?? {}).reduce((a, b) => a + b, 0)).toBe(60);
  });

  it("인원 = 편마다 같은 유닛 수, 스킬 끔 = 사양 스킬 없음, 장비 끔 = 무기 밖 장비 없음", () => {
    const skilled: LabUnit = {
      ...template,
      skills: [{ id: "power_strike", grade: 1 }],
      equipment: [{ slot: 3, item: "test_vest", pm: 0 }],
    };
    const on = matrixPlan(
      matrixInput({ conditions: { ...conditions, template: skilled, teamSize: 3 } }),
      rules,
      0,
    );
    expect(on.cells[0]?.a.units).toHaveLength(3);
    expect(on.cells[0]?.a.units[0]?.spec.skills.length).toBeGreaterThan(0);
    const off = matrixPlan(
      matrixInput({ conditions: { ...conditions, template: skilled, skills: false, gear: false } }),
      rules,
      0,
    );
    expect(off.cells[0]?.a.units[0]?.spec.skills).toEqual([]);
    expect(unitFor(skilled, skilled.initial, { ...conditions, gear: false }).equipment).toEqual([]);
    expect(unitFor(skilled, skilled.initial, { ...conditions, elements: 2 }).elements[2]).toBe(10);
  });
});

const sensitivityInput = (patch: Partial<AnalysisSensitivityInput> = {}): AnalysisSensitivityInput => ({
  conditions,
  weights: weightsOf("balanced"),
  sum: 60,
  mode: "shift",
  steps: [-10, 10],
  runs: 2,
  seed: 1,
  ...patch,
});

describe("영향도 계획", () => {
  it("1차 여섯 × 단계 변형 + 기준 대조 칸, 옮겨도 총합 같음, 같은 시드면 같은 결과", () => {
    const plan = sensitivityPlan(sensitivityInput(), rules, 0);
    expect(plan.cells).toHaveLength(1 + 12);
    const run = () => {
      const p = sensitivityPlan(sensitivityInput(), rules, 0);
      return p.assemble(runBatch({ ...batchOf(p) }));
    };
    const result = run();
    expect(run()).toEqual(result);
    if (result.kind !== "sensitivity") throw new Error("sensitivity");
    expect(result.points).toHaveLength(12);
    expect(result.control?.runs).toBe(2);
    for (const point of result.points) {
      expect(Object.values(point.initial ?? {}).reduce((a, b) => a + b, 0)).toBe(60);
      expect(point.duel?.runs).toBe(2);
      expect(point.secondary).toHaveLength(result.rows.length);
    }
    // VIT +10 → HP가 오른다(2차 스탯 영향)
    const hpIndex = result.rows.indexOf("hp");
    const vitUp = result.points.find((point) => point.stat === "vit" && point.step === 10);
    expect(vitUp?.secondary?.[hpIndex] ?? 0).toBeGreaterThan(result.base.secondary[hpIndex] ?? 0);
  });

  it("판 수 0이면 칸 없이 2차 스탯만, 옮길 수 없는 단계는 빈 점", () => {
    const plan = sensitivityPlan(
      sensitivityInput({ runs: 0, weights: weightsOf("glass"), steps: [-10, 5] }),
      rules,
      0,
    );
    expect(plan.cells).toHaveLength(0);
    const result = plan.assemble([]);
    if (result.kind !== "sensitivity") throw new Error("sensitivity");
    expect(result.control).toBeNull();
    // glass 분포는 VIT·INT·WIS가 0 → −10은 옮길 수 없다
    const empty = result.points.find((point) => point.stat === "vit" && point.step === -10);
    expect(empty?.initial).toBeNull();
    expect(result.points.find((point) => point.stat === "vit" && point.step === 5)?.unit).not.toBeNull();
  });

  it("plus는 총합이 단계만큼 늘어난다", () => {
    const result = sensitivityPlan(
      sensitivityInput({ runs: 0, mode: "plus", steps: [10] }),
      rules,
      0,
    ).assemble([]);
    if (result.kind !== "sensitivity") throw new Error("sensitivity");
    for (const point of result.points)
      expect(Object.values(point.initial ?? {}).reduce((a, b) => a + b, 0)).toBe(70);
  });
});

// ── 일 서비스 ──

const viewer = (id: string) => ({ id, loginId: id, roles: ["dev" as const] });
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 감사 쓰기를 바꿔 끼워 DB를 쓰지 않는다
const db = {} as Database;

function service(options: { batches?: BatchRunner; audit?: (entry: AuditEntry) => void } = {}) {
  let clock = 1_000_000;
  const audits: AuditEntry[] = [];
  const logs: string[] = [];
  const svc = createAnalysisService({
    rules: () => ({ rules, revision: 5 }),
    batches: options.batches ?? inlineBatchRunner(),
    now: () => clock,
    log: { info: (_fields, message) => logs.push(message), warn: (_fields, message) => logs.push(message) },
    audit: (_db, entry) => {
      audits.push(entry);
      options.audit?.(entry);
      return Promise.resolve();
    },
  });
  return { svc, audits, logs, tick: (ms: number) => (clock += ms) };
}

/** 손으로 끝내는 묶음(진행·끝·실패를 시험이 정한다) */
function manualBatches() {
  const pending: {
    resolve: (value: never[]) => void;
    reject: (error: unknown) => void;
    progress: (done: number) => void;
    cancelled: boolean;
  }[] = [];
  const runner: BatchRunner = (_job, { onProgress }) => {
    let entry: (typeof pending)[number] | undefined;
    const promise = new Promise<never[]>((resolve, reject) => {
      entry = { resolve, reject, progress: onProgress, cancelled: false };
      pending.push(entry);
    });
    return {
      promise,
      cancel: () => {
        if (entry) entry.cancelled = true;
      },
    };
  };
  return { runner, pending };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function waitDone(svc: ReturnType<typeof service>["svc"], id: string) {
  for (let i = 0; i < 400; i++) {
    const status = svc.status(viewer("u1"), id);
    if (status.job.state !== "running") return status;
    await flush();
  }
  throw new Error("job did not finish");
}

describe("분석 일 서비스", () => {
  it("시작 → 진행 → 결과, 감사 기록 하나, 같은 입력이면 같은 결과", async () => {
    const { svc, audits, logs } = service();
    const input = { kind: "matrix" as const, ...matrixInput() };
    const job = await svc.start(db, viewer("u1"), "127.0.0.1", input);
    expect(job.total).toBe(12);
    expect(audits[0]?.action).toBe("balance_analysis.start");
    const done = await waitDone(svc, job.id);
    expect(done.job.state).toBe("done");
    expect(done.job.done).toBe(12);
    const again = await svc.start(db, viewer("u1"), "127.0.0.1", input);
    const second = await waitDone(svc, again.id);
    expect(second.result).toEqual(done.result);
    expect(logs).toContain("balance analysis finished");
  });

  it("남의 일은 unknown_job, 목록은 내 일만", async () => {
    const { svc } = service();
    const job = await svc.start(db, viewer("u1"), "ip", {
      kind: "sensitivity",
      ...sensitivityInput({ runs: 0 }),
    });
    expect(() => svc.status(viewer("u2"), job.id)).toThrow(/BALANCE_ANALYSIS_REJECTED/);
    expect(svc.list(viewer("u2")).jobs).toEqual([]);
    expect(svc.list(viewer("u1")).jobs.map((entry) => entry.id)).toEqual([job.id]);
    // 판 수 0은 바로 끝난다
    expect(svc.status(viewer("u1"), job.id).job.state).toBe("done");
  });

  it("도는 일이 있으면 다른 사람의 시작은 busy, 취소하면 cancelled·감사 기록, 그 뒤 시작 가능", async () => {
    const manual = manualBatches();
    const { svc, audits } = service({ batches: manual.runner });
    const input = { kind: "matrix" as const, ...matrixInput() };
    const job = await svc.start(db, viewer("u1"), "ip", input);
    manual.pending[0]?.progress(5);
    expect(svc.status(viewer("u1"), job.id).job.done).toBe(5);
    await expect(svc.start(db, viewer("u2"), "ip", input)).rejects.toThrow(/BALANCE_BUSY/);
    expect(svc.list(viewer("u2")).busy).toBe(true);
    const cancelled = await svc.cancel(db, viewer("u1"), "ip", job.id);
    expect(cancelled.state).toBe("cancelled");
    expect(manual.pending[0]?.cancelled).toBe(true);
    expect(audits.map((entry) => entry.action)).toEqual([
      "balance_analysis.start",
      "balance_analysis.cancel",
    ]);
    // 취소 뒤 늦게 온 결과는 버린다
    manual.pending[0]?.resolve([]);
    await flush();
    expect(svc.status(viewer("u1"), job.id).job.state).toBe("cancelled");
    await expect(svc.start(db, viewer("u2"), "ip", input)).resolves.toMatchObject({ state: "running" });
  });

  it("워커 실패는 failed와 까닭, 예산·짝수 판 위반은 시작 전에 거절", async () => {
    const manual = manualBatches();
    const { svc } = service({ batches: manual.runner });
    const job = await svc.start(db, viewer("u1"), "ip", { kind: "matrix", ...matrixInput() });
    manual.pending[0]?.reject(new Error("boom"));
    await flush();
    expect(svc.status(viewer("u1"), job.id).job).toMatchObject({ state: "failed", reason: "failed" });
    await expect(
      svc.start(db, viewer("u1"), "ip", { kind: "matrix", ...matrixInput({ runs: 3 }) }),
    ).rejects.toThrow(/BALANCE_ANALYSIS_REJECTED/);
    await expect(
      svc.start(db, viewer("u1"), "ip", {
        kind: "matrix",
        ...matrixInput({
          runs: 400,
          sums: [60, 120, 300, 600],
          conditions: { ...conditions, limitSec: 600 },
        }),
      }),
    ).rejects.toThrow(/BALANCE_ANALYSIS_REJECTED/);
  });

  it("감사 기록을 못 쓰면 시작하지 않는다", async () => {
    const { svc } = service({
      audit: () => {
        throw new Error("db down");
      },
    });
    await expect(svc.start(db, viewer("u1"), "ip", { kind: "matrix", ...matrixInput() })).rejects.toThrow(
      /db down/,
    );
    expect(svc.list(viewer("u1")).jobs).toEqual([]);
  });

  it("시작은 사용자마다 순간 3번, 진행 조회는 따로 센다", async () => {
    const { svc } = service();
    const input = { kind: "sensitivity" as const, ...sensitivityInput({ runs: 0 }) };
    for (let i = 0; i < 3; i++) await svc.start(db, viewer("u1"), "ip", input);
    await expect(svc.start(db, viewer("u1"), "ip", input)).rejects.toThrow(/RATE_LIMITED/);
    expect(() => svc.admitPoll(viewer("u1"))).not.toThrow();
  });

  it("모르는 유닛 종류는 invalid_unit", async () => {
    const { svc } = service();
    await expect(
      svc.start(db, viewer("u1"), "ip", {
        kind: "matrix",
        ...matrixInput({ conditions: { ...conditions, template: { ...template, kind: "no_such_kind" } } }),
      }),
    ).rejects.toThrow(/BALANCE_ANALYSIS_REJECTED/);
  });
});

describe("묶음 워커", () => {
  it("워커(duelWorker.ts 일 종류 batch)와 같은 스레드가 같은 결과, 진행은 늘어나기만", async () => {
    const plan = matrixPlan(matrixInput(), rules, 0);
    const job = batchOf(plan);
    const progress: number[] = [];
    const worker = workerBatchRunner({ workerUrl: tsWorkerUrl("../balance/duelWorker.ts", import.meta.url) });
    const fromWorker = await worker(job, { onProgress: (done) => progress.push(done), timeoutMs: 60_000 })
      .promise;
    const inline = await inlineBatchRunner()(job, { onProgress: () => undefined, timeoutMs: 60_000 }).promise;
    expect(fromWorker).toEqual(inline);
    expect(progress).toEqual([...progress].toSorted((a, b) => a - b));
  });

  it("취소하면 워커를 끝내고 cancelled", async () => {
    const plan = matrixPlan(matrixInput({ runs: 40 }), rules, 0);
    const worker = workerBatchRunner({ workerUrl: tsWorkerUrl("../balance/duelWorker.ts", import.meta.url) });
    const handle = worker(batchOf(plan), { onProgress: () => undefined, timeoutMs: 60_000 });
    handle.cancel();
    await expect(handle.promise).rejects.toBeInstanceOf(BatchRunError);
    await expect(handle.promise).rejects.toMatchObject({ reason: "cancelled" });
  });
});
