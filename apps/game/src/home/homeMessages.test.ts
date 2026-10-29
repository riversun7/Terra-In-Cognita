// 홈 문구 키 시험 — 카드마다 빈 문구(card_<카드>_empty, 기기 카드는 없음), [임시] W3 문구의 대신 키(home_tmp_*: 종류·동작·복귀 요약 칸·
// 마감·시험 자료 표시)가 ko·en에 있다. 그리는 표(cards/registry.tsx·source/standIn.ts)는 satisfies Record<…>라 타입 검사가 같은 일을 하지만,
// 메시지 원본을 바로 읽어 생성 파일(src/paraglide/) 없이도 돈다. ko·en이 같은지는 scripts/check-i18n.mjs가 본다.
import { HOME_CARDS, isCardId } from "@terra/shared/dashboard";
import { INBOX_KINDS, SUMMARY_SECTION_KINDS } from "@terra/shared/inbox";
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

  it("[임시] 시안 자료 종류·바로 처리 동작·복귀 요약 칸·W3 표시 문구마다 대신 키가 있다(W3이 오면 home_tmp_*를 모두 지운다)", () => {
    for (const kind of Object.keys(INBOX_KINDS)) expect(has(`home_tmp_kind_${kind}`), kind).toBe(true);
    const actions = new Set(Object.values(INBOX_KINDS).flatMap((kind) => [...kind.actions]));
    for (const action of actions) expect(has(`home_tmp_action_${action}`), action).toBe(true);
    for (const kind of SUMMARY_SECTION_KINDS) expect(has(`home_tmp_summary_${kind}`), kind).toBe(true);
    for (const key of [
      "home_tmp_kind_unknown",
      "home_tmp_deadline",
      "home_tmp_deadline_soon",
      "home_tmp_overdue",
      "home_tmp_preview_tag",
      "home_tmp_preview_notice",
      "home_tmp_action_preview_done",
      "home_tmp_group_other",
    ]) {
      expect(has(key), key).toBe(true);
    }
  });

  it("[임시] 대신 키 home_tmp_*는 W4 자리 한 덩어리다(W3 뒤 한 번에 지운다)", () => {
    const keys = Object.keys(ko);
    const positions = keys.flatMap((key, index) => (key.startsWith("home_tmp_") ? [index] : []));
    const first = positions[0] ?? 0;
    expect(positions).toEqual(positions.map((_, offset) => first + offset));
    expect(Object.keys(en).filter((key) => key.startsWith("home_tmp_"))).toEqual(
      keys.filter((key) => key.startsWith("home_tmp_")),
    );
  });
});
