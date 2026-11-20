// 유닛 공통 경험치 테이블 편집기 화면 자료·계획 시험
import { expTableEntrySchema, readCategoryFile } from "@terra/content";
import { DEFAULT_EXP_TABLE, EXP_TABLE_LIMITS, expTableMilestones } from "@terra/shared/expTable";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { expTableJsonOf, expTableViews } from "./views.ts";

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

describe("경험치 테이블 편집기 화면 자료", () => {
  it("팩 exp_table.json 줄마다 화면 JSON = 팩 파일 한 줄이고 기본표와 일치한다", () => {
    const raw = readCategoryFile(loaded.source, "exp_table").entries;
    expect(raw).toHaveLength(59);
    for (const line of raw) expect(expTableJsonOf(expTableEntrySchema.parse(line))).toEqual(line);

    const state = createContentEditState(loaded.source);
    const views = expTableViews(state, state.snapshot());
    expect(views).toHaveLength(59);
    expect(views.map((view) => view.entry)).toEqual([...DEFAULT_EXP_TABLE]);
    expect(views[0]?.origin).toBe("pack");
    expect(views[0]?.hash).toBe(state.hashOf("exp_table", "lv_01"));

    const summary = expTableMilestones(views.map((view) => view.entry));
    expect(summary.expToBaseCap).toBe(1_000_000);
    expect(summary.expAfterBaseCap).toBe(1_000_000);
    expect(summary.totalExp).toBe(2_000_000);
  });

  it("plan으로 구간 경험치 수정과 역전 경고를 검증한다", () => {
    const state = createContentEditState(loaded.source);
    const baseHash = state.hashOf("exp_table", "lv_02");
    if (!baseHash) throw new Error("lv_02 hash");

    // 정상 수정(단조 유지)
    const okPlan = state.plan([
      { category: "exp_table", id: "lv_02", entry: { id: "lv_02", level: 2, requiredExp: 150 }, baseHash },
    ]);
    expect(okPlan.ok).toBe(true);
    if (okPlan.ok) expect(okPlan.warnings).toEqual([]);

    // 역전 수정(Lv 2 < Lv 1): 통과하되 경고
    const warnPlan = state.plan([
      { category: "exp_table", id: "lv_02", entry: { id: "lv_02", level: 2, requiredExp: 10 }, baseHash },
    ]);
    expect(warnPlan.ok).toBe(true);
    if (warnPlan.ok)
      expect(warnPlan.warnings.some((issue) => issue.code === "exp_span_decreasing")).toBe(true);

    // 범위 밖 값(0): 실패
    const badPlan = state.plan([
      { category: "exp_table", id: "lv_02", entry: { id: "lv_02", level: 2, requiredExp: 0 }, baseHash },
    ]);
    expect(badPlan.ok).toBe(false);
    expect(EXP_TABLE_LIMITS.requiredExpMin).toBe(1);
  });
});
