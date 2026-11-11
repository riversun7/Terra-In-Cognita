// 도시 건물 배치 판 그림 셈 시험 — 값은 형식 확인용이다.
import type { WorldCityLayoutCity } from "@terra/shared/worldPlacementApi";
import { describe, expect, it } from "vitest";
import { layoutLines, layoutRects, layoutWindow, shift } from "./cityLayoutModel.ts";

const metrics = {
  hallOffset: 0,
  sectors: 4,
  screenPm: 200,
  hallToStation: 30,
  hallToStorage: 20,
  hallToLodging: 10,
  haul: 8,
  commutePm: 1030,
  walledIn: 0,
};
const city: WorldCityLayoutCity = {
  cityId: 1,
  code: "a",
  name: "A",
  mapKey: "1",
  center: { x: 128, y: 128 },
  movable: 4,
  pinned: 1,
  moves: 3,
  stay: 0,
  now: metrics,
  planned: metrics,
  buildings: [
    {
      id: 1,
      facility: "government_hall",
      role: "core",
      x: 120,
      y: 120,
      width: 3,
      height: 3,
      pinned: false,
      to: { x: 127, y: 127, width: 3, height: 3 },
    },
    {
      id: 2,
      facility: "farm",
      role: "gather",
      x: 140,
      y: 120,
      width: 4,
      height: 4,
      pinned: false,
      to: { x: 160, y: 126, width: 4, height: 4 },
    },
    {
      id: 3,
      facility: "lodging",
      role: "living",
      x: 130,
      y: 120,
      width: 3,
      height: 2,
      pinned: false,
      to: { x: 138, y: 127, width: 3, height: 2 },
    },
    {
      id: 4,
      facility: "storehouse",
      role: "storage",
      x: 125,
      y: 140,
      width: 3,
      height: 3,
      pinned: true,
      to: null,
    },
  ],
};

describe("도시 건물 배치 판", () => {
  it("모드마다 자리: 다시 놓은 뒤는 to, 옮기지 않는 건물(to 없음)은 지금 자리", () => {
    const now = layoutRects(city, "now");
    const planned = layoutRects(city, "planned");
    expect(now.map((r) => [r.id, r.x, r.y])).toEqual([
      [1, 120, 120],
      [2, 140, 120],
      [3, 130, 120],
      [4, 125, 140],
    ]);
    expect(planned.map((r) => [r.id, r.x, r.y, r.moves])).toEqual([
      [1, 127, 127, true],
      [2, 160, 126, true],
      [3, 138, 127, true],
      [4, 125, 140, false],
    ]);
  });

  it("선: 채집소 → 가장 가까운 숙소 → 행정 건물(출퇴근), 채집소 → 가장 가까운 창고(옮김)", () => {
    const lines = layoutLines(layoutRects(city, "planned"));
    expect(lines).toEqual([
      { id: "r2", kind: "route", points: "162,128 139.5,128 128.5,128.5" },
      { id: "h2", kind: "haul", points: "162,128 126.5,141.5" },
    ]);
  });

  it("그림 창은 두 모드 건물이 다 들고 2차맵 안, 글은 지금 → 뒤", () => {
    const window = layoutWindow(city);
    expect(window.size).toBe(80);
    expect(window.x).toBe(88);
    // 2차맵 가장자리 도시: 창은 2차맵 안(0 ~ 256)
    const edge = layoutWindow({ ...city, center: { x: 20, y: 236 }, buildings: [] });
    expect(edge).toEqual({ x: 0, y: 176, size: 80 });
    expect(shift(16.3, 8.1)).toBe("16.3 → 8.1");
    expect(shift(null, 3)).toBe("- → 3");
  });
});
