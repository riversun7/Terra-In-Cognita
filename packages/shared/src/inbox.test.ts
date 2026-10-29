// 처리할 일 자료 시험 — 분류·순위, 종류 표 모양, 항목 ID 규칙, 전송 타입(ADR 2026-10-29-app-shell 7·8·13절)
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  INBOX_CATEGORIES,
  INBOX_ITEM_ID_PATTERN,
  INBOX_KINDS,
  type InboxItem,
  type InboxKindId,
  type InboxListResponse,
  SUMMARY_SECTION_KINDS,
  type SummaryGetResponse,
  inboxCategoryRank,
  inboxItemId,
  isInboxCategory,
  isInboxKindId,
  isSummarySectionKind,
  parseInboxItemId,
} from "./inbox.ts";
import { isNavItemId } from "./navigation.ts";
import { isRouteId, isRouteTarget } from "./routes.ts";
import { SAVED_ID_PATTERN } from "./savedId.ts";

describe("분류", () => {
  it("위협 1 → 돈·생존 2 → 멈춤 3 → 제안·결정 4 → 완료 5(D-6006·D-6009)", () => {
    expect(INBOX_CATEGORIES).toEqual(["threat", "money_survival", "stalled", "decision", "done"]);
    expect(INBOX_CATEGORIES.map(inboxCategoryRank)).toEqual([1, 2, 3, 4, 5]);
    for (const category of INBOX_CATEGORIES) expect(category).toMatch(SAVED_ID_PATTERN);
    expect(isInboxCategory("done")).toBe(true);
    expect(isInboxCategory("urgent")).toBe(false);
  });
});

describe("종류 표", () => {
  const kinds = Object.entries(INBOX_KINDS);

  it("시안 자료용 8개, 모두 planned(제공 함수 없음)", () => {
    expect(Object.keys(INBOX_KINDS)).toEqual([
      "wave_incoming",
      "siege_declared",
      "goods_spoiling",
      "unit_injured",
      "unit_idle",
      "building_stopped",
      "contract_match",
      "craft_done",
    ]);
    for (const [kind, definition] of kinds) expect(definition.planned, kind).toBe(true);
  });

  it("5분류를 모두 덮고, 표 순서가 분류 순서다(시안 자료가 순서대로 보인다)", () => {
    const categories = kinds.map(([, definition]) => definition.category);
    expect(new Set(categories)).toEqual(new Set(INBOX_CATEGORIES));
    const ranks = categories.map(inboxCategoryRank);
    expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
  });

  it("ID·동작은 저장되는 ID 모양, 동작은 0~2개, 이동 화면·배지는 표에 있는 것", () => {
    for (const [kind, definition] of kinds) {
      expect(kind).toMatch(SAVED_ID_PATTERN);
      expect(definition.actions.length, kind).toBeLessThanOrEqual(2);
      expect(new Set(definition.actions).size, kind).toBe(definition.actions.length);
      for (const action of definition.actions) expect(action, kind).toMatch(SAVED_ID_PATTERN);
      if (definition.route !== null) expect(isRouteId(definition.route), kind).toBe(true);
      if (definition.badge !== null) expect(isNavItemId(definition.badge), kind).toBe(true);
    }
  });

  it("완료 분류 종류는 묶지 않는다(항목 ID가 사건 ID이고 확인도 사건마다다)", () => {
    const done = kinds.filter(([, definition]) => definition.category === "done");
    expect(done.length).toBeGreaterThan(0);
    for (const [kind, definition] of done) expect(definition.grouped, kind).toBe(false);
  });

  it("묶는 종류와 묶지 않는 종류, 바로 처리 0·1·2개가 모두 있다(시안 자료가 모든 모양을 보인다)", () => {
    const grouped = kinds.map(([, definition]) => definition.grouped);
    expect(grouped).toContain(true);
    expect(grouped).toContain(false);
    const actionCounts = new Set(kinds.map(([, definition]) => definition.actions.length));
    expect(actionCounts).toEqual(new Set([0, 1, 2]));
  });

  it("isInboxKindId는 표의 종류만 받는다", () => {
    expect(isInboxKindId("unit_idle")).toBe(true);
    expect(isInboxKindId("ransom_offer")).toBe(false);
    expect(isInboxKindId("constructor")).toBe(false);
    expectTypeOf<InboxKindId>().toEqualTypeOf<keyof typeof INBOX_KINDS>();
  });
});

describe("항목 ID", () => {
  it("<종류>:<묶음 키 또는 사건 ID>", () => {
    expect(inboxItemId("unit_idle", "city_12")).toBe("unit_idle:city_12");
    expect(inboxItemId("craft_done", "40213")).toBe("craft_done:40213");
    expect(inboxItemId("upkeep_short", "all")).toBe("upkeep_short:all");
    expect(parseInboxItemId("unit_idle:city_12")).toEqual({ kind: "unit_idle", key: "city_12" });
  });

  it("모양이 틀리면 만들 때 예외, 읽을 때 null", () => {
    for (const [kind, key] of [
      ["unit_idle", ""],
      ["unit_idle", "City"],
      ["unit_idle", "a.b"],
      ["unit_idle", "a:b"],
      ["Unit_idle", "x"],
      ["u", "x"],
      ["unit_idle", "a".repeat(65)],
    ] as const) {
      expect(() => inboxItemId(kind, key), `${kind}:${key}`).toThrow(RangeError);
      expect(parseInboxItemId(`${kind}:${key}`), `${kind}:${key}`).toBeNull();
    }
    expect(parseInboxItemId("unit_idle")).toBeNull();
    expect(parseInboxItemId(12)).toBeNull();
    expect(INBOX_ITEM_ID_PATTERN.test("unit_idle:city_12\n")).toBe(false);
  });
});

describe("전송 타입", () => {
  it("inbox.list 응답: 시각은 서버 UTC ms, target은 주소 표의 화면", () => {
    const item: InboxItem = {
      id: "unit_idle:city_12",
      kind: "unit_idle",
      category: "stalled",
      count: 6,
      deadlineAt: null,
      firstSeenAt: 1_761_700_000_000,
      params: { city: "북항", units: 6 },
      target: { route: "units" },
      actions: ["auto_assign"],
      preview: true,
    };
    const response: InboxListResponse = {
      generatedAt: 1_761_700_001_000,
      items: [item],
      counts: { threat: 0, money_survival: 0, stalled: 1, decision: 0, done: 0 },
      badges: { units: 1 },
    };
    expect(isRouteTarget(item.target)).toBe(true);
    // 모르는 메뉴 항목 배지는 읽으면 undefined다(그리지 않는다)
    expectTypeOf(response.badges["trade"]).toEqualTypeOf<number | undefined>();
    // 종류는 문자열이다: 더 새 서버의 모르는 종류도 담긴다
    expectTypeOf<InboxItem["kind"]>().toEqualTypeOf<string>();
    expect(response.items[0]?.count).toBe(6);
  });

  it("summary.get 응답과 복귀 요약 칸 4종(D-6014)", () => {
    expect(SUMMARY_SECTION_KINDS).toEqual(["production", "raid", "injury", "world_news"]);
    for (const kind of SUMMARY_SECTION_KINDS) expect(kind).toMatch(SAVED_ID_PATTERN);
    expect(isSummarySectionKind("raid")).toBe(true);
    expect(isSummarySectionKind("weather")).toBe(false);
    const empty: SummaryGetResponse = { show: false, since: null, until: 1_761_700_000_000, sections: [] };
    expect(empty.show).toBe(false);
  });
});
