import type { TuningEntryView } from "@terra/shared/tuning";
import { describe, expect, it } from "vitest";
import cellsJson from "./settingsCells.json";
import {
  ALL_FAMILIES,
  cellCounts,
  cellRows,
  deltaOf,
  familiesOf,
  filterEntries,
  formatDuration,
  formatGloss,
  groupEntries,
  parseSettingsCells,
  parseValueInput,
  pendingChanges,
  prunePending,
  rangePositions,
  stagedValue,
  tuningErrorOf,
} from "./tuningModel.ts";

const entry = (id: string, code: string, extra: Partial<TuningEntryView> = {}): TuningEntryView => ({
  id,
  code,
  name: { ko: `이름 ${id}`, en: `Name ${id}` },
  unit: null,
  min: null,
  max: null,
  structural: false,
  packValue: 10,
  value: 10,
  scope: "sim",
  override: null,
  ...extra,
});

const override = {
  value: 12,
  packValueAtSave: 10,
  contentVersionAtSave: "core@15",
  note: null,
  updatedBy: "dev",
  updatedAt: 1,
};

const ENTRIES = [
  entry("n9_a", "N9", { scope: "live" }),
  entry("c2_b", "C2", { value: 12, override }),
  entry("d130_c", ""),
  entry("n13_d", "N13"),
  entry("n9_e", "N9"),
  entry("x5_f", "Q5"),
];

describe("설정 칸 패널 거르기·무리", () => {
  it("무리는 49 차례(C 앞, N 뒤), 모르는 글자는 그 뒤, 코드 없음은 끝. 무리 안은 코드 번호 → 팩 차례", () => {
    expect(familiesOf(ENTRIES)).toEqual(["C", "N", "Q", ""]);
    expect(groupEntries(ENTRIES).map((group) => [group.family, group.entries.map((e) => e.id)])).toEqual([
      ["C", ["c2_b"]],
      ["N", ["n9_a", "n9_e", "n13_d"]],
      ["Q", ["x5_f"]],
      ["", ["d130_c"]],
    ]);
  });

  it("찾기(코드·ID·이름 ko/en, 대소문자 무시)·바꾼 것(덮어쓰기·담음)·서버 즉시·무리", () => {
    const all = { text: "", filter: "all", family: ALL_FAMILIES } as const;
    expect(filterEntries(ENTRIES, { ...all, text: "n13" }, new Map()).map((e) => e.id)).toEqual(["n13_d"]);
    expect(filterEntries(ENTRIES, { ...all, text: "NAME D130" }, new Map()).map((e) => e.id)).toEqual([
      "d130_c",
    ]);
    expect(
      filterEntries(ENTRIES, { ...all, filter: "changed" }, new Map([["n9_e", 3]])).map((e) => e.id),
    ).toEqual(["c2_b", "n9_e"]);
    expect(filterEntries(ENTRIES, { ...all, filter: "live" }, new Map()).map((e) => e.id)).toEqual(["n9_a"]);
    expect(filterEntries(ENTRIES, { ...all, family: "" }, new Map()).map((e) => e.id)).toEqual(["d130_c"]);
  });
});

