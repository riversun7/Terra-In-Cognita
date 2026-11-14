import type { WorldMapFaction } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import { colorDistance } from "./nationColor.ts";
import { PATTERN_CLOSE_DISTANCE, patternedNations, territoryViewOf } from "./territoryView.ts";

const faction = (id: number, color: string | null): WorldMapFaction => ({
  id,
  code: null,
  kind: "npc",
  name: null,
  color,
});

describe("비슷한 색 이웃 무늬(기획 D-546 1435)", () => {
  it("맞닿은 두 국가 색이 문턱보다 가까우면 큰 ID 국가만 무늬, 먼 색·맞닿지 않은 쌍·색 없는 국가는 무늬 없음", () => {
    // 빨강 둘(가깝다)·파랑(멀다)
    const factions = [faction(1, "#e5035d"), faction(2, "#e81603"), faction(3, "#0e84b7"), faction(4, null)];
    expect(colorDistance("#e5035d", "#e81603")).toBeLessThan(PATTERN_CLOSE_DISTANCE);
    expect(colorDistance("#e5035d", "#0e84b7")).toBeGreaterThan(PATTERN_CLOSE_DISTANCE);
    expect([...patternedNations([[1, 2]], factions)]).toEqual([2]);
    expect([
      ...patternedNations(
        [
          [1, 3],
          [2, 3],
          [3, 4],
        ],
        factions,
      ),
    ]).toEqual([]);
    expect([...patternedNations([], factions)]).toEqual([]);
  });

  it("준비 전이면 빈 보기", () => {
    expect(territoryViewOf(null).shapes.areas).toEqual([]);
    expect(territoryViewOf(null).patterned.size).toBe(0);
  });
});
