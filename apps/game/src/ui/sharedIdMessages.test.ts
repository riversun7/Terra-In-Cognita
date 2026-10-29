// 공용 ID → 이름 키 시험(앱 뼈대 0단계) — 메뉴 항목·템플릿·카드·처리할 일 분류마다 이름 키가 ko·en에 있다.
// 키 앞머리는 ADR 2026-10-29-app-shell 12절(nav_·template_·card_·inbox_category_). ko·en이 같은지는 scripts/check-i18n.mjs가 본다.
// 화면이 키를 고르는 표(shell/menuItems.ts, home/cards/ 등)가 생기면 그 표의 satisfies Record<…>가 같은 일을 타입으로 한다.
import { NAV_ITEM_IDS } from "@terra/shared";
import { HOME_CARDS, HOME_TEMPLATES } from "@terra/shared/dashboard";
import { INBOX_CATEGORIES } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json" with { type: "json" };
import ko from "../../messages/ko.json" with { type: "json" };

const KEYS = [
  ...NAV_ITEM_IDS.flatMap((id) => [`nav_${id}`, `nav_${id}_desc`]),
  ...HOME_TEMPLATES.map((id) => `template_${id}`),
  ...Object.keys(HOME_CARDS).map((id) => `card_${id}`),
  ...INBOX_CATEGORIES.map((id) => `inbox_category_${id}`),
];

describe("공용 ID의 이름 키", () => {
  it("메뉴 항목(이름·한 줄 설명)·템플릿·카드 제목·처리할 일 분류가 ko·en에 모두 있다", () => {
    expect(KEYS).toHaveLength(
      NAV_ITEM_IDS.length * 2 +
        HOME_TEMPLATES.length +
        Object.keys(HOME_CARDS).length +
        INBOX_CATEGORIES.length,
    );
    for (const key of KEYS) {
      expect(Object.hasOwn(ko, key), `ko ${key}`).toBe(true);
      expect(Object.hasOwn(en, key), `en ${key}`).toBe(true);
    }
  });
});
