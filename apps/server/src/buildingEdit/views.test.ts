// 건물 편집기 화면 자료 시험 — 화면 JSON이 팩 줄과 똑같고(칸을 잃으면 저장이 칸을 지운다), 공용 상수가 팩 스키마와 같다.
// docs/adr/2026-11-02-building-editor.md
import {
  FACILITY_STAGES,
  GATHER_MODES,
  PRIMARY_STAT_CODES,
  facilityEntrySchema,
  gatherTierEntrySchema,
  readCategoryFile,
} from "@terra/content";
import {
  FACILITY_BUILD_LIMITS,
  FACILITY_LEVEL_MAX,
  FACILITY_LIMITS,
  FACILITY_STAGE_IDS,
  FACILITY_STAT_IDS,
  GATHER_MODE_IDS,
  buildCostAt,
} from "@terra/shared/buildingEditor";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { facilityJsonOf, facilityViews, gatherBandViews, gatherTierJsonOf } from "./views.ts";

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

const base = {
  id: "farm",
  name: { ko: "농장", en: "Farm" },
  stage: "gather",
  slotsPerLevel: 10,
};
const ok = (extra: Record<string, unknown>) => facilityEntrySchema.safeParse({ ...base, ...extra }).success;

describe("건물 편집기 화면 자료", () => {
  it("팩 시설·채집 티어 확률표마다 화면 JSON = 팩 파일 한 줄(빠지는 칸이 없다)", () => {
    const raw = readCategoryFile(loaded.source, "facilities").entries;
    expect(raw.length).toBeGreaterThanOrEqual(8);
    for (const line of raw) expect(facilityJsonOf(facilityEntrySchema.parse(line))).toEqual(line);
    const rawBands = readCategoryFile(loaded.source, "gather_tiers").entries;
    // 표 하나 14줄(기획 D-552 "표 하나")
    expect(rawBands).toHaveLength(14);
    for (const line of rawBands) expect(gatherTierJsonOf(gatherTierEntrySchema.parse(line))).toEqual(line);
    const state = createContentEditState(loaded.source);
    const bands = gatherBandViews(state, state.snapshot());
    expect(bands).toHaveLength(14);
    expect(bands[0]?.entry.id).toBe("band_000");
    expect(bands.every((band) => !("ladder" in band.entry))).toBe(true);
    expect(bands[0]?.origin).toBe("pack");
  });

  it("목록 줄: 실효·팩 항목·해시·이 시설 레시피", () => {
    const state = createContentEditState(loaded.source);
    const views = facilityViews(state, state.snapshot(), []);
    const smelter = views.find((view) => view.entry.id === "smelter");
    expect(smelter?.origin).toBe("pack");
    expect(smelter?.hash).toBe(state.hashOf("facilities", "smelter"));
    // 제련소(T3, Lv1 합 16, mulPm 1000): Lv2(L²=4) 벽돌 40·판자 24, Lv4(L²=16) 벽돌 128·판자 64·철 주괴 64
    if (smelter?.entry.build) {
      expect(buildCostAt(smelter.entry.build, 2)).toEqual([
        { item: "brick", qty: 40 },
        { item: "plank", qty: 24 },
      ]);
      expect(buildCostAt(smelter.entry.build, 4)).toEqual([
        { item: "brick", qty: 128 },
        { item: "plank", qty: 64 },
        { item: "iron_ingot", qty: 64 },
      ]);
    }
  });

  it("공용 상수(코드 목록·범위)가 팩 스키마와 같다", () => {
    expect([...FACILITY_STAGE_IDS]).toEqual([...FACILITY_STAGES]);
    expect([...GATHER_MODE_IDS]).toEqual([...GATHER_MODES]);
    expect([...FACILITY_STAT_IDS]).toEqual([...PRIMARY_STAT_CODES]);
    const { slotsPerLevel, pollution } = FACILITY_LIMITS;
    expect(ok({ slotsPerLevel: slotsPerLevel.min })).toBe(true);
    expect(ok({ slotsPerLevel: slotsPerLevel.max })).toBe(true);
    expect(ok({ slotsPerLevel: slotsPerLevel.max + 1 })).toBe(false);
    expect(ok({ slotsPerLevel: slotsPerLevel.min - 1 })).toBe(false);
    expect(ok({ pollution: pollution.max })).toBe(true);
    expect(ok({ pollution: pollution.max + 1 })).toBe(false);
    expect(ok({ maxLevel: FACILITY_LEVEL_MAX })).toBe(true);
    expect(ok({ maxLevel: FACILITY_LEVEL_MAX + 1 })).toBe(false);
    const gather = (extra: Record<string, unknown>) =>
      ok({ gather: { primary: "str", secondary: "vit", subcategory: "ore", ...extra } });
    for (const key of ["yieldBase", "yieldPerStatPm", "yieldCap"] as const) {
      expect(gather({ [key]: FACILITY_LIMITS[key].min }), key).toBe(true);
      expect(gather({ [key]: FACILITY_LIMITS[key].max }), key).toBe(true);
      expect(gather({ [key]: FACILITY_LIMITS[key].max + 1 }), key).toBe(false);
      expect(gather({ [key]: FACILITY_LIMITS[key].min - 1 }), key).toBe(false);
    }
    const build = (mulPm: number, qty: number, bands = 1) =>
      ok({
        build: {
          mulPm,
          levels: Array.from({ length: bands }, (_, index) => ({
            from: index + 1,
            materials: [{ item: "stone", qty }],
          })),
        },
      });
    expect(build(FACILITY_BUILD_LIMITS.mulPm.max, FACILITY_BUILD_LIMITS.qty.max)).toBe(true);
    expect(build(FACILITY_BUILD_LIMITS.mulPm.max + 1, 1)).toBe(false);
    expect(build(800, FACILITY_BUILD_LIMITS.qty.max + 1)).toBe(false);
    expect(build(800, 0)).toBe(false);
    expect(build(800, 1, FACILITY_BUILD_LIMITS.levels)).toBe(true);
  });
});
