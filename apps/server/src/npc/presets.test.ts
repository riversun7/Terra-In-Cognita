// 국가 프리셋 읽기·실효 목록 시험 — docs/adr/2026-11-10-nation-editor.md 2·5절. 값은 팩 자료와 시험용 가짜다.
import { type NationPresetEntry, nationPresetEntrySchema } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { START_WORLD_SEED } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { syncNationNames } from "../ranking/paths.ts";
import { nationEmblemOf, nationSeedOf } from "./nations.ts";
import { createLivePresets, nationPresetsFrom, nationPresetsOf } from "./presets.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.pack) throw new Error("content pack");
const pack = loaded.pack;
const entries: NationPresetEntry[] = (pack.entries.get("nation_presets") ?? []).map((raw) =>
  nationPresetEntrySchema.parse(JSON.parse(JSON.stringify(raw))),
);

const distinct = (values: readonly (string | undefined)[]): number => new Set(values).size;

describe("팩 국가 프리셋 자료(core)", () => {
  it("16개 모두 임시 이름이 아니고 한글 2~8자·영문 3~16자다(D-5046, D-076)", () => {
    expect(entries).toHaveLength(16);
    for (const entry of entries) {
      for (const name of [entry.name, entry.currency.name]) {
        expect(name.ko).not.toMatch(/임시/);
        expect(name.en).not.toMatch(/placeholder/i);
        expect(name.ko.length).toBeGreaterThanOrEqual(2);
        expect(name.ko.length).toBeLessThanOrEqual(8);
        expect(name.en.length).toBeGreaterThanOrEqual(3);
        expect(name.en.length).toBeLessThanOrEqual(16);
      }
      expect(entry.leaderName?.ko).not.toMatch(/임시/);
      expect(entry.leaderName?.en).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(entry.emblem).toBeDefined();
      expect(entry.nameStyle).toBeDefined();
      expect(entry.currency.symbol).toBeDefined();
      expect(entry.currency.ticker).toMatch(/^[A-Z]{3}$/);
      expect(entry.shortName).toMatch(/^[A-Z]{3}$/);
      expect(entry.cityNames?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(entry.humanNames?.given.length ?? 0).toBeGreaterThanOrEqual(8);
    }
  });

  it("ID·화폐 코드는 그대로다(팩 ID는 바꾸지 않는다)", () => {
    entries.forEach((entry, index) => {
      const n = String(index + 1).padStart(2, "0");
      expect(entry.id).toBe(`placeholder_nation_${n}`);
      expect(entry.currency.code).toBe(`placeholder_cur_${n}`);
    });
  });

  it("이름·약어·화폐 약어·기호·말씨·지도자가 국가마다 다르다", () => {
    expect(distinct(entries.map((entry) => entry.name.ko))).toBe(16);
    expect(distinct(entries.map((entry) => entry.name.en))).toBe(16);
    expect(distinct(entries.map((entry) => entry.shortName))).toBe(16);
    expect(distinct(entries.map((entry) => entry.currency.name.en))).toBe(16);
    expect(distinct(entries.map((entry) => entry.currency.ticker))).toBe(16);
    expect(distinct(entries.map((entry) => entry.currency.symbol))).toBe(16);
    expect(distinct(entries.map((entry) => entry.nameStyle))).toBe(16);
    expect(distinct(entries.map((entry) => entry.leaderName?.en))).toBe(16);
  });
});

describe("nationPresetsFrom", () => {
  it("팩 프리셋 16개를 코드·이름·화폐·마크 사양과 함께 읽는다", () => {
    const presets = nationPresetsOf(pack);
    expect(presets).toHaveLength(16);
    expect(presets[0]).toMatchObject({
      code: "placeholder_nation_01",
      name: { ko: "메리데일", en: "Meridale" },
      shortName: "MRD",
      emblem: { shape: "shield", division: "chief", charge: "star", scheme: 0 },
      currency: { code: "placeholder_cur_01", name: { ko: "올더", en: "Alder" }, ticker: "ALD" },
      leaderName: { en: "Jolan Harwell" },
    });
    expect(presets).toEqual(nationPresetsFrom(entries));
  });

  it("국가마다 씨앗 값 칸을 성격 칸에 옮기고, 없는 칸은 키째 없다", () => {
    const first = entries[0];
    if (!first) throw new Error("no entry");
    const edited: NationPresetEntry = {
      ...first,
      personality: { ...first.personality, startHousing: 60, startPopulationPm: 500, startFarms: 2 },
    };
    const [preset] = nationPresetsFrom([edited]);
    expect(preset?.personality).toMatchObject({ startHousing: 60, startPopulationPm: 500, startFarms: 2 });
    expect(Object.hasOwn(preset?.personality ?? {}, "startMines")).toBe(false);
    // 팩 그대로면 씨앗 칸이 없다
    expect(Object.hasOwn(nationPresetsFrom([first])[0]?.personality ?? {}, "startHousing")).toBe(false);
  });

  it("꺼진 프리셋은 뺀다", () => {
    const first = entries[0];
    if (!first) throw new Error("no entry");
    expect(nationPresetsFrom([{ ...first, enabled: false }])).toEqual([]);
  });
});

describe("nationSeedOf", () => {
  it("성격 칸이 없으면 설정 칸 값 그대로(같은 객체)", () => {
    expect(nationSeedOf(START_WORLD_SEED, undefined)).toBe(START_WORLD_SEED);
    expect(nationSeedOf(START_WORLD_SEED, { startCities: 3 })).toBe(START_WORLD_SEED);
  });

  it("있는 칸만 얹는다", () => {
    const seed = nationSeedOf(START_WORLD_SEED, {
      startHousing: 80,
      startPopulationPm: 250,
      startFarms: 3,
      startStorehouses: 0,
    });
    expect(seed).toMatchObject({
      startHousing: 80,
      populationPm: 250,
      farms: 3,
      storehouses: 0,
      lumberCamps: START_WORLD_SEED.lumberCamps,
      mines: START_WORLD_SEED.mines,
      startCitiesMin: START_WORLD_SEED.startCitiesMin,
    });
    expect(START_WORLD_SEED.startHousing).toBe(40);
  });
});

describe("createLivePresets", () => {
  it("같은 배열을 제자리에서 바꾼다(읽는 쪽 참조는 그대로)", () => {
    let source: readonly NationPresetEntry[] = entries;
    const live = createLivePresets(() => source);
    const list = live.list;
    expect(list).toHaveLength(16);
    expect(list[0]?.name.ko).toBe("메리데일");
    // 바뀌지 않았으면 그대로
    expect(live.sync()).toBe(false);
    const first = entries[0];
    if (!first) throw new Error("no entry");
    source = [{ ...first, name: { ko: "새 이름", en: "New name" } }, ...entries.slice(1)];
    expect(live.sync()).toBe(true);
    expect(live.list).toBe(list);
    expect(list[0]?.name.ko).toBe("새 이름");
    expect(list).toHaveLength(16);
  });
});

describe("실효 목록을 따르는 것들", () => {
  it("랭킹 판 세력 이름 표를 제자리에서 다시 채운다(국가 1 = 16번째 프리셋)", () => {
    const names = new Map<string, { ko: string; en: string }>([["old_code", { ko: "옛", en: "Old" }]]);
    syncNationNames(names, nationPresetsFrom(entries));
    expect(names.has("old_code")).toBe(false);
    expect(names.get("placeholder_nation_01")?.ko).toBe("메리데일");
    expect(names.get("s3_test_npc")?.ko).toBe("칼루누이");
  });

  it("세력 코드 → 국가 마크(사양·색·프리셋 ID). 시험 NPC 세력은 16번째 프리셋", () => {
    const presets = nationPresetsFrom(entries);
    expect(nationEmblemOf("placeholder_nation_02", presets)).toEqual({
      preset: "placeholder_nation_02",
      spec: { shape: "circle", division: "border", charge: "leaf", scheme: 1 },
      color: "#2980b9",
    });
    expect(nationEmblemOf("s3_test_npc", presets)?.preset).toBe("placeholder_nation_16");
    expect(nationEmblemOf("unknown_code", presets)).toBeUndefined();
    // 마크 칸이 없는 프리셋은 ID로 정해지는 기본 마크
    const first = presets[0];
    if (!first) throw new Error("no preset");
    const { emblem: _emblem, ...bare } = first;
    const fallback = nationEmblemOf(first.code, [bare]);
    expect(fallback?.spec).toEqual(nationEmblemOf(first.code, [bare])?.spec);
    expect(fallback?.spec.shape).toBeDefined();
  });
});
