// 기준 유닛 프리셋 고르기 시험 — docs/adr/2026-11-01-balance-screen.md "바뀜 (D-467)".
// 팩 씨앗 + DB 줄 겹치기(고침·만듦), 가장 나중에 바꾼 것이 이김(팩이 바뀌면 팩), 맞지 않는 줄은 쓰지 않음(모르는 무기·상한 밖·틀린 모양),
// 팩 프리셋 읽기(맨손·무기 사양이 없는 아이템), 화면에서 만든 프리셋 ID.
import { loadContentPack } from "@terra/content/node";
import { BALANCE_CUSTOM_PRESET_ID, type BalancePresetValues } from "@terra/shared/balance";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { balancePresetsOf } from "../world/combatCatalog.ts";
import { BALANCE_DEFAULTS } from "./services.ts";
import {
  type PackPreset,
  type PresetRecord,
  newCustomPresetId,
  packPresetsOf,
  presetJson,
  resolvePresets,
} from "./presets.ts";

const flat = (value: number) => ({ str: value, vit: value, int: value, wis: value, dex: value, agi: value });
const values = (extra: Partial<BalancePresetValues> = {}): BalancePresetValues => ({
  name: { ko: "새 사이보그", en: "New cyborg" },
  primaries: flat(10),
  weapon: "unarmed",
  count: 1,
  runs: 10,
  limitSec: 120,
  ...extra,
});
const PACK: readonly PackPreset[] = [
  { id: "new_cyborg", values: values() },
  {
    id: "lv30_combat",
    values: values({
      name: { ko: "Lv 30 전투형", en: "Lv 30 combat" },
      primaries: flat(40),
      weapon: "test_sword",
    }),
  },
];
const WEAPONS = new Set(["unarmed", "test_sword"]);

const record = (
  id: string,
  data: unknown,
  packEntry: unknown,
  extra: Partial<PresetRecord> = {},
): PresetRecord => ({
  id,
  data,
  packEntry,
  contentVersion: "core@19",
  version: 1,
  updatedById: null,
  updatedByName: "dev",
  updatedAtMs: 5,
  createdAtMs: 5,
  ...extra,
});

describe("프리셋 고르기(resolvePresets)", () => {
  it("DB 줄이 없으면 팩 프리셋 그대로(팩 차례, 판 0)", () => {
    const { list, kept, packWon, dropped } = resolvePresets(PACK, [], WEAPONS);
    expect(list.map((preset) => [preset.id, preset.source, preset.version, preset.updatedBy])).toEqual([
      ["new_cyborg", "pack", 0, null],
      ["lv30_combat", "pack", 0, null],
    ]);
    expect([kept, packWon, dropped]).toEqual([[], [], []]);
  });

  it("팩 프리셋을 고친 줄(저장 때 팩 항목 = 지금 팩)은 그 값으로, 화면에서 만든 것은 뒤에 만든 차례로", () => {
    const edited = values({ name: { ko: "고친 이름", en: "Edited" }, primaries: flat(12) });
    const rows = [
      record("dev_00000000000b", values({ name: { ko: "둘째", en: "Second" } }), null, { createdAtMs: 9 }),
      record("new_cyborg", edited, PACK[0]?.values, { version: 3 }),
      record("dev_00000000000a", values({ name: { ko: "첫째", en: "First" } }), null, { createdAtMs: 7 }),
    ];
    const { list, kept } = resolvePresets(PACK, rows, WEAPONS);
    expect(list.map((preset) => [preset.id, preset.source, preset.version, preset.name.ko])).toEqual([
      ["new_cyborg", "edited", 3, "고친 이름"],
      ["lv30_combat", "pack", 0, "Lv 30 전투형"],
      ["dev_00000000000a", "custom", 1, "첫째"],
      ["dev_00000000000b", "custom", 1, "둘째"],
    ]);
    expect(list[0]?.primaries).toEqual(flat(12));
    expect(kept).toHaveLength(3);
  });

  it("가장 나중에 바꾼 것이 이긴다: 저장 뒤 팩 항목이 바뀌었거나 팩에서 빠졌으면 팩이 이긴다(키 차례는 상관없다)", () => {
    const oldPack = values({ primaries: flat(9) });
    // jsonb를 거치면 키 차례가 바뀐다 — 같은 값이면 같은 항목으로 본다
    const reordered = JSON.parse(
      JSON.stringify({
        limitSec: 120,
        runs: 10,
        count: 1,
        weapon: "unarmed",
        primaries: flat(10),
        name: values().name,
      }),
    );
    const rows = [
      record("new_cyborg", values({ primaries: flat(20) }), oldPack),
      record("lv30_combat", values({ primaries: flat(41), weapon: "test_sword" }), {
        ...PACK[1]?.values,
        runs: 20,
      }),
      record("gone_preset", values(), values()),
    ];
    const { list, packWon } = resolvePresets(PACK, rows, WEAPONS);
    expect(list.map((preset) => preset.source)).toEqual(["pack", "pack"]);
    expect(packWon.map((row) => row.id)).toEqual(["new_cyborg", "lv30_combat", "gone_preset"]);
    const same = resolvePresets(
      PACK,
      [record("new_cyborg", values({ primaries: flat(20) }), reordered)],
      WEAPONS,
    );
    expect(same.list[0]?.source).toBe("edited");
  });

  it("값이 지금 규칙에 맞지 않는 줄은 쓰지 않는다(모르는 무기·상한 밖·틀린 모양·만든 것이 아닌데 팩 항목이 없음)", () => {
    const rows = [
      record("dev_00000000000a", values({ weapon: "removed_axe" }), null),
      record("dev_00000000000b", values({ runs: 40, limitSec: 120 }), null),
      record("dev_00000000000c", { name: "oops" }, null),
      record("lv30_combat", values({ count: 9 }), PACK[1]?.values),
      record("stray_id", values(), null),
    ];
    const { list, dropped } = resolvePresets(PACK, rows, WEAPONS);
    expect(list.map((preset) => preset.source)).toEqual(["pack", "pack"]);
    expect(dropped.map(({ row, reason }) => [row.id, reason])).toEqual([
      ["dev_00000000000a", "unknown_weapon"],
      ["dev_00000000000b", "invalid"],
      ["dev_00000000000c", "invalid"],
      ["lv30_combat", "invalid"],
      ["stray_id", "invalid"],
    ]);
  });

  it("같은 값이면 같은 정규 글(presetJson): 키 차례·이름 앞뒤 빈칸과 상관없다", () => {
    expect(presetJson(values())).toBe(presetJson(JSON.parse(JSON.stringify(values()))));
    expect(presetJson(null)).toBe("null");
  });
});

