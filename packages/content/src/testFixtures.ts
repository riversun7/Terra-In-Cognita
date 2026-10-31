// 시험용 공용 자료 — 올바른 팩을 메모리에 만들고, 시험마다 파일 하나씩 바꿔 쓴다.
// 시험 파일끼리 서로 import하면 시험이 두 번 등록되므로 여기에 둔다.
import { z } from "zod";
import type { PackSource } from "./pack.ts";
import { type CategoryRegistry, itemEntrySchema } from "./schema/categories.ts";
import { contentId, localizedText, ref } from "./schema/common.ts";

/** 파일 이름 → 내용. 객체는 JSON으로 쓰고, 문자열은 그대로(문법 오류 시험), null은 파일 없음 */
export type FixtureFiles = Record<string, unknown>;

/** 아이템 항목의 경제 칸(대분류·티어·기준 가치·켬/끔) — 형식 시험이 이름·ID만 볼 때 붙인다 */
export const ITEM_FIELDS = { category: "raw", tier: 0, baseValue: 1, enabled: true } as const;

/** 기본 팩의 items 항목 */
export const BASE_ITEMS = [
  { id: "iron_ore", name: { ko: "철광석", en: "Iron ore" }, ...ITEM_FIELDS },
  { id: "copper_ore", name: { ko: "구리광석", en: "Copper ore" }, ...ITEM_FIELDS },
] as const;

export function baseFiles(packId = "core"): FixtureFiles {
  return {
    "manifest.json": { formatVersion: 1, packId, version: 1 },
    "items.json": { entries: BASE_ITEMS },
    "id-changes.json": { renamed: [], removed: [] },
  };
}

/** 올바른 팩에 overrides를 덮어쓴 PackSource */
export function fixture(overrides: FixtureFiles = {}, packId = "core"): PackSource {
  const merged: FixtureFiles = { ...baseFiles(packId), ...overrides };
  const files = new Map<string, string>();
  for (const [name, value] of Object.entries(merged)) {
    if (value === null) continue;
    files.set(name, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }
  return { packId, files };
}

/** 참조·고아 시험용 분류 목록 (실제 게임 분류가 아니다) */
export const testRegistry: CategoryRegistry = {
  items: { entry: itemEntrySchema },
  kits: {
    entry: z.strictObject({
      id: contentId,
      name: localizedText,
      parts: z.array(z.strictObject({ item: ref("items"), count: z.int().positive() })),
      tag: ref("tags").optional(),
    }),
  },
  tags: { entry: z.strictObject({ id: contentId, name: localizedText }), mustBeReferenced: true },
};

/** 이름과 경제 칸을 가진 items 항목 */
export const itemNamed = (id: string) => ({ ...named(id), ...ITEM_FIELDS });

/** 한국어·영어 이름 */
export const named = (id: string): { id: string; name: { ko: string; en: string } } => ({
  id,
  name: { ko: `이름 ${id}`, en: `Name ${id}` },
});
