// 저장 행 ↔ 움직임 시험 — 구간 걸음 배율(docs/adr/2026-11-14-segment-speed.md 4절), 움직임 속도(운영자 배율, operatorPace.ts)
import { MAX_SPEED, createMotion } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { HEALTHY } from "./unitCondition.ts";
import { NO_JOB, motionOfRow, unitColumnsOf, unitRowOf } from "./secondMapRows.ts";

const waypoints = [
  { x: 512, y: 512 },
  { x: 4608, y: 512 },
  { x: 4608, y: 8704 },
];

describe("저장 행 ↔ 움직임(구간 걸음 배율)", () => {
  it("배율을 저장하고 같은 도착 시각으로 되읽는다", () => {
    const motion = createMotion({ waypoints, departAtMs: 1_000, speed: 437, paces: [1800, 1000] });
    const unit = {
      id: 3,
      ownerId: 7,
      kind: 4,
      size: 1 as const,
      speed: 437,
      domain: "land" as const,
      motion,
      wakeAtMs: undefined,
      aiStep: 0,
      job: NO_JOB,
      condition: HEALTHY,
    };
    const row = unitRowOf(unit, 9, "s2_test_planet");
    expect(row.pace).toEqual([1800, 1000]);
    expect(unitColumnsOf(row)).toMatchObject({ path: row.path, pace: [1800, 1000] });
    expect(motionOfRow(row)?.arrivals).toEqual(motion.arrivals);
    // 배율이 없는 움직임은 null(같은 빠르기)
    const flat = unitRowOf(
      { ...unit, motion: createMotion({ waypoints, departAtMs: 1_000, speed: 437 }) },
      9,
      "p",
    );
    expect(flat.pace).toBeNull();
    expect(unitColumnsOf(flat).pace).toBeNull();
  });

  it("길이가 맞지 않는 배율(옛 앱이 path만 고쳐 쓴 행)은 버리고 같은 빠르기로 읽는다, 틀린 행은 undefined", () => {
    const path = [512, 512, 4608, 512];
    const read = motionOfRow({ path, pace: [1800, 1000], departAtMs: 1_000, speed: 437 });
    expect(read?.paces).toBeUndefined();
    expect(read?.arrivals).toEqual(
      createMotion({ waypoints: waypoints.slice(0, 2), departAtMs: 1_000, speed: 437 }).arrivals,
    );
    expect(motionOfRow({ path, pace: [0], departAtMs: 1_000, speed: 437 })?.paces).toBeUndefined();
    expect(motionOfRow({ path, pace: null, departAtMs: 1_000, speed: 0 })).toBeUndefined();
  });

  it("움직임 속도가 기본 속도와 다르면 저장하고 그 속도로 되읽는다, 같으면 null", () => {
    const base = {
      id: 3,
      ownerId: 7,
      kind: 4,
      size: 1 as const,
      speed: 437,
      domain: "land" as const,
      wakeAtMs: undefined,
      aiStep: 0,
      job: NO_JOB,
      condition: HEALTHY,
    };
    const fast = createMotion({ waypoints, departAtMs: 1_000, speed: 4370, paces: [1800, 1000] });
    const row = unitRowOf({ ...base, motion: fast }, 9, "p");
    expect(row.speed).toBe(437);
    expect(row.motionSpeed).toBe(4370);
    expect(unitColumnsOf(row)).toMatchObject({ speed: 437, motion_speed: 4370, motion_depart_at_ms: 1_000 });
    expect(motionOfRow(row)?.arrivals).toEqual(fast.arrivals);
    const normal = unitRowOf(
      { ...base, motion: createMotion({ waypoints, departAtMs: 1_000, speed: 437 }) },
      9,
      "p",
    );
    expect(normal.motionSpeed).toBeNull();
    expect(unitColumnsOf(normal)).toMatchObject({ motion_speed: null, motion_depart_at_ms: null });
  });

  it("범위 밖·정수가 아닌 움직임 속도는 버리고 기본 속도로 읽는다", () => {
    const path = [512, 512, 4608, 512];
    const read = (motionSpeed: number | null | undefined) =>
      motionOfRow({ path, pace: null, departAtMs: 1_000, speed: 437, motionSpeed })?.speed;
    expect(read(4370)).toBe(4370);
    expect(read(MAX_SPEED)).toBe(MAX_SPEED);
    expect(read(undefined)).toBe(437);
    expect(read(null)).toBe(437);
    for (const bad of [0, -5, 1.5, MAX_SPEED + 1, Number.NaN]) expect(read(bad)).toBe(437);
  });
});
