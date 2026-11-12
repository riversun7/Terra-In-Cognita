// 채집 티어 추첨 미리 보기(D-506, 49 N43) — 팩 확률표 = 시뮬 TEST_GATHER_BANDS(둘을 함께 고치게, 팩 파일을 읽어야 해서 서버 시험),
// 실제 팩으로 철광석(T3)·구리(T2)·은(T4)·곡물(추첨 밖) 미리 보기. 옛 1차 생산 규칙(D-507): 진행 속도·수확량·필요 진행,
// 농장 선택 방식(해금 티어). 팩 core@32부터 옛 자원이 모두 켜져 있다(사용자 답 2026-11-03): 초안을 끄면(아이템 편집기 끄기) 빠진다
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
      lotSize: item.lotSize,
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
    // 레벨 보너스는 10으로 고정해 구간 넘김을 본다(팩 출발값은 10 → 5, 기획 D-535 1155 나)
    levelBonus: 10,
    rules: TEST_SOCIETY_COEFFICIENTS,
  };
  const find = (id: string): GatherItem => {
    const item = pack.items.find((entry) => entry.id === id);
    if (!item) throw new Error(id);
    return item;
  };

  it("철광석(T3)은 광산(STR + VIT) 사다리: 새 유닛 20 → Lv1 5.00%, Lv5(+40 = 60) 6.00%(T4 몫 1%는 켜진 은)", () => {
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
      [5, 60, 3, 600],
    ]);
    expect(shown?.bands[0]).toEqual({ from: 0, to: 19, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] });
    expect(shown?.bands.at(-1)?.to).toBeNull();
  });

  it("구리(T2)는 0~39 구간 10%, 은(T4)은 Lv5(60~79)에서 1%이고 초안을 끄면 0(그 몫은 철로 내려온다)", () => {
    expect(
      previewGather(ctx, find("copper_ore"), pack.items, DEFAULT_PREVIEW_UNIT)?.levels[0]?.chanceBp,
    ).toBe(1000);
    const silver = find("silver_ore");
    expect(silver.enabled).toBe(true);
    expect(
      previewGather(ctx, silver, pack.items, DEFAULT_PREVIEW_UNIT)?.levels.map((row) => row.chanceBp),
    ).toEqual([0, 0, 0, 0, 100]);
    const off = previewGather(ctx, { ...silver, enabled: false }, pack.items, DEFAULT_PREVIEW_UNIT);
    expect(off?.levels[4]?.chanceBp).toBe(0);
  });

  it("새 세 사다리(1차 생산 여섯 가지): 약초 = 약초원 추첨, 축산물 = 목장 선택, 어류 = 낚시터 추첨 × 성공 확률", () => {
    // 자생초(T0, 같은 티어 셋): 새 유닛 20 → T0 700‰ ÷ 3 = 23.33%
    const herb = previewGather(ctx, find("wild_herb"), pack.items, DEFAULT_PREVIEW_UNIT);
    expect(herb).toMatchObject({
      facility: "herb_field",
      primary: "int",
      secondary: "wis",
      mode: "roll",
      sameTier: 3,
    });
    expect(herb?.levels[0]?.chanceBp).toBe(2333);
    // 사슴 고기(T1): 목장 선택 — 새 유닛 해금 ⌊20 ÷ 20⌋ = T1. 목장 사다리 = 축산물 + 목축 부산물(질문 946 나, core@63)이라 T1은
    // 사슴 고기·사슴 가죽·사슴뿔 셋 → 33.33%, 생고기(T0)는 0
    const venison = previewGather(ctx, find("venison"), pack.items, DEFAULT_PREVIEW_UNIT);
    expect(venison).toMatchObject({
      facility: "ranch",
      primary: "wis",
      secondary: "agi",
      mode: "select",
      unitTier: 1,
      sameTier: 3,
    });
    expect(venison?.levels[0]?.chanceBp).toBe(3333);
    // 목축 부산물(사슴 가죽)도 목장 사다리에서 같은 몫으로 나온다
    const hide = previewGather(ctx, find("deer_hide"), pack.items, DEFAULT_PREVIEW_UNIT);
    expect(hide).toMatchObject({ facility: "ranch", mode: "select", sameTier: 3 });
    expect(hide?.levels[0]?.chanceBp).toBe(3333);
    expect(previewGather(ctx, find("raw_meat"), pack.items, DEFAULT_PREVIEW_UNIT)?.levels[0]?.chanceBp).toBe(
      0,
    );
    // 미꾸라지(T0, 같은 티어 둘): 낚시터 — 성공 300 + ⌊500 × 20 ÷ 200⌋ = 350‰ → T0 700‰ × 0.35 = 245‰ ÷ 2 = 12.25%
    const loach = previewGather(ctx, find("loach"), pack.items, DEFAULT_PREVIEW_UNIT);
    expect(loach).toMatchObject({
      facility: "fishing_spot",
      primary: "agi",
      secondary: "dex",
      mode: "roll",
      sameTier: 2,
    });
    expect(loach?.levels[0]?.chanceBp).toBe(1225);
  });

  it("진행·수확량(D-507): 철광석 = 새 유닛 속도 ×1·한 번에 2개(1 + ⌊10 × 0.10⌋)·T3 필요 진행 120 = 2시간, 광석 한 번 1,000g", () => {
    const work = previewGather(ctx, find("iron_ore"), pack.items, DEFAULT_PREVIEW_UNIT)?.work;
    expect(work).toMatchObject({
      divisor: 20,
      yieldBase: 1,
      yieldPerStatPm: 100,
      yieldCap: 10,
      requiredProgress: 120,
      tickMs: 60_000,
      harvestGrams: 1000,
      unitPrimary: 10,
      unitSecondary: 10,
      unitProgress: 1,
      unitYield: 2,
      unitHarvestMs: 7_200_000,
    });
    // 스탯 40 → 진행 2(한 번 1시간)·한 번에 5개, 100 → 진행 5·상한 10개
    expect(work?.rows.map((row) => [row.stat, row.progress, row.yield, row.harvestMs])).toEqual([
      [10, 1, 2, 7_200_000],
      [20, 1, 3, 7_200_000],
      [40, 2, 5, 3_600_000],
      [60, 3, 7, 2_400_000],
      [100, 5, 10, 1_440_000],
      [160, 8, 10, 900_000],
      [240, 12, 10, 600_000],
    ]);
    // 잡석(T0, 개 단위)은 g 환산 없음, 필요 진행 30
    expect(previewGather(ctx, find("rubble"), pack.items, DEFAULT_PREVIEW_UNIT)?.work).toMatchObject({
      harvestGrams: null,
      requiredProgress: 30,
      unitHarvestMs: 1_800_000,
    });
  });

  it("농장은 선택 + 효율(49 P8): VIT 10 + INT 10 = 20 → 해금 T1, T1 작물 셋(감자·배추·당근)이 나눠 나온다(레벨 보너스 없음)", () => {
    const potato = find("potato");
    const shown = previewGather(ctx, potato, pack.items, DEFAULT_PREVIEW_UNIT);
    expect(shown).toMatchObject({
      facility: "farm",
      mode: "select",
      unitTier: 1,
      levelBonus: 0,
      tier: 1,
      sameTier: 3,
    });
    expect(shown?.levels.map((row) => [row.band, row.chanceBp])).toEqual(
      Array.from({ length: 5 }, () => [-1, 3333]),
    );
    expect(shown?.work).toMatchObject({
      yieldPerStatPm: 80,
      yieldCap: 8,
      unitYield: 1,
      requiredProgress: 60,
    });
    // 옛 예시 VIT 60 + INT 20 = 80 → T4: T4 작물(옥수수·아스파라거스·셀러리)을 고르고 감자는 나오지 않는다
    const strong = {
      ...DEFAULT_PREVIEW_UNIT,
      primaries: { ...DEFAULT_PREVIEW_UNIT.primaries, vit: 60, int: 20 },
    };
    expect(previewGather(ctx, potato, pack.items, strong)?.levels[0]?.chanceBp).toBe(0);
    const high = previewGather(ctx, find("corn"), pack.items, strong);
    expect(high).toMatchObject({ unitTier: 4, tier: 4, sameTier: 3 });
    expect(high?.levels[0]?.chanceBp).toBe(3333);
    expect(high?.work).toMatchObject({ unitProgress: 3, unitYield: 2 });
  });

  it("추첨 시설 사다리에 없는 아이템(곡물)은 null", () => {
    expect(previewGather(ctx, find("grain"), pack.items, DEFAULT_PREVIEW_UNIT)).toBeNull();
  });
});
