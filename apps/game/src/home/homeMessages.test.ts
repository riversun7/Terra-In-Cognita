// 홈 문구 키 시험 — 카드마다 빈 문구(card_<카드>_empty, 기기 카드는 없음)가 ko·en에 있다. 그리는 표(cards/registry.tsx)는
// satisfies Record<…>라 타입 검사가 같은 일을 하지만,
// 메시지 원본을 바로 읽어 생성 파일(src/paraglide/) 없이도 돈다. ko·en이 같은지는 scripts/check-i18n.mjs가 본다.
import { HOME_CARDS, isCardId } from "@terra/shared/dashboard";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json" with { type: "json" };
import ko from "../../messages/ko.json" with { type: "json" };

const has = (key: string): boolean => Object.hasOwn(ko, key) && Object.hasOwn(en, key);

describe("홈 문구 키", () => {
  it("자료가 비거나 준비 중일 수 있는 카드(기기 카드 빼고)마다 빈 문구가 있다", () => {
    const ids = Object.keys(HOME_CARDS)
      .filter(isCardId)
      .filter((id) => HOME_CARDS[id].source !== "device");
    expect(ids).toEqual(["inbox", "cyborg", "units", "assets", "faction", "timeline", "briefing"]);
    for (const id of ids) expect(has(`card_${id}_empty`), id).toBe(true);
  });
});
