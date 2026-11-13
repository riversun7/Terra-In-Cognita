import type { TuningEntryView } from "@terra/shared/tuning";
import { describe, expect, it } from "vitest";
import cellsJson from "./settingsCells.json";
import {
  ALL_PAGES,
  NO_UNIT,
  type Pending,
  type TuningQuery,
  TUNING_PAGE_TABS,
  canEditDurationInUnit,
  cellCounts,
  cellRows,
  checkDurationInput,
  checkValueInput,
  defaultDurationUnitOf,
  deltaOf,
  durationEditBounds,
  durationEditToMs,
  familiesOf,
  filterEntries,
  formatDuration,
  formatGloss,
  groupEntries,
  msToDurationEdit,
  openQuery,
  pageChangedCounts,
  pageCounts,
  parsePageTab,
  parseSettingsCells,
  parseValueInput,
  pendingChanges,
  preferredDurationUnit,
  prunePending,
  rangePositions,
  stagedValue,
  tuningErrorOf,
  unitsOf,
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
  page: "other",
  desc: null,
  source: null,
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
  entry("c2_b", "C2", { value: 12, override, page: "combat" }),
  entry("d130_c", "", { page: "society", source: "ADR 2026-10-31-faction-society-core · D-130" }),
  entry("n13_d", "N13", { desc: { ko: "반란이 일어나는 문턱", en: "Rebellion threshold" } }),
  entry("n9_e", "N9", { unit: "ms" }),
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

  it("찾기(코드·ID·이름·풀이·출처, 대소문자 무시, 낱말 모두)·바꾼 것만(덮어쓰기·담음)·반영 범위·단위·무리", () => {
    const all = openQuery(ALL_PAGES);
    const ids = (query: TuningQuery, pending: Pending = new Map()) =>
      filterEntries(ENTRIES, query, pending).map((e) => e.id);
    expect(ids({ ...all, text: "n13" })).toEqual(["n13_d"]);
    expect(ids({ ...all, text: "NAME D130" })).toEqual(["d130_c"]);
    expect(ids({ ...all, changedOnly: true }, new Map([["n9_e", 3]]))).toEqual(["c2_b", "n9_e"]);
    expect(ids({ ...all, scope: "live" })).toEqual(["n9_a"]);
    expect(ids({ ...all, scope: "sim", changedOnly: true })).toEqual(["c2_b"]);
    expect(ids({ ...all, family: "" })).toEqual(["d130_c"]);
    // 출처(ADR·결정 ID)로도 찾는다
    expect(ids({ ...all, text: "d-130" })).toEqual(["d130_c"]);
    // 풀이(ko·en)로도, 낱말 여럿이면 모두 맞아야 한다
    expect(ids({ ...all, text: "반란 문턱" })).toEqual(["n13_d"]);
    expect(ids({ ...all, text: "rebellion n13" })).toEqual(["n13_d"]);
    expect(ids({ ...all, text: "반란 c2" })).toEqual([]);
    // 단위: 그 단위만, NO_UNIT = 단위 없는 칸
    expect(ids({ ...all, unit: "ms" })).toEqual(["n9_e"]);
    expect(ids({ ...all, unit: NO_UNIT })).toHaveLength(5);
    expect(unitsOf(ENTRIES)).toEqual(["ms", NO_UNIT]);
    expect(unitsOf(ENTRIES.slice(4, 5))).toEqual(["ms"]);
  });

  it("분야마다 바뀐 칸 수(덮어쓰기 + 담음, 전체 포함)", () => {
    expect(pageChangedCounts(ENTRIES, new Map([["d130_c", 1]]))).toMatchObject({
      all: 2,
      combat: 1,
      society: 1,
      other: 0,
    });
  });

  it("분야 페이지: 탭 차례(전체 먼저), 탭마다 칸 수, 페이지 거르기, 저장 글 읽기", () => {
    expect(TUNING_PAGE_TABS).toEqual([
      "all",
      "society",
      "npc",
      "gardener",
      "holdings",
      "combat",
      "economy",
      "other",
    ]);
    expect(pageCounts(ENTRIES)).toEqual({
      all: 6,
      society: 1,
      npc: 0,
      gardener: 0,
      holdings: 0,
      combat: 1,
      economy: 0,
      other: 4,
    });
    expect(filterEntries(ENTRIES, openQuery("combat"), new Map()).map((e) => e.id)).toEqual(["c2_b"]);
    expect(filterEntries(ENTRIES, openQuery(ALL_PAGES), new Map())).toHaveLength(6);
    // 페이지 안에서도 다른 거르기가 함께 든다
    expect(
      filterEntries(ENTRIES, { ...openQuery("other"), scope: "live" }, new Map()).map((e) => e.id),
    ).toEqual(["n9_a"]);
    expect([parsePageTab("npc"), parsePageTab("all"), parsePageTab("nope"), parsePageTab(null)]).toEqual([
      "npc",
      "all",
      null,
      null,
    ]);
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

  it("줄 입력 검사: 같음·정수 아님·범위 밖(양 끝 포함)·담을 수 있음", () => {
    const range = { min: 0, max: 100 };
    expect(checkValueInput(range, "50", 50)).toEqual({ status: "same" });
    expect(checkValueInput(range, "5.5", 50)).toEqual({ status: "invalid" });
    expect(checkValueInput(range, "", 50)).toEqual({ status: "invalid" });
    expect(checkValueInput(range, "101", 50)).toEqual({ status: "out_of_range", value: 101 });
    expect(checkValueInput(range, "100", 50)).toEqual({ status: "ok", value: 100 });
    expect(checkValueInput({ min: null, max: null }, "-1,000", 0)).toEqual({ status: "ok", value: -1000 });
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

describe("시간(ms) 단위 편집 변환", () => {
  it("팩 기본값·상한으로 우선 단위를 고르고, 나누어떨어지지 않으면 가장 큰 나누어떨어지는 단위로 내린다", () => {
    // 60일 수명 → 시간
    const lifespan = { packValue: 5_184_000_000, min: 86_400_000, max: 315_360_000_000 };
    expect(preferredDurationUnit(lifespan)).toBe("hours");
    expect(defaultDurationUnitOf(lifespan, 5_184_000_000)).toBe("hours");
    // 1시간 30분(5,400,000 ms)은 hours로 나누어떨어지지 않아 minutes로 내려간다
    expect(defaultDurationUnitOf(lifespan, 5_400_000)).toBe("minutes");
    expect(canEditDurationInUnit(lifespan, 5_400_000, "hours")).toBe(false);
    expect(canEditDurationInUnit(lifespan, 5_400_000, "minutes")).toBe(true);
    // 0ms 기본값 + 720시간 상한 → hours, 0ms 기본값 + 60초 상한 → seconds
    expect(preferredDurationUnit({ packValue: 0, max: 2_592_000_000 })).toBe("hours");
    expect(preferredDurationUnit({ packValue: 0, max: 60_000 })).toBe("seconds");
    expect(preferredDurationUnit({ packValue: 600_000, max: 3_600_000 })).toBe("minutes");
    expect(preferredDurationUnit({ packValue: 2_000, max: 60_000 })).toBe("seconds");
  });

  it("단위 변환 시 범위는 ms 경계 안쪽으로 올림·내림하고, 입력 검사는 ms 정수로 돌려준다", () => {
    const dividend = { min: 60_000, max: 31_536_000_000 };
    expect(durationEditBounds(dividend, "hours")).toEqual({ min: 1, max: 8760 });
    expect(durationEditBounds(dividend, "minutes")).toEqual({ min: 1, max: 525_600 });
    expect(msToDurationEdit(5_184_000_000, "hours")).toBe(1440);
    expect(msToDurationEdit(5_400_000, "hours")).toBeNull();
    expect(durationEditToMs(1440, "hours")).toBe(5_184_000_000);
    expect(durationEditToMs(1_000_000_000, "hours")).toBeNull();

    expect(checkDurationInput(dividend, "24", 3_600_000, "hours")).toEqual({
      status: "ok",
      value: 86_400_000,
    });
    expect(checkDurationInput(dividend, "1", 3_600_000, "hours")).toEqual({ status: "same" });
    expect(checkDurationInput(dividend, "0", 3_600_000, "hours")).toEqual({
      status: "out_of_range",
      value: 0,
    });
    expect(checkDurationInput(dividend, "1.5", 3_600_000, "hours")).toEqual({ status: "invalid" });
  });
});
