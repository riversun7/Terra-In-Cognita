// 2차맵 사이 이동의 길 시험 — 2차맵 줄(가장 짧게, 띄우지 않은 2차맵을 줄이고 곧은 선을 따라), 틀 바꾸기(면 경계 포함), 넘는 자리(목적지로
// 곧은 선이 변을 지나는 자리 590 나, 막히면 가까운 쪽부터), 건너뛰는 구간(593 나), 목표 둘레 설 칸, 곧은 거리
// (docs/adr/2026-11-07-play-flow.md "WP9"·"WP11")
import {
  EARTH_FACE_LEVEL,
  PLACEMENT_SUBLEVELS,
  cellKey,
  decodeCellKey,
  isCellKey,
  neighbors4,
} from "@terra/planet";
import { stepMapCell } from "@terra/planet/secondMap";
import { CELL_UNITS, WALK_SPEED, anchorCenter } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { testMapKey } from "../world/world.ts";
import {
  applyFrame,
  composeFrames,
  frameBetween,
  invertFrame,
  neighbourFrame,
  routeFrames,
} from "./frame.ts";
import {
  type Standable,
  distanceMeters,
  entryOf,
  hopPlace,
  mapRoute,
  pickCrossing,
  planLegs,
  routeContext,
  sideToward,
  standNear,
  travelMs,
} from "./route.ts";

const K: number[] = Array.from({ length: 6 }, (_, index) => testMapKey(index));
const loadedSix = (key: number) => K.includes(key);
const everywhere: Standable = () => true;
/** (100, 100) 둘레 5×5(시청 건물)는 설 수 없다 */
const hall: Standable = (_key, cell) => Math.abs(cell.x - 100) > 2 || Math.abs(cell.y - 100) > 2;
const center = (x: number, y: number) => anchorCenter(x, y, 1);
const ij = (key: number) => {
  if (!isCellKey(key)) throw new Error("not a cell key");
  const cell = decodeCellKey(key);
  return { i: cell.i, j: cell.j };
};

describe("2차맵 줄", () => {
  it("시험 2차맵 줄(오른쪽으로 나란히)에서 가장 짧은 줄, 같은 2차맵이면 하나", () => {
    expect(mapRoute(K[0] ?? 0, K[3] ?? 0, loadedSix)).toEqual([K[0], K[1], K[2], K[3]]);
    expect(mapRoute(K[4] ?? 0, K[1] ?? 0, loadedSix)).toEqual([K[4], K[3], K[2], K[1]]);
    expect(mapRoute(K[2] ?? 0, K[2] ?? 0, loadedSix)).toEqual([K[2]]);
  });

  it("띄우지 않은 2차맵도 줄에 든다(593 나). 목적·출발을 띄우지 않았거나 상한을 넘으면 null", () => {
    const gap = (key: number) => loadedSix(key) && key !== K[2];
    expect(mapRoute(K[0] ?? 0, K[4] ?? 0, gap)).toEqual([K[0], K[1], K[2], K[3], K[4]]);
    expect(mapRoute(K[0] ?? 0, cellKey(0, EARTH_FACE_LEVEL, 10, 10), loadedSix)).toBeNull();
    expect(mapRoute(K[0] ?? 0, K[5] ?? 0, loadedSix, 3)).toBeNull();
  });

  it("같은 길이면 띄운 2차맵을 먼저 지나고, 모두 같으면 큰 원(곧은 선)을 따라 계단처럼 간다", () => {
    const start = ij(K[0] ?? 0);
    const target = cellKey(0, EARTH_FACE_LEVEL, start.i + 3, start.j + 3);
    // 띄운 줄(K)을 먼저 따라간 뒤 꺾는다(띄우지 않은 2차맵 2장)
    const withRow = (key: number) => loadedSix(key) || key === target;
    const alongRow = mapRoute(K[0] ?? 0, target, withRow) ?? [];
    expect(alongRow.slice(0, 4)).toEqual([K[0], K[1], K[2], K[3]]);
    expect(alongRow).toHaveLength(7);
    // 출발·목적만 띄웠다: 대각선을 따라 i·j가 번갈아 오른다(곧은 선에서 한 칸 넘게 벗어나지 않는다)
    const onlyEnds = (key: number) => key === K[0] || key === target;
    const stairs = mapRoute(K[0] ?? 0, target, onlyEnds) ?? [];
    expect(stairs).toHaveLength(7);
    for (const key of stairs) {
      const cell = ij(key);
      expect(Math.abs(cell.i - start.i - (cell.j - start.j))).toBeLessThanOrEqual(1);
    }
  });
});

