// NPC 일꾼 직무 장부(docs/adr/2026-11-27-npc-worker-jobs.md) — 직무 켬·끔, 묶음마다 피로(시설 피로 배율), 쉬러 가기, 쉼터 회복, 다시 일하기
import { JOB_GATHER, JOB_NONE, PHASE_REST, PHASE_WORK, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { UnitJob } from "../world/secondMapRows.ts";
import { createWorkerJobs, facilityFatiguePm, restStepMsOf } from "./workerJobs.ts";

const C = TEST_SOCIETY_COEFFICIENTS;
const idle = (fatigue = 0): UnitJob => ({ job: JOB_NONE, phase: PHASE_WORK, progressMs: 0, fatigue });

function rig(units: Record<number, UnitJob>, life?: { restAt: number; resumeAt: number }) {
  const jobs = new Map<number, UnitJob>(Object.entries(units).map(([id, job]) => [Number(id), job]));
  const writes: number[] = [];
  const map = {
    unitInfo: (unitId: number) => {
      const job = jobs.get(unitId);
      return job ? { job } : undefined;
    },
    setJob: (unitId: number, job: UnitJob) => {
      jobs.set(unitId, job);
      writes.push(unitId);
      return true;
    },
  };
  const book = createWorkerJobs({
    maps: new Map([[1, map]]),
    rules: () => C,
    lifeOf: life ? () => life : undefined,
  });
  return { book, jobs, writes };
}

describe("NPC 일꾼 직무 장부", () => {
  it("시설 피로 배율은 플레이어 채집소와 같다: 레벨 1 = 900‰, 레벨마다 100‰씩, 하한 100‰", () => {
    expect(facilityFatiguePm(C.gatherObjects, 1)).toBe(900);
    expect(facilityFatiguePm(C.gatherObjects, 5)).toBe(500);
    expect(facilityFatiguePm(C.gatherObjects, 30)).toBe(100);
    // 쉼터 회복 걸음: 집 = 피로 회복 걸음(3분), 회복 배율 1500‰ 숙소 = 2분
    expect(restStepMsOf(undefined, C)).toBe(180_000);
    expect(restStepMsOf({ kind: "lodging", level: 1, recoveryPm: 1500 }, C)).toBe(120_000);
  });

  it("맞추기: 새 일꾼은 직무를 켜고(피로가 쉬러 가는 값 이상이면 쉼부터), 빠진 휴먼은 끈다(피로는 그대로)", () => {
    const r = rig({ 1: idle(), 2: idle(95), 3: idle(7) }, { restAt: 90, resumeAt: 0 });
    expect(r.book.enabled()).toBe(true);
    expect(
      r.book.sync(
        10,
        [
          { unitId: 1, facilityId: 100 },
          { unitId: 2, facilityId: 100 },
          // 2차맵에 없는 휴먼(이동 중)은 맡지 않는다
          { unitId: 99, facilityId: 100 },
        ],
        0,
      ),
    ).toBe(2);
    expect(r.jobs.get(1)).toEqual({ job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 });
    expect(r.jobs.get(2)).toEqual({ job: JOB_GATHER, phase: PHASE_REST, progressMs: 0, fatigue: 95 });
    expect(r.book.has(1)).toBe(true);
    expect(r.book.has(99)).toBe(false);
    expect(r.book.workingOf(1)).toBe(true);
    expect(r.book.workingOf(2)).toBe(false);
    expect(r.book.workingOf(3)).toBeUndefined();
    expect(r.book.workingAt([1, 2, 3])).toBe(1);
    // 1번이 일꾼에서 빠진다 → 직무 끔, 2번은 그대로
    r.jobs.set(1, { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 27 });
    expect(r.book.sync(10, [{ unitId: 2, facilityId: 100 }], 0)).toBe(1);
    expect(r.jobs.get(1)).toEqual(idle(27));
    expect(r.book.has(1)).toBe(false);
    expect(r.book.size).toBe(1);
    // 다른 도시를 맞춰도 이 도시 일꾼은 그대로
    expect(r.book.sync(11, [], 0)).toBe(0);
    expect(r.book.has(2)).toBe(true);
  });

  it("묶음: 일하는 일꾼에게 차례로 직무 묶음 피로 × 시설 배율, 쉬러 가는 피로에 닿으면 쉼. 쉬는 일꾼은 받지 않는다", () => {
    const r = rig({ 1: idle(), 2: idle() }, { restAt: 18, resumeAt: 0 });
    r.book.sync(
      10,
      [1, 2].map((unitId) => ({ unitId, facilityId: 100 })),
      0,
    );
    // 레벨 1 시설: 묶음 하나 = 10 × 900‰ = 9
    expect(r.book.lot({ id: 100, level: 1 }, [1, 2], 1000)).toBe(1);
    expect(r.book.lot({ id: 100, level: 1 }, [1, 2], 2000)).toBe(2);
    expect(r.jobs.get(1)?.fatigue).toBe(9);
    expect(r.jobs.get(2)?.fatigue).toBe(9);
    // 둘째 묶음에서 18 → 쉬러 간다
    expect(r.book.lot({ id: 100, level: 1 }, [1, 2], 3000)).toBe(1);
    expect(r.jobs.get(1)).toMatchObject({ phase: PHASE_REST, fatigue: 18 });
    expect(r.book.workingAt([1, 2])).toBe(1);
    // 1번이 쉬는 동안은 2번만 받는다
    expect(r.book.lot({ id: 100, level: 1 }, [1, 2], 4000)).toBe(2);
    expect(r.jobs.get(2)).toMatchObject({ phase: PHASE_REST, fatigue: 18 });
    // 모두 쉬면 받을 일꾼이 없다
    expect(r.book.lot({ id: 100, level: 1 }, [1, 2], 5000)).toBeUndefined();
    expect(r.book.workingAt([1, 2])).toBe(0);
  });

  it("레벨이 높은 시설은 묶음 피로가 적다(레벨 5 = 5점). 피로는 피로 상한을 넘지 않는다", () => {
    const r = rig({ 1: idle(118) });
    r.book.sync(10, [{ unitId: 1, facilityId: 100 }], 0);
    // 생활 규칙이 없으면 피로 상한(120)에서 쉰다
    expect(r.book.lot({ id: 100, level: 5 }, [1], 0)).toBe(1);
    expect(r.jobs.get(1)).toMatchObject({ phase: PHASE_REST, fatigue: C.fatigueMax });
  });

  it("쉼: 쉼터 회복 걸음마다 1씩 내리고, 다시 일하는 피로에 닿으면 일 단계로 돌아온다(그 시설을 알린다)", () => {
    const r = rig({ 1: idle(), 2: idle() }, { restAt: 9, resumeAt: 6 });
    r.book.sync(
      10,
      [
        { unitId: 1, facilityId: 100 },
        { unitId: 2, facilityId: 200, place: { kind: "lodging", level: 1, recoveryPm: 1500 } },
      ],
      0,
    );
    r.book.lot({ id: 100, level: 1 }, [1], 0);
    r.book.lot({ id: 200, level: 1 }, [2], 0);
    expect(r.book.workingAt([1, 2])).toBe(0);
    // 2분 뒤: 숙소(1500‰ → 2분에 1)의 2번만 1 내린다. 집(3분에 1)의 1번은 아직
    expect(r.book.tick(120_000).size).toBe(0);
    expect(r.jobs.get(1)?.fatigue).toBe(9);
    expect(r.jobs.get(2)?.fatigue).toBe(8);
    // 6분 뒤: 2번은 6(= 다시 일하는 피로) → 일 단계, 1번은 7
    expect([...r.book.tick(360_000)]).toEqual([200]);
    expect(r.jobs.get(2)).toEqual({ job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 6 });
    expect(r.jobs.get(1)).toMatchObject({ phase: PHASE_REST, fatigue: 7 });
    // 9분 뒤: 1번도 돌아온다. 나눠 밀어도 한 번에 밀어도 같다
    expect([...r.book.tick(540_000)]).toEqual([100]);
    expect(r.jobs.get(1)).toMatchObject({ phase: PHASE_WORK, fatigue: 6 });
    expect(r.book.tick(900_000).size).toBe(0);
  });

  it("다시 켠 뒤: 저장된 직무 상태(쉼 단계)를 잇고 그 시각부터 회복을 센다", () => {
    const r = rig(
      { 1: { job: JOB_GATHER, phase: PHASE_REST, progressMs: 0, fatigue: 40 } },
      { restAt: 90, resumeAt: 0 },
    );
    // 피로 40은 쉬러 가는 값(90)보다 낮지만 쉬던 중이었다 → 쉼을 잇는다(쓰지 않는다)
    r.book.sync(10, [{ unitId: 1, facilityId: 100 }], 1_000_000);
    expect(r.writes).toEqual([]);
    expect(r.book.workingOf(1)).toBe(false);
    r.book.tick(1_000_000 + 180_000 * 3);
    expect(r.jobs.get(1)).toMatchObject({ phase: PHASE_REST, fatigue: 37 });
  });
});
