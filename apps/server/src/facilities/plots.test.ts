// 면적 모듈 붙이기(기획 D-567) — 건물 채집소만, 자리 = 레벨 × 레벨당 수, 재료 = 레벨 1 짓기 재료, 운영자는 재료 없이
import { DEFAULT_BUILDING_GATHER } from "@terra/shared/gatherMath";
import { describe, expect, it } from "vitest";
import { type PlotDeps, type PlotFacility, addPlot } from "./plots.ts";
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
  const saved: number[] = [];
  let left = stock;
  const deps: PlotDeps = {
    now: () => 1_000,
    ownerFor: (userId) => (userId === "u" ? 3 : undefined),
    myFacility: (me, buildingId) => (me === 3 && buildingId === 7 ? { record, def: def(mode) } : "forbidden"),
    levelMaterials: () => [{ item: "pine_log", qty: 8 }],
    spend: (_me, materials) => {
      const need = materials.reduce((sum, row) => sum + row.qty, 0);
      if (need > left) return false;
      left -= need;
      spent.push(materials);
      return true;
    },
    save: (row) => saved.push(row.plots ?? 0),
    rules: () => DEFAULT_BUILDING_GATHER,
  };
  return { record, deps, spent, saved };
}

describe("면적 모듈 붙이기", () => {
  it("레벨 2 농장은 둘까지 붙고(레벨당 1) 셋째는 plot_full, 붙일 때마다 레벨 1 짓기 재료를 뺀다", () => {
    const { record, deps, spent, saved } = setup(2);
    expect(addPlot(deps, "u", 7, false)).toEqual({ ok: true });
    expect(addPlot(deps, "u", 7, false)).toEqual({ ok: true });
    expect(addPlot(deps, "u", 7, false)).toEqual({ ok: false, code: "plot_full" });
    expect(record.plots).toBe(2);
    expect(saved).toEqual([1, 2]);
    expect(spent).toHaveLength(2);
  });

  it("재료가 모자라면 insufficient_materials(붙지 않음), 운영자는 재료 없이", () => {
    const poor = setup(3, "select", 5);
    expect(addPlot(poor.deps, "u", 7, false)).toEqual({ ok: false, code: "insufficient_materials" });
    expect(poor.record.plots).toBeUndefined();
    expect(addPlot(poor.deps, "u", 7, true)).toEqual({ ok: true });
    expect(poor.spent).toEqual([[]]);
  });

  it("건물 채집소가 아니면 not_facility, 짓는 중이면 under_construction, 남의 것·로그인 전", () => {
    expect(addPlot(setup(1, "roll").deps, "u", 7, false)).toEqual({ ok: false, code: "not_facility" });
    expect(addPlot(setup(0).deps, "u", 7, false)).toEqual({ ok: false, code: "under_construction" });
    expect(addPlot(setup(1).deps, "u", 8, false)).toEqual({ ok: false, code: "forbidden" });
    expect(addPlot(setup(1).deps, "x", 7, false)).toEqual({ ok: false, code: "busy" });
  });
});
