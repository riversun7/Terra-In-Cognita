// 면적 모듈 붙이기·떼기·기를 티어(기획 D-567·D-569 1761·1765) — 건물 채집소만, 자리 = 레벨 × 레벨당 수, 재료 = 레벨 1 짓기 재료, 시간 = 레벨 1
// 짓는 시간 × 일꾼 단축(작업), 운영자는 재료·시간 없이, 떼기는 바로(재료 돌려주지 않음), 티어는 최고 티어까지
import { DEFAULT_BUILDING_GATHER } from "@terra/shared/gatherMath";
import { describe, expect, it } from "vitest";
import {
  type PlotDeps,
  type PlotFacility,
  type PlotJobInput,
  addPlot,
  chooseTier,
  plotOpen,
  removePlot,
} from "./plots.ts";
import type { FacilityRecord, JobMaterial } from "./state.ts";

const def = (mode: "roll" | "select"): PlotFacility => ({ gather: { mode } });

function setup(level: number, mode: "roll" | "select" = "select", stock = 100) {
  const record: FacilityRecord = {
    buildingId: 7,
    facilityId: "farm",
    level,
    conditionPpm: 1_000_000,
    conditionAtMs: 0,
    builtAtMs: 0,
    builtBy: null,
    cityId: 1,
  };
  const spent: (readonly JobMaterial[])[] = [];
  const saved: FacilityRecord[] = [];
  const jobs: PlotJobInput[] = [];
  let running = false;
  let left = stock;
  const deps: PlotDeps = {
    now: () => 1_000,
    ownerFor: (userId) => (userId === "u" ? 3 : undefined),
    myFacility: (me, buildingId) => (me === 3 && buildingId === 7 ? { record, def: def(mode) } : "forbidden"),
    levelMaterials: () => [{ item: "pine_log", qty: 8 }],
    levelMs: () => 60_000,
    // 일꾼 하나마다 반(시험값)
    withBuilders: (ms, builders) => Math.floor(ms / (1 + builders)),
    checkUnits: (_me, unitIds) => (unitIds.includes(99) ? "unit_busy" : null),
    jobRunning: () => running,
    spend: (_me, materials) => {
      const need = materials.reduce((sum, row) => sum + row.qty, 0);
      if (need > left) return false;
      left -= need;
      spent.push(materials);
      return true;
    },
    startJob: (job) => {
      jobs.push(job);
      // 작업이 끝나면 모듈 + 1(service.ts finish와 같다) — 여기서는 바로 끝낸다
      record.plots = (record.plots ?? 0) + 1;
    },
    save: (row) => saved.push({ ...row }),
    rules: () => DEFAULT_BUILDING_GATHER,
  };
  return { record, deps, spent, saved, jobs, run: (on: boolean) => (running = on) };
}