describe("틀 바꾸기", () => {
  it("면 안의 이웃은 옮김만(오른쪽 이웃 = x + 256칸), 거꾸로·잇기가 맞다", () => {
    const frame = neighbourFrame(K[0] ?? 0, K[1] ?? 0);
    expect(frame).toEqual({ xx: 1, xy: 0, yx: 0, yy: 1, tx: 256 * CELL_UNITS, ty: 0 });
    if (!frame) return;
    const point = center(10, 20);
    expect(applyFrame(invertFrame(frame), applyFrame(frame, point))).toEqual(point);
    const frames = routeFrames([K[0] ?? 0, K[1] ?? 0, K[2] ?? 0]) ?? [];
    expect(applyFrame(frameBetween(frames, 2, 0), point)).toEqual({
      x: point.x + 512 * CELL_UNITS,
      y: point.y,
    });
    expect(frameBetween(frames, 2, 0)).toEqual(composeFrames(frames[0] ?? frame, frames[1] ?? frame));
    expect(applyFrame(frameBetween(frames, 0, 2), applyFrame(frameBetween(frames, 2, 0), point))).toEqual(
      point,
    );
  });

  it("면 경계를 넘는 이웃: 변 칸 너머 칸(stepMapCell)이 늘인 틀의 그 칸과 늘 맞는다", () => {
    for (const edge of [cellKey(0, EARTH_FACE_LEVEL, 511, 300), cellKey(2, EARTH_FACE_LEVEL, 0, 0)]) {
      for (const next of neighbors4(edge)) {
        const side = sideToward(edge, next);
        const frame = neighbourFrame(edge, next);
        expect(side).not.toBeNull();
        expect(frame).not.toBeNull();
        if (!side || !frame) continue;
        for (const along of [0, 37, 128, 255]) {
          const cell =
            side.dx === 0 ? { x: along, y: side.dy > 0 ? 255 : 0 } : { x: side.dx > 0 ? 255 : 0, y: along };
          const step = stepMapCell(edge, PLACEMENT_SUBLEVELS, cell.x, cell.y, side.dx, side.dy);
          expect(step?.mapKey).toBe(next);
          if (!step) continue;
          expect(applyFrame(frame, center(step.x, step.y))).toEqual(
            center(cell.x + side.dx, cell.y + side.dy),
          );
        }
      }
    }
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

  it("590 나: 목적지로 곧은 선이 변을 지나는 자리, 선이 그 변으로 가지 않으면 목표를 변에 내린 자리", () => {
    const here = center(30, 70);
    // 목표 = K[1] (20, 170) → K[0] 틀 (276, 170). 선이 x = 256칸을 y ≈ 162.17칸에서 지난다
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, here, 1, everywhere, center(276, 170))).toEqual({
      exit: { x: 255, y: 162 },
      entry: { x: 0, y: 162 },
    });
    // 목표가 뒤쪽(선이 오른쪽 변으로 가지 않음): 목표의 y
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, here, 1, everywhere, center(10, 200))?.exit).toEqual({
      x: 255,
      y: 200,
    });
    // 목표가 없으면 옛 규칙(지금 좌표를 이어 간다)
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, here, 1, everywhere)?.exit).toEqual({ x: 255, y: 70 });
  });

  it("막혔으면 가까운 쪽부터(작은 쪽 먼저) 찾고, 띄우지 않은 쪽은 보지 않을 수 있다", () => {
    // 나가는 쪽 y 70·69, 들어가는 쪽 y 71이 막힘 → 68(같은 거리면 작은 쪽 먼저)
    const blocked: Standable = (key, cell) =>
      !(key === K[0] && cell.x === 255 && (cell.y === 70 || cell.y === 69)) &&
      !(key === K[1] && cell.x === 0 && cell.y === 71);
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, center(30, 70), 1, blocked)).toEqual({
      exit: { x: 255, y: 68 },
      entry: { x: 0, y: 68 },
    });
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, center(30, 70), 1, () => false)).toBeNull();
    const onlyFirst: Standable = (key) => key === K[0];
    expect(pickCrossing(K[0] ?? 0, K[1] ?? 0, center(30, 70), 1, onlyFirst, undefined, false)).toEqual({
      exit: { x: 255, y: 70 },
      entry: null,
    });
  });

  it("면 경계를 넘는 이웃도 변과 들어가는 칸(상대 2차맵의 가장자리)을 준다", () => {
    const edge = cellKey(0, EARTH_FACE_LEVEL, 511, 300);
    for (const next of neighbors4(edge)) {
      const crossing = pickCrossing(edge, next, center(128, 128), 1, everywhere);
      expect(crossing).not.toBeNull();
      const entry = crossing?.entry ?? { x: 1, y: 1 };
      expect([0, 255].includes(entry.x) || [0, 255].includes(entry.y)).toBe(true);
    }
  });
});

