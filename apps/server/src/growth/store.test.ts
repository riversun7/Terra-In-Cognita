// 유닛 성장 저장소(docs/adr/2026-11-26-unit-growth.md) — 표 읽기, 몸 바탕(저장된 스탯 + 레벨 성장), 경험치·레벨 오르기, 쓰기 대기열 따라가기
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_GROWTH_K_PM, createUnitGrowth, registerUnitGrowth, unitGrowthOf } from "./store.ts";

type Listener = (table: string, row: Record<string, unknown>, removed: boolean) => void;

function rig(tables: {
  humans?: Record<string, unknown>[];
  cyborgUnits?: Record<string, unknown>[];
  exps?: Record<string, unknown>[];
}) {
  const writes: [string, Record<string, unknown>][] = [];
  const listeners: Listener[] = [];
  const pool = {
    query: (text: string) =>
      Promise.resolve({
        rows: text.includes("from world_humans")
          ? (tables.humans ?? [])
          : text.includes("from cyborg_units")
            ? (tables.cyborgUnits ?? [])
            : (tables.exps ?? []),
      }),
  };
  const writer = {
    upsert: (table: string, row: Record<string, unknown>) => {
      writes.push([table, row]);
      for (const listener of listeners) listener(table, row, false);
    },
    observe: (listener: Listener) => {
      listeners.push(listener);
    },
  };
  const store = createUnitGrowth({
    pool,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 표 이름을 글자로 받는 가짜 대기열
    writer: writer as unknown as Parameters<typeof createUnitGrowth>[0]["writer"],
    now: () => 5000,
    rules: () => TEST_SOCIETY_COEFFICIENTS,
  });
  const emit = (table: string, row: Record<string, unknown>, removed = false): void => {
    for (const listener of listeners) listener(table, row, removed);
  };
  return { store, writes, emit };
}

const human = (unitId: number, level = 1, extra: Record<string, unknown> = {}) => ({
  unit_id: unitId,
  level,
  rebirths: 0,
  stats: [12, 10, 8, 14, 10, 6],
  elements: null,
  k_pm: null,
  ...extra,
});

