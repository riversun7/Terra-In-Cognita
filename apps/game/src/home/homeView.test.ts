// 홈 화면 규칙 시험 — 템플릿 고르기(역할·주소), 머리 카드·격자 카드, 받을 자료, 타임라인 나누기, 분류별 묶음
import { DEFAULT_HOME_TEMPLATE, HOME_TEMPLATES, type HomeCardEntry } from "@terra/shared/dashboard";
import type { InboxItem } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import {
  canUseHomeTools,
  chooseTemplate,
  gridCards,
  groupByCategory,
  headItems,
  heroCards,
  homeNeeds,
  listedIn,
  nonZeroCounts,
  sameNeeds,
  splitTimeline,
} from "./homeView.ts";

const card = (id: string, size = "1x1"): HomeCardEntry => ({ id, size });

function item(id: string, overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    kind: id.split(":")[0] ?? id,
    category: "stalled",
    count: 1,
    deadlineAt: null,
    firstSeenAt: 0,
    params: {},
    target: null,
    actions: [],
    ...overrides,
  };
}

describe("chooseTemplate", () => {
  it("플레이어는 저장값·주소와 상관없이 늘 기본 템플릿(조합)이다", () => {
    expect(chooseTemplate(["player"], "dt_city", "dt_grid")).toEqual({
      template: DEFAULT_HOME_TEMPLATE,
      from: "fixed",
    });
    expect(chooseTemplate(["gm"], "dt_grid", undefined).template).toBe("dt_hybrid");
  });

  it("dev·admin은 주소 ?template=이 먼저, 없거나 모르는 값이면 저장값이다", () => {
    expect(chooseTemplate(["admin"], "dt_grid", "dt_city")).toEqual({ template: "dt_city", from: "address" });
    expect(chooseTemplate(["dev"], "dt_grid", "nope")).toEqual({ template: "dt_grid", from: "saved" });
    expect(chooseTemplate(["player", "dev"], "dt_brief", undefined)).toEqual({
      template: "dt_brief",
      from: "saved",
    });
    expect(canUseHomeTools(["player", "gm"])).toBe(false);
  });
});

describe("머리 카드·격자 카드", () => {
  const cards = [
    card("cyborg"),
    card("inbox", "2x2"),
    card("future_card", "9x9"),
    card("timeline", "2x1"),
    card("briefing", "1x1"),
  ];

  it("격자 템플릿만 머리가 없고, 나머지는 처리할 일을 머리로 둔다", () => {
    for (const template of HOME_TEMPLATES) {
      expect(heroCards(template).includes("inbox"), template).toBe(template !== "dt_grid");
    }
  });

  it("격자에는 아는 카드만 저장 순서대로, 머리 카드는 빼고, 틀린 크기는 기본 크기로 그린다", () => {
    expect(gridCards("dt_grid", cards)).toEqual([
      { id: "cyborg", size: "1x1" },
      { id: "inbox", size: "2x2" },
      { id: "timeline", size: "2x1" },
      { id: "briefing", size: "2x1" },
    ]);
    expect(gridCards("dt_hybrid", cards).map((entry) => entry.id)).toEqual([
      "cyborg",
      "timeline",
      "briefing",
    ]);
    expect(gridCards("dt_timeline", cards).map((entry) => entry.id)).toEqual(["cyborg", "briefing"]);
    expect(gridCards("dt_brief", cards).map((entry) => entry.id)).toEqual(["cyborg", "timeline"]);
  });

  it("격자 템플릿에서 처리할 일 카드가 없으면 맨 앞에 넣어 그린다", () => {
    expect(gridCards("dt_grid", [card("units")])).toEqual([
      { id: "inbox", size: "2x1" },
      { id: "units", size: "1x1" },
    ]);
  });

  it("편집 목록은 아는 카드 중 머리가 아닌 것이다", () => {
    const listed = listedIn("dt_hybrid");
    expect(cards.filter(listed).map((entry) => entry.id)).toEqual(["cyborg", "timeline", "briefing"]);
    expect(cards.filter(listedIn("dt_grid")).map((entry) => entry.id)).toContain("inbox");
  });
});

