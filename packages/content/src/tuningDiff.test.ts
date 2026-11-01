import { describe, expect, it } from "vitest";
import { statRowEntrySchema } from "./schema/stats.ts";
import { tuningEntrySchema, tuningValueInRange } from "./schema/tuning.ts";
import {
  TUNING_DIFF_FORMAT,
  type TuningDiff,
  applyStatRowsDiff,
  applyTuningDiff,
  overlayStatRowsDiff,
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
    expect(tuningDiffSchema.safeParse(diffOf([{ id: "a_b", code: "C16a", from: 1, to: 2 }])).success).toBe(
      true,
    );
    expect(tuningDiffSchema.safeParse(diffOf([{ id: "a_b", code: "C16ab", from: 1, to: 2 }])).success).toBe(
      false,
    );
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

describe("가중치 표 칸 차이(밸런스 화면, statRows)", () => {
  const hp = {
    id: "hp",
    name: { ko: "HP", en: "HP" },
    shape: "quantity",
    base: 0,
    weights: [1500, 1000, 1500, 3000, 1000, 1200],
    enabled: true,
  };
  const evade = {
    id: "evade",
    name: { ko: "회피", en: "Evade" },
    shape: "probability",
    cap: 850,
    halfConstant: 250,
    weights: [0, 0, 1000, 0, 0, 0],
    enabled: true,
  };
  const off = { ...hp, id: "old_row", enabled: false };

  it("형식: statRows는 선택 칸이고, 없는 칸 이름·같은 칸 두 번은 받지 않는다(없으면 옛 모양 그대로)", () => {
    expect(tuningDiffSchema.safeParse(diffOf([])).success).toBe(true);
    const withRows = { ...diffOf([]), statRows: [{ row: "hp", field: "vit", from: 3000, to: 3500 }] };
    expect(tuningDiffSchema.safeParse(withRows).success).toBe(true);
    expect(
      tuningDiffSchema.safeParse({ ...withRows, statRows: [{ row: "hp", field: "luck", from: 0, to: 1 }] })
        .success,
    ).toBe(false);
    expect(
      tuningDiffSchema.safeParse({
        ...withRows,
        statRows: [
          { row: "hp", field: "vit", from: 3000, to: 3500 },
          { row: "hp", field: "vit", from: 3000, to: 3600 },
        ],
      }).success,
    ).toBe(false);
  });

  it("applyStatRowsDiff: 그 칸만 바꾸고(키 차례 그대로) 없는 행·꺼진 행·모양에 없는 칸·팩 값 어긋남·범위 밖은 건너뛴다", () => {
    const raw = [hp, evade, off];
    const result = applyStatRowsDiff(raw, [
      { row: "hp", field: "vit", from: 3000, to: 3500 },
      { row: "evade", field: "half", from: 250, to: 200 },
      { row: "evade", field: "cap", from: 850, to: 1200 },
      { row: "evade", field: "base", from: 0, to: 1 },
      { row: "hp", field: "str", from: 1400, to: 1600 },
      { row: "old_row", field: "str", from: 1500, to: 1 },
      { row: "gone", field: "str", from: 0, to: 1 },
    ]);
    expect(result.applied).toEqual([
      { row: "hp", field: "vit", from: 3000, to: 3500 },
      { row: "evade", field: "half", from: 250, to: 200 },
    ]);
    expect(result.skipped).toEqual([
      { row: "evade", field: "cap", reason: "out_of_range", current: 850 },
      { row: "evade", field: "base", reason: "unknown" },
      { row: "hp", field: "str", reason: "stale", current: 1500 },
      { row: "old_row", field: "str", reason: "unknown", current: 1500 },
      { row: "gone", field: "str", reason: "unknown" },
    ]);
    expect(result.entries[0]).toEqual({ ...hp, weights: [1500, 1000, 1500, 3500, 1000, 1200] });
    expect(result.entries[1]).toEqual({ ...evade, halfConstant: 200 });
    expect(Object.keys(Object(result.entries[1]))).toEqual(Object.keys(evade));
    expect(hp.weights[3]).toBe(3000);
    const forced = applyStatRowsDiff(raw, [{ row: "hp", field: "str", from: 1400, to: 1600 }], {
      force: true,
    });
    expect(forced.applied).toEqual([{ row: "hp", field: "str", from: 1500, to: 1600 }]);
  });

  it("overlayStatRowsDiff: 팩 행 위에 얹고 없는 칸·어긋난 칸을 알린다", () => {
    const rows = [statRowEntrySchema.parse(hp), statRowEntrySchema.parse(evade)];
    const result = overlayStatRowsDiff(rows, [
      { row: "hp", field: "wis", from: 1200, to: 0 },
      { row: "evade", field: "cap", from: 800, to: 900 },
      { row: "hp", field: "cap", from: 0, to: 1 },
    ]);
    expect(result.rows[0]?.weights).toEqual([1500, 1000, 1500, 3000, 1000, 0]);
    expect(result.rows[1]?.shape === "probability" ? result.rows[1].cap : null).toBe(900);
    expect(result.stale).toEqual(["evade.cap"]);
    expect(result.unknown).toEqual(["hp.cap"]);
    expect(rows[0]?.weights[5]).toBe(1200);
  });
});
