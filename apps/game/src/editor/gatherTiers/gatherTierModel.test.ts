// 1차 생산 티어 확률 모델 시험 — 담음 → 묶음, 실효 값과 같아지면 빠짐, 1000‰ 맞추기, 프리셋(/dev/gather-tiers, 2026-11-09)
import type { BuildingEditorGatherBand } from "@terra/shared/buildingEditor";
import { describe, expect, it } from "vitest";
import {
  EMPTY_GATHER_STAGE,
  applyBulkPreset,
  draftBandOf,
  editBand,
  gatherChangesOf,
  gatherStageKeys,
  maxAccessTierOf,
  normalizeWeightsPm,
  revertBand,
  rowPresetWeights,
  stageGatherDiscard,
  weightSum,
  withWeight,
} from "./gatherTierModel.ts";

const HASH = "c".repeat(64);
const band = (id: string, from: number, weightsPm: number[], edited = false): BuildingEditorGatherBand => ({
  entry: { id, from, weightsPm },
  origin: edited ? "edited" : "pack",
  pack: { id, from, weightsPm: edited ? [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0] : weightsPm },
  override: null,
  hash: HASH,
});
const B0 = band("band_000", 0, [700, 150, 100, 50, 0, 0, 0, 0, 0, 0]);
const B1 = band("band_020", 20, [500, 300, 150, 50, 0, 0, 0, 0, 0, 0], true);

describe("담은 변경", () => {
  it("칸을 고치면 put이 담기고, 실효 값으로 되돌리면 빠진다. 잠든 줄 버리기는 확률표 분류로 보낸다", () => {
    const next = withWeight(B0.entry.weightsPm, 1, 200);
    const staged = editBand(EMPTY_GATHER_STAGE, B0, next);
    expect(gatherStageKeys(staged)).toEqual(["band_000"]);
    expect(draftBandOf(B0, staged).weightsPm[1]).toBe(200);
    expect(gatherChangesOf(staged)).toEqual([
      { op: "put_gather_band", entry: { id: "band_000", from: 0, weightsPm: next }, baseHash: HASH },
    ]);
    expect(gatherStageKeys(editBand(staged, B0, B0.entry.weightsPm))).toEqual([]);
    const withDiscard = stageGatherDiscard(staged, "band_old", true);
    expect(gatherChangesOf(withDiscard).at(-1)).toEqual({
      op: "discard_sleeping",
      id: "band_old",
      category: "gather_tiers",
    });
  });

  it("팩 값으로 되돌리기는 화면에 팩 값을 보이고 revert_gather_band로 보낸다", () => {
    const staged = revertBand(EMPTY_GATHER_STAGE, B1);
    expect(draftBandOf(B1, staged).weightsPm).toEqual(B1.pack?.weightsPm);
    expect(gatherChangesOf(staged)).toEqual([{ op: "revert_gather_band", id: "band_020", baseHash: HASH }]);
  });
});

describe("가중치", () => {
  it("1000‰ 맞추기는 열 칸·합 1000, 빈 것은 T0 1000", () => {
    const normalized = normalizeWeightsPm([100, 70, 40, 20]);
    expect(weightSum(normalized)).toBe(1000);
    expect(normalized).toHaveLength(10);
    expect(normalizeWeightsPm([])).toEqual([1000, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(withWeight([1, 2], 1, 5000)).toEqual([1, 1000, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("구간 프리셋은 권장 최고 티어 위를 0으로 두고 합 1000, 전체 프리셋은 구간마다 담는다", () => {
    expect(maxAccessTierOf(0, 20)).toBe(1);
    expect(maxAccessTierOf(220, undefined)).toBe(9);
    for (const kind of ["low", "even", "mid", "high"] as const) {
      const weights = rowPresetWeights(kind, 3);
      expect(weightSum(weights), kind).toBe(1000);
      expect(
        weights.slice(4).every((value) => value === 0),
        kind,
      ).toBe(true);
    }
    const stage = applyBulkPreset(EMPTY_GATHER_STAGE, [B0, B1], "monotonic");
    expect(draftBandOf(B0, stage).weightsPm).toEqual([950, 50, 0, 0, 0, 0, 0, 0, 0, 0]);
    // 팩 값 전부: 고친 구간만 팩 값으로 담긴다(팩과 같은 구간은 담지 않는다)
    expect(gatherStageKeys(applyBulkPreset(EMPTY_GATHER_STAGE, [B0, B1], "pack"))).toEqual(["band_020"]);
  });
});
