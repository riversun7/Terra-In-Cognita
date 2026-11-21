// 서버 NPC 알박기 자리 셈 시험(npc-claim-3, claimSites.ts): 행성 칸 이웃 겹, 출발 2차맵 변 쪽 점, 가운데부터의 건물 자리
import { cellKey, neighbors8 } from "@terra/planet";
import { describe, expect, it } from "vitest";
import { MAP_CENTER, edgeToward, ringsOf, spotOf } from "./claimSites.ts";

describe("NPC 알박기 자리 셈", () => {
  const home = cellKey(0, 9, 100, 100);

  it("ringsOf: 반경 1 = 이웃 8칸(거리 1, 첫 걸음 = 그 칸), 반경 2 = 둘째 겹(첫 걸음은 이웃 가운데 하나)", () => {
    const one = ringsOf(home, 1);
    expect(one.get(home)).toEqual({ d: 0, first: home });
    expect(one.size).toBe(9);
    for (const n of neighbors8(home)) expect(one.get(n)).toEqual({ d: 1, first: n });
    const two = ringsOf(home, 2);
    expect(two.size).toBe(25);
    const far = cellKey(0, 9, 102, 100);
    expect(two.get(far)?.d).toBe(2);
    expect(neighbors8(home)).toContain(two.get(far)?.first);
  });

  it("edgeToward: 첫 걸음 방향 쪽 변 점(i·j 방향 = x·y), 이웃이 아니면 undefined", () => {
    expect(edgeToward(home, cellKey(0, 9, 101, 100))).toEqual({ x: 248, y: MAP_CENTER });
    expect(edgeToward(home, cellKey(0, 9, 99, 99))).toEqual({ x: 8, y: 8 });
    expect(edgeToward(home, cellKey(0, 9, 105, 100))).toBeUndefined();
  });

  it("spotOf: 가운데가 비면 가운데, 막혔으면 바깥 고리에서 처음 놓을 수 있는 자리, 없으면 undefined", () => {
    expect(spotOf({ canPlace: () => true }, 4, 4)).toEqual({ x: 126, y: 126 });
    const spot = spotOf({ canPlace: (p) => p.x > 140 }, 4, 4);
    expect(spot && spot.x > 140).toBe(true);
    expect(spotOf({ canPlace: () => false }, 4, 4)).toBeUndefined();
  });
});
