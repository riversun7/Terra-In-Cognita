// 화면 입력 칸 범위·목록(@terra/shared/itemEditor)이 팩 스키마(@terra/content)와 같은지 본다(설계안 3.9: 기기의 바로 보이는 검사와 서버
// 검사가 같은 값). 게임 앱은 @terra/content를 가져오지 않아 같은 값을 따로 들고 있다.
import {
  FOOD_FAMILIES,
  ITEM_CATEGORIES,
  ITEM_SCHEMA_LIMITS,
  PERISH_CATEGORIES,
  STORAGE_KINDS,
  WEAPON_TYPE_SLOTS,
} from "@terra/content";
import {
  FOOD_FAMILY_IDS,
  ITEM_CATEGORY_IDS,
  ITEM_LIMITS,
  ITEM_PERISH_CATEGORIES,
  STORAGE_KIND_IDS,
  WEAPON_TYPE_SLOT_IDS,
} from "@terra/shared/itemEditor";
import { describe, expect, it } from "vitest";

describe("아이템 편집기 범위 = 팩 스키마", () => {
  it("대분류·신선도 대분류·보관 창고·식재료 계열·무기 종류 칸 목록이 같다", () => {
    expect([...ITEM_CATEGORY_IDS]).toEqual([...ITEM_CATEGORIES]);
    expect([...ITEM_PERISH_CATEGORIES]).toEqual([...PERISH_CATEGORIES]);
    expect([...STORAGE_KIND_IDS]).toEqual([...STORAGE_KINDS]);
    expect([...FOOD_FAMILY_IDS]).toEqual([...FOOD_FAMILIES]);
    expect([...WEAPON_TYPE_SLOT_IDS]).toEqual([...WEAPON_TYPE_SLOTS]);
  });

  it("태그 수·무게·스택·유통기한·효과 줄 수·차례 상한이 같다", () => {
    expect(ITEM_LIMITS.tags).toBe(ITEM_SCHEMA_LIMITS.tags);
    expect(ITEM_LIMITS.weight.max).toBe(ITEM_SCHEMA_LIMITS.weightMax);
    expect(ITEM_LIMITS.stackMax.max).toBe(ITEM_SCHEMA_LIMITS.stackMax);
    expect(ITEM_LIMITS.shelfLifeMs).toEqual({
      min: ITEM_SCHEMA_LIMITS.shelfLifeMinMs,
      max: ITEM_SCHEMA_LIMITS.shelfLifeMaxMs,
    });
    expect(ITEM_LIMITS.effectsMax).toBe(ITEM_SCHEMA_LIMITS.effectsMax);
    expect(ITEM_LIMITS.order.max).toBe(ITEM_SCHEMA_LIMITS.order);
  });
});
