// 사이보그 판 원자재별 채집 예상 시험(2026-11-12) — 팩 core 채집 시설 여섯·티어 구간으로 판정 함수(workerEffects·gatherBandIndex)와
// 같은 값이 나오는지, 최적 작업이 유닛 추천(recommendProduction)과 같은지, 컨디션이 상한으로 잘리는지.
import {
  facilityEntrySchema,
  gatherTierEntrySchema,
  itemEntrySchema,
  itemSubcategoryEntrySchema,
  readCategoryFile,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { gatherKindsFromEntries } from "../gather/kinds.ts";
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
    items: readCategoryFile(source, "items").entries.map((raw) => itemEntrySchema.parse(raw)),
    kinds: gatherKindsFromEntries(readCategoryFile(source, "gather_objects").entries),
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
    // 광산 STR 10 + VIT 7 = 17 → 구간 0~19(표 하나, 기획 D-552 — T0 70%·T1 15%·T2 10%·T3 5%)
    expect(ore).toMatchObject({ primary: "str", secondary: "vit", stat: 17, bandFrom: 0, bandNext: 20 });
    expect(ore?.tierPm).toEqual(source.gatherTiers.find((band) => band.id === "band_000")?.weightsPm);
    expect(ore?.tierPm).toEqual([700, 150, 100, 50, 0, 0, 0, 0, 0, 0]);
    // 벌목장 DEX 12 + STR 10 = 22 → 기본 표 구간 20(옛 T0 70%·T1 15% — 소나무 원목이 줄지 않는다)
    const wood = rows.find((row) => row.facility === "lumber_camp");
    expect(wood).toMatchObject({ stat: 22, bandFrom: 20, bandNext: 40 });
    expect(wood?.tierPm).toEqual([700, 150, 100, 50, 0, 0, 0, 0, 0, 0]);
    // 낚시터 AGI 15 + DEX 12 = 27 → 구간 20, 성공 ‰ = 300 + ⌊500 × 27 ÷ 200⌋ = 367
    const fish = rows.find((row) => row.facility === "fishing_spot");
    expect(fish).toMatchObject({ stat: 27, bandFrom: 20, catchPm: 367 });
    // 최적 = 시간당 기대 금액이 가장 큰 일(D-562 1569 — 자리를 모르면 시작 시세, 금액이 모두 있으면 하나)
    expect(rows.filter((row) => row.best)).toHaveLength(1);
    for (const row of rows) expect(row).toMatchObject({ level: 1, priceSource: "start" });
    for (const row of rows) expect(row.tierPm.reduce((sum, pm) => sum + pm, 0)).toBe(1000);
  });

  it("건물 채집소(농장·목장·약초원)는 레벨 최고 티어 한 칸과 효율, 컨디션은 상한으로 잘라 더한다(D-566 1721)", () => {
    const strong = { str: 10, vit: 30, int: 25, wis: 10, dex: 10, agi: 10 };
    const farm = gatherSheetOf(source, strong, 0, society).find((row) => row.facility === "farm");
    // 일터가 아니면 레벨 1 = T1, VIT 30 + INT 25 = 55 ≥ 권장 20 → 효율 1000‰
    expect(farm).toMatchObject({
      mode: "select",
      selectTier: 1,
      stat: 55,
      yieldPm: 1000,
      recommendedStat: 20,
    });
    expect(farm?.tierPm).toEqual([0, 1000, 0, 0, 0, 0, 0, 0, 0, 0]);
    // 레벨 3 농장(T5, 권장 100)에서 일하면 합 55 → 효율 max(300, 1000 − 25 × 45) = 300‰, 모듈 둘 → 300 × 1400 ÷ 1000 = 420‰
    const placed: GatherSheetSource = {
      ...source,
      place: () => ({ workplace: { facility: "farm", level: 3, plots: 2 }, lastPrice: () => undefined }),
    };
    const worker = gatherSheetOf(placed, strong, 0, society, 9).find((row) => row.facility === "farm");
    expect(worker).toMatchObject({ selectTier: 5, yieldPm: 420, recommendedStat: 100, plots: 2, level: 3 });
    const cap = society.condition.cap;
    const boosted = gatherSheetOf(source, strong, cap + 100, society).find((row) => row.facility === "farm");
    expect(boosted?.condition).toBe(cap);
    expect(boosted?.stat).toBe(55 + cap);
  });

  it("낚시터 줄만 물 종류마다 접은 확률(D-562 1562 — 범위는 팩 오브젝트 물터·어군 위 끝, 아래 끝은 막지 않는다)", () => {
    const rows = gatherSheetOf(source, PHOTO, 0, society);
    const fish = rows.find((row) => row.facility === "fishing_spot");
    // 구간 20: T0 70%·T1 15%·T2 10%·T3 5%
    expect(fish?.tierPm).toEqual([700, 150, 100, 50, 0, 0, 0, 0, 0, 0]);
    expect(fish?.waters?.map((water) => [water.water, water.min, water.max])).toEqual([
      ["fresh", 0, 2],
      ["coast", 0, 4],
      ["shelf", 0, 6],
      ["deep", 0, 8],
    ]);
    const tierPm = (water: string) => fish?.waters?.find((row) => row.water === water)?.tierPm;
    expect(tierPm("fresh")).toEqual([700, 150, 150, 0, 0, 0, 0, 0, 0, 0]);
    expect(tierPm("coast")).toEqual(fish?.tierPm);
    expect(tierPm("deep")).toEqual(fish?.tierPm);
    expect(rows.filter((row) => row.waters !== undefined).map((row) => row.facility)).toEqual([
      "fishing_spot",
    ]);
    // 오브젝트가 없으면 물 종류 줄을 싣지 않는다
    const bare = gatherSheetOf({ ...source, kinds: [] }, PHOTO, 0, society);
    expect(bare.some((row) => row.waters !== undefined)).toBe(false);
  });

  it("유닛 자리(D-562 1569·D-556 1255): 일터 레벨로 세고, 그 도시 체결가가 있으면 그 값 — 최적은 기대 금액이 가장 큰 일", () => {
    const base = gatherSheetOf(source, PHOTO, 0, society, 7);
    const mine = base.find((row) => row.facility === "mine");
    // 자리 읽기가 없으면 레벨 1·시작 시세(광석은 철 8, 그 밖 1)
    expect(mine).toMatchObject({ level: 1, priceSource: "start" });
    const placed = gatherSheetOf(
      {
        ...source,
        place: (unitId) =>
          unitId === 7
            ? {
                workplace: { facility: "mine", level: 3 },
                // 그 도시 거래소: 구리 원광 체결가 5,000(10kg 묶음당)
                lastPrice: (item) => (item === "copper_ore" ? 5000n : undefined),
                currency: "TST",
              }
            : undefined,
      },
      PHOTO,
      0,
      society,
      7,
    );
    const placedMine = placed.find((row) => row.facility === "mine");
    // 광산 Lv 3: 유효 스탯 17 + 레벨 보너스 × 2
    expect(placedMine).toMatchObject({ level: 3, priceSource: "market", currency: "TST" });
    expect(placedMine?.stat).toBe(17 + society.gatherLevelBonus * 2);
    expect(BigInt(placedMine?.valuePerHour ?? "0")).toBeGreaterThan(BigInt(mine?.valuePerHour ?? "0"));
    expect(placed.filter((row) => row.best).map((row) => row.facility)).toEqual(["mine"]);
    // 다른 줄은 레벨 1
    expect(placed.find((row) => row.facility === "lumber_camp")?.level).toBe(1);
  });

  it("채집 시설이 없으면 빈 목록", () => {
    expect(gatherSheetOf({ ...source, facilities: [] }, PHOTO, 0, society)).toEqual([]);
  });
});
