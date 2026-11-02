// 채집 티어 추첨 미리 보기(D-506, 49 N43) — 팩 확률표 = 시뮬 TEST_GATHER_BANDS(둘을 함께 고치게, 팩 파일을 읽어야 해서 서버 시험),
// 실제 팩으로 철광석(T3)·구리(꺼짐)·곡물(추첨 밖) 미리 보기
import {
  facilityEntrySchema,
  gatherTierEntrySchema,
  itemEntrySchema,
  readCategoryFile,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_PREVIEW_UNIT } from "@terra/shared/itemEditor";
import { TEST_GATHER_BANDS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { type GatherItem, previewGather } from "./previewGather.ts";

function corePack() {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  const source = loaded.source;
  const bands = readCategoryFile(source, "gather_tiers").entries.map((raw) =>
    gatherTierEntrySchema.parse(raw),
  );
  const facilities = readCategoryFile(source, "facilities").entries.map((raw) =>
    facilityEntrySchema.parse(raw),
  );
  const items: GatherItem[] = readCategoryFile(source, "items")
    .entries.map((raw) => itemEntrySchema.parse(raw))
    .map((item) => ({
      id: item.id,
      subcategory: item.subcategory?.id,
      tier: item.tier,
      enabled: item.enabled,
    }));
  return { bands, facilities, items };
}

describe("채집 확률표: 팩 gather_tiers = TEST_GATHER_BANDS", () => {
  it("구간 시작·가중치가 같다(파일 차례)", () => {
    const { bands } = corePack();
    expect(bands.map((band) => ({ from: band.from, weightsPm: band.weightsPm }))).toEqual(
      TEST_GATHER_BANDS.map((band) => ({ from: band.from, weightsPm: [...band.weightsPm] })),
    );
  });
});

describe("미리 보기 채집 추첨(실제 팩)", () => {
  const pack = corePack();
  const ctx = {
    facilities: pack.facilities,
    bands: pack.bands.map((band) => ({ from: band.from, weightsPm: [...band.weightsPm] })),
    levelBonus: TEST_SOCIETY_COEFFICIENTS.gatherLevelBonus,
  };
  const find = (id: string): GatherItem => {
    const item = pack.items.find((entry) => entry.id === id);
    if (!item) throw new Error(id);
    return item;
  };

  it("철광석(T3)은 광산(STR + VIT) 사다리: 새 유닛 20 → Lv1 5.00%, Lv5(+40 = 60) 7.00%(꺼진 은 T4 몫이 철로 내려옴)", () => {
    const shown = previewGather(ctx, find("iron_ore"), pack.items, DEFAULT_PREVIEW_UNIT);
    expect(shown).toMatchObject({
      facility: "mine",
      primary: "str",
      secondary: "vit",
      unitStat: 20,
      levelBonus: 10,
      tier: 3,
      sameTier: 1,
      enabled: true,
    });
    expect(shown?.levels.map((row) => [row.level, row.stat, row.band, row.chanceBp])).toEqual([
      [1, 20, 1, 500],
      [2, 30, 1, 500],
      // 40~59 구간은 옛 표 T3 3%(가장 낮은 구간 [임시] 5%보다 낮다)
      [3, 40, 2, 300],
      [4, 50, 2, 300],
      [5, 60, 3, 700],
    ]);
    expect(shown?.bands[0]).toEqual({ from: 0, to: 19, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] });
    expect(shown?.bands.at(-1)?.to).toBeNull();
  });

  it("꺼진 구리(T2)는 확률 0, 초안을 켜면 그 티어 몫(0~39 구간 10%)을 받는다", () => {
    const copper = find("copper_ore");
    expect(previewGather(ctx, copper, pack.items, DEFAULT_PREVIEW_UNIT)?.levels[0]?.chanceBp).toBe(0);
    const on = previewGather(ctx, { ...copper, enabled: true }, pack.items, DEFAULT_PREVIEW_UNIT);
    expect(on?.levels[0]?.chanceBp).toBe(1000);
  });

  it("추첨 시설 사다리에 없는 아이템(곡물)은 null", () => {
    expect(previewGather(ctx, find("grain"), pack.items, DEFAULT_PREVIEW_UNIT)).toBeNull();
  });
});