describe("면적 모듈 붙이기", () => {
  it("레벨 2 농장은 둘까지(레벨당 1) 셋째는 plot_full, 붙일 때마다 레벨 1 재료를 빼고 짓는 시간 작업을 건다", () => {
    const { record, deps, spent, jobs } = setup(2);
    expect(addPlot(deps, "u", 7, [], false)).toEqual({ ok: true, doneAtMs: 61_000 });
    expect(addPlot(deps, "u", 7, [5], false)).toEqual({ ok: true, doneAtMs: 31_000 });
    expect(addPlot(deps, "u", 7, [], false)).toEqual({ ok: false, code: "plot_full" });
    expect(record.plots).toBe(2);
    expect(spent).toHaveLength(2);
    expect(jobs.map((job) => [job.ownerId, job.buildingId, job.unitIds, job.doneAtMs])).toEqual([
      [3, 7, [], 61_000],
      [3, 7, [5], 31_000],
    ]);
  });

  it("작업이 걸려 있으면 job_running, 일꾼이 바쁘면 그 코드(재료를 빼지 않는다)", () => {
    const busy = setup(2);
    busy.run(true);
    expect(addPlot(busy.deps, "u", 7, [], false)).toEqual({ ok: false, code: "job_running" });
    busy.run(false);
    expect(addPlot(busy.deps, "u", 7, [99], false)).toEqual({ ok: false, code: "unit_busy" });
    expect(busy.spent).toEqual([]);
  });

  it("재료가 모자라면 insufficient_materials(붙지 않음), 운영자는 재료·시간 없이", () => {
    const poor = setup(3, "select", 5);
    expect(addPlot(poor.deps, "u", 7, [], false)).toEqual({ ok: false, code: "insufficient_materials" });
    expect(poor.record.plots).toBeUndefined();
    expect(addPlot(poor.deps, "u", 7, [], true)).toEqual({ ok: true, doneAtMs: 1_000 });
    expect(poor.spent).toEqual([[]]);
  });

  it("건물 채집소가 아니면 not_facility, 짓는 중이면 under_construction, 남의 것·로그인 전", () => {
    expect(addPlot(setup(1, "roll").deps, "u", 7, [], false)).toEqual({ ok: false, code: "not_facility" });
    expect(addPlot(setup(0).deps, "u", 7, [], false)).toEqual({ ok: false, code: "under_construction" });
    expect(addPlot(setup(1).deps, "u", 8, [], false)).toEqual({ ok: false, code: "forbidden" });
    expect(addPlot(setup(1).deps, "x", 7, [], false)).toEqual({ ok: false, code: "busy" });
  });

  it("NPC와 같은 자리 규칙(plotOpen)", () => {
    const { record } = setup(1);
    expect(plotOpen(record, def("select"), DEFAULT_BUILDING_GATHER)).toBeNull();
    record.plots = 1;
    expect(plotOpen(record, def("select"), DEFAULT_BUILDING_GATHER)).toBe("plot_full");
    expect(plotOpen(record, def("roll"), DEFAULT_BUILDING_GATHER)).toBe("not_facility");
  });
});

describe("면적 모듈 떼기", () => {
  it("붙은 모듈 하나를 바로 뗀다(재료는 그대로 — 빼지도 돌려주지도 않음), 없으면 no_plot, 작업 중이면 job_running", () => {
    const { record, deps, spent, run } = setup(2);
    expect(removePlot(deps, "u", 7)).toEqual({ ok: false, code: "no_plot" });
    record.plots = 2;
    run(true);
    expect(removePlot(deps, "u", 7)).toEqual({ ok: false, code: "job_running" });
    run(false);
    expect(removePlot(deps, "u", 7)).toEqual({ ok: true });
    expect(record.plots).toBe(1);
    expect(spent).toEqual([]);
    expect(removePlot(setup(1, "roll").deps, "u", 7)).toEqual({ ok: false, code: "not_facility" });
  });
});

describe("기를 티어 고르기", () => {
  it("0~최고 티어(2 × 레벨 − 1)는 저장, 위는 tier_locked, null은 기본으로 되돌림", () => {
    const { record, deps, saved } = setup(3);
    expect(chooseTier(deps, "u", 7, 2)).toEqual({ ok: true });
    expect(record.gatherTier).toBe(2);
    expect(chooseTier(deps, "u", 7, 5)).toEqual({ ok: true });
    expect(chooseTier(deps, "u", 7, 6)).toEqual({ ok: false, code: "tier_locked" });
    expect(chooseTier(deps, "u", 7, null)).toEqual({ ok: true });
    expect(record.gatherTier).toBeNull();
    expect(saved.map((row) => row.gatherTier)).toEqual([2, 5, null]);
    expect(chooseTier(setup(1, "roll").deps, "u", 7, 0)).toEqual({ ok: false, code: "not_facility" });
    expect(chooseTier(setup(0).deps, "u", 7, 0)).toEqual({ ok: false, code: "under_construction" });
  });
});
