// 설정 칸 실효 값 접근자 시험 — docs/adr/2026-11-01-dev-settings-panel.md 5·6·7절·"꼬임 점검". 저장소 팩을 서버 시작과 같은 길로 읽는다.
import { loadContentPack } from "@terra/content/node";
import { type StatRow, TEST_STAT_TABLE, TUNING_KEYS, societyCoefficientsFrom } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { SERVER_LIVE_PATHS, tuningScopeOf } from "./scope.ts";
import { type TuningOverrideRecord, createTuningState } from "./state.ts";

function packEntries() {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  return tuningEntriesOf(loaded.source);
}

/** 팩 값만 얹은 계수표(덮어쓰기 없음) */
const packSociety = () =>
  societyCoefficientsFrom(new Map(packEntries().map((entry) => [entry.id, entry.value])));

const record = (
  id: string,
  value: number,
  packValue: number,
  updatedAtMs = 1,
  unit: string | null = null,
): TuningOverrideRecord => ({
  id,
  value,
  packValue,
  unit,
  contentVersion: "core@15",
  note: null,
  updatedById: null,
  updatedByName: null,
  updatedAtMs,
});

describe("설정 칸 실효 값", () => {
  it("덮어쓰기가 없으면 팩 값 그대로, 팩 값에는 여러 칸 규칙 문제가 없다", () => {
    const state = createTuningState(packEntries());
    expect(state.society()).toEqual(packSociety());
    expect(state.appliedCount()).toBe(0);
    expect(state.problems()).toEqual([]);
  });

  it("install은 스냅숏을 한 번에 바꿔 끼운다: 받아 둔 스냅숏·계수표는 그대로, 다음 읽기부터 새 값(판이 바뀌면 계수표를 새로 만든다)", () => {
    const state = createTuningState(packEntries());
    const before = state.snapshot();
    const beforeSociety = state.society();
    state.install([record("n39_grant_base", 90, 72, 1, "minor"), record("s26_rebellion", 30, 40)], 7);
    const after = state.snapshot();
    expect(after.revision).toBe(7);
    expect(state.society().cyborg.grantBase).toBe(90);
    expect(state.society().rebellionThreshold).toBe(30);
    expect(state.society()).toBe(state.society());
    expect(before.values.get("n39_grant_base")).toBe(72);
    expect(beforeSociety.cyborg.grantBase).toBe(72);
    // 팩에 없는 ID는 넣지 않는다
    state.install([record("gone_entry", 1, 0)], 8);
    expect(state.appliedCount()).toBe(0);
    expect(state.society()).toEqual(packSociety());
  });

  it("plan: 묶음을 바꾼 뒤의 전체 값으로 본다. 함께 바꾸면 되는 칸(N9 합·칸 최대)은 한 묶음으로 받는다", () => {
    const state = createTuningState(packEntries());
    // 합 150만 바꾸면 칸 최대 20 × 6 = 120 < 150 → 문제
    expect(state.plan([{ id: "n9_initial_sum", value: 150 }])).toEqual({
      ok: false,
      reason: "rules_conflict",
      id: null,
      problems: ["n9_fit"],
    });
    // 칸 최대 30과 함께면 맞다
    expect(
      state.plan([
        { id: "n9_initial_sum", value: 150 },
        { id: "n9_initial_max", value: 30 },
      ]),
    ).toEqual({
      ok: true,
      changes: [
        { id: "n9_initial_sum", before: null, after: 150 },
        { id: "n9_initial_max", before: null, after: 30 },
      ],
    });
    // plan은 메모리를 바꾸지 않는다
    expect(state.values().get("n9_initial_sum")).toBe(60);
  });

  it("plan 거절: 팩에 없는 ID, 범위 밖, 같은 칸 두 번. 팩 값·null은 되돌리기, 같은 값은 빠진다", () => {
    const state = createTuningState(packEntries());
    expect(state.plan([{ id: "nope_id", value: 1 }])).toMatchObject({ ok: false, reason: "unknown_entry" });
    expect(state.plan([{ id: "n39_grant_base", value: -1 }])).toMatchObject({
      ok: false,
      reason: "out_of_range",
      id: "n39_grant_base",
    });
    expect(
      state.plan([
        { id: "n39_grant_base", value: 80 },
        { id: "n39_grant_base", value: 90 },
      ]),
    ).toMatchObject({ ok: false, reason: "duplicate_entry" });
    state.install([record("n39_grant_base", 90, 72, 1, "minor"), record("s26_rebellion", 30, 40)], 3);
    expect(
      state.plan([
        { id: "n39_grant_base", value: 72 },
        { id: "s26_rebellion", value: null },
        { id: "n6_k_min", value: null },
        { id: "nope_id", value: null },
        { id: "n38_living_unpaid", value: 700 },
      ]),
    ).toEqual({
      ok: true,
      changes: [
        { id: "n39_grant_base", before: 90, after: null },
        { id: "s26_rebellion", before: 30, after: null },
      ],
    });
  });

  it("되돌리기도 규칙 검사를 받는다(합 100·칸 최소 15에서 합만 되돌리면 60 < 90), 함께 되돌리면 된다", () => {
    const state = createTuningState(packEntries());
    state.install([record("n9_initial_sum", 100, 60), record("n9_initial_min", 15, 1)], 2);
    expect(state.plan([{ id: "n9_initial_sum", value: null }])).toMatchObject({
      ok: false,
      reason: "rules_conflict",
      problems: ["n9_fit"],
    });
    expect(
      state.plan([
        { id: "n9_initial_sum", value: null },
        { id: "n9_initial_min", value: null },
      ]),
    ).toMatchObject({ ok: true });
  });

  it("selectAtBoot: 가장 나중에 바꾼 것이 이긴다, 빠진 칸·단위·범위·규칙이 맞지 않으면 지운다(던지지 않는다)", () => {
    const state = createTuningState(packEntries());
    const selection = state.selectAtBoot([
      // 저장 때 팩 값 72 = 지금 팩 값 → 패널이 더 나중
      record("n39_grant_base", 90, 72, 1, "minor"),
      // 저장 때 팩 값 30 ≠ 지금 40 → 저장 뒤 배포가 바꿈 → 팩이 이김
      record("s26_rebellion", 25, 30, 2, "points"),
      // 팩 값과 같은 덮어쓰기 → 팩 값
      record("n38_living_unpaid", 700, 700, 3, "pm"),
      record("gone_entry", 5, 1, 4),
      // 저장 때 단위가 달랐다
      record("n39_grant_step", 60, 50, 5, "count"),
      // 지금 범위 밖
      record("n39_grant_max", 99_999, 1500, 6, "pm"),
      // 합 100은 맞고, 그 뒤 칸 최대 15(90 < 100)는 맞지 않는다
      record("n9_initial_sum", 100, 60, 7, "points"),
      record("n9_initial_max", 15, 20, 8, "points"),
    ]);
    expect(selection.keep.map((row) => row.id)).toEqual(["n39_grant_base", "n9_initial_sum"]);
    expect(selection.packWon.map(({ row, packValue }) => [row.id, packValue])).toEqual([
      ["s26_rebellion", 40],
      ["n38_living_unpaid", 700],
    ]);
    expect(selection.dropped.map(({ row, reason }) => [row.id, reason])).toEqual([
      ["gone_entry", "unknown_entry"],
      ["n39_grant_step", "unit_changed"],
      ["n39_grant_max", "out_of_range"],
      ["n9_initial_max", "rules_conflict"],
    ]);
    // 고르기만 하고 메모리는 그대로
    expect(state.appliedCount()).toBe(0);
  });
});

