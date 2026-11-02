// 대량 도구 시험(아이템 편집기 WP-7): 시작 시세 ‰ BigInt 반올림, 여러 개 고치기, CSV 왕복, 틀린 머리·값의 줄 번호, 크기·줄 수 상한,
// 옛 칸 이름 baseValue(팩 core@27까지)를 startPrice로 읽기(295)
import { describe, expect, it } from "vitest";
import type { ItemJson } from "./itemEditor.ts";
import {
  ITEM_BULK_LIMITS,
  ITEM_CSV_COLUMNS,
  applyItemPatch,
  importDiff,
  itemsToCsv,
  itemsToJson,
  parseItemsCsv,
  parseItemsJson,
  scaleStartPrice,
  splitCsvLine,
} from "./itemEditorBulk.ts";

const grain: ItemJson = {
  id: "grain",
  name: { ko: "곡물", en: "Grain" },
  category: "raw",
  subcategory: "crop",
  tier: 0,
  startPrice: 10,
  weight: 1000,
  enabled: true,
};
const sword: ItemJson = {
  id: "test_sword",
  name: { ko: '시험용 검, "날"', en: "Test sword" },
  description: { ko: "줄\n바꿈", en: "Line\nbreak" },
  category: "equipment",
  tier: 1,
  startPrice: 100,
  stackMax: 1,
  tags: ["sharp", "metal"],
  equip: { slot: "weapon", stats: [] },
  enabled: true,
};
const current = new Map([grain, sword].map((entry) => [entry.id, entry]));

describe("시작 시세 ‰(BigInt, 0.5는 올림, 1 이상)", () => {
  it("+10%·−10%·0.5 올림·하한 1·상한 안전한 정수", () => {
    expect(scaleStartPrice(100, 100)).toBe(110);
    expect(scaleStartPrice(100, -100)).toBe(90);
    // 15 × 1.1 = 16.5 → 17(올림), 15 × 0.9 = 13.5 → 14
    expect(scaleStartPrice(15, 100)).toBe(17);
    expect(scaleStartPrice(15, -100)).toBe(14);
    expect(scaleStartPrice(1, -900)).toBe(1);
    expect(scaleStartPrice(Number.MAX_SAFE_INTEGER, 10_000)).toBe(Number.MAX_SAFE_INTEGER);
    // 큰 값도 실수 오차 없이(9,007,199,254,740,991 × 0.5 = 4,503,599,627,370,495.5 → …496)
    expect(scaleStartPrice(Number.MAX_SAFE_INTEGER, -500)).toBe(4_503_599_627_370_496);
  });
});

describe("여러 개 고치기(patch)", () => {
  it("켜기·티어·중분류·태그 더하기·빼기·시작 시세 ‰를 그 칸만 얹는다", () => {
    const next = applyItemPatch(sword, {
      enabled: false,
      tier: 3,
      subcategory: "weapon",
      tagsAdd: ["rare", "sharp"],
      tagsRemove: ["metal"],
      startPricePm: 250,
    });
    expect(next).toEqual({
      ...sword,
      enabled: false,
      tier: 3,
      subcategory: "weapon",
      tags: ["sharp", "rare"],
      startPrice: 125,
    });
    // 바뀐 것이 없으면 같은 객체, 중분류 null = 뺀다, 태그를 다 빼면 칸을 뺀다
    expect(applyItemPatch(grain, { enabled: true, tier: 0 })).toBe(grain);
    expect(applyItemPatch(grain, { subcategory: null }).subcategory).toBeUndefined();
    expect(applyItemPatch(sword, { tagsRemove: ["sharp", "metal"] }).tags).toBeUndefined();
  });
});

