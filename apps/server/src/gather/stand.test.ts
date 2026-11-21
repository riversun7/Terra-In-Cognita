import { describe, expect, it } from "vitest";
import type { SecondMap } from "../world/secondMap.ts";
import { standNearRect } from "./stand.ts";

/** 건물 칸(직사각형 안)만 막힌 가짜 2차맵 */
function mapWithBlock(rect: { x: number; y: number; width: number; height: number }): SecondMap {
  const blocked = (x: number, y: number): boolean =>
    x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
  const fake = {
    isStandable: (x: number, y: number, size: number) => {
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) if (blocked(x + dx, y + dy)) return false;
      return true;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 설 칸 검사(isStandable, onLand)만 쓴다
  return fake as unknown as SecondMap;
}

describe("건물 둘레 설 칸(standNearRect)", () => {
  const rect = { x: 50, y: 50, width: 6, height: 4 };
  const map = mapWithBlock(rect);

  it("유닛 쪽 변에 맞닿은 칸을 고른다 — 건물 기준 칸(왼쪽 위)으로 돌아가지 않는다(사용자 지적 2026-11-21)", () => {
    // 오른쪽(동쪽) 아래에 선 유닛 → 오른쪽 변 바로 옆
    expect(standNearRect(map, rect, 1, 14, { x: 60, y: 53 })).toEqual({ x: 56, y: 53 });
    // 아래쪽 유닛 → 아래 변 바로 옆
    expect(standNearRect(map, rect, 1, 14, { x: 52, y: 70 })).toEqual({ x: 52, y: 54 });
    // 이미 맞닿아 있으면 그 자리
    expect(standNearRect(map, rect, 1, 14, { x: 49, y: 51 })).toEqual({ x: 49, y: 51 });
  });

  it("큰 몸(크기 2)은 몸 전체가 건물에 겹치지 않는 맞닿은 칸", () => {
    expect(standNearRect(map, rect, 2, 14, { x: 40, y: 51 })).toEqual({ x: 48, y: 51 });
  });

  it("둘레가 모두 막히면 반경 안 다음 고리, 반경 밖이면 null", () => {
    const wall = { x: 49, y: 49, width: 8, height: 6 };
    const walled = mapWithBlock(wall);
    expect(standNearRect(walled, rect, 1, 14, { x: 60, y: 53 })).toEqual({ x: 57, y: 53 });
    expect(standNearRect(walled, rect, 1, 1, { x: 60, y: 53 })).toBeNull();
  });
});
