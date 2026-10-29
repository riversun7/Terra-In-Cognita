// 홈 그리기 시험 — 더 새 서버가 보낸 모르는 값(분류·종류·동작·화면)이 와도 홈이 깨지지 않고, 처리함 화면(W3)과 같은 규칙으로 그린다
// (ADR 2026-10-29-app-shell 7절: 모르는 종류는 "새 알림"이고 처리함으로, 실제 항목에는 명령을 보낼 길이 생길 때까지 바로 처리 단추가 없다).
// react-dom/server로 HTML을 만들어 본다(브라우저 없이). 화면 확인은 저장소 밖 Playwright 스크립트(작업 기록).
import { HOME_CARDS, type HomeCardEntry, type HomeTemplate, isCardId } from "@terra/shared/dashboard";
import type { InboxItem, InboxListResponse, SummaryGetResponse } from "@terra/shared/inbox";
import { type ComponentType, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { cardTitle } from "./cards/registry.tsx";
import type { HomeData } from "./homeData.ts";
import type { TemplateProps } from "./homeTypes.ts";
import { gridCards } from "./homeView.ts";
import BriefTemplate from "./templates/BriefTemplate.tsx";
import CityTemplate from "./templates/CityTemplate.tsx";
import GridTemplate from "./templates/GridTemplate.tsx";
import HybridTemplate from "./templates/HybridTemplate.tsx";
import InboxTemplate from "./templates/InboxTemplate.tsx";
import TimelineTemplate from "./templates/TimelineTemplate.tsx";
import { TodoList } from "./TodoList.tsx";

// 연결·성능 카드(W1 DiagnosticsPanel → shell/ConnectionNotice.tsx)가 SW 등록(virtual:pwa-register, Vite 전용 모듈)을 가져온다.
// 그리기 시험에는 필요 없어 비운다([새로고침]을 누르지 않는다)
vi.mock("../pwa/updates.ts", () => ({ forceUpdate: () => undefined }));

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

/** 더 새 서버가 보낸, 이 기기가 모르는 분류의 줄(타입은 닫힌 목록이라 JSON으로 만든다) */
const rumor = (): InboxItem => ({
  ...item({ id: "rumor_heard:x_1", kind: "rumor_heard", actions: ["accept"], target: { route: "units" } }),
  category: JSON.parse('"rumor"'),
});

function data(items: readonly InboxItem[], summary: SummaryGetResponse | null = null): HomeData {
  const inbox: InboxListResponse = {
    generatedAt: NOW,
    items,
    counts: { threat: 0, money_survival: 0, stalled: items.length, decision: 0, done: 0 },
    badges: {},
  };
  return {
    inbox: { status: "ready", value: inbox },
    cards: { status: "ready", value: { cards: [] } },
    summary: summary === null ? { status: "idle", value: null } : { status: "ready", value: summary },
  };
}

/** 그리기 시험에서는 프레임을 재지 않는다(연결·성능 카드를 넣지 않는다) */
const NO_MONITOR: FrameMonitor = {
  subscribe: () => () => undefined,
  drain: () => null,
  stop: () => undefined,
};

function renderList(items: readonly InboxItem[], extra: { actions?: boolean } = {}): string {
  return renderToStaticMarkup(createElement(TodoList, { items, now: NOW, ...extra }));
}

/** 태그를 지운 글(읽는 차례) */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("처리할 일 줄", () => {
  it("아는 종류: 제목·곳 이름(번역 안 함)·남은 시간 마감·시험 자료·바로 처리 단추, 아는 화면으로 간다", () => {
    const html = renderList([
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
    ]);
    expect(textOf(html)).toBe("웨이브가 다가옵니다 위협 Nova 2시간 후 마감 시험 자료 방어 배치");
    expect(html).toContain('href="/map"');
    expect(html).toContain('translate="no"');
    expect(html).toContain('data-category="threat"');
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("마감은 남은 시간을 내림한다(W3 문구): 1분 안·분·시간·날, 지난 마감은 '마감 지남'이고 표시가 붙는다", () => {
    const due = (left: number) => textOf(renderList([item({ deadlineAt: NOW + left })]));
    expect(due(30_000)).toContain("1분 안에 마감");
    expect(due(59.5 * 60_000)).toContain("59분 후 마감");
    expect(due(91 * 60_000)).toContain("1시간 후 마감");
    expect(due(2.5 * 24 * HOUR)).toContain("2일 후 마감");
    const html = renderList([item({ deadlineAt: NOW - 1 })]);
    expect(textOf(html)).toContain("마감 지남");
    expect(html).toContain('data-overdue="true"');
  });

  it("모르는 분류·종류(더 새 서버): 깨지지 않고 기본 아이콘 + '새 알림', 값·단추 없이 처리함으로 간다", () => {
    const html = renderList([rumor()]);
    expect(textOf(html)).toBe("새 알림");
    expect(html).toContain('href="/inbox?item=rumor_heard%3Ax_1"');
    expect(html).toContain('data-category="other"');
    expect(html).not.toContain("<button");
    // 분류 이름 칸이 없다(모르는 분류의 ID를 글자·분류 표시로 그리지 않는다)
    expect(textOf(html)).not.toContain("rumor");
    expect(html).not.toContain('data-category="rumor"');
  });

  it("모르는 종류 + 아는 화면·동작: 처리함으로 가고 단추가 없다(종류를 모르면 동작의 뜻도 모른다)", () => {
    const html = renderList([
      item({
        id: "guild_call:g_1",
        kind: "guild_call",
        target: { route: "units" },
        actions: ["accept"],
        preview: true,
      }),
    ]);
    expect(html).toContain('href="/inbox?item=guild_call%3Ag_1"');
    expect(html).not.toContain('href="/units"');
    expect(html).not.toContain("<button");
  });

  it("실제 항목(시안 자료가 아님)에는 바로 처리 단추가 없다. 모르는 동작 ID도 그리지 않는다", () => {
    expect(renderList([item({ actions: ["auto_assign"] })])).not.toContain("<button");
    const html = renderList([
      item({
        id: "contract_match:c_1",
        kind: "contract_match",
        category: "decision",
        actions: ["haggle", "accept"],
        preview: true,
      }),
    ]);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(textOf(html)).toContain("수락");
  });

  it("모르는 화면(더 새 서버)은 처리함으로", () => {
    const html = renderList([item({ target: JSON.parse('{"route":"guild_hall"}') })]);
    expect(html).toContain('href="/inbox?item=unit_idle%3Acity_1"');
    expect(html).not.toContain("guild_hall");
  });
});

const TEMPLATES: readonly [HomeTemplate, ComponentType<TemplateProps>][] = [
  ["dt_hybrid", HybridTemplate],
  ["dt_grid", GridTemplate],
  ["dt_inbox", InboxTemplate],
  ["dt_timeline", TimelineTemplate],
  ["dt_city", CityTemplate],
  ["dt_brief", BriefTemplate],
];

/** 템플릿 하나를 그린다. 격자 카드는 그 템플릿의 규칙대로(머리 카드는 빼고, 격자 템플릿은 처리할 일 카드를 맨 앞에) */
function renderTemplate(
  template: HomeTemplate,
  homeData: HomeData,
  cards: readonly HomeCardEntry[] = [],
): string {
  const Template = TEMPLATES.find(([id]) => id === template)?.[1];
  if (Template === undefined) throw new Error(template);
  return renderToStaticMarkup(
    createElement(Template, { cards: gridCards(template, cards), data: homeData, monitor: NO_MONITOR }),
  );
}

describe("템플릿", () => {
  it.each(TEMPLATES)("%s: 모르는 분류의 줄이 와도 그린다(빼지 않는다)", (template) => {
    const text = textOf(renderTemplate(template, data([item({}), rumor()]), [{ id: "inbox", size: "2x2" }]));
    expect(text).toContain("명령 없는 유닛 1");
    expect(text).toContain("새 알림");
  });

  it("처리함 템플릿: 모르는 분류의 줄은 끝의 '그 밖의 알림' 묶음", () => {
    const text = textOf(renderTemplate("dt_inbox", data([rumor(), item({})])));
    expect(text.indexOf("멈춤")).toBeLessThan(text.indexOf("그 밖의 알림"));
    expect(text).toMatch(/그 밖의 알림 1 새 알림$/);
  });

  it("처리할 일이 없으면 빈 문구(수 없음)", () => {
    for (const [template] of TEMPLATES) {
      const text = textOf(renderTemplate(template, data([])));
      expect(text, template).toContain(
        template === "dt_brief" ? "보고할 일이 없습니다." : "지금 처리할 일이 없습니다.",
      );
      expect(text, template).not.toMatch(/\d/);
    }
  });

  it("격자의 2×1 처리할 일 카드: 앞 3줄 + 처리함에서 더 보기와 가린 줄의 분류별 수(마감 없는 멈춤·완료도 보인다)", () => {
    const items = [
      item({ id: "wave_incoming:w_1", kind: "wave_incoming", category: "threat", deadlineAt: NOW + HOUR }),
      item({
        id: "siege_declared:s_1",
        kind: "siege_declared",
        category: "threat",
        deadlineAt: NOW + 2 * HOUR,
      }),
      item({
        id: "goods_spoiling:g_1",
        kind: "goods_spoiling",
        category: "money_survival",
        deadlineAt: NOW + 3 * HOUR,
      }),
      item({ id: "unit_idle:u_1", count: 6 }),
      item({ id: "craft_done:e_1", kind: "craft_done", category: "done" }),
    ];
    const text = textOf(renderTemplate("dt_grid", data(items), [{ id: "inbox", size: "2x1" }]));
    expect(text).toContain("처리함에서 2개 더 보기 멈춤 1 완료 1");
    expect(text).not.toContain("명령 없는 유닛 6");
  });

  it("도시 템플릿: 처리할 일이 도시 판보다 먼저다", () => {
    const html = renderTemplate("dt_city", data([item({})]));
    expect(html.indexOf("명령 없는 유닛 1")).toBeLessThan(html.indexOf("city-plate"));
  });

  it("타임라인 템플릿: 완료는 '지금'에 넣지 않고 맨 끝", () => {
    const items = [
      item({ id: "craft_done:e_1", kind: "craft_done", category: "done" }),
      item({ id: "wave_incoming:w_1", kind: "wave_incoming", category: "threat", deadlineAt: NOW + HOUR }),
      item({}),
    ];
    const text = textOf(renderTemplate("dt_timeline", data(items)));
    expect(text).toMatch(
      /지금 명령 없는 유닛 1 멈춤 다가올 일 1시간 후 마감 웨이브가 다가옵니다 위협 완료 제작 완료$/,
    );
  });

  it("부관 보고: 복귀 요약 칸은 이름 + 수(대화상자와 같다), 모르는 칸·사건 없는 칸은 뺀다", () => {
    const summary: SummaryGetResponse = {
      show: true,
      since: NOW - 8 * HOUR,
      until: NOW,
      sections: [
        { kind: "production", count: 3, params: {}, target: { route: "economy" }, preview: true },
        { kind: "injury", count: 0, params: {}, target: null },
        { kind: "rumor_mill", count: 9, params: {}, target: null },
      ],
    };
    const html = renderTemplate("dt_brief", data([], summary));
    expect(textOf(html)).toContain("생산 완료 3");
    expect(html).toContain('href="/economy"');
    expect(textOf(html)).not.toContain("부상");
    expect(textOf(html)).not.toContain("9");
  });
});

describe("카드 목록", () => {
  it("카드마다 이름이 있다", () => {
    const ids = Object.keys(HOME_CARDS).filter(isCardId);
    expect(ids).toHaveLength(9);
    for (const id of ids) expect(cardTitle(id), id).not.toBe("");
  });
});
