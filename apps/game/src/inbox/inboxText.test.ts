// 처리할 일 문구·링크 시험 — 종류마다 제목, 모르는 종류(더 새 서버)는 "새 알림" + 처리함으로, 마감(내림)·개수 표시
// (ADR 2026-10-29-app-shell 7·12절)
import { INBOX_CATEGORIES, type InboxItem } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_ORDER,
  describeItem,
  formatDue,
  inboxItemTitle,
  isInboxItemTarget,
  itemTarget,
} from "./inboxText.ts";

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

describe("분류 순서", () => {
  it("공용 분류 목록(정렬 순위)과 같다", () => {
    expect(CATEGORY_ORDER).toEqual(INBOX_CATEGORIES);
  });
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
    expect(itemTarget(item(), true)).toEqual({ route: "units" });
    expect(itemTarget(item({ target: { route: "inbox", search: { item: "x:y" } } }), false)).toEqual({
      route: "inbox",
      search: { item: "x:y" },
    });
  });

  it("이동 화면이 없거나 모르는 화면·모르는 종류면 처리함(?item=)으로(처리함 화면 안에서는 링크 없음)", () => {
    for (const odd of [
      item({ target: null }),
      item({ kind: "brand_new_kind" }),
      // 더 새 서버가 보낸 모르는 주소 ID·틀린 매개변수
      { ...item(), target: JSON.parse('{"route":"guild_hall"}') },
      { ...item(), target: JSON.parse('{"route":"units","search":[]}') },
    ]) {
      expect(itemTarget(odd, false)).toEqual({ route: "inbox", search: { item: "unit_idle:city_1" } });
      expect(itemTarget(odd, true)).toBeNull();
    }
  });

  it("처리함의 한 줄을 가리키는지(그리로 옮기면 그 줄에 초점)", () => {
    expect(isInboxItemTarget({ route: "inbox", search: { item: "unit_idle:city_1" } })).toBe(true);
    expect(isInboxItemTarget({ route: "inbox" })).toBe(false);
    expect(isInboxItemTarget({ route: "inbox", search: { item: undefined } })).toBe(false);
    expect(isInboxItemTarget({ route: "units" })).toBe(false);
  });
});

describe("마감", () => {
  it("남은 시간: 1시간 안은 분, 48시간 안은 시간, 그 뒤는 날", () => {
    expect(formatDue(NOW + 20 * MIN, NOW, "ko")).toBe("20분 후 마감");
    expect(formatDue(NOW + 26 * HOUR, NOW, "ko")).toBe("26시간 후 마감");
    expect(formatDue(NOW + 72 * HOUR, NOW, "ko")).toBe("3일 후 마감");
    expect(formatDue(NOW + 2 * HOUR, NOW, "en")).toBe("Due in 2 hours");
    expect(formatDue(NOW + MIN, NOW, "en")).toBe("Due in 1 minute");
  });

  it("내림해서 남은 시간을 늘려 말하지 않는다(위협·대출 마감을 놓치지 않게). 1분 안은 '1분 안에 마감'", () => {
    // 2일 12시간 → 2일(반올림이면 3일)
    expect(formatDue(NOW + 60 * HOUR, NOW, "ko")).toBe("2일 후 마감");
    expect(formatDue(NOW + 60 * HOUR, NOW, "en")).toBe("Due in 2 days");
    // 1시간 31분 → 1시간(반올림이면 2시간)
    expect(formatDue(NOW + 91 * MIN, NOW, "ko")).toBe("1시간 후 마감");
    // 59분 30초 → 59분(올림이면 "60분")
    expect(formatDue(NOW + 59.5 * MIN, NOW, "ko")).toBe("59분 후 마감");
    // 47시간 59분 → 47시간, 48시간부터 날
    expect(formatDue(NOW + 48 * HOUR - MIN, NOW, "ko")).toBe("47시간 후 마감");
    expect(formatDue(NOW + 48 * HOUR, NOW, "ko")).toBe("2일 후 마감");
    expect(formatDue(NOW + 30 * 1_000, NOW, "ko")).toBe("1분 안에 마감");
    expect(formatDue(NOW + 1, NOW, "en")).toBe("Due in under a minute");
    expect(formatDue(NOW + 90 * 1_000, NOW, "ko")).toBe("1분 후 마감");
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
      target: { route: "units" },
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
      target: { route: "inbox", search: { item: "unit_idle:city_1" } },
      href: "/inbox?item=unit_idle%3Acity_1",
      preview: false,
      known: false,
    });
  });
});
