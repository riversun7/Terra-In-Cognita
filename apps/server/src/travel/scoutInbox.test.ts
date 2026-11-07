// 처리할 일 "정찰을 마쳤습니다"(scout_returned) 시험 — 기획 답 612 나: 정찰이 돌아서면(돌아오는 중·돌아옴·돌아오다 멈춤) 길마다 한 줄, 누르면 본
// 2차맵 지도. 이동·돌아서기 전 정찰은 없음(docs/adr/2026-11-07-play-flow.md "WP13")
import { describe, expect, it } from "vitest";
import { collectInbox } from "../inbox/registry.ts";
import type { TravelView } from "./service.ts";
import { createScoutInboxProvider } from "./scoutInbox.ts";

const NOW = 1_798_000_000_000;

function view(overrides: Partial<TravelView>): TravelView {
  return {
    unitId: 5,
    kind: "scout",
    route: [1, 2],
    leg: 0,
    mapKey: 2,
    cellX: 10,
    cellY: 10,
    targetX: 10,
    targetY: 10,
    startedAt: NOW - 60_000,
    arriveAt: NOW + 60_000,
    state: "going",
    stop: null,
    returning: false,
    scoutedMapKey: null,
    hidden: false,
    ...overrides,
  };
}

describe("정찰 끝 처리할 일", () => {
  it("돌아선 정찰만 한 줄(제안·결정), 누르면 본 2차맵", async () => {
    const asked: string[] = [];
    const provider = createScoutInboxProvider(() => ({
      list: (userId) => {
        asked.push(userId);
        return [
          view({ unitId: 5 }),
          view({ unitId: 6, returning: true, scoutedMapKey: 77 }),
          view({ unitId: 7, kind: "move", state: "arrived" }),
          view({ unitId: 8, state: "arrived", returning: true, scoutedMapKey: 78 }),
        ];
      },
    }));
    const list = await collectInbox([provider], { userId: "u1", roles: ["player"] }, NOW, false);
    expect(asked).toEqual(["u1"]);
    expect(list.items.map((item) => [item.id, item.category, item.target])).toEqual([
      [`scout_returned:u6_${NOW - 60_000}`, "decision", { route: "map", search: { key: "77" } }],
      [`scout_returned:u8_${NOW - 60_000}`, "decision", { route: "map", search: { key: "78" } }],
    ]);
  });

  it("세계가 준비되기 전이면 없다", async () => {
    const provider = createScoutInboxProvider(() => undefined);
    expect(await provider.collect({ userId: "u1", roles: ["player"] }, NOW)).toEqual([]);
  });
});
