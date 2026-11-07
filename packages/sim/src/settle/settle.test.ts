// 오프라인 정산 해결 함수 시험 — 손 계산, 한 걸음씩 흉내와 견주기, 나눠 정산해도 같은지(무작위 자르기)
import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  JOB_GATHER,
  JOB_HUNT,
  JOB_NONE,
  type JobRules,
  type JobState,
  OFFLINE_WORK_MS,
  PHASE_REST,
  PHASE_WORK,
  advanceJob,
  restIdle,
  settleJob,
  settleUpkeep,
  switchJob,
  upkeepBoundaries,
} from "./settle.ts";

const SMALL: JobRules = { cycleMs: 7, fatigueMax: 4, restStepMs: 5 };
const fresh = (job = JOB_GATHER): JobState => ({ job, phase: PHASE_WORK, progressMs: 0, fatigue: 0 });

/** 1ms씩 따라가는 느린 참조 구현 */
function reference(
  state: JobState,
  durationMs: number,
  rules: JobRules,
): { state: JobState; cycles: number } {
  let { phase, progressMs, fatigue } = state;
  let cycles = 0;
  for (let t = 0; t < durationMs; t++) {
    progressMs += 1;
    if (phase === PHASE_WORK && progressMs === rules.cycleMs) {
      progressMs = 0;
      cycles += 1;
      fatigue += 1;
      if (fatigue === rules.fatigueMax) phase = PHASE_REST;
    } else if (phase === PHASE_REST && progressMs === rules.restStepMs) {
      progressMs = 0;
      fatigue -= 1;
      if (fatigue === 0) phase = PHASE_WORK;
    }
  }
  return { state: { job: state.job, phase, progressMs, fatigue }, cycles };
}

describe("advanceJob", () => {
  it("손 계산: 일 주기 3번, 피로가 차면 쉬고 다 회복하면 다시 일한다", () => {
    expect(advanceJob(fresh(), 21, SMALL)).toEqual({ state: { ...fresh(), fatigue: 3 }, cycles: 3 });
    // 일 28ms(주기 4번) → 쉼 시작
    expect(advanceJob(fresh(), 28, SMALL).state).toEqual({ ...fresh(), phase: PHASE_REST, fatigue: 4 });
    // 일 28 + 쉼 20 = 48ms면 한 바퀴를 돌아 처음과 같다
    expect(advanceJob(fresh(), 48, SMALL)).toEqual({ state: fresh(), cycles: 4 });
    expect(advanceJob(fresh(), 48 * 1000 + 3, SMALL)).toEqual({
      state: { ...fresh(), progressMs: 3 },
      cycles: 4000,
    });
  });

  it("무작위 상태·길이에서 1ms씩 따라간 값과 같다", () => {
    const rng = createRng(7);
    for (let i = 0; i < 2_000; i++) {
      const phase = rng.nextInt(2);
      const fatigue =
        phase === PHASE_WORK ? rng.nextInt(SMALL.fatigueMax) : 1 + rng.nextInt(SMALL.fatigueMax);
      const progressMs = rng.nextInt(phase === PHASE_WORK ? SMALL.cycleMs : SMALL.restStepMs);
      const state = { job: JOB_GATHER, phase, progressMs, fatigue };
      const duration = rng.nextInt(400);
      expect(advanceJob(state, duration, SMALL)).toEqual(reference(state, duration, SMALL));
    }
  });
});

describe("settleJob — 접속 상태", () => {
  const rules: JobRules = { cycleMs: 60_000, fatigueMax: 120, restStepMs: 120_000 };
  it("접속 중이면 끝까지, 채집은 끊긴 뒤 24시간까지, 사냥은 끊긴 때 멈춘다, 직무 없음은 그대로", () => {
    const day = OFFLINE_WORK_MS;
    const online = settleJob(fresh(), 0, 3 * day, null, rules);
    const full = advanceJob(fresh(), 3 * day, rules);
    expect(online).toEqual(full);
    const offline = settleJob(fresh(), 0, 3 * day, 1_000, rules);
    expect(offline).toEqual(advanceJob(fresh(), day + 1_000, rules));
    expect(settleJob(fresh(JOB_HUNT), 0, 3 * day, 1_000, rules)).toEqual(
      advanceJob(fresh(JOB_HUNT), 1_000, rules),
    );
    expect(settleJob(fresh(JOB_NONE), 0, 3 * day, null, rules)).toEqual({
      state: fresh(JOB_NONE),
      cycles: 0,
    });
    // 일할 수 있는 끝이 지난 구간은 아무것도 바꾸지 않는다
    expect(settleJob(fresh(), 2 * day, 3 * day, 0, rules)).toEqual({ state: fresh(), cycles: 0 });
  });

  it("나눠 정산해도 한 번에 한 것과 같다(무작위 자르기, 접속·오프라인 모두)", () => {
    const rng = createRng(42);
    for (let round = 0; round < 300; round++) {
      const end = 1 + rng.nextInt(3 * OFFLINE_WORK_MS);
      const offline = rng.nextInt(3) === 0 ? null : rng.nextInt(end);
      const job = rng.nextInt(2) === 0 ? JOB_GATHER : JOB_HUNT;
      const whole = settleJob(fresh(job), 0, end, offline, rules);
      const cuts = Array.from({ length: rng.nextInt(12) }, () => rng.nextInt(end)).toSorted((a, b) => a - b);
      let state = fresh(job);
      let cycles = 0;
      let from = 0;
      for (const cut of [...cuts, end]) {
        const step = settleJob(state, from, cut, offline, rules);
        state = step.state;
        cycles += step.cycles;
        from = cut;
      }
      expect({ state, cycles }).toEqual(whole);
    }
  });
});