describe("homeNeeds", () => {
  it("보이는 서버 카드만(정렬해서), 부관 보고가 보일 때만 복귀 요약을 받는다", () => {
    const cards = [card("units"), card("inbox", "2x1"), card("cyborg"), card("maps", "2x1")];
    expect(homeNeeds("dt_hybrid", cards, false)).toEqual({
      serverCardIds: ["cyborg", "units"],
      summary: false,
      preview: false,
    });
    expect(homeNeeds("dt_brief", cards, true).summary).toBe(true);
    expect(homeNeeds("dt_hybrid", [...cards, card("briefing", "2x1")], false).summary).toBe(true);
    expect(homeNeeds("dt_grid", [], false).serverCardIds).toEqual([]);
  });

  it("같은 고르기는 순서만 같으면 같다고 본다", () => {
    const a = homeNeeds("dt_hybrid", [card("units"), card("cyborg")], false);
    const b = homeNeeds("dt_grid", [card("cyborg"), card("units")], false);
    expect(sameNeeds(a, b)).toBe(true);
    expect(sameNeeds(a, { ...b, preview: true })).toBe(false);
  });
});

describe("처리할 일 나누기", () => {
  const items = [
    item("wave_incoming:city_1", { category: "threat", deadlineAt: 5_000 }),
    item("unit_injured:city_1", { category: "money_survival" }),
    item("goods_spoiling:wh_1", { category: "money_survival", deadlineAt: 2_000 }),
    item("unit_idle:city_1"),
    item("contract_match:c_7", { category: "decision", deadlineAt: 2_000 }),
    item("craft_done:e_9", { category: "done" }),
  ];

  it("타임라인: 마감 없는 일은 받은 순서로 '지금'에, 마감 있는 일은 마감 순서(같으면 받은 순서)로", () => {
    const { now, upcoming } = splitTimeline(items);
    expect(now.map((entry) => entry.id)).toEqual([
      "unit_injured:city_1",
      "unit_idle:city_1",
      "craft_done:e_9",
    ]);
    expect(upcoming.map((entry) => entry.id)).toEqual([
      "goods_spoiling:wh_1",
      "contract_match:c_7",
      "wave_incoming:city_1",
    ]);
    // 마감 없는 항목도 빠지지 않는다
    expect(now.length + upcoming.length).toBe(items.length);
  });

  it("분류별 묶음은 분류 순서·받은 순서이고 빈 분류는 없다. 모르는 분류(더 새 서버)는 끝의 other 묶음", () => {
    expect(groupByCategory(items).map((group) => [group.key, group.items.length])).toEqual([
      ["threat", 1],
      ["money_survival", 2],
      ["stalled", 1],
      ["decision", 1],
      ["done", 1],
    ]);
    expect(groupByCategory([])).toEqual([]);
    const rumor = { ...item("rumor_heard:x_1"), category: JSON.parse('"rumor"') };
    expect(groupByCategory([rumor, ...items]).map((group) => group.key)).toEqual([
      "threat",
      "money_survival",
      "stalled",
      "decision",
      "done",
      "other",
    ]);
  });

  it("앞 몇 줄과 가린 줄", () => {
    expect(headItems(items, 4).hidden.map((entry) => entry.id)).toEqual([
      "contract_match:c_7",
      "craft_done:e_9",
    ]);
    expect(headItems(items, 10)).toEqual({ shown: items, hidden: [] });
  });

  it("분류별 수(접은 처리할 일 머리)는 0이 아닌 분류만", () => {
    const counts = { threat: 1, money_survival: 2, stalled: 0, decision: 1, done: 3 };
    expect(nonZeroCounts(counts).map((entry) => entry.category)).toEqual([
      "threat",
      "money_survival",
      "decision",
      "done",
    ]);
  });
});
