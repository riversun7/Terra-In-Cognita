// 2차맵 사이 이동의 길 시험 — 2차맵 줄(띄운 2차맵만, 가장 짧게), 넘는 변·자리(설 수 있는 짝, 가까운 쪽부터), 면 경계, 목표 둘레 설 칸, 곧은 거리
// (docs/adr/2026-11-07-play-flow.md "WP9")
import { EARTH_FACE_LEVEL, cellKey, neighbors4 } from "@terra/planet";
import { CELL_UNITS, WALK_SPEED, anchorCenter } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { testMapKey } from "../world/world.ts";
import {
  type Standable,
  distanceMeters,
  entryOf,
  mapRoute,
  pickCrossing,
  planLegs,
  sideToward,
  standNear,
  travelMs,
} from "./route.ts";

const K: number[] = Array.from({ length: 6 }, (_, index) => testMapKey(index));
const loadedSix = (key: number) => K.includes(key);
const everywhere: Standable = () => true;
/** (100, 100) 둘레 5×5(시청 건물)는 설 수 없다 */
const hall: Standable = (_key, cell) => Math.abs(cell.x - 100) > 2 || Math.abs(cell.y - 100) > 2;

describe("2차맵 줄", () => {
  it("시험 2차맵 줄(오른쪽으로 나란히)에서 가장 짧은 줄, 같은 2차맵이면 하나", () => {
    expect(mapRoute(K[0] ?? 0, K[3] ?? 0, loadedSix)).toEqual([K[0], K[1], K[2], K[3]]);
    expect(mapRoute(K[4] ?? 0, K[1] ?? 0, loadedSix)).toEqual([K[4], K[3], K[2], K[1]]);
    expect(mapRoute(K[2] ?? 0, K[2] ?? 0, loadedSix)).toEqual([K[2]]);
  });

  it("띄우지 않은 2차맵은 지나지 않는다(이을 수 없으면 null), 상한을 넘어도 null", () => {
    const gap = (key: number) => loadedSix(key) && key !== K[2];
    expect(mapRoute(K[0] ?? 0, K[4] ?? 0, gap)).toBeNull();
    expect(mapRoute(K[0] ?? 0, cellKey(0, EARTH_FACE_LEVEL, 10, 10), loadedSix)).toBeNull();
    expect(mapRoute(K[0] ?? 0, K[5] ?? 0, loadedSix, 3)).toBeNull();
  });
});

describe("넘는 변·자리", () => {
  it("i가 커지는 이웃 = 배치 칸 x가 커지는 변, 나가는 칸 (255, y) → 들어가는 칸 (0, y)", () => {
    expect(sideToward(K[0] ?? 0, K[1] ?? 0)).toEqual({ dx: 1, dy: 0 });
    expect(sideToward(K[1] ?? 0, K[0] ?? 0)).toEqual({ dx: -1, dy: 0 });
    expect(sideToward(K[0] ?? 0, K[3] ?? 0)).toBeNull();
    expect(entryOf(K[0] ?? 0, K[1] ?? 0, { x: 255, y: 40 }, { dx: 1, dy: 0 }, 1)).toEqual({ x: 0, y: 40 });
    expect(entryOf(K[1] ?? 0, K[0] ?? 0, { x: 0, y: 40 }, { dx: -1, dy: 0 }, 1)).toEqual({ x: 255, y: 40 });
    // 크기 2: 나가는 기준 칸 254(몸 254~255) → 들어가는 기준 칸 0
    expect(entryOf(K[0] ?? 0, K[1] ?? 0, { x: 254, y: 40 }, { dx: 1, dy: 0 }, 2)).toEqual({ x: 0, y: 40 });
  });

  it("변을 따라가는 좌표를 이어 가고, 막혔으면 가까운 쪽부터(작은 쪽 먼저) 찾는다", () => {
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, { x: 30, y: 70 }, 1, everywhere)).toEqual({
      exit: { x: 255, y: 70 },
      entry: { x: 0, y: 70 },
    });
    // 나가는 쪽 y 70·69, 들어가는 쪽 y 71이 막힘 → 68(같은 거리면 작은 쪽 먼저)
    const blocked: Standable = (key, cell) =>
      !(key === K[0] && cell.x === 255 && (cell.y === 70 || cell.y === 69)) &&
      !(key === K[1] && cell.x === 0 && cell.y === 71);
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, { x: 30, y: 70 }, 1, blocked)).toEqual({
      exit: { x: 255, y: 68 },
      entry: { x: 0, y: 68 },
    });
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, { x: 30, y: 70 }, 1, () => false)).toBeNull();
  });

  it("면 경계를 넘는 이웃도 변과 들어가는 칸(상대 2차맵의 가장자리)을 준다", () => {
    const edge = cellKey(0, EARTH_FACE_LEVEL, 511, 300);
    for (const next of neighbors4(edge)) {
      const side = sideToward(edge, next);
      expect(side).not.toBeNull();
      const crossing = pickCrossing(edge, next, { x: 128, y: 128 }, 1, everywhere);
      expect(crossing).not.toBeNull();
      const entry = crossing?.entry ?? { x: 1, y: 1 };
      expect([0, 255].includes(entry.x) || [0, 255].includes(entry.y)).toBe(true);
    }
  });
});

describe("목표 둘레·거리", () => {
  it("목표 칸에 설 수 없으면 가장 가까운 고리의 첫 칸", () => {
    expect(standNear(K[0] ?? 0, { x: 100, y: 100 }, 1, everywhere)).toEqual({ x: 100, y: 100 });
    expect(standNear(K[0] ?? 0, { x: 100, y: 100 }, 1, hall)).toEqual({ x: 97, y: 97 });
    expect(standNear(K[0] ?? 0, { x: 100, y: 100 }, 1, () => false, 3)).toBeNull();
  });

  it("구간 = 2차맵마다 곧은 선, 거리 = 합, 걸리는 시간 = 거리 ÷ 속도", () => {
    const start = anchorCenter(10, 40, 1);
    const plan = planLegs([K[0] ?? 0, K[1] ?? 0], start, { x: 20, y: 40 }, 1, everywhere);
    expect(plan).toEqual({
      ok: true,
      legs: [
        { mapKey: K[0], from: start, to: anchorCenter(255, 40, 1) },
        { mapKey: K[1], from: anchorCenter(0, 40, 1), to: anchorCenter(20, 40, 1) },
      ],
      distance: (245 + 20) * CELL_UNITS,
    });
    // 걷기(437단위/초): 2차맵 한 장(256칸)에 약 600초
    expect(travelMs(256 * CELL_UNITS, WALK_SPEED)).toBe(Math.ceil((256 * CELL_UNITS * 1000) / WALK_SPEED));
    expect(distanceMeters(256 * CELL_UNITS, 1500.7)).toBe(1501);
    expect(planLegs([K[0] ?? 0, K[1] ?? 0], start, { x: 20, y: 40 }, 1, () => false)).toEqual({
      ok: false,
      problem: "border_blocked",
    });
  });
});