/** 직무 없는 유닛 상태 */
const idle = (fatigue: number, phase = PHASE_WORK, progressMs = 0): JobState => ({
  job: JOB_NONE,
  phase,
  progressMs,
  fatigue,
});

describe("직무 없는 유닛의 쉼(D-430, WP8 525 ①)", () => {
  it("손 계산: 걸음마다 피로 −1, 0이 되면 일 단계·진행 0, 피로 0이면 그대로", () => {
    // SMALL 걸음 5ms: 피로 3 → 12ms 뒤 1(2걸음 + 2ms)
    expect(restIdle(idle(3), 12, SMALL)).toEqual(idle(1, PHASE_WORK, 2));
    // 쉼 단계에서 풀린 유닛도 같은 값으로 풀리고, 0이 되면 일 단계
    expect(restIdle(idle(2, PHASE_REST, 4), 6, SMALL)).toEqual(idle(0));
    expect(restIdle(idle(2, PHASE_REST, 4), 5, SMALL)).toEqual(idle(1, PHASE_REST, 4));
    expect(restIdle(idle(0, PHASE_WORK, 0), 1_000, SMALL)).toEqual(idle(0));
    expect(restIdle(idle(4), 0, SMALL)).toEqual(idle(4));
  });

  it("settleJob: 접속 상태와 상관없이 구간 내내 쉰다(산출 0)", () => {
    expect(settleJob(idle(4), 0, 20, null, SMALL)).toEqual({ state: idle(0), cycles: 0 });
    // 끊긴 뒤 24시간이 지나도 회복은 멈추지 않는다
    expect(settleJob(idle(4), OFFLINE_WORK_MS * 3, OFFLINE_WORK_MS * 3 + 7, 0, SMALL)).toEqual({
      state: idle(3, PHASE_WORK, 2),
      cycles: 0,
    });
  });

  it("나눠 셈해도 한 번에 한 것과 같다(무작위 자르기)", () => {
    const rng = createRng(11);
    for (let round = 0; round < 500; round++) {
      const start = idle(rng.nextInt(SMALL.fatigueMax + 1), rng.nextInt(2), rng.nextInt(SMALL.restStepMs));
      const end = rng.nextInt(60);
      const whole = restIdle(start, end, SMALL);
      let state = start;
      let from = 0;
      const cuts = Array.from({ length: rng.nextInt(8) }, () => rng.nextInt(end + 1)).toSorted(
        (a, b) => a - b,
      );
      for (const cut of [...cuts, end]) {
        state = restIdle(state, cut - from, SMALL);
        from = cut;
      }
      expect(state).toEqual(whole);
    }
  });

  it("풀었다 다시 배치해도 피로가 지워지지 않는다: 바꿀 때 진행만 0, 다시 일하면 남은 피로에서 이어 간다", () => {
    const tired: JobState = { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 3, fatigue: 3 };
    const off = switchJob(tired, JOB_NONE);
    expect(off).toEqual(idle(3));
    const back = switchJob(off, JOB_GATHER);
    expect(back).toEqual({ ...tired, progressMs: 0 });
    // 쉼 단계에서 바로 다시 받으면 쉼을 마저 한다(피로 0이 될 때까지 일하지 않는다)
    const resting: JobState = { job: JOB_GATHER, phase: PHASE_REST, progressMs: 2, fatigue: 4 };
    expect(advanceJob(switchJob(switchJob(resting, JOB_NONE), JOB_GATHER), 19, SMALL).cycles).toBe(0);
    // 피로 0이면 일 단계로 바꾼다
    expect(switchJob({ ...resting, fatigue: 0 }, JOB_NONE)).toEqual(idle(0));
  });
});

describe("유지비", () => {
  it("경계는 (시작, 끝] 안의 주기 배수, 모자라면 내지 않고 센다", () => {
    expect(upkeepBoundaries(0, 10, 4)).toEqual([4, 8]);
    expect(upkeepBoundaries(4, 8, 4)).toEqual([8]);
    expect(upkeepBoundaries(5, 7, 4)).toEqual([]);
    expect(settleUpkeep(5n, 2n, [4, 8, 12])).toEqual({ paid: [4, 8], unpaid: 1, balance: 1n });
    expect(settleUpkeep(5n, 0n, [4, 8])).toEqual({ paid: [], unpaid: 0, balance: 5n });
  });

  it("나눠 정산해도 같다", () => {
    const rng = createRng(3);
    for (let round = 0; round < 200; round++) {
      const end = rng.nextInt(1_000);
      const balance = BigInt(rng.nextInt(40));
      const whole = settleUpkeep(balance, 3n, upkeepBoundaries(0, end, 10));
      let left = balance;
      let paid: number[] = [];
      let unpaid = 0;
      let from = 0;
      const cuts = Array.from({ length: rng.nextInt(6) }, () => rng.nextInt(end + 1)).toSorted(
        (a, b) => a - b,
      );
      for (const cut of [...cuts, end]) {
        const step = settleUpkeep(left, 3n, upkeepBoundaries(from, cut, 10));
        left = step.balance;
        paid = [...paid, ...step.paid];
        unpaid += step.unpaid;
        from = cut;
      }
      expect({ paid, unpaid, balance: left }).toEqual(whole);
    }
  });
});
