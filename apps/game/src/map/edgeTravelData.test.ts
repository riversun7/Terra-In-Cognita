// [옆 2차맵으로](WP14) 순수 계산 시험 — 나침반 이름, 변 넷의 옆 2차맵·목표 칸(면 안·면 경계 너머 — 서버가 넘는 칸 짝 stepMapCell과 같은 자리),
// 가장 가까운 변, 보낼 유닛 고르기
import { EARTH_FACE_LEVEL, cellKey, stepCell } from "@terra/planet";
import { stepMapCell } from "@terra/planet/secondMap";
import type { MapUnit } from "@terra/shared/mapUnits";
import { describe, expect, it } from "vitest";
import { EDGE_STEP_CELLS, compassOf, edgeTargets, edgeUnitOf, nearestEdge } from "./edgeTravelData.ts";

const SUB = 8;
const NORTH_UP = { x: 0, z: -1 };

describe("나침반 이름", () => {
  it("북쪽이 화면 위(−z)면 위·오른쪽·아래·왼쪽 변 = 북·동·남·서, 북쪽을 모르면 null", () => {
    expect(compassOf(NORTH_UP, 0, -1)).toBe("north");
    expect(compassOf(NORTH_UP, 1, 0)).toBe("east");
    expect(compassOf(NORTH_UP, 0, 1)).toBe("south");
    expect(compassOf(NORTH_UP, -1, 0)).toBe("west");
    // 북쪽이 오른쪽(+x)이면 오른쪽 변이 북, 아래 변이 동
    expect(compassOf({ x: 1, z: 0 }, 1, 0)).toBe("north");
    expect(compassOf({ x: 1, z: 0 }, 0, 1)).toBe("east");
    expect(compassOf(null, 1, 0)).toBeNull();
  });
});

describe("변 넷의 옆 2차맵과 목표 칸", () => {
  it("면 안: 옆 2차맵 = 면 칸 이웃, 목표 = 유닛에서 변에 곧게 내린 점의 변 너머 8번째 칸, 나침반 차례", () => {
    const key = cellKey(0, EARTH_FACE_LEVEL, 282, 328);
    const targets = edgeTargets(key, { x: 100.5, y: 50.5 }, NORTH_UP);
    expect(targets.map((target) => target.compass)).toEqual(["north", "east", "south", "west"]);
    const east = targets.find((target) => target.ox === 1);
    expect(east).toMatchObject({ mapKey: stepCell(key, 1, 0), x: EDGE_STEP_CELLS - 1, y: 50, distance: 156 });
    const west = targets.find((target) => target.ox === -1);
    expect(west).toMatchObject({
      mapKey: stepCell(key, -1, 0),
      x: 256 - EDGE_STEP_CELLS,
      y: 50,
      distance: 101,
    });
    // 아래(+y)는 면 칸 j가 작아지는 쪽
    const south = targets.find((target) => target.oy === 1);
    expect(south).toMatchObject({ mapKey: stepCell(key, 0, -1), x: 100, y: EDGE_STEP_CELLS - 1 });
    expect(nearestEdge(targets)?.oy).toBe(-1);
  });

  it("면 경계 너머(틀이 돌아간 이웃)도 넘는 칸 짝(stepMapCell)에서 안쪽으로 7칸 더 간 칸", () => {
    for (const key of [cellKey(0, EARTH_FACE_LEVEL, 511, 300), cellKey(2, EARTH_FACE_LEVEL, 0, 0)]) {
      const unit = { x: 37.5, y: 200.5 };
      for (const target of edgeTargets(key, unit, null)) {
        // 유닛에서 변에 곧게 내린 변 칸 → 한 걸음 = 옆 2차맵 변 칸 q
        const edgeX = target.ox > 0 ? 255 : target.ox < 0 ? 0 : 37;
        const edgeY = target.oy > 0 ? 255 : target.oy < 0 ? 0 : 200;
        const q = stepMapCell(key, SUB, edgeX, edgeY, target.ox, target.oy);
        expect(q?.mapKey).toBe(target.mapKey);
        if (!q) continue;
        // q에서 이 2차맵으로 돌아오는 방향 d(옆 2차맵 틀) — 목표는 q에서 −d로 7칸
        const back = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].find(([dx, dy]) => {
          const step = stepMapCell(q.mapKey, SUB, q.x, q.y, dx ?? 0, dy ?? 0);
          return step?.mapKey === key && step.x === edgeX && step.y === edgeY;
        });
        expect(back).toBeDefined();
        const [dx, dy] = back ?? [0, 0];
        expect({ x: target.x, y: target.y }).toEqual({
          x: q.x - (dx ?? 0) * (EDGE_STEP_CELLS - 1),
          y: q.y - (dy ?? 0) * (EDGE_STEP_CELLS - 1),
        });
      }
    }
  });
});

/** 시험 유닛 한 줄 */
const unit = (unitId: number, kind: MapUnit["kind"]): MapUnit => ({
  unitId,
  kind,
  name: null,
  cellX: 10,
  cellY: 10,
  moving: false,
  job: null,
  injury: 0,
  hold: null,
});

describe("보낼 유닛", () => {
  const units = [unit(7, "cyborg_body"), unit(9, "human")];

  it("고른 내 유닛, 고르지 않았으면 이 2차맵의 내 사이보그, 남의 유닛·목록 밖이면 없음", () => {
    expect(edgeUnitOf({ selected: 9, units, cyborgUnitId: 7 })?.unitId).toBe(9);
    expect(edgeUnitOf({ selected: null, units, cyborgUnitId: 7 })?.unitId).toBe(7);
    expect(edgeUnitOf({ selected: 42, units, cyborgUnitId: 7 })).toBeNull();
    expect(edgeUnitOf({ selected: null, units, cyborgUnitId: null })).toBeNull();
    expect(edgeUnitOf({ selected: null, units: null, cyborgUnitId: 7 })).toBeNull();
  });
});
