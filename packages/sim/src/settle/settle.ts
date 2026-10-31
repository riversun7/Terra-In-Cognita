// 오프라인 정산 해결 함수 — docs/adr/2026-10-31-s3-server-stage.md 4절, 시뮬레이션 ADR "해결 함수는 메커니즘당 1개"
// - 정산은 (상태, 규칙, 접속 상태, 시작, 끝) → (새 상태, 산출, 유지비)인 정수 함수다.
// - 나눠 정산해도 같다: (a → b) 다음 (b → c)의 결과가 (a → c)와 정확히 같다(settle.test.ts가 무작위로 잘라 본다).
//   그래서 접속 중(잘게)과 오프라인(한 번에)의 결과가 같다. 로그아웃으로 이득을 볼 수 없다.
// - 계산량은 구간 길이에 비례하지 않는다(일·쉼 주기를 나눗셈으로 센다).
// [임시] 직무·피로·유지비의 모양과 수치는 기획 Step 5 전 시험값이다(기획 질문 S3-Q3~Q5).

/** 오프라인으로 일을 이어 가는 시간(D-061·D-136: 모든 기기 연결이 끊긴 때부터 24시간) */
export const OFFLINE_WORK_MS = 24 * 60 * 60 * 1000;

/** 직무 종류 */
export const JOB_NONE = 0;
/** 반복 직무(채집 등): 오프라인 24시간까지 이어 간다(D-144) */
export const JOB_GATHER = 1;
/** 접속 중에만 하는 직무(사냥 등): 끊기면 멈춘다(D-144 "사냥·토벌은 오프라인에서 하지 않는다") */
export const JOB_HUNT = 2;

export const PHASE_WORK = 0;
export const PHASE_REST = 1;

/** 유닛 하나의 직무 상태 */
export interface JobState {
  readonly job: number;
  /** PHASE_WORK | PHASE_REST */
  readonly phase: number;
  /** 지금 주기(일 주기 또는 회복 한 걸음) 안에서 지난 시간(ms) */
  readonly progressMs: number;
  readonly fatigue: number;
}

/** [임시] 직무 규칙 */
export interface JobRules {
  /** 일 주기 하나(ms). 끝날 때마다 산출 1, 피로 +1 */
  readonly cycleMs: number;
  /** 피로가 이만큼 차면 쉰다 */
  readonly fatigueMax: number;
  /** 피로 1을 회복하는 시간(ms). 주거가 아직 없어 노숙 배율(D-296)로 느리게 둔다 */
  readonly restStepMs: number;
}

export const TEST_JOB_RULES: JobRules = { cycleMs: 60_000, fatigueMax: 120, restStepMs: 120_000 };

/** [임시] 유지비: 정시(UTC) 경계마다 유닛 하나에 이만큼(최소 단위 정수) */
export const UPKEEP_PERIOD_MS = 60 * 60 * 1000;
export const TEST_UPKEEP_PER_UNIT = 1n;

export interface JobAdvance {
  readonly state: JobState;
  /** 끝난 일 주기 수(= 산출 수) */
  readonly cycles: number;
}

function checkRules(rules: JobRules): void {
  if (
    !Number.isSafeInteger(rules.cycleMs) ||
    !Number.isSafeInteger(rules.restStepMs) ||
    !Number.isSafeInteger(rules.fatigueMax) ||
    rules.cycleMs < 1 ||
    rules.restStepMs < 1 ||
    rules.fatigueMax < 1
  ) {
    throw new RangeError("job rules must be positive safe integers");
  }
}

/**
 * 일하는 시간 durationMs만큼 직무 상태를 앞으로 보낸다. 일 단계: 주기마다 산출 1·피로 +1, 피로가 다 차면 쉰다.
 * 쉼 단계: restStepMs마다 피로 −1, 0이 되면 다시 일한다(D-144 "피로가 차면 쉬고, 회복하면 다시 일한다").
 */
