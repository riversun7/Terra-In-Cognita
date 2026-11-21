// 경험치 테이블 편집기 모형 시험 — 곡선 생성기·프리셋·초안 담기·되돌리기·계산 행 검증
import { DEFAULT_EXP_TABLE, type ExpTableRowView, expTableMilestones } from "@terra/shared/expTable";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURVE_PARAMS,
  EMPTY_EXP_STAGE,
  EXP_CURVE_PRESETS,
  buildComputedExpRows,
  effectiveEntriesOf,
  expChangesOf,
  expStageCount,
  generateExpCurve,
  stageExpCurve,
  stageExpRevertAll,
  stageExpRevertRow,
  stageExpSpan,
} from "./expTableModel.ts";

function fakeServerRows(): ExpTableRowView[] {
  return DEFAULT_EXP_TABLE.map((entry) => ({
    entry,
    pack: entry,
    origin: "pack",
    override: null,
    hash: "0".repeat(64),
  }));
}

describe("expTableModel", () => {
  it("기본 곡선 생성 결과가 DEFAULT_EXP_TABLE(팩 기본표)과 정확히 일치한다", () => {
    const generated = generateExpCurve(DEFAULT_CURVE_PARAMS);
    expect(generated).toEqual([...DEFAULT_EXP_TABLE]);
  });

  it("모든 프리셋이 빈틈없는 59구간과 정확한 1→50 / 50→60 합계를 만든다", () => {
    for (const [name, params] of Object.entries(EXP_CURVE_PRESETS)) {
      const curve = generateExpCurve(params);
      expect(curve, name).toHaveLength(59);
      const summary = expTableMilestones(curve, params.baseCapLevel);
      expect(summary.expToBaseCap, name).toBe(params.totalToBaseCap);
      expect(summary.expAfterBaseCap, name).toBe(
        Math.round((params.totalToBaseCap * params.prestigeRatioPct) / 100),
      );
      expect(
        curve.every((entry, idx) => entry.level === idx + 1 && entry.requiredExp >= 10),
        name,
      ).toBe(true);
    }
  });

  it("초안 담기·같은 값 복원 자동 해제·곡선 일괄 담기·되돌리기가 정확히 동작한다", () => {
    const rows = fakeServerRows();
    let stage = stageExpSpan(EMPTY_EXP_STAGE, rows, 10, 3_500);
    expect(expStageCount(stage)).toBe(1);
    expect(effectiveEntriesOf(rows, stage).find((e) => e.level === 10)?.requiredExp).toBe(3_500);

    // 원래 서버 실효 값(2806)으로 다시 바꾸면 초안에서 자동으로 빠진다
    stage = stageExpSpan(stage, rows, 10, 2_806);
    expect(expStageCount(stage)).toBe(0);

    // 빠른 성장 프리셋 전체를 초안에 담는다
    const fast = generateExpCurve(EXP_CURVE_PRESETS.fast);
    stage = stageExpCurve(EMPTY_EXP_STAGE, rows, fast);
    expect(expStageCount(stage)).toBe(59);
    expect(expChangesOf(stage)).toHaveLength(59);

    // 팩 그대로였던 줄 되돌리기는 초안에서 제거한다
    const row1 = rows[0];
    if (!row1) throw new Error("row1");
    stage = stageExpRevertRow(stage, row1);
    expect(expStageCount(stage)).toBe(58);

    // 서버에 덮어쓴 줄이 있을 때 전체 되돌리기
    const overriddenRows: ExpTableRowView[] = rows.map((row, index) =>
      index === 0 ? { ...row, origin: "edited", entry: { ...row.entry, requiredExp: 99 } } : row,
    );
    const revertAll = stageExpRevertAll(overriddenRows);
    expect(expChangesOf(revertAll)).toEqual([{ op: "revert", id: "lv_01", baseHash: "0".repeat(64) }]);
  });

  it("계산 행이 누적 경험치와 예상 도달일을 정확히 낸다", () => {
    const rows = fakeServerRows();
    const computed = buildComputedExpRows(rows, EMPTY_EXP_STAGE, 50, 22_500);
    expect(computed).toHaveLength(59);
    const to50 = computed[48];
    const to60 = computed[58];
    expect(to50?.nextLevel).toBe(50);
    expect(to50?.cumEnd).toBe(1_000_000);
    expect(to50?.daysToReach).toBeCloseTo(1_000_000 / 22_500, 4);
    expect(to50?.isPrestige).toBe(false);
    expect(to60?.nextLevel).toBe(60);
    expect(to60?.cumEnd).toBe(2_000_000);
    expect(to60?.daysToReach).toBeCloseTo(2_000_000 / 22_500, 4);
    expect(to60?.isPrestige).toBe(true);
  });
});
