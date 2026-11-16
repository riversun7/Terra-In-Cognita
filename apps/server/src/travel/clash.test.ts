// 띄운 2차맵 위 조우 찾기(D-570 1901·1904) — 칸 격자, 다른 나라, 판단하는 유닛 한쪽 이상
import { describe, expect, it } from "vitest";
import { type ClashUnit, findClashes } from "./clash.ts";

const u = (unitId: number, nation: number, x: number, y: number, decider = true): ClashUnit => ({
  unitId,
  ownerId: unitId,
  nation,
  x,
  y,
  decider,
});

describe("findClashes", () => {
  it("다른 나라 두 유닛이 거리 안이면 짝(편마다 상대와 만난 유닛, 유닛 ID 차례)", () => {
    const found = findClashes(
      [u(5, 200, 15, 10), u(1, 100, 10, 10), u(2, 100, 12, 12), u(9, 100, 60, 60)],
      10,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.nations).toEqual([100, 200]);
    expect(found[0]?.sides.map((side) => side.map((unit) => unit.unitId))).toEqual([[1, 2], [5]]);
  });

  it("거리 밖(체비쇼프)·같은 나라끼리·판단하는 유닛이 없는 짝은 만나지 않는다", () => {
    expect(findClashes([u(1, 100, 10, 10), u(2, 200, 21, 10)], 10)).toEqual([]);
    expect(findClashes([u(1, 100, 10, 10), u(2, 100, 11, 10)], 10)).toEqual([]);
    // 봇끼리(판단하는 유닛 없음)
    expect(findClashes([u(1, 100, 10, 10, false), u(2, 200, 11, 10, false)], 10)).toEqual([]);
    // 봇 하나와 판단하는 유닛 하나는 만난다
    expect(findClashes([u(1, 100, 10, 10, false), u(2, 200, 11, 10)], 10)).toHaveLength(1);
  });

  it("격자 칸 경계를 넘어도 찾는다(둘레 3×3 칸), 나라 짝마다 하나씩 나라 ID 차례", () => {
    const found = findClashes(
      [u(1, 300, 19, 19), u(2, 100, 20, 20), u(3, 200, 21, 21, false), u(4, 300, 200, 200)],
      10,
    );
    expect(found.map((contact) => contact.nations)).toEqual([
      [100, 200],
      [100, 300],
      [200, 300],
    ]);
  });

  it("같은 입력이면 같은 답(차례를 섞어도)", () => {
    const units = Array.from({ length: 40 }, (_, i) =>
      u(i + 1, 100 + (i % 3), (i * 37) % 256, (i * 91) % 256, i % 2 === 0),
    );
    const a = findClashes(units, 16);
    const b = findClashes(units.toReversed(), 16);
    expect(a).toEqual(b);
  });
});