describe("팩 프리셋(packPresetsOf)", () => {
  it("저장소 팩: 새 사이보그(= 기본 기준 유닛)·Lv 30 전투형·Lv 30 기술형(셋 다 맨손)", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const { presets, skipped } = packPresetsOf(
      balancePresetsOf(loaded.source),
      new Set(["unarmed", "test_sword", "test_staff"]),
    );
    expect(skipped).toEqual([]);
    expect(presets.map((preset) => [preset.id, preset.values.weapon])).toEqual([
      ["new_cyborg", "unarmed"],
      ["lv30_combat", "unarmed"],
      ["lv30_tech", "unarmed"],
    ]);
    const fresh = presets[0]?.values;
    // 새 사이보그 프리셋 = 기본 기준 유닛(D-467 228 가)
    expect(fresh && { ...fresh, name: undefined }).toEqual({
      name: undefined,
      primaries: BALANCE_DEFAULTS.primaries,
      weapon: BALANCE_DEFAULTS.weapon,
      count: BALANCE_DEFAULTS.count,
      runs: BALANCE_DEFAULTS.runs,
      limitSec: BALANCE_DEFAULTS.limitSec,
    });
    // Lv 30: 성향 평균 14·8 × 성장(100‰ × K 1000‰ × 29) = 3.9배 내림
    expect(presets[1]?.values.primaries).toEqual({ str: 54, vit: 54, int: 31, wis: 31, dex: 31, agi: 31 });
    expect(presets[2]?.values.primaries).toEqual({ str: 31, vit: 31, int: 54, wis: 31, dex: 54, agi: 31 });
  });

  it("무기 사양이 없는 아이템을 가리키면 그 프리셋은 빼고 알린다(시작을 막지 않는다)", () => {
    const entry = {
      id: "odd",
      name: { ko: "이상함", en: "Odd" },
      primaries: flat(10),
      weapon: { id: "iron_ore" },
      count: 1,
      runs: 10,
      limitSec: 120,
    };
    const { presets, skipped } = packPresetsOf([entry], WEAPONS);
    expect(presets).toEqual([]);
    expect(skipped).toEqual([{ id: "odd", reason: "unknown_weapon" }]);
  });
});

describe("화면에서 만든 프리셋 ID", () => {
  it("dev_ + 16진 12자, 팩 ID 모양과도 맞는다", () => {
    const id = newCustomPresetId();
    expect(id).toMatch(BALANCE_CUSTOM_PRESET_ID);
    expect(id).toMatch(/^[a-z][a-z0-9_]{1,47}$/);
    expect(newCustomPresetId()).not.toBe(id);
  });
});
