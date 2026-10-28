import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { CAR_SPEED, MAP_UNITS, type Point, WALK_SPEED } from "../units.ts";
import {
  type Motion,
  arrivalAt,
  createMotion,
  distanceAt,
  positionAt,
  positionAtDistance,
} from "./motion.ts";

const route = (points: [number, number][]): Point[] => points.map(([x, y]) => ({ x, y }));

const between = (value: number, p: number, q: number) => value >= Math.min(p, q) && value <= Math.max(p, q);

// 이동 중 위치가 지금 구간의 두 끝 사이(축별 범위 안)에 있는지
function onSegment(motion: Motion, time: number, point: Point): boolean {
  const d = distanceAt(motion, time);
  for (let i = 0; i < motion.waypoints.length - 1; i++) {
    const a = motion.waypoints[i];
    const b = motion.waypoints[i + 1];
    const start = motion.distances[i] ?? 0;
    const end = motion.distances[i + 1] ?? 0;
    if (!a || !b || d < start || d >= end) continue;
    return between(point.x, a.x, b.x) && between(point.y, a.y, b.y);
  }
  return false;
}

describe("경로 이동 계산", () => {
  it("계산 예: 꺾이는 점 도착 시각은 누적 거리 × 1000 ÷ 속도를 올림한 값", () => {
    const motion = createMotion({
      waypoints: route([
        [0, 0],
        [1024, 0],
        [1024, 1024],
      ]),
      departAtMs: 1000,
      speed: 430,
    });
    expect(motion.distances).toEqual([0, 1024, 2048]);
    // 1,024,000 ÷ 430 = 2381.4 → 2382, 2,048,000 ÷ 430 = 4762.8 → 4763
    expect(motion.arrivals).toEqual([1000, 3382, 5763]);
    expect(arrivalAt(motion)).toBe(5763);
    // 지난 거리 = (t - 출발) × 속도 ÷ 1000 내림
    expect(positionAt(motion, 999)).toEqual({ x: 0, y: 0 });
    expect(positionAt(motion, 1000)).toEqual({ x: 0, y: 0 });
    expect(positionAt(motion, 1003)).toEqual({ x: 1, y: 0 });
    // 도착 시각 1ms 전에는 아직 꺾이는 점에 닿지 않았다
    expect(positionAt(motion, 3381)).toEqual({ x: 1023, y: 0 });
    expect(positionAt(motion, 3382)).toEqual({ x: 1024, y: 0 });
    expect(positionAt(motion, 5762)).toEqual({ x: 1024, y: 1023 });
    expect(positionAt(motion, 5763)).toEqual({ x: 1024, y: 1024 });
    expect(positionAt(motion, 10_000_000)).toEqual({ x: 1024, y: 1024 });
  });

  it("대각선 길이는 가장 가까운 정수, 구간 안 위치는 출발점 쪽으로 자른다", () => {
    const forward = createMotion({
      waypoints: route([
        [0, 0],
        [1024, 1024],
      ]),
      departAtMs: 0,
      speed: 1448,
    });
    // √(2 × 1024²) = 1448.15 → 1448, 1448 단위/초라 정확히 1초
    expect(forward.distances).toEqual([0, 1448]);
    expect(arrivalAt(forward)).toBe(1000);
    expect(positionAt(forward, 500)).toEqual({ x: 512, y: 512 });
    const backward = createMotion({
      waypoints: route([
        [1024, 1024],
        [0, 0],
      ]),
      departAtMs: 0,
      speed: 1448,
    });
    expect(positionAt(backward, 500)).toEqual({ x: 512, y: 512 });
    // 1ms 뒤 지난 거리 1 → 1024 × 1 ÷ 1448 = 0.7 → 0 (출발점에서 아직 안 움직임)
    expect(positionAt(backward, 1)).toEqual({ x: 1024, y: 1024 });
  });

  it("무작위 경로: 정수 위치, 거리는 줄지 않고, 꺾이는 점에 정확히 도착한다", () => {
    const rng = createRng(120);
    for (let round = 0; round < 60; round++) {
      const points: Point[] = [{ x: rng.nextInt(MAP_UNITS), y: rng.nextInt(MAP_UNITS) }];
      const count = 1 + rng.nextInt(6);
      for (let i = 0; i < count; i++) {
        const last = points[points.length - 1] ?? { x: 0, y: 0 };
        points.push({ x: last.x + rng.nextInt(8000) - 4000, y: last.y + rng.nextInt(8000) - 4000 });
      }
      const motion = createMotion({
        waypoints: points,
        departAtMs: 1_798_000_000_000 + rng.nextInt(1000),
        speed: 1 + rng.nextInt(CAR_SPEED),
      });
      const end = arrivalAt(motion);
      const step = Math.max(1, Math.floor((end - motion.departAtMs) / 500));
      // 표본마다 expect를 부르면 느려서, 어긋난 첫 표본만 모아 한 번에 확인한다
      let previous = -1;
      let problem = "";
      for (let t = motion.departAtMs - 5; t <= end + 5 && problem === ""; t += step) {
        const point = positionAt(motion, t);
        const d = distanceAt(motion, t);
        if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) problem = `정수가 아님 t=${t}`;
        else if (d < previous) problem = `거리가 줄어듦 t=${t}`;
        else if (t > motion.departAtMs && t < end && !onSegment(motion, t, point)) problem = `구간 밖 t=${t}`;
        previous = d;
      }
      expect(problem).toBe("");
      motion.waypoints.forEach((waypoint, i) => {
        const reached = motion.distances[i] ?? 0;
        // 누적 거리에서는 정확히 꺾이는 점이다
        expect(positionAtDistance(motion, reached)).toEqual(waypoint);
        // 도착 시각은 그 거리에 닿는 첫 ms다
        const arrival = motion.arrivals[i] ?? 0;
        expect(distanceAt(motion, arrival)).toBeGreaterThanOrEqual(reached);
        if (arrival - 1 >= motion.departAtMs && reached > 0) {
          expect(distanceAt(motion, arrival - 1)).toBeLessThan(reached);
        }
      });
      expect(positionAt(motion, motion.departAtMs)).toEqual(points[0]);
      expect(positionAt(motion, end)).toEqual(points[points.length - 1]);
    }
  });

  it("점 하나·같은 점 반복도 다룬다", () => {
    const still = createMotion({ waypoints: route([[5, 7]]), departAtMs: 50, speed: WALK_SPEED });
    expect(arrivalAt(still)).toBe(50);
    expect(positionAt(still, 0)).toEqual({ x: 5, y: 7 });
    expect(positionAt(still, 99)).toEqual({ x: 5, y: 7 });
    const repeated = createMotion({
      waypoints: route([
        [0, 0],
        [0, 0],
        [2048, 0],
      ]),
      departAtMs: 0,
      speed: 1024,
    });
    expect(repeated.arrivals).toEqual([0, 0, 2000]);
    expect(positionAt(repeated, 1000)).toEqual({ x: 1024, y: 0 });
  });

  it("걷기 출발값으로 2차맵 한 변(256칸)을 10분 안에 건넌다(D-120)", () => {
    const walk = createMotion({
      waypoints: route([
        [0, 0],
        [MAP_UNITS, 0],
      ]),
      departAtMs: 0,
      speed: WALK_SPEED,
    });
    expect(arrivalAt(walk)).toBeLessThanOrEqual(600_000);
    expect(arrivalAt(walk)).toBeGreaterThan(590_000);
  });

  it("틀린 입력은 거부한다", () => {
    const ok = { waypoints: route([[0, 0]]), departAtMs: 0, speed: 100 };
    const bad = [
      { ...ok, waypoints: [] },
      { ...ok, speed: 0 },
      { ...ok, speed: 1.5 },
      { ...ok, departAtMs: -1 },
      { ...ok, departAtMs: 0.5 },
      { ...ok, waypoints: route([[0.5, 0]]) },
      { ...ok, waypoints: route([[2 ** 30, 0]]) },
    ];
    for (const input of bad) expect(() => createMotion(input)).toThrow(RangeError);
  });
});