describe("값", () => {
  it("값 입력: 쉼표·밑줄·빈칸을 빼고 정수만, ±10¹² 밖은 null", () => {
    expect(parseValueInput(" 1,800,000 ")).toBe(1_800_000);
    expect(parseValueInput("-20")).toBe(-20);
    expect(parseValueInput("1_000")).toBe(1000);
    expect(parseValueInput("1.5")).toBeNull();
    expect(parseValueInput("")).toBeNull();
    expect(parseValueInput("1e3")).toBeNull();
    expect(parseValueInput("2000000000000")).toBeNull();
  });

  it("담은 값(되돌리기 = 팩 값), 차이·비율, 범위 막대 자리", () => {
    const c2 = ENTRIES[1];
    if (!c2) throw new Error("entry");
    expect(stagedValue(c2, new Map())).toBe(12);
    expect(stagedValue(c2, new Map([["c2_b", null]]))).toBe(10);
    expect(stagedValue(c2, new Map([["c2_b", 30]]))).toBe(30);
    expect(deltaOf(12, 10)).toEqual({ diff: 2, percent: 20 });
    expect(deltaOf(5, 0)).toEqual({ diff: 5, percent: null });
    expect(rangePositions({ min: 0, max: 100, packValue: 25 }, 150)).toEqual({ pack: 25, now: 100 });
    expect(rangePositions({ min: 0, max: null, packValue: 25 }, 30)).toBeNull();
  });

  it("값 풀이: ms는 큰 단위 둘까지, ‰·만분율·%는 퍼센트, 나머지는 없음", () => {
    expect(formatDuration(604_800_000, "en")).toBe("7 days");
    expect(formatDuration(5_400_000, "en")).toBe("1 hr 30 min");
    expect(formatDuration(500, "en")).toBe("500 ms");
    expect(formatDuration(0, "en")).toBe("0 ms");
    expect(formatGloss(700, "pm", "en")).toBe("70%");
    expect(formatGloss(5000, "bp", "en")).toBe("50%");
    expect(formatGloss(30, "pct", "en")).toBe("30%");
    expect(formatGloss(30, "cells", "en")).toBeNull();
    expect(formatGloss(600_000, "ms", "ko")).toBe("10분");
  });

  it("담은 변경 → 묶음(넣은 차례), 새 목록에서 바뀔 것이 없어진 칸은 뺀다", () => {
    const pending = new Map<string, number | null>([
      ["c2_b", null],
      ["n9_a", 10],
      ["gone", 1],
      ["n9_e", 20],
    ]);
    expect(pendingChanges(pending)).toEqual([
      { id: "c2_b", value: null },
      { id: "n9_a", value: 10 },
      { id: "gone", value: 1 },
      { id: "n9_e", value: 20 },
    ]);
    expect([...prunePending(pending, ENTRIES)]).toEqual([
      ["c2_b", null],
      ["n9_e", 20],
    ]);
  });
});

describe("서버 오류", () => {
  it("data.reason이 패널 까닭이면 그것, 규칙 문제는 data.details, 그 밖은 코드로", () => {
    expect(
      tuningErrorOf({
        data: { code: "BAD_REQUEST", reason: "rules_conflict", details: ["n9_fit", "bogus"] },
      }),
    ).toEqual({ key: "rules_conflict", problems: ["n9_fit"], sessionEnded: false });
    expect(tuningErrorOf({ data: { code: "CONFLICT", reason: "revision_conflict" } }).key).toBe(
      "revision_conflict",
    );
    expect(tuningErrorOf({ data: { code: "UNAUTHORIZED" } })).toMatchObject({
      key: "unauthorized",
      sessionEnded: true,
    });
    expect(tuningErrorOf({ data: { code: "FORBIDDEN", reason: "cross_origin" } }).key).toBe("forbidden");
    expect(tuningErrorOf({ data: { code: "NOT_FOUND" } }).key).toBe("unavailable");
    expect(tuningErrorOf(new Error("offline")).key).toBe("network");
  });
});

describe("49 칸 목록(D-462)", () => {
  it("저장소 JSON을 읽고, 팩에 그 코드가 있으면 연결됨·없으면 출발값 없음 = 값 없음·있음 = 연결 없음", () => {
    const cells = parseSettingsCells(cellsJson);
    expect(cells.length).toBeGreaterThan(200);
    const rows = cellRows(cells, [entry("n9_a", "N9"), entry("n9_e", "N9"), entry("t4_x", "T4")]);
    const byCode = new Map(rows.map((row) => [row.cell.code, row]));
    expect(byCode.get("N9")).toMatchObject({ status: "connected", ids: ["n9_a", "n9_e"] });
    expect(byCode.get("T4")?.status).toBe("connected");
    // T6 부상 자연 회복 시간: 49에 출발값이 없다
    expect(byCode.get("T6")?.status).toBe("no_value");
    // T1 낮·밤 주기: 출발값은 있지만 팩 칸이 없다
    expect(byCode.get("T1")?.status).toBe("not_connected");
    const counts = cellCounts(rows);
    expect(counts.connected).toBe(2);
    expect(counts.connected + counts.no_value + counts.not_connected).toBe(counts.total);
    expect(parseSettingsCells({ cells: [{ code: "T1" }, null] })).toEqual([]);
  });
});
