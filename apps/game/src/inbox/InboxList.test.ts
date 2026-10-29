// 처리할 일 목록 그리기 시험 — 모르는 종류·분류·동작·주소가 와도 깨지지 않고 모든 줄이 보인다(ADR 2026-10-29-app-shell 7·13절,
// W3 통과 기준 5, D-6011)
// react-dom/server로 HTML을 만들어 본다(브라우저 없이). 화면 확인은 저장소 밖 Playwright 스크립트(작업 기록).
import type { InboxItem } from "@terra/shared/inbox";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InboxList, type InboxListProps } from "./InboxList.tsx";

const NOW = 1_761_700_000_000;
const HOUR = 3_600_000;

const item = (extra: Partial<InboxItem>): InboxItem => ({
  id: "unit_idle:city_1",
  kind: "unit_idle",
  category: "stalled",
  count: 1,
  deadlineAt: null,
  firstSeenAt: NOW - HOUR,
  params: {},
  target: null,
  actions: [],
  ...extra,
});

function render(items: readonly InboxItem[], extra: Partial<InboxListProps> = {}): string {
  return renderToStaticMarkup(
    createElement(InboxList, { items, now: NOW, onInboxScreen: true, onQuickAction: () => {}, ...extra }),
  );
}

/** 태그를 지운 글(읽는 차례) */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("처리할 일 목록 그리기", () => {
  it("분류마다 아이콘 + 이름 + 줄 수, 줄은 제목·곳·마감·시험 자료·바로 처리 버튼", () => {
    const html = render([
      item({
        id: "wave_incoming:preview_wave_1",
        kind: "wave_incoming",
        category: "threat",
        deadlineAt: NOW + 2 * HOUR,
        params: { place: "Nova" },
        target: { route: "map" },
        actions: ["deploy_defense"],
        preview: true,
      }),
      item({
        id: "unit_idle:preview_base_1",
        count: 6,
        params: { place: "Nova" },
        target: { route: "units" },
        actions: ["auto_assign"],
        preview: true,
      }),
    ]);
    expect(textOf(html)).toBe(
      "위협 1 웨이브가 다가옵니다 Nova 2시간 후 마감 시험 자료 방어 배치 멈춤 1 명령 없는 유닛 6 Nova 시험 자료 자동 배치",
    );
    expect(html).toContain('data-category="threat"');
    expect(html).toContain('href="/map"');
    expect(html).toContain('href="/units"');
    // 분류 아이콘은 꾸밈이다(읽기 프로그램에 숨김)
    expect(html.match(/<svg class="inbox-icon"[^>]*aria-hidden="true"/g)).toHaveLength(2);
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("모르는 종류는 '새 알림'이고 값·버튼을 보이지 않는다. 모르는 동작은 그리지 않고, 모르는 분류의 줄은 끝의 '그 밖의 알림'에", () => {
    const odd = [
      item({
        id: "brand_new:k1",
        kind: "brand_new",
        category: "threat",
        params: { place: "Secret" },
        actions: ["accept"],
        preview: true,
      }),
      item({
        id: "contract_match:c1",
        kind: "contract_match",
        category: "decision",
        actions: ["haggle", "accept"],
        preview: true,
      }),
      { ...item({ id: "unit_idle:x" }), category: JSON.parse('"urgent"') },
      { ...item({ id: "unit_idle:y", target: JSON.parse('{"route":"guild_hall"}') }) },
    ];
    const html = render(odd);
    expect(textOf(html)).toBe(
      "위협 1 새 알림 시험 자료 멈춤 1 명령 없는 유닛 1 제안·결정 1 조건에 맞는 의뢰 시험 자료 수락 그 밖의 알림 1 명령 없는 유닛 1",
    );
    // 처리함에는 늘 모든 항목이 나온다(D-6011): 받은 줄 수 = 그린 줄 수
    expect(html.match(/<li /g)).toHaveLength(odd.length);
    expect(html).toContain('data-category="other"');
    expect(html).not.toContain("Secret");
    expect(html).not.toContain("guild_hall");
    // 처리함 안에서는 갈 화면이 없는 줄에 링크를 두지 않는다
    expect(html).not.toContain("<a ");
  });

  it("처리함 밖(홈)에서는 갈 화면이 없거나 모르는 줄이 처리함(?item=)으로 간다", () => {
    const html = render(
      [
        item({ id: "brand_new:k1", kind: "brand_new" }),
        item({ id: "contract_match:c1", kind: "contract_match", category: "decision" }),
      ],
      {
        onInboxScreen: false,
      },
    );
    expect(html).toContain('href="/inbox?item=brand_new%3Ak1"');
    expect(html).toContain('href="/inbox?item=contract_match%3Ac1"');
  });

  it("?item=의 항목을 강조한다, 실제 항목에는 바로 처리 버튼이 없다(명령을 보낼 길이 아직 없다)", () => {
    const html = render(
      [
        item({ id: "unit_idle:city_1", actions: ["auto_assign"] }),
        item({ id: "unit_idle:city_2", actions: ["auto_assign"] }),
      ],
      { highlightId: "unit_idle:city_2" },
    );
    expect(html.match(/data-highlight="true"/g)).toHaveLength(1);
    expect(html).not.toContain("<button");
  });

  it("모르는 분류가 여럿이어도 '그 밖의 알림' 하나에 받은 차례로, 알려진 분류 뒤에", () => {
    const html = render([
      { ...item({ id: "unit_idle:a" }), category: JSON.parse('"urgent"') },
      item({ id: "craft_done:e1", kind: "craft_done", category: "done" }),
      { ...item({ id: "unit_idle:b", count: 2 }), category: JSON.parse('"__proto__"') },
    ]);
    expect(textOf(html)).toBe("완료 1 제작 완료 그 밖의 알림 2 명령 없는 유닛 1 명령 없는 유닛 2");
    expect(html.match(/data-category="other"/g)).toHaveLength(1);
  });

  it("받은 차례가 섞여 와도 분류 제목은 한 번씩, 분류 순서대로(분류 안은 받은 차례)", () => {
    const html = render([
      item({ id: "craft_done:e1", kind: "craft_done", category: "done" }),
      item({ id: "unit_idle:a", count: 2 }),
      item({ id: "wave_incoming:w1", kind: "wave_incoming", category: "threat" }),
      item({ id: "unit_idle:b", count: 3 }),
    ]);
    expect(textOf(html)).toBe(
      "위협 1 웨이브가 다가옵니다 멈춤 2 명령 없는 유닛 2 명령 없는 유닛 3 완료 1 제작 완료",
    );
    expect(html.match(/data-category="stalled"/g)).toHaveLength(1);
  });

  it("빈 목록은 아무 분류도 그리지 않는다(빈 문구는 화면이 그린다)", () => {
    expect(render([])).toBe('<div class="inbox-list"></div>');
  });
});
