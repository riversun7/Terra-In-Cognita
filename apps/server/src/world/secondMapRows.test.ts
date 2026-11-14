// 저장 행 ↔ 움직임 시험 — 구간 걸음 배율(docs/adr/2026-11-14-segment-speed.md 4절)
import { createMotion } from "@terra/sim";
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
});
