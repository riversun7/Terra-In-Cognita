// 바로 처리 버튼 시험 — 시안 자료는 버튼만(명령 없음), 실제 항목은 보낼 길이 생길 때까지 버튼 없음, 모르는 동작은 그리지 않는다
import type { InboxItem } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import { quickActionLabel, quickActionsFor } from "./quickActions.ts";

const item = (extra: Partial<InboxItem> = {}): InboxItem => ({
  id: "contract_match:c1",
  kind: "contract_match",
  category: "decision",
  count: 1,
  deadlineAt: null,
  firstSeenAt: 0,
  params: {},
  target: null,
  actions: ["accept", "decline"],
  ...extra,
});

describe("바로 처리 버튼", () => {
  it("시안 자료 항목: 아는 동작을 그 차례대로(0~2개)", () => {
    expect(quickActionsFor(item({ preview: true }))).toEqual(["accept", "decline"]);
    expect(quickActionsFor(item({ preview: true, actions: [] }))).toEqual([]);
  });

  it("모르는 동작(더 새 서버)·모르는 종류는 그리지 않는다", () => {
    expect(quickActionsFor(item({ preview: true, actions: ["haggle", "accept"] }))).toEqual(["accept"]);
    expect(quickActionsFor(item({ preview: true, kind: "brand_new_kind" }))).toEqual([]);
    expect(quickActionsFor(item({ preview: true, actions: ["__proto__", "toString"] }))).toEqual([]);
  });

  it("실제 항목: 명령(inbox_action)이 아직 없어 버튼을 그리지 않는다(줄을 눌러 그 화면에서 처리)", () => {
    expect(quickActionsFor(item())).toEqual([]);
  });

  it("버튼 이름(한국어 기본)", () => {
    expect(quickActionLabel("accept")).toBe("수락");
    expect(quickActionLabel("deploy_defense")).toBe("방어 배치");
    expect(quickActionLabel("auto_assign", "en")).toBe("Auto-Assign");
  });
});