export function advanceJob(state: JobState, durationMs: number, rules: JobRules): JobAdvance {
  checkRules(rules);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new RangeError("duration must be >= 0");
  let { phase, progressMs, fatigue } = state;
  let left = durationMs;
  let cycles = 0;
  const periodMs = rules.fatigueMax * (rules.cycleMs + rules.restStepMs);
  let fullPeriodsTaken = false;
  while (left > 0) {
    if (phase === PHASE_WORK) {
      const toRest = (rules.fatigueMax - fatigue) * rules.cycleMs - progressMs;
      if (left < toRest) {
        const done = Math.floor((progressMs + left) / rules.cycleMs);
        cycles += done;
        fatigue += done;
        progressMs = (progressMs + left) % rules.cycleMs;
        left = 0;
      } else {
        cycles += rules.fatigueMax - fatigue;
        left -= toRest;
        fatigue = rules.fatigueMax;
        phase = PHASE_REST;
        progressMs = 0;
      }
    } else {
      const toWork = fatigue * rules.restStepMs - progressMs;
      if (left < toWork) {
        const done = Math.floor((progressMs + left) / rules.restStepMs);
        fatigue -= done;
        progressMs = (progressMs + left) % rules.restStepMs;
        left = 0;
      } else {
        left -= toWork;
        fatigue = 0;
        phase = PHASE_WORK;
        progressMs = 0;
        // 일 시작(피로 0, 주기 0)에서 온전한 일·쉼 묶음은 한 번에 센다
        if (!fullPeriodsTaken) {
          fullPeriodsTaken = true;
          const periods = Math.floor(left / periodMs);
          cycles += periods * rules.fatigueMax;
          left -= periods * periodMs;
        }
      }
    }
  }
  return { state: { job: state.job, phase, progressMs, fatigue }, cycles };
}

/** 직무가 일할 수 있는 마지막 시각. 접속 중이면 끝이 없다 */
export function jobCutoffMs(job: number, offlineSinceMs: number | null): number {
  if (job === JOB_NONE) return Number.NEGATIVE_INFINITY;
  if (offlineSinceMs === null) return Number.POSITIVE_INFINITY;
  return job === JOB_HUNT ? offlineSinceMs : offlineSinceMs + OFFLINE_WORK_MS;
}

/**
 * 유닛 하나의 직무를 (fromMs, toMs] 구간 정산한다. 접속 상태(offlineSinceMs)는 구간 안에서 바뀌지 않아야 한다
 * (서버는 접속 상태가 바뀔 때마다 정산한다). 일할 수 있는 끝을 넘은 시간은 멈춘 채로 둔다(24시간 뒤 대기, D-061).
 */
export function settleJob(
  state: JobState,
  fromMs: number,
  toMs: number,
  offlineSinceMs: number | null,
  rules: JobRules,
): JobAdvance {
  const end = Math.min(toMs, jobCutoffMs(state.job, offlineSinceMs));
  if (end <= fromMs) return { state, cycles: 0 };
  return advanceJob(state, end - fromMs, rules);
}

/** (fromMs, toMs] 안의 유지비 경계 시각들(periodMs의 배수) */
export function upkeepBoundaries(fromMs: number, toMs: number, periodMs: number): number[] {
  if (!Number.isSafeInteger(periodMs) || periodMs < 1) throw new RangeError("period must be >= 1");
  const out: number[] = [];
  for (let at = (Math.floor(fromMs / periodMs) + 1) * periodMs; at <= toMs; at += periodMs) out.push(at);
  return out;
}

export interface UpkeepResult {
  /** 낸 경계 시각(차례대로) */
  readonly paid: number[];
  /** 내지 못한 경계 수 */
  readonly unpaid: number;
  readonly balance: bigint;
}

/**
 * 경계마다 charge를 낸다. 잔고가 모자란 경계는 내지 않고 센다(밀린 유지비, 결과는 기획 질문 S3-Q4).
 * 경계 순서대로 내므로 나눠 정산해도 같다.
 */
export function settleUpkeep(balance: bigint, charge: bigint, boundaries: readonly number[]): UpkeepResult {
  const paid: number[] = [];
  let unpaid = 0;
  let left = balance;
  for (const at of boundaries) {
    if (charge <= 0n) continue;
    if (left >= charge) {
      left -= charge;
      paid.push(at);
    } else {
      unpaid += 1;
    }
  }
  return { paid, unpaid, balance: left };
}