describe("유닛 성장 저장소", () => {
  it("표를 읽어 든다: 저장된 스탯이 있는 휴먼·사이보그 유닛만, 경험치는 unit_exp", async () => {
    const r = rig({
      humans: [human(1, 3)],
      cyborgUnits: [{ unit_id: 2, level: 1, stats: [20, 20, 20, 20, 20, 20], elements: null }],
      exps: [
        { unit_id: 1, exp: 40 },
        { unit_id: 99, exp: 7 },
      ],
    });
    await r.store.loaded;
    expect(r.store.size).toBe(2);
    expect(r.store.viewOf(1)).toEqual({ level: 3, exp: 40, span: 285 });
    expect(r.store.viewOf(2)).toEqual({ level: 1, exp: 0, span: 35 });
    expect(r.store.viewOf(99)).toBeUndefined();
    expect(r.store.baseOf(99)).toBeUndefined();
    const key = {};
    registerUnitGrowth(key, r.store);
    expect(unitGrowthOf(key)).toBe(r.store);
    expect(unitGrowthOf(undefined)).toBeUndefined();
  });

  it("몸 바탕 = 저장된 스탯(STR·DEX·AGI·VIT·INT·WIS) + 레벨. 성장 K가 없으면 기준 K, 있으면 그 값", async () => {
    const r = rig({ humans: [human(1, 5), human(2, 1, { k_pm: [800, 900, 1000, 1100, 1200, 1000] })] });
    await r.store.loaded;
    expect(r.store.baseOf(1)).toEqual({
      kind: "stats",
      unitKind: "human",
      primaries: { str: 12, dex: 10, agi: 8, vit: 14, int: 10, wis: 6 },
      kPm: {
        str: DEFAULT_GROWTH_K_PM,
        dex: DEFAULT_GROWTH_K_PM,
        agi: DEFAULT_GROWTH_K_PM,
        vit: DEFAULT_GROWTH_K_PM,
        int: DEFAULT_GROWTH_K_PM,
        wis: DEFAULT_GROWTH_K_PM,
      },
      level: 5,
      rebirths: 0,
      elements: null,
    });
    expect(r.store.baseOf(2)).toMatchObject({
      kPm: { str: 800, dex: 900, agi: 1000, vit: 1100, int: 1200, wis: 1000 },
    });
  });

  it("운영 조회 판: 처음 스탯·성장 K·레벨 성장을 센 지금 스탯, 구간 경험치(만렙이면 0)", async () => {
    const r = rig({
      humans: [human(1, 5), human(2, 1, { k_pm: [800, 900, 1000, 1100, 1200, 1000] })],
      exps: [{ unit_id: 1, exp: 9 }],
    });
    await r.store.loaded;
    const growthPm = TEST_SOCIETY_COEFFICIENTS.cyborg.growthPm;
    const sheet = r.store.sheetOf(1);
    expect(sheet).toMatchObject({
      kind: "human",
      level: 5,
      exp: 9,
      rebirths: 0,
      initial: [12, 10, 8, 14, 10, 6],
      kPm: null,
    });
    // 기준 K(1000‰): 처음 스탯 × (1 + 성장률 × (레벨 − 1))
    expect(sheet?.stats).toEqual(
      [12, 10, 8, 14, 10, 6].map((value) => Math.floor((value * (1000 + growthPm * 4)) / 1000)),
    );
    expect(sheet?.stats).toEqual(r.store.grownOf([12, 10, 8, 14, 10, 6], null, 5));
    // 레벨 1은 처음 스탯 그대로, 저장된 K는 그대로 보인다
    expect(r.store.sheetOf(2)).toMatchObject({
      level: 1,
      stats: [12, 10, 8, 14, 10, 6],
      kPm: [800, 900, 1000, 1100, 1200, 1000],
    });
    expect(r.store.sheetOf(99)).toBeUndefined();
    expect(r.store.spanAt(1)).toBe(35);
    expect(r.store.spanAt(TEST_SOCIETY_COEFFICIENTS.cyborg.maxLevel)).toBe(0);
  });

  it("경험치를 더하면 구간을 넘을 때 레벨이 오르고, 레벨·경험치를 따로 쓴다", async () => {
    const r = rig({
      humans: [human(1)],
      cyborgUnits: [{ unit_id: 2, level: 1, stats: [20, 20, 20, 20, 20, 20], elements: null }],
    });
    await r.store.loaded;
    // Lv1 → 2 = 35, Lv2 → 3 = 132
    expect(r.store.gain(1, 30)).toEqual({ level: 1, exp: 30, gainedLevels: 0 });
    expect(r.writes).toEqual([["unitExp", { unit_id: 1, exp: 30, updated_at_ms: 5000 }]]);
    expect(r.store.gain(1, 10)).toEqual({ level: 2, exp: 5, gainedLevels: 1 });
    expect(r.writes.slice(1)).toEqual([
      ["humanLevel", { unit_id: 1, level: 2 }],
      ["unitExp", { unit_id: 1, exp: 5, updated_at_ms: 5000 }],
    ]);
    expect(r.store.baseOf(1)).toMatchObject({ level: 2 });
    // 사이보그 유닛은 자기 표의 레벨 칸
    expect(r.store.gain(2, 35)).toEqual({ level: 2, exp: 0, gainedLevels: 1 });
    expect(r.writes.at(-2)).toEqual(["cyborgUnitLevel", { unit_id: 2, level: 2 }]);
    // 0·거울에 없는 유닛
    expect(r.store.gain(1, 0)).toEqual({ level: 2, exp: 5, gainedLevels: 0 });
    expect(r.store.gain(99, 10)).toBeUndefined();
  });

  it("쓰기 대기열을 따라간다: 구인(휴먼 줄), 환생 K, 융합(휴먼 줄 지움 + 사이보그 유닛 줄), 유닛 지움", async () => {
    const r = rig({});
    await r.store.loaded;
    // 휴먼 줄 쓰기(humans 행)는 성장 K 칸을 쓰지 않는다
    const { k_pm: _unused, ...written } = human(7);
    // 구인: 스탯이 있는 휴먼 줄이 생긴다. 스탯 없는 휴먼(NPC 처음 휴먼)은 두지 않는다
    r.emit("humans", written);
    r.emit("humans", { unit_id: 8, level: 1, rebirths: 0, stats: null, elements: null });
    expect(r.store.viewOf(7)).toEqual({ level: 1, exp: 0, span: 35 });
    expect(r.store.viewOf(8)).toBeUndefined();
    r.store.gain(7, 20);
    // 환생 어드밴티지 K
    r.emit("humanGrowth", { unit_id: 7, k_pm: [1100, 1000, 1000, 1000, 1000, 1000] });
    expect(r.store.baseOf(7)).toMatchObject({ kPm: { str: 1100 } });
    // 같은 레벨의 휴먼 줄 다시 쓰기는 경험치·K를 지킨다
    r.emit("humans", written);
    expect(r.store.viewOf(7)).toMatchObject({ exp: 20 });
    expect(r.store.baseOf(7)).toMatchObject({ kPm: { str: 1100 } });
    // 융합: 휴먼 줄을 지우고 사이보그 유닛 줄을 쓴다(경험치 0부터)
    r.emit("humans", { unit_id: 7 }, true);
    expect(r.store.viewOf(7)).toBeUndefined();
    r.emit("cyborgUnits", { unit_id: 7, level: 1, stats: [30, 30, 30, 30, 30, 30], elements: null });
    expect(r.store.baseOf(7)).toMatchObject({ unitKind: "cyborg", primaries: { str: 30 } });
    expect(r.store.viewOf(7)).toMatchObject({ level: 1, exp: 0 });
    // 유닛이 지워지면 거울에서도 빠진다
    r.emit("units", { id: 7 }, true);
    expect(r.store.viewOf(7)).toBeUndefined();
  });
});
