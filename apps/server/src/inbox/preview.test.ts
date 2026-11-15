// 시안 자료 시험 — dev·admin이 템플릿을 비교할 때 보는 처리할 일·복귀 요약(ADR 2026-10-29-app-shell 6절 "시안 자료", 사용자 결정 2)
import { INBOX_KINDS } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import { orderInbox } from "./order.ts";
import { PREVIEW_SUMMARY_SPAN_MS, previewInboxEntries, previewSummarySections } from "./preview.ts";

const NOW = 1_761_700_000_000;

describe("처리할 일 시안 자료", () => {
  const list = orderInbox(previewInboxEntries(NOW), NOW);

  it("종류 표의 시안 자료 8종류가 5분류 순서로, 마감 없는 항목은 그 분류의 끝에 온다", () => {
    expect(
      list.items.map(({ id, category, count, deadlineAt }) => [id, category, count, deadlineAt]),
    ).toEqual([
      ["wave_incoming:preview_wave_1", "threat", 1, NOW + 2 * 3_600_000],
      ["siege_declared:preview_siege_1", "threat", 1, NOW + 26 * 3_600_000],
      ["goods_spoiling:preview_store_1", "money_survival", 2, NOW + 5 * 3_600_000],
      ["unit_injured:preview_base_1", "money_survival", 2, null],
      ["building_stopped:preview_base_2", "stalled", 1, null],
      ["unit_idle:preview_base_1", "stalled", 6, null],
      ["contract_match:preview_contract_1", "decision", 1, NOW + 20 * 3_600_000],
      ["craft_done:preview_event_1", "done", 1, null],
    ]);
    // 시안 자료가 없는 종류: 정찰 끝(scout_returned, 기획 답 612 나)·가문 셋(house_*, 질문 985)·배 둘(boat_*, D-559 1523·1528)
    // — 실제 제공 함수만, 시안 자료 8개는 그대로
    expect(new Set(list.items.map((item) => item.kind))).toEqual(
      new Set(
        Object.keys(INBOX_KINDS).filter(
          (kind) => kind !== "scout_returned" && !kind.startsWith("house_") && !kind.startsWith("boat_"),
        ),
      ),
    );
  });

  it("모든 줄에 시안 자료 표시가 있고, 키는 preview_로 시작해 실제 항목 ID와 겹치지 않는다", () => {
    for (const item of list.items) {
      expect(item.preview, item.id).toBe(true);
      expect(item.id.split(":")[1], item.id).toMatch(/^preview_/);
    }
  });

  it("바로 처리 0·1·2개와 처리함으로 가는 줄(target null)이 모두 있다", () => {
    expect(new Set(list.items.map((item) => item.actions.length))).toEqual(new Set([0, 1, 2]));
    expect(list.items.some((item) => item.target === null)).toBe(true);
  });

  it("분류별 줄 수와 메뉴 배지: 종 배지(완료 뺀 줄)는 7", () => {
    expect(list.counts).toEqual({ threat: 2, money_survival: 2, stalled: 2, decision: 1, done: 1 });
    expect(list.badges).toEqual({ faction: 1, economy: 1, units: 2 });
  });

  it("시각은 지금을 기준으로 만든다(처음 생긴 시각은 과거, 마감은 미래)", () => {
    for (const item of list.items) {
      expect(item.firstSeenAt, item.id).toBeLessThan(NOW);
      if (item.deadlineAt !== null) expect(item.deadlineAt, item.id).toBeGreaterThan(NOW);
    }
  });
});

describe("복귀 요약 시안 자료", () => {
  it("칸 4종(생산·습격과 방어·부상·세계 소식, D-6014)이 모두 시안 자료", () => {
    expect(previewSummarySections()).toEqual([
      { kind: "production", count: 3, params: {}, target: { route: "economy" }, preview: true },
      { kind: "raid", count: 1, params: {}, target: { route: "map" }, preview: true },
      { kind: "injury", count: 2, params: {}, target: { route: "units" }, preview: true },
      { kind: "world_news", count: 4, params: {}, target: null, preview: true },
    ]);
    expect(PREVIEW_SUMMARY_SPAN_MS).toBe(8 * 3_600_000);
  });
});
