// 채집 오브젝트 편집기 자료 시험(기획 D-552) — 목록 줄·실효 범위·고치기(범위·양·아이템·모델·바이옴·지표·천분율)·미리 보기·차이
import { describe, expect, it } from "vitest";
import gatherObjectsJson from "../../../../../content/core/gather_objects.json";
import gatherTiersJson from "../../../../../content/core/gather_tiers.json";
import itemsJson from "../../../../../content/core/items.json";
import subcategoriesJson from "../../../../../content/core/item_subcategories.json";
import { hashEntry } from "../terrainObjects/terrainObjectsModel.ts";
import {
  type GatherRefs,
  type JsonEntry,
  SURFACES,
  buildDiff,
  chancePreview,
  changedEntries,
  effectiveRange,
  itemGroups,
  objectRows,
  setBiome,
  setChance,
  setItem,
  setLots,
  setTierRange,
  toggleModel,
  toggleSurface,
} from "./gatherObjectsModel.ts";

const rawSubs = new Set(subcategoriesJson.entries.filter((sub) => sub.major === "raw").map((sub) => sub.id));
/** 서버 gatherRefsOf와 같은 모양(원자재 중분류 아이템·이름·표) */
const refs: GatherRefs = {
  items: itemsJson.entries
    .filter((item) => rawSubs.has(String(item.subcategory)))
    .map((item) => ({
      id: item.id,
      name: { ko: item.name.ko, en: item.name.en },
      subcategory: String(item.subcategory),
      tier: item.tier,
      enabled: item.enabled,
    })),
  subcategories: subcategoriesJson.entries
    .filter((sub) => sub.major === "raw")
    .map((sub) => ({ id: sub.id, name: { ko: sub.name.ko, en: sub.name.en } })),
  bands: gatherTiersJson.entries.map((band) => ({ from: band.from, weightsPm: band.weightsPm })),
};
const pack: readonly JsonEntry[] = gatherObjectsJson.entries;
const find = (entries: readonly JsonEntry[], id: string): JsonEntry => {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(id);
  return entry;
};

describe("목록 줄(팩 core gather_objects)", () => {
  it("오브젝트마다 원자재 종류 = 대표 아이템 중분류, 굴림표는 범위 없음", () => {
    const rows = objectRows(pack, refs);
    expect(rows).toHaveLength(pack.length);
    const conifer = rows.find((row) => row.id === "conifer_tree");
    expect(conifer).toMatchObject({
      source: "prop",
      item: "pine_log",
      subcategory: "wood",
      range: { min: 0, max: 1 },
    });
    expect(conifer?.models).toEqual(["tree_conifer"]);
    expect(rows.find((row) => row.id === "shipwreck")).toMatchObject({ table: true, range: null });
    expect(rows.find((row) => row.id === "school_deep")?.biomeCount).toBe(1);
    // 팩 지표 이름은 모두 화면 지표 목록에 있다(@terra/content GATHER_PLOT_SURFACES와 같은 차례)
    for (const entry of pack)
      for (const surface of Array.isArray(entry.surfaces) ? entry.surfaces : [])
        expect(SURFACES).toContain(surface);
  });

  it("범위 칸이 없으면 대표 아이템 티어 하나", () => {
    const { tierRange: _drop, ...bare } = find(pack, "herb_patch");
    expect(effectiveRange(bare, refs)).toEqual({ min: 1, max: 1 });
  });

  it("원자재 아이템 묶음: 중분류 차례, 안에서 티어 차례", () => {
    const groups = itemGroups(refs);
    const wood = groups.find((group) => group.subcategory === "wood");
    expect(wood?.items[0]?.id).toBe("pine_log");
    expect(wood?.items.map((item) => item.tier)).toEqual(
      [...(wood?.items.map((item) => item.tier) ?? [])].toSorted((a, b) => a - b),
    );
  });
});

