import { describe, expect, it } from "vitest";
import { tuningEntrySchema, tuningValueInRange } from "./schema/tuning.ts";
import {
  TUNING_DIFF_FORMAT,
  type TuningDiff,
  applyTuningDiff,
  overlayTuningDiff,
  tuningDiffSchema,
} from "./tuningDiff.ts";

const entry = (id: string, value: number, extra: Record<string, unknown> = {}) => ({
  id,
  code: "N9",
  name: { ko: id, en: id },
  value,
  structural: false,
  ...extra,
});

const diffOf = (changes: TuningDiff["changes"]): TuningDiff => ({
  format: TUNING_DIFF_FORMAT,
  formatVersion: 1,
  exportedAt: "2026-11-01T04:00:00.000Z",
  packId: "core",
  contentVersion: "core@15",
  contentHash: "abc",
  changes,
});

describe("설정 칸 항목의 기술 범위(D1 형식)", () => {
  it("unit·min·max는 선택 칸이고, 값이 범위 밖이거나 범위가 거꾸로면 1단계 검사가 거절한다", () => {
    expect(tuningEntrySchema.safeParse(entry("a_b", 5)).success).toBe(true);
    expect(tuningEntrySchema.safeParse(entry("a_b", 5, { unit: "pm", min: 0, max: 10 })).success).toBe(true);
    expect(tuningEntrySchema.safeParse(entry("a_b", 11, { min: 0, max: 10 })).success).toBe(false);
    expect(tuningEntrySchema.safeParse(entry("a_b", -1, { min: 0 })).success).toBe(false);
    expect(tuningEntrySchema.safeParse(entry("a_b", 5, { min: 10, max: 0 })).success).toBe(false);
    expect(tuningEntrySchema.safeParse(entry("a_b", 5, { unit: "parsec" })).success).toBe(false);
    expect(tuningEntrySchema.safeParse(entry("a_b", 5, { min: 1.5 })).success).toBe(false);
  });

  it("tuningValueInRange: 양 끝 포함, 범위가 없으면 스키마 한계만", () => {
    expect(tuningValueInRange({ min: 1, max: 3 }, 1)).toBe(true);
    expect(tuningValueInRange({ min: 1, max: 3 }, 3)).toBe(true);
    expect(tuningValueInRange({ min: 1, max: 3 }, 4)).toBe(false);
    expect(tuningValueInRange({}, -1_000_000_000_000)).toBe(true);
    expect(tuningValueInRange({}, 1_000_000_000_001)).toBe(false);
    expect(tuningValueInRange({}, 0.5)).toBe(false);
  });
});

describe("설정 칸 차이(내보내기)", () => {
  it("형식: 같은 ID 두 번, 모르는 칸, 다른 형식 이름은 받지 않는다", () => {
    expect(tuningDiffSchema.safeParse(diffOf([{ id: "a_b", code: "N9", from: 1, to: 2 }])).success).toBe(
      true,
    );
    expect(
      tuningDiffSchema.safeParse(
        diffOf([
          { id: "a_b", code: "N9", from: 1, to: 2 },
          { id: "a_b", code: "N9", from: 1, to: 3 },
        ]),
      ).success,
    ).toBe(false);
    expect(tuningDiffSchema.safeParse({ ...diffOf([]), extra: 1 }).success).toBe(false);
    expect(tuningDiffSchema.safeParse({ ...diffOf([]), format: "other" }).success).toBe(false);
  });

  it("overlayTuningDiff: 팩에 있는 ID만 얹고, 팩 값이 from과 다르면 stale로 알린다", () => {
    const pack = new Map([
      ["a_b", 1],
      ["c_d", 10],
    ]);
    const result = overlayTuningDiff(
      pack,
      diffOf([
        { id: "a_b", code: "", from: 1, to: 2 },
        { id: "c_d", code: "", from: 9, to: 11 },
        { id: "gone", code: "", from: 0, to: 1 },
      ]),
    );
    expect([...result.values]).toEqual([
      ["a_b", 2],
      ["c_d", 11],
    ]);
    expect(result.unknown).toEqual(["gone"]);
    expect(result.stale).toEqual(["c_d"]);
    expect(pack.get("a_b")).toBe(1);
  });

  it("applyTuningDiff: value만 바꾸고(다른 칸·키 차례 그대로) 모르는 ID·팩 값 어긋남·범위 밖은 건너뛴다. force면 어긋남도 넣는다", () => {
    const raw = [
      entry("a_b", 1, { unit: "count", min: 0, max: 5 }),
      entry("c_d", 10),
      entry("e_f", 3, { max: 4 }),
    ];
    const diff = diffOf([
      { id: "a_b", code: "N9", from: 1, to: 4 },
      { id: "c_d", code: "N9", from: 9, to: 12 },
      { id: "e_f", code: "N9", from: 3, to: 9 },
      { id: "gone", code: "N9", from: 0, to: 1 },
    ]);
    const result = applyTuningDiff(raw, diff);
    expect(result.applied).toEqual([{ id: "a_b", from: 1, to: 4 }]);
    expect(result.skipped).toEqual([
      { id: "c_d", reason: "stale", current: 10 },
      { id: "e_f", reason: "out_of_range", current: 3 },
      { id: "gone", reason: "unknown" },
    ]);
    expect(result.entries[0]).toEqual(entry("a_b", 4, { unit: "count", min: 0, max: 5 }));
    expect(Object.keys(Object(result.entries[0]))).toEqual(Object.keys(Object(raw[0])));
    // 원래 배열은 그대로
    expect(raw[0]?.value).toBe(1);
    const forced = applyTuningDiff(raw, diff, { force: true });
    expect(forced.applied.map((change) => change.id)).toEqual(["a_b", "c_d"]);
  });
});
