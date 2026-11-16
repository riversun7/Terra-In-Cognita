// 처리할 일 접기 시험 — [기다림](기획 대조 2163)은 이 기기에서 그 경고를 접는다. 같은 계약이 다시 멈추면(처음 생긴 시각이 바뀜) 다시 보인다
import type { InboxItem, InboxListResponse } from "@terra/shared/inbox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { foldInboxItem, withoutFolded } from "./folded.ts";

const row = (id: string, firstSeenAt: number): InboxItem => ({
  id,
  kind: "labor_paused",
  category: "decision",
  count: 1,
  deadlineAt: null,
  firstSeenAt,
  params: { contractId: 1 },
  target: null,
  actions: ["wait", "terminate"],
});

const list = (items: InboxItem[]): InboxListResponse => ({
  generatedAt: 0,
  items,
  counts: { threat: 0, money_survival: 0, stalled: 0, decision: items.length, done: 0 },
  badges: {},
});

/** 메모리 저장소(시험 환경에는 localStorage가 없다) */
const memory = new Map<string, string>();

describe("처리할 일 접기(2163)", () => {
  beforeEach(() => {
    memory.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("접은 줄을 빼고 분류 수를 줄인다", () => {
    foldInboxItem("labor_paused:c1", 100);
    const out = withoutFolded(list([row("labor_paused:c1", 100), row("labor_paused:c2", 200)]));
    expect(out.items.map((item) => item.id)).toEqual(["labor_paused:c2"]);
    expect(out.counts.decision).toBe(1);
  });

  it("처음 생긴 시각이 바뀌면(다시 멈춤) 다시 보이고, 없는 접힘은 지운다", () => {
    foldInboxItem("labor_paused:c1", 100);
    foldInboxItem("labor_paused:c9", 50);
    expect(withoutFolded(list([row("labor_paused:c1", 300)])).items).toHaveLength(1);
    expect(memory.get("terra.inbox.folded.v1")).toBe("{}");
  });
});