describe("고치기", () => {
  it("티어 범위: 한 끝을 고치면 다른 끝을 민다, 칸이 없으면 실효 범위에서 시작, 굴림표는 그대로", () => {
    let edited = setTierRange(pack, refs, "conifer_tree", "max", 6);
    expect(find(edited, "conifer_tree").tierRange).toEqual({ min: 0, max: 6 });
    edited = setTierRange(edited, refs, "conifer_tree", "min", 8);
    expect(find(edited, "conifer_tree").tierRange).toEqual({ min: 8, max: 8 });
    const { tierRange: _drop, ...bare } = find(pack, "herb_patch");
    const noRange = pack.map((entry) => (entry.id === "herb_patch" ? bare : entry));
    expect(find(setTierRange(noRange, refs, "herb_patch", "max", 4), "herb_patch").tierRange).toEqual({
      min: 1,
      max: 4,
    });
    expect(setTierRange(pack, refs, "shipwreck", "max", 4)).toEqual(pack);
  });

  it("양·아이템·천분율은 범위 안으로, 굴림표 아이템은 고치지 않는다", () => {
    expect(find(setLots(pack, "boulder_stone", 500), "boulder_stone").lots).toBe(100);
    expect(find(setItem(pack, "boulder_stone", "rubble"), "boulder_stone").item).toBe("rubble");
    expect(setItem(pack, "shipwreck", "rubble")).toEqual(pack);
    expect(find(setChance(pack, "ore_vein", 0), "ore_vein").chancePm).toBe(1);
    // 천분율이 없는 자리(소품)는 그대로
    expect(setChance(pack, "conifer_tree", 50)).toEqual(pack);
  });

  it("3D 모델: 소품은 켜고 끄되 하나는 남기고, 지형별 자리는 하나를 바꾼다", () => {
    const more = toggleModel(pack, "conifer_tree", "tree_palm");
    expect(find(more, "conifer_tree").arts).toEqual(["tree_conifer", "tree_palm"]);
    expect(find(toggleModel(more, "conifer_tree", "tree_conifer"), "conifer_tree").arts).toEqual([
      "tree_palm",
    ]);
    expect(toggleModel(pack, "conifer_tree", "tree_conifer")).toEqual(pack);
    expect(find(toggleModel(pack, "meteorite", "boulder"), "meteorite").art).toBe("boulder");
  });

  it("나오는 지형: 바이옴 더하기·고치기·빼기(하나는 남김), 지표 켜고 끄기(차례 그대로, 하나는 남김)", () => {
    let edited = setBiome(pack, "school_deep", "ocean_shelf", 3);
    expect(find(edited, "school_deep").biomes).toEqual([
      { biome: "ocean_deep", count: 6 },
      { biome: "ocean_shelf", count: 3 },
    ]);
    edited = setBiome(edited, "school_deep", "ocean_deep", null);
    expect(find(edited, "school_deep").biomes).toEqual([{ biome: "ocean_shelf", count: 3 }]);
    expect(setBiome(edited, "school_deep", "ocean_shelf", null)).toEqual(edited);
    expect(find(setBiome(pack, "oasis", "desert", 5000), "oasis").biomes).toEqual([
      { biome: "desert", chancePm: 1000 },
    ]);
    const surfaced = toggleSurface(pack, "copper_outcrop", "snow");
    expect(find(surfaced, "copper_outcrop").surfaces).toEqual([
      "grass",
      "dirt",
      "rock",
      "sand",
      "gravel",
      "snow",
    ]);
    expect(find(toggleSurface(surfaced, "copper_outcrop", "grass"), "copper_outcrop").surfaces).toEqual([
      "dirt",
      "rock",
      "sand",
      "gravel",
      "snow",
    ]);
  });
});

/** 미리 보기 확률 합(백만분율) */
const sum = (rows: readonly { ppm: number }[]) => rows.reduce((acc, row) => acc + row.ppm, 0);

describe("미리 보기(서버 objectRollOf·rollGatherOutputs와 같은 셈)", () => {
  it("침엽수 T0~T1, 유효 스탯 20: 소나무 70%·자작나무 30%", () => {
    const rows = chancePreview(find(pack, "conifer_tree"), refs, 20);
    expect(rows.map((row) => [row.item, row.ppm])).toEqual([
      ["pine_log", 700_000],
      ["birch_log", 300_000],
    ]);
  });

  it("바위 T1~T1은 늘 석재, 광맥 T2~T9는 구리 85%부터", () => {
    expect(chancePreview(find(pack, "boulder_stone"), refs, 20)).toEqual([
      { item: "stone", tier: 1, ppm: 1_000_000 },
    ]);
    const vein = chancePreview(find(pack, "ore_vein"), refs, 20);
    expect(vein[0]).toEqual({ item: "copper_ore", tier: 2, ppm: 950_000 });
    expect(vein[1]).toEqual({ item: "iron_ore", tier: 3, ppm: 50_000 });
  });

  it("같은 티어에 아이템이 여럿이면 대표 아이템이 아닌 티어는 고르게(합은 1,000,000에 가깝다)", () => {
    const rows = chancePreview(find(pack, "herb_patch"), refs, 120);
    expect(rows.find((row) => row.item === "chamomile")?.ppm).toBeGreaterThan(400_000);
    expect(sum(rows)).toBeGreaterThan(999_990);
    expect(sum(rows)).toBeLessThanOrEqual(1_000_000);
  });

  it("굴림표는 표의 가중치", () => {
    const rows = chancePreview(find(pack, "whale_pod"), refs, 20);
    expect(rows.map((row) => [row.item, row.ppm])).toEqual([
      ["whale_meat", 700_000],
      ["whale_oil", 300_000],
    ]);
  });
});

describe("차이 내보내기", () => {
  it("바뀐 항목만, from = 팩 항목 해시, 분류 gather_objects", async () => {
    const edited = setTierRange(pack, refs, "ore_vein", "max", 7);
    expect(changedEntries(pack, edited).map((change) => change.id)).toEqual(["ore_vein"]);
    expect(changedEntries(pack, pack)).toEqual([]);
    const diff = await buildDiff(pack, edited, "core@98", "2026-11-15T00:00:00.000Z");
    expect(diff).toMatchObject({
      format: "terra-tuning-diff",
      formatVersion: 1,
      packId: "core",
      contentVersion: "core@98",
    });
    expect(diff.entries).toEqual([
      {
        category: "gather_objects",
        id: "ore_vein",
        from: await hashEntry(find(pack, "ore_vein")),
        entry: find(edited, "ore_vein"),
      },
    ]);
  });
});