function packRows() {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  return statRowsOf(loaded.source);
}
const withRows = () => createTuningState(packEntries(), packRows());
const hpOf = (table: readonly StatRow[]) => table.find((row) => row.id === "hp");
const evadeOf = (table: readonly StatRow[]) => table.find((row) => row.id === "evade");

describe("가중치 표 칸 덮어쓰기(밸런스 화면, docs/adr/2026-11-01-balance-screen.md 1절·꼬임 점검)", () => {
  it("덮어쓰기가 없으면 팩 표 그대로(= sim 시험 표), 문제 없음. 키는 켜진 행·모양에 있는 칸만", () => {
    const state = withRows();
    expect(state.statTable()).toEqual(TEST_STAT_TABLE);
    expect(state.problems()).toEqual([]);
    expect(state.statCell("hp.vit")).toMatchObject({ field: "vit", packValue: 3000, unit: "pm" });
    expect(state.statCell("evade.half")).toMatchObject({ field: "half", packValue: 250, unit: "points" });
    // 양 모양에 cap 없음, 확률 모양에 base 없음, 없는 행
    expect(state.statCell("hp.cap")).toBeUndefined();
    expect(state.statCell("evade.base")).toBeUndefined();
    expect(state.statCell("gone_row.str")).toBeUndefined();
    expect(state.slot("n39_grant_base")?.packValue).toBe(72);
  });

  it("install은 표를 한 번에 바꿔 끼운다: 받아 둔 표는 그대로, 판마다 새 표(같은 판이면 같은 객체), 칸 수", () => {
    const state = withRows();
    const before = state.statTable();
    state.install([record("hp.vit", 4000, 3000, 1, "pm"), record("evade.cap", 900, 850, 1, "pm")], 3);
    const after = state.statTable();
    expect(after).not.toBe(before);
    expect(state.statTable()).toBe(after);
    expect(hpOf(after)?.weights[3]).toBe(4000);
    expect(evadeOf(after)).toMatchObject({ cap: 900, halfConstant: 250 });
    expect(hpOf(before)?.weights[3]).toBe(3000);
    expect(state.appliedCount()).toBe(2);
    expect(state.statOverrideCount()).toBe(2);
    expect(Object.isFrozen(after)).toBe(true);
  });

  it("plan: 없는 칸·모양에 없는 칸은 unknown_entry, 칸 범위 밖은 out_of_range, 가치 없는 1차를 만들면 rules_conflict", () => {
    const state = withRows();
    expect(state.plan([{ id: "hp.cap", value: 10 }])).toMatchObject({ ok: false, reason: "unknown_entry" });
    expect(state.plan([{ id: "nope.str", value: 10 }])).toMatchObject({ ok: false, reason: "unknown_entry" });
    expect(state.plan([{ id: "hp.str", value: 100_001 }])).toMatchObject({
      ok: false,
      reason: "out_of_range",
    });
    expect(state.plan([{ id: "evade.cap", value: 1001 }])).toMatchObject({
      ok: false,
      reason: "out_of_range",
    });
    expect(state.plan([{ id: "evade.half", value: 0 }])).toMatchObject({ ok: false, reason: "out_of_range" });
    // STR를 쓰는 행: hp·armor_hp·shield_hp·defense_rate·physical_attack·mp → 모두 0이면 STR는 가치 없는 1차
    const strRows = state.statTable().filter((row) => (row.weights[0] ?? 0) !== 0);
    const zeroStr = strRows.map((row) => ({ id: `${row.id}.str`, value: 0 }));
    expect(state.plan(zeroStr)).toEqual({
      ok: false,
      reason: "rules_conflict",
      id: null,
      problems: ["stat_primary_unused"],
    });
    // 하나만 남기면 받는다
    expect(state.plan(zeroStr.slice(1))).toMatchObject({ ok: true });
  });

  it("plan: 설정 칸과 섞은 묶음, 팩 값·null은 되돌리기(덮어쓰기 없는 칸은 할 일 없음)", () => {
    const state = withRows();
    const plan = state.plan([
      { id: "hp.vit", value: 3500 },
      { id: "n39_grant_base", value: 90 },
      { id: "evade.cap", value: 850 },
    ]);
    expect(plan).toEqual({
      ok: true,
      changes: [
        { id: "hp.vit", before: null, after: 3500 },
        { id: "n39_grant_base", before: null, after: 90 },
      ],
    });
    state.install([record("hp.vit", 3500, 3000, 1, "pm")], 1);
    expect(state.plan([{ id: "hp.vit", value: null }])).toEqual({
      ok: true,
      changes: [{ id: "hp.vit", before: 3500, after: null }],
    });
  });

  it("statTableWith: 미리 보기는 팩에 있고 범위 안인 칸만 얹고 지금 표는 그대로", () => {
    const state = withRows();
    const preview = state.statTableWith([
      { id: "hp.vit", value: 5000 },
      { id: "hp.str", value: 999_999 },
      { id: "nope.str", value: 1 },
      { id: "n39_grant_base", value: 90 },
    ]);
    expect(hpOf(preview)?.weights).toEqual([1500, 1000, 1500, 5000, 1000, 1200]);
    expect(hpOf(state.statTable())?.weights[3]).toBe(3000);
  });

  it("selectAtBoot: 팩 칸 값이 바뀌었으면 팩이 이김, 행이 빠졌거나 모양이 바뀐 칸은 unknown_entry, 범위 밖·가치 없는 1차는 지움", () => {
    const state = withRows();
    const strRows = state.statTable().filter((row) => (row.weights[0] ?? 0) !== 0);
    const selection = state.selectAtBoot([
      record("hp.vit", 3600, 3000, 1, "pm"),
      // 저장 뒤에 팩이 바꿈(저장 때 팩 값 150 ≠ 지금 200)
      record("shield_hp.dex", 400, 150, 2, "pm"),
      // 모양에 없는 칸(팩이 양 → 확률로 바꾼 경우와 같다)·없는 행
      record("hp.cap", 500, 600, 3, "pm"),
      record("old_row.str", 10, 0, 4, "pm"),
      // 단위가 다름
      record("evade.half", 300, 250, 5, "pm"),
      // 지금 범위 밖(DB에 남은 옛 값)
      record("evade.cap", 1500, 850, 6, "pm"),
      // 저장 차례로 얹다 STR가 모든 행에서 0이 되는 마지막 칸은 지운다
      ...strRows.map((row, index) => record(`${row.id}.str`, 0, row.weights[0] ?? 0, 10 + index, "pm")),
    ]);
    expect(selection.keep.map((row) => row.id)).toEqual([
      "hp.vit",
      ...strRows.slice(0, -1).map((row) => `${row.id}.str`),
    ]);
    expect(selection.packWon.map(({ row, packValue }) => [row.id, packValue])).toEqual([
      ["shield_hp.dex", 200],
    ]);
    expect(selection.dropped.map(({ row, reason }) => [row.id, reason])).toEqual([
      ["hp.cap", "unknown_entry"],
      ["old_row.str", "unknown_entry"],
      ["evade.half", "unit_changed"],
      ["evade.cap", "out_of_range"],
      [`${strRows.at(-1)?.id}.str`, "rules_conflict"],
    ]);
  });
});

describe("반영 범위(scope)", () => {
  it("서버가 읽는 경로는 모두 TUNING_KEYS에 있고, 팩 칸마다 live·sim·none 중 하나", () => {
    const paths = new Set(TUNING_KEYS.filter((key) => key.target === "society").map((key) => key.path));
    for (const path of SERVER_LIVE_PATHS) expect(paths, path).toContain(path);
    expect(tuningScopeOf("n39_grant_base")).toBe("live");
    expect(tuningScopeOf("s26_rebellion")).toBe("live");
    expect(tuningScopeOf("c19_loot")).toBe("sim");
    expect(tuningScopeOf("n37_light_dark")).toBe("sim");
    expect(tuningScopeOf("nope_id")).toBe("none");
    const live = packEntries().filter((entry) => tuningScopeOf(entry.id) === "live");
    expect(live).toHaveLength(SERVER_LIVE_PATHS.length);
    // 서버가 읽는 칸은 모두 기술 범위·단위가 있다(ADR 2절)
    for (const entry of live) {
      expect(entry.min, entry.id).toBeDefined();
      expect(entry.unit, entry.id).toBeDefined();
    }
  });
});
