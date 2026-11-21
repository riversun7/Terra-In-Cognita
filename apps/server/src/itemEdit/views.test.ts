// 편집기 항목 JSON(itemJsonOf)이 팩 파일 한 줄과 같은지 — 칸을 빠뜨리면 편집기에서 저장할 때 그 칸이 사라진다(묶음 크기 lotSize 등)
import { itemEntrySchema, readCategoryFile } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { itemJsonOf } from "./views.ts";

describe("itemJsonOf = 팩 items.json 한 줄", () => {
  it("팩의 모든 아이템이 같은 JSON으로 돌아온다(철광석 묶음 10,000 포함)", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const raw = readCategoryFile(loaded.source, "items").entries;
    expect(raw.length).toBeGreaterThan(100);
    for (const entry of raw) expect(itemJsonOf(itemEntrySchema.parse(entry))).toEqual(entry);
    const ore = raw.find((entry) => entry.id === "iron_ore");
    expect(ore && itemJsonOf(itemEntrySchema.parse(ore)).lotSize).toBe(10_000);
  });
});
