// 사이보그 판 원자재별 채집 예상 시험(2026-11-12) — 팩 core 채집 시설 여섯·티어 구간으로 판정 함수(workerEffects·gatherBandIndex)와
// 같은 값이 나오는지, 최적 작업이 유닛 추천(recommendProduction)과 같은지, 컨디션이 상한으로 잘리는지.
import {
  facilityEntrySchema,
  gatherTierEntrySchema,
  itemSubcategoryEntrySchema,
  readCategoryFile,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { type GatherSheetSource, gatherSheetOf } from "./gatherSheet.ts";

function packSource(): GatherSheetSource {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  const source = loaded.source;
  return {
    facilities: readCategoryFile(source, "facilities").entries.map((raw) => facilityEntrySchema.parse(raw)),
    gatherTiers: readCategoryFile(source, "gather_tiers").entries.map((raw) =>
      gatherTierEntrySchema.parse(raw),
    ),
    itemSubcategories: readCategoryFile(source, "item_subcategories").entries.map((raw) =>
      itemSubcategoryEntrySchema.parse(raw),
    ),
  };
}

/** 사용자 사진의 Lv 1 사이보그(STR 10·VIT 7·INT 7·WIS 9·DEX 12·AGI 15) */
const PHOTO = { str: 10, vit: 7, int: 7, wis: 9, dex: 12, agi: 15 };

describe("원자재별 채집 예상(사이보그 판 효율 묶음)", () => {
  const source = packSource();
  const society = TEST_SOCIETY_COEFFICIENTS;

  it("여섯 원자재(팩 차례)마다 유효 스탯 = 주 + 보조 + 컨디션, 구간 ‰, 최적 작업 하나", () => {
    const rows = gatherSheetOf(source, PHOTO, 0, society);
    expect(rows.map((row) => row.subcategory)).toEqual([
      "crop",
      "wood",
      "ore",
      "herb",
      "livestock_product",
      "fish",
    ]);
    const ore = rows.find((row) => row.facility === "mine");
    // 광산 STR 10 + VIT 7 = 17 → 구간 0~19(T0 70%·T1 15%·T2 10%·T3 5%)
    expect(ore).toMatchObject({ primary: "str", secondary: "vit", stat: 17, bandFrom: 0, bandNext: 20 });
    expect(ore?.tierPm).toEqual([700, 150, 100, 50, 0, 0, 0, 0, 0, 0]);
    // 낚시터 AGI 15 + DEX 12 = 27 → 구간 20, 성공 ‰ = 300 + ⌊500 × 27 ÷ 200⌋ = 367
    const fish = rows.find((row) => row.facility === "fishing_spot");
    expect(fish).toMatchObject({ stat: 27, bandFrom: 20, catchPm: 367 });
    // 최적 = 주 + 보조가 가장 큰 1차 생산(낚시터 27, 벌목장 DEX 12 + STR 10 = 22)
    expect(rows.filter((row) => row.best).map((row) => row.facility)).toEqual(["fishing_spot"]);
    for (const row of rows) expect(row.tierPm.reduce((sum, pm) => sum + pm, 0)).toBe(1000);
  });

  it("선택 방식(농장·목장)은 해금 티어 한 칸, 컨디션은 상한으로 잘라 더한다", () => {
    const strong = { str: 10, vit: 30, int: 25, wis: 10, dex: 10, agi: 10 };
    const farm = gatherSheetOf(source, strong, 0, society).find((row) => row.facility === "farm");
    // VIT 30 + INT 25 = 55 → 해금 ⌊55 ÷ 20⌋ = T2
    expect(farm).toMatchObject({ mode: "select", selectTier: 2, stat: 55 });
    expect(farm?.tierPm).toEqual([0, 0, 1000, 0, 0, 0, 0, 0, 0, 0]);
    const cap = society.condition.cap;
    const boosted = gatherSheetOf(source, strong, cap + 100, society).find((row) => row.facility === "farm");
    expect(boosted?.condition).toBe(cap);
    expect(boosted?.stat).toBe(55 + cap);
  });

  it("채집 시설이 없으면 빈 목록", () => {
    expect(gatherSheetOf({ ...source, facilities: [] }, PHOTO, 0, society)).toEqual([]);
  });
});