describe("CSV 거래 묶음 열(302·D-506)", () => {
  it("lotSize 열을 내보내고 읽는다(빈 칸 그대로, - 는 뺀다)", () => {
    const ore: ItemJson = { ...grain, id: "iron_ore", weight: 1, lotSize: 1000 };
    const csv = itemsToCsv([ore]);
    expect(csv.split("\n")[0]).toContain("weight,lotSize,stackMax");
    const back = parseItemsCsv(csv, new Map([[ore.id, ore]]));
    expect(back.problems).toEqual([]);
    expect(back.entries[0]?.lotSize).toBe(1000);
    const cleared = parseItemsCsv("id,lotSize\niron_ore,-\n", new Map([[ore.id, ore]]));
    expect(cleared.entries[0]?.lotSize).toBeUndefined();
    const set = parseItemsCsv("id,lotSize\ngrain,500\n", current);
    expect(set.entries[0]?.lotSize).toBe(500);
  });
});

describe("CSV 왕복", () => {
  it("내보낸 CSV를 다시 읽으면 같은 공통 칸(따옴표·쉼표·줄바꿈 이스케이프 포함, 장비 칸은 지금 항목 그대로)", () => {
    const csv = itemsToCsv([grain, sword]);
    expect(csv.split("\n")[0]).toBe(ITEM_CSV_COLUMNS.join(","));
    // 줄바꿈이 든 칸이 있으면 줄 단위로 읽지 못한다 — 설명 줄바꿈은 JSON으로 다룬다(CSV는 평평한 칸만)
    const flat = { ...sword, description: { ko: "설명", en: "Description" } };
    const parsed = parseItemsCsv(itemsToCsv([grain, flat]), current);
    expect(parsed.problems).toEqual([]);
    expect(parsed.entries).toEqual([grain, flat]);
    expect(parsed.rows).toEqual({ grain: 2, test_sword: 3 });
    expect(splitCsvLine('a,"b,c","d""e"')).toEqual(["a", "b,c", 'd"e']);
  });

  it("새 아이템은 필수 열이 있어야 하고 꺼진 채, 있는 아이템은 적은 칸만(빈 칸 그대로, - 는 뺀다)", () => {
    const text = [
      "id,category,tier,startPrice,name.ko,name.en,weight,subcategory",
      "copper,raw,2,1,구리,Copper,1000,ore",
      "grain,,,,,,-,",
    ].join("\n");
    const parsed = parseItemsCsv(text, current);
    expect(parsed.problems).toEqual([]);
    expect(parsed.entries[0]).toEqual({
      id: "copper",
      name: { ko: "구리", en: "Copper" },
      category: "raw",
      tier: 2,
      startPrice: 1,
      enabled: false,
      weight: 1000,
      subcategory: "ore",
    });
    const { weight: _drop, ...noWeight } = grain;
    expect(parsed.entries[1]).toEqual(noWeight);
    expect(importDiff(parsed.entries, current)).toEqual({ added: ["copper"], changed: ["grain"], same: [] });
  });
});

describe("옛 칸 이름 baseValue(팩 core@27까지, 295에서 startPrice)", () => {
  it("CSV 열 baseValue와 JSON 칸 baseValue를 startPrice로 읽고, 내보내기는 새 이름만 쓴다", () => {
    const csv = parseItemsCsv(
      "id,category,tier,baseValue,name.ko,name.en\ncopper,raw,2,7,구리,Copper",
      current,
    );
    expect(csv.problems).toEqual([]);
    expect(csv.entries[0]).toMatchObject({ id: "copper", startPrice: 7 });
    expect(csv.entries[0]).not.toHaveProperty("baseValue");
    // 같은 칸을 두 이름으로 적으면 겹친 열
    expect(parseItemsCsv("id,baseValue,startPrice\ngrain,1,2", current).problems).toEqual([
      { row: 1, column: "startPrice", code: "duplicate_column", value: "startPrice" },
    ]);
    const { startPrice: _drop, ...noPrice } = grain;
    const json = parseItemsJson(JSON.stringify({ entries: [{ ...noPrice, baseValue: 9 }] }));
    expect(json.problems).toEqual([]);
    expect(json.entries).toEqual([{ ...grain, startPrice: 9 }]);
    // 둘 다 있으면 startPrice를 둔다
    expect(parseItemsJson(JSON.stringify([{ ...grain, baseValue: 3 }])).entries).toEqual([grain]);
    expect(itemsToCsv([grain]).split("\n")[0]).not.toContain("baseValue");
  });
});

