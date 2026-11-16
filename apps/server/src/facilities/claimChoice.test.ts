// 짓는 중 알박기 고르기 바꾸기(기획 D-577 — 완성 때 발효, 완성 전에는 언제든 바꿈): 짓는 중인 내 알박기 정부만, 다 지었거나 멈췄으면 막는다
import { DEFAULT_BUILDING_GATHER } from "@terra/shared/gatherMath";
import { describe, expect, it } from "vitest";
import { type ClaimFacility, chooseClaim } from "./claimChoice.ts";
import type { PlotDeps } from "./plots.ts";
import type { FacilityRecord } from "./state.ts";

function setup(over: Partial<FacilityRecord> = {}, stage = "government") {
  const record: FacilityRecord = {
    buildingId: 7,
    facilityId: "government_hall",
    level: 0,
    conditionPpm: 1_000_000,
    conditionAtMs: 0,
    builtAtMs: 0,
    builtBy: null,
    cityId: null,
    claim: { mode: "nation", regime: null },
    ...over,
  };
  const saved: FacilityRecord[] = [];
  let running = true;
  const def: ClaimFacility = { stage };
  const deps: PlotDeps<ClaimFacility> = {
    now: () => 1_000,
    ownerFor: (userId) => (userId === "u" ? 3 : undefined),
    myFacility: (me, buildingId) => (me === 3 && buildingId === 7 ? { record, def } : "forbidden"),
    levelMaterials: () => [],
    levelMs: () => 0,
    withBuilders: (ms) => ms,
    checkUnits: () => null,
    jobRunning: () => running,
    spend: () => true,
    startJob: () => undefined,
    save: (row) => saved.push({ ...row }),
    rules: () => DEFAULT_BUILDING_GATHER,
  };
  return { record, deps, saved, stop: () => (running = false) };
}

describe("chooseClaim (D-577)", () => {
  it("짓는 중이면 바꾸고 저장한다(귀속이면 체제를 지운다)", () => {
    const { record, deps, saved } = setup();
    expect(chooseClaim(deps, "u", 7, { mode: "independent", regime: "capitalism" })).toEqual({ ok: true });
    expect(record.claim).toEqual({ mode: "independent", regime: "capitalism" });
    expect(chooseClaim(deps, "u", 7, { mode: "nation", regime: "democracy" })).toEqual({ ok: true });
    expect(record.claim).toEqual({ mode: "nation", regime: null });
    expect(saved).toHaveLength(2);
  });

  it("남의 건물·알박기 정부 아님·다 지음·도시가 섬·멈춤은 막는다", () => {
    const other = setup();
    expect(chooseClaim(other.deps, "x", 7, { mode: "nation", regime: null })).toEqual({
      ok: false,
      code: "busy",
    });
    expect(chooseClaim(other.deps, "u", 8, { mode: "nation", regime: null })).toEqual({
      ok: false,
      code: "forbidden",
    });
    const notClaim = setup({ claim: undefined });
    expect(chooseClaim(notClaim.deps, "u", 7, { mode: "nation", regime: null })).toMatchObject({
      code: "not_facility",
    });
    const farm = setup({}, "production");
    expect(chooseClaim(farm.deps, "u", 7, { mode: "nation", regime: null })).toMatchObject({
      code: "not_facility",
    });
    const built = setup({ level: 1 });
    expect(chooseClaim(built.deps, "u", 7, { mode: "nation", regime: null })).toMatchObject({
      code: "not_buildable",
    });
    const city = setup({ cityId: 4 });
    expect(chooseClaim(city.deps, "u", 7, { mode: "nation", regime: null })).toMatchObject({
      code: "not_buildable",
    });
    const halted = setup();
    halted.stop();
    expect(chooseClaim(halted.deps, "u", 7, { mode: "independent", regime: null })).toMatchObject({
      code: "not_buildable",
    });
    expect(halted.saved).toHaveLength(0);
  });
});
