// 처리할 일 문구·링크 시험 — 종류마다 제목, 모르는 종류(더 새 서버)는 "새 알림" + 처리함으로, 마감·개수 표시(ADR 2026-10-29-app-shell 7·12절)
import type { InboxItem } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import { describeItem, formatDue, inboxItemTitle, itemHref } from "./inboxText.ts";

const NOW = 1_761_700_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

const item = (extra: Partial<InboxItem> = {}): InboxItem => ({
  id: "unit_idle:city_1",
  kind: "unit_idle",
  category: "stalled",
  count: 6,
  deadlineAt: null,
  firstSeenAt: NOW - MIN,
  params: { place: "Nova" },
  target: { route: "units" },
  actions: ["auto_assign"],
  ...extra,
});

describe("처리할 일 제목", () => {
  it("종류마다 문구, 묶은 줄은 개수(D-6009 예 '명령 없는 유닛 6')", () => {
    expect(inboxItemTitle(item())).toBe("명령 없는 유닛 6");
    expect(inboxItemTitle(item(), "en")).toBe("Idle units: 6");
    expect(inboxItemTitle(item({ kind: "wave_incoming", count: 1 }))).toBe("웨이브가 다가옵니다");
    expect(inboxItemTitle(item({ kind: "craft_done", count: 1 }), "en")).toBe("Crafting done");
  });

  it("큰 수는 언어에 맞게 자리를 나눈다", () => {
    expect(inboxItemTitle(item({ count: 12_345 }))).toBe("명령 없는 유닛 12,345");
    expect(inboxItemTitle(item({ count: 12_345 }), "en")).toBe("Idle units: 12,345");
  });

  it("모르는 종류(더 새 서버)는 '새 알림'", () => {
    expect(inboxItemTitle(item({ kind: "ransom_offer_v2" }))).toBe("새 알림");
    expect(inboxItemTitle(item({ kind: "__proto__" }), "en")).toBe("New alert");
  });
});

describe("처리할 일 링크", () => {
  it("아는 종류는 이동 화면(target)으로", () => {
    expect(itemHref(item(), true)).toBe("/units");
    expect(itemHref(item({ target: { route: "inbox", search: { item: "x:y" } } }), false)).toBe(
      "/inbox?item=x%3Ay",
    );
  });

  it("이동 화면이 없거나 모르는 화면·모르는 종류면 처리함으로(처리함 화면 안에서는 링크 없음)", () => {
    for (const odd of [
      item({ target: null }),
      item({ kind: "brand_new_kind" }),
      // 더 새 서버가 보낸 모르는 주소 ID·틀린 매개변수
      { ...item(), target: JSON.parse('{"route":"guild_hall"}') },
      { ...item(), target: JSON.parse('{"route":"units","search":[]}') },
    ]) {
      expect(itemHref(odd, false)).toBe("/inbox?item=unit_idle%3Acity_1");
      expect(itemHref(odd, true)).toBeNull();
    }
  });
});

describe("마감", () => {
  it("남은 시간: 1시간 안은 분, 48시간 안은 시간, 그 뒤는 날", () => {
    expect(formatDue(NOW + 20 * MIN, NOW, "ko")).toBe("20분 후 마감");
    expect(formatDue(NOW + 30 * 1_000, NOW, "ko")).toBe("1분 후 마감");
    expect(formatDue(NOW + 26 * HOUR, NOW, "ko")).toBe("26시간 후 마감");
    expect(formatDue(NOW + 72 * HOUR, NOW, "ko")).toBe("3일 후 마감");
    expect(formatDue(NOW + 2 * HOUR, NOW, "en")).toBe("Due in 2 hours");
    expect(formatDue(NOW + MIN, NOW, "en")).toBe("Due in 1 minute");
  });

  it("지났으면 '마감 지남', 마감이 없으면 null", () => {
    expect(formatDue(NOW - MIN, NOW, "ko")).toBe("마감 지남");
    expect(formatDue(NOW, NOW, "en")).toBe("Overdue");
    expect(formatDue(null, NOW, "ko")).toBeNull();
  });
});

describe("줄 하나의 모습", () => {
  it("제목·곳·마감·시험 자료·링크를 한 번에", () => {
    expect(
      describeItem(item({ deadlineAt: NOW + 5 * HOUR, preview: true }), { now: NOW, onInboxScreen: true }),
    ).toEqual({
      title: "명령 없는 유닛 6",
      place: "Nova",
      due: "5시간 후 마감",
      href: "/units",
      preview: true,
      known: true,
    });
  });

  it("모르는 종류는 값(params)을 보이지 않는다(뜻을 모른다)", () => {
    expect(
      describeItem(item({ kind: "brand_new_kind", params: { place: 7 } }), {
        now: NOW,
        onInboxScreen: false,
      }),
    ).toEqual({
      title: "새 알림",
      place: null,
      due: null,
      href: "/inbox?item=unit_idle%3Acity_1",
      preview: false,
      known: false,
    });
  });
});