describe("틀린 머리·값은 줄 번호로", () => {
  it("모르는 열·겹친 열·id 열 없음은 1줄(머리)", () => {
    const parsed = parseItemsCsv("id,colour,tier,tier\ngrain,red,1,1", current);
    expect(parsed.problems).toEqual([
      { row: 1, column: "colour", code: "unknown_column", value: "colour" },
      { row: 1, column: "tier", code: "duplicate_column", value: "tier" },
    ]);
    expect(parseItemsCsv("name.ko\n곡물", current).problems[0]).toMatchObject({
      row: 1,
      code: "missing_column",
    });
  });

  it("값: 정수 아님·참거짓 아님·대분류·ID·칸 수·겹친 ID·새 항목 필수 칸", () => {
    const text = [
      "id,category,tier,startPrice,name.ko,name.en,enabled",
      "grain,raw,two,10,곡물,Grain,yes",
      "Bad-Id,raw,1,1,가,A,true",
      "grain,raw,1,10,곡물,Grain",
      "newbie,gizmo,1,1,새,New,true",
      "lonely,,1,,,,",
      "test_sword,equipment,1,100,검,Sword,true",
      "test_sword,equipment,1,100,검,Sword,true",
    ].join("\n");
    const codes = parseItemsCsv(text, current).problems.map((item) => [item.row, item.code, item.column]);
    expect(codes).toEqual([
      [2, "not_int", "tier"],
      [2, "bad_bool", "enabled"],
      [3, "bad_id", "id"],
      [4, "column_count", null],
      [5, "bad_category", "category"],
      [6, "missing_value", "category"],
      [6, "missing_value", "startPrice"],
      [6, "missing_value", "name.ko"],
      [6, "missing_value", "name.en"],
      [8, "duplicate_id", "id"],
    ]);
  });
});

describe("크기·줄 수 상한", () => {
  it("900 KiB를 넘는 글, 300줄을 넘는 CSV·JSON은 읽지 않는다", () => {
    const big = "x".repeat(ITEM_BULK_LIMITS.importBytesMax + 1);
    expect(parseItemsCsv(big, current).problems).toEqual([
      { row: 0, column: null, code: "too_large", value: null },
    ]);
    const rows = Array.from({ length: ITEM_BULK_LIMITS.rowsMax + 1 }, (_, index) => `item_${index}`);
    expect(parseItemsCsv(`id\n${rows.join("\n")}`, current).problems[0]?.code).toBe("too_many_rows");
    const entries = rows.map((id) => ({ ...grain, id }));
    expect(parseItemsJson(itemsToJson(entries)).problems[0]?.code).toBe("too_many_rows");
  });

  it("JSON: 팩 파일 모양을 읽고, 항목마다 모양·ID·크기(4 KiB)를 줄(항목 차례)로 알린다", () => {
    const ok = parseItemsJson(itemsToJson([grain, sword]));
    expect(ok.problems).toEqual([]);
    expect(ok.entries).toEqual([grain, sword]);
    const huge = { ...grain, id: "huge", name: { ko: "가".repeat(2000), en: "a" } };
    const bad = parseItemsJson(JSON.stringify({ entries: [grain, { id: 3 }, grain, huge] }));
    expect(bad.problems.map((item) => [item.row, item.code])).toEqual([
      [2, "bad_entry"],
      [3, "duplicate_id"],
      [4, "entry_too_large"],
    ]);
    expect(parseItemsJson("{oops").problems[0]?.code).toBe("bad_json");
    expect(parseItemsJson('{"items": []}').problems[0]?.code).toBe("not_entries");
  });
});
