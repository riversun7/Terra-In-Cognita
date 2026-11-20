// 유닛 공통 경험치 테이블 검증 시험 — ID·레벨 짝, 중복 레벨, 빈틈(1..N), 역전 경고
import { describe, expect, it } from "vitest";
import { validatePack } from "./pack.ts";

function packWith(entries: readonly Record<string, unknown>[]) {
  return validatePack({
    packId: "test",
    files: new Map([
      ["manifest.json", JSON.stringify({ formatVersion: 1, packId: "test", version: 1 })],
      ["id-changes.json", JSON.stringify({ renamed: [], removed: [] })],
      ["exp_table.json", JSON.stringify({ entries })],
    ]),
  });
}

describe("checkExpTable", () => {
  it("연속된 lv_01..lv_03 단조 증가 표는 문제없이 통과한다", () => {
    const result = packWith([
      { id: "lv_01", level: 1, requiredExp: 100 },
      { id: "lv_02", level: 2, requiredExp: 250 },
      { id: "lv_03", level: 3, requiredExp: 500 },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.pack).toBeDefined();
  });

  it("ID가 레벨과 어긋나거나 중복·빈틈이 있으면 오류다", () => {
    const badId = packWith([{ id: "lv_02", level: 1, requiredExp: 100 }]);
    expect(badId.issues.map((issue) => issue.code)).toContain("exp_level_id_mismatch");

    const gap = packWith([
      { id: "lv_01", level: 1, requiredExp: 100 },
      { id: "lv_03", level: 3, requiredExp: 300 },
    ]);
    expect(gap.issues.map((issue) => issue.code)).toContain("exp_level_gap");

    const dup = packWith([
      { id: "lv_01", level: 1, requiredExp: 100 },
      { id: "lv_01_dup", level: 1, requiredExp: 120 },
    ]);
    expect(dup.issues.map((issue) => issue.code)).toContain("exp_level_duplicate");
  });

  it("앞 레벨보다 필요 경험치가 줄어들면 경고(오류 아님)를 낸다", () => {
    const dec = packWith([
      { id: "lv_01", level: 1, requiredExp: 200 },
      { id: "lv_02", level: 2, requiredExp: 150 },
    ]);
    expect(dec.pack).toBeDefined();
    expect(dec.issues).toHaveLength(1);
    expect(dec.issues[0]).toMatchObject({ level: "warning", code: "exp_span_decreasing", id: "lv_02" });
  });
});
