// 2차맵 지도자 이름표 시험 — docs/adr/2026-11-07-play-flow.md "WP-NPC3"(기획 정리 748 나·742 나). DOM 없이 순수 도우미와 상태만 본다:
// 표시 종류 → 지도자 ID, 누른 곳 → 가장 가까운 이름표(22px 안), 이름표 글, 상태(지도자 바뀜·이름·사라진 지도자 이름 지우기).
import { describe, expect, it } from "vitest";
import { m } from "../paraglide/messages.js";
import { createLeaderTagState, leaderIdsOf, leaderTagText, pickLeaderTag } from "./leaderTags.ts";

describe("지도자 이름표", () => {
  it("표시 종류 npc_leader인 유닛만 ID 차례로(모르는 종류는 보통 유닛)", () => {
    const kinds = new Map([
      [9, "npc_leader"],
      [3, "guardian_2"],
      [4, "npc_leader"],
    ]);
    expect(leaderIdsOf(kinds)).toEqual([4, 9]);
    expect(leaderIdsOf(new Map())).toEqual([]);
  });

  it("누르기: 22px 안 가장 가까운 이름표, 없으면 null", () => {
    const hits = [
      { x: 100, y: 100, unitId: 1 },
      { x: 130, y: 100, unitId: 2 },
    ];
    expect(pickLeaderTag(hits, { x: 112, y: 100 })).toBe(1);
    expect(pickLeaderTag(hits, { x: 118, y: 100 })).toBe(2);
    expect(pickLeaderTag(hits, { x: 100, y: 122 })).toBe(1);
    expect(pickLeaderTag(hits, { x: 100, y: 123 })).toBeNull();
    expect(pickLeaderTag([], { x: 0, y: 0 })).toBeNull();
  });

  it("이름표 글: 이름을 받기 전·없으면 '지도자'", () => {
    expect(leaderTagText(null)).toBe(m.map_unit_kind_npc_leader());
    expect(leaderTagText({ ko: "임시 지도자 3", en: "Placeholder leader 3" })).toMatch(/3/);
  });

  it("상태: 지도자 목록이 바뀔 때만 알리고, 사라진 지도자의 이름은 지운다", () => {
    const state = createLeaderTagState();
    let calls = 0;
    const unsubscribe = state.subscribe(() => {
      calls += 1;
    });
    state.setIds([5]);
    state.setIds([5]);
    expect(calls).toBe(1);
    expect(state.isLeader(5)).toBe(true);
    expect(state.isLeader(6)).toBe(false);
    // 목록에 없는 유닛의 이름은 받지 않는다
    state.setName(6, { ko: "가", en: "A" });
    expect(state.nameOf(6)).toBeNull();
    state.setName(5, { ko: "임시 지도자 1", en: "Placeholder leader 1" });
    expect(state.nameOf(5)?.ko).toBe("임시 지도자 1");
    expect(calls).toBe(2);
    state.setIds([]);
    expect(state.nameOf(5)).toBeNull();
    expect(state.version).toBe(3);
    unsubscribe();
    state.setIds([7]);
    expect(calls).toBe(3);
  });
});