describe("목표 둘레·구간·거리", () => {
  it("목표 칸에 설 수 없으면 가장 가까운 고리의 첫 칸", () => {
    expect(standNear(K[0] ?? 0, { x: 100, y: 100 }, 1, everywhere)).toEqual({ x: 100, y: 100 });
    expect(standNear(K[0] ?? 0, { x: 100, y: 100 }, 1, hall)).toEqual({ x: 97, y: 97 });
    expect(standNear(K[0] ?? 0, { x: 100, y: 100 }, 1, () => false, 3)).toBeNull();
  });

  it("구간 = 2차맵마다 곧은 선, 거리 = 합, 걸리는 시간 = 거리 ÷ 속도", () => {
    const start = center(10, 40);
    const route = [K[0] ?? 0, K[1] ?? 0];
    const plan = planLegs(routeContext(route, { x: 20, y: 40 }, 1, everywhere, loadedSix), start);
    expect(plan).toEqual({
      ok: true,
      legs: [
        { mapKey: K[0], from: start, to: center(255, 40) },
        { mapKey: K[1], from: center(0, 40), to: center(20, 40) },
      ],
      hops: [],
      distance: (245 + 20) * CELL_UNITS,
    });
    // 걷기(437단위/초): 2차맵 한 장(256칸)에 약 600초
    expect(travelMs(256 * CELL_UNITS, WALK_SPEED)).toBe(Math.ceil((256 * CELL_UNITS * 1000) / WALK_SPEED));
    expect(distanceMeters(256 * CELL_UNITS, 1500.7)).toBe(1501);
    expect(
      planLegs(
        routeContext(route, { x: 20, y: 40 }, 1, () => false, loadedSix),
        start,
      ),
    ).toEqual({
      ok: false,
      problem: "border_blocked",
    });
  });

  it("593 나: 띄우지 않은 2차맵은 건너뛴다(변 끝에서 사라져 다음 띄운 2차맵 변에 나타난다), 지금 있을 자리", () => {
    const route = [K[0] ?? 0, K[1] ?? 0, K[2] ?? 0];
    const gap = (key: number) => key === K[0] || key === K[2];
    // 띄우지 않은 K[1]의 칸은 묻지 않는다
    const notMiddle: Standable = (key) => key !== K[1];
    const context = routeContext(route, { x: 10, y: 100 }, 1, notMiddle, gap);
    const start = center(250, 100);
    expect(planLegs(context, start)).toEqual({
      ok: true,
      legs: [
        { mapKey: K[0], from: start, to: center(255, 100) },
        { mapKey: K[2], from: center(0, 100), to: center(10, 100) },
      ],
      hops: [{ from: 0, to: 2, entry: { x: 0, y: 100 }, distance: 257 * CELL_UNITS }],
      distance: (5 + 257 + 10) * CELL_UNITS,
    });
    const hop = { from: 0, to: 2, entry: { x: 0, y: 100 } };
    expect(hopPlace(context, hop, center(255, 100), 0)).toEqual({
      index: 0,
      mapKey: K[0],
      cell: { x: 255, y: 100 },
    });
    expect(hopPlace(context, hop, center(255, 100), 0.5)).toEqual({
      index: 1,
      mapKey: K[1],
      cell: { x: 128, y: 100 },
    });
    expect(hopPlace(context, hop, center(255, 100), 1)).toEqual({
      index: 2,
      mapKey: K[2],
      cell: { x: 0, y: 100 },
    });
  });
});
