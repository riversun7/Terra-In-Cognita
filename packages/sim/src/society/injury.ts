// 부상 단계·작업 중 부상·단계별 자연 치유·병원 치료 — 기획 D-521(사용자 원문 "병원이 있어야만 낫는 부상은 없다. 부상상태를 초록(정상) 흰색
// 노랑 빨강으로 두고 전투나 생산채집등의 작업시 부상 확률에 따라 부상. 자유치유 시간을 높게두고 병원은 건물등급, 의사 스탯, 스킬에 따라 회복
// 속도 매우 빠르고 비용이 들게함" → "흰1일 노랑 2일 빨강3일 => 빨강에서 노랑, 노랑에서 흰색 상태로 거쳐감 즉 빨강은 초록까지 6일걸림")·D-514
// (단계별 회복 속도·불이익은 그대로)·49 N55, docs/adr/2026-11-08-injury.md.
// 서버(세계 유닛 상태·전투 결과·소유 주체 정산·병원 명령)와 시뮬레이터(정산·조우 전투·만족도)가 이 한 벌을 쓴다.
// - 단계: 0 초록(정상)·1 흰·2 노랑·3 빨강. 저장은 (단계, 그 단계가 끝나는 시각, 치유 배율 ‰) 셋이다. 지금 단계는 읽을 때 센다: 끝 시각이 지났으면
//   한 단계 내려가 그 단계의 치유 시간(설정 칸 ÷ 배율)을 더한다(빨강 → 노랑 → 흰 → 초록). 그래서 오프라인이어도 쓰기 없이 맞다.
// - 작업 중 부상: 일하는 유닛을 실제 시각의 작업 주기 경계(설정 칸, 정시 기준)마다 굴린다. 경계에서 그 유닛의 직무가 일 단계일 때만 굴리고,
//   피로가 높을수록 확률이 오른다. 난수는 (시드, 유닛, 경계 번호)로만 정한다 → 정산을 어떻게 나눠도 같은 경계가 같은 결과(S3 4절 "나눠 정산해도
//   같다"). 채집(2차맵 오브젝트 채집 줄기)도 같은 함수(workInjuryStage·settleWorkInjury)를 부른다.
// - 전투 부상: 전투가 끝나면 유닛마다 굴린다. 쓰러졌으면(HP 0) 쓰러짐 확률·단계표, 아니면 잃은 HP 몫에 비례한 확률·단계표. 난수는 (전투 시드, 유닛).
// - 병원: 치유 배율 = 기본 + 등급(레벨) + 의사 스탯(INT + WIS) + 의사 치유 스킬 등급(상한까지). 치료하면 남은 시간이 배율만큼 줄고 이후 단계도
//   그 배율로 지난다. 비용 = 지금 남은 치유 시간(일) × 하루 값 × 등급 배율(최소 단위 정수). 병원이 꼭 있어야 낫는 부상은 없다.
// 수치는 모두 [임시] 출발값이다(D-515, 자연 치유 3·2·1일만 D-521 원문). 정수 연산만 쓴다(판정 코드 규칙).
import { createRng } from "@terra/shared";
import { mix32 } from "../math/hash.ts";
import {
  type JobRules,
  type JobState,
  JOB_NONE,
  PHASE_WORK,
  advanceJob,
  jobCutoffMs,
} from "../settle/settle.ts";

/** 초록(정상) */
export const INJURY_GREEN = 0;
/** 흰 */
export const INJURY_WHITE = 1;
/** 노랑 */
export const INJURY_YELLOW = 2;
/** 빨강(가장 무거움 — 옛 중태처럼 명령을 받지 못한다, 서버 world/unitCondition.ts unavailable) */
export const INJURY_RED = 3;
export const INJURY_STAGE_MAX = INJURY_RED;
/** 치유 배율 기준(자연 치유 = ×1) */
export const NATURAL_HEAL_PM = 1000;

/** 단계 하나의 단계표(흰·노랑·빨강 무게, 0번 칸은 초록 — 구조 값 0) */
export type InjuryStageWeights = readonly number[];

/** 부상 설정 칸(49 N55). 세력·사회 계수표 injury 칸, 팩 tuning 경로 "injury.*" */
export interface InjuryCoefficients {
  /**
   * 단계마다 한 단계 내려가는 자연 치유 시간(ms). 칸 번호 = 지금 단계: 1 흰 → 초록, 2 노랑 → 흰, 3 빨강 → 노랑. 0번 칸은 구조 값(0).
   * 출발값 D-521 원문: 흰 1일·노랑 2일·빨강 3일(빨강 → 초록 6일)
   */
  readonly healMs: readonly number[];
  /** 작업 중 부상을 굴리는 주기(ms, 실제 시각 정시 기준 경계) */
  readonly workPeriodMs: number;
  /** 작업 주기 경계 한 번의 부상 확률(‰, 피로 0) */
  readonly workChancePm: number;
  /** 피로가 가득일 때 확률에 더하는 몫(확률의 ‰, 피로에 비례 — 1000이면 가득일 때 두 배) */
  readonly workFatiguePm: number;
  /** 작업 중 부상의 단계표(무게) */
  readonly workStagePm: InjuryStageWeights;
  /** 전투에서 쓰러진(HP 0) 유닛의 부상 확률(‰) */
  readonly combatDownedChancePm: number;
  /** 쓰러진 유닛의 단계표 */
  readonly combatDownedStagePm: InjuryStageWeights;
  /** 쓰러지지 않은 유닛: 최대 HP를 모두 잃었을 때의 부상 확률(‰, 잃은 몫에 비례) */
  readonly combatHitChancePm: number;
  /** 쓰러지지 않은 유닛의 단계표 */
  readonly combatHitStagePm: InjuryStageWeights;
  readonly hospital: {
    /** 레벨 1 병원·의사 없음의 치유 배율(‰) */
    readonly baseSpeedPm: number;
    /** 레벨 1을 넘는 레벨마다 더하는 배율(‰) */
    readonly levelSpeedPm: number;
    /** 의사 스탯(INT + WIS) 1당 더하는 배율(‰) */
    readonly statSpeedPm: number;
    /** 의사 치유 스킬 등급 1당 더하는 배율(‰) */
    readonly skillSpeedPm: number;
    /** 배율 상한(‰) */
    readonly maxSpeedPm: number;
    /** 남은 치유 하루당 값(최소 단위) */
    readonly costPerDay: number;
    /** 레벨 1을 넘는 레벨마다 값에 더하는 몫(‰) */
    readonly levelCostPm: number;
  };
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** [임시] 출발값(자연 치유만 D-521 원문). 기획 N55 "나머지 [임시]" */
export const START_INJURY_COEFFICIENTS: InjuryCoefficients = {
  healMs: [0, DAY_MS, 2 * DAY_MS, 3 * DAY_MS],
  workPeriodMs: HOUR_MS,
  workChancePm: 3,
  workFatiguePm: 1000,
  workStagePm: [0, 800, 180, 20],
  combatDownedChancePm: 1000,
  combatDownedStagePm: [0, 300, 500, 200],
  combatHitChancePm: 200,
  combatHitStagePm: [0, 900, 100, 0],
  hospital: {
    baseSpeedPm: 4000,
    levelSpeedPm: 2000,
    statSpeedPm: 50,
    skillSpeedPm: 500,
    maxSpeedPm: 30_000,
    costPerDay: 200,
    levelCostPm: 500,
  },
};

/** 저장하는 부상 상태(세계 유닛 줄 world_units.injury·injury_until_ms·injury_heal_pm) */
export interface InjuryState {
  /** 0 초록 ~ 3 빨강 */
  readonly stage: number;
  /** 지금 단계가 한 단계 내려가는 시각(초록이면 null) */
  readonly untilMs: number | null;
  /** 치유 배율(‰, 1000 = 자연 치유, 병원 치료가 올린다) */
  readonly healPm: number;
}

export const NO_INJURY: InjuryState = { stage: INJURY_GREEN, untilMs: null, healPm: NATURAL_HEAL_PM };

const clampStage = (stage: number): number =>
  Number.isFinite(stage) ? Math.min(INJURY_STAGE_MAX, Math.max(0, Math.trunc(stage))) : 0;

/** 그 단계 하나를 지나는 시간(ms, 치유 배율을 얹음, 최소 1) */
export function stageHealMs(stage: number, healPm: number, c: InjuryCoefficients): number {
  const base = Math.max(0, c.healMs[clampStage(stage)] ?? 0);
  return Math.max(1, Math.floor((base * NATURAL_HEAL_PM) / Math.max(1, healPm)));
}

/**
 * nowMs의 부상: 지금 단계의 끝이 지났으면 한 단계씩 내려가며 그 단계의 치유 시간을 더한다(초록이 되면 NO_INJURY).
 * 끝 시각이 nowMs와 같으면 이미 내려간 것이다(끝 = 다음 단계의 시작)
 */
export function injuryNow(state: InjuryState, nowMs: number, c: InjuryCoefficients): InjuryState {
  let stage = clampStage(state.stage);
  if (stage <= 0 || state.untilMs === null) return NO_INJURY;
  let untilMs = state.untilMs;
  while (stage > 0 && untilMs <= nowMs) {
    stage -= 1;
    if (stage > 0) untilMs += stageHealMs(stage, state.healPm, c);
  }
  return stage > 0 ? { stage, untilMs, healPm: state.healPm } : NO_INJURY;
}

/** 초록이 되는 시각(이미 초록이면 null): 지금 단계 끝 + 아래 단계마다 치유 시간 */
export function injuryGreenAtMs(state: InjuryState, nowMs: number, c: InjuryCoefficients): number | null {
  const now = injuryNow(state, nowMs, c);
  if (now.stage <= 0 || now.untilMs === null) return null;
  let at = now.untilMs;
  for (let stage = now.stage - 1; stage > 0; stage--) at += stageHealMs(stage, now.healPm, c);
  return at;
}

/**
 * 새 부상(stage)을 atMs에 더한다: 지금보다 무거우면 그 단계를 자연 치유로 새로 시작(치료 배율은 풀린다), 같으면 그 단계 시간을 다시 센다
 * (늦은 쪽), 가벼우면 그대로
 */
export function injure(state: InjuryState, stage: number, atMs: number, c: InjuryCoefficients): InjuryState {
  const now = injuryNow(state, atMs, c);
  const next = clampStage(stage);
  if (next <= 0 || next < now.stage) return now;
  if (next > now.stage)
    return { stage: next, untilMs: atMs + stageHealMs(next, NATURAL_HEAL_PM, c), healPm: NATURAL_HEAL_PM };
  const restart = atMs + stageHealMs(next, now.healPm, c);
  return { ...now, untilMs: Math.max(now.untilMs ?? restart, restart) };
}

/** 단계표에서 하나 뽑기(roll = 0 이상 무게 합 미만). 무게 합이 0이면 초록 */
export function pickInjuryStage(weights: InjuryStageWeights, roll: number): number {
  let left = roll;
  for (let stage = 1; stage <= INJURY_STAGE_MAX; stage++) {
    const weight = Math.max(0, weights[stage] ?? 0);
    if (left < weight) return stage;
    left -= weight;
  }
  return INJURY_GREEN;
}

const weightSum = (weights: InjuryStageWeights): number => {
  let sum = 0;
  for (let stage = 1; stage <= INJURY_STAGE_MAX; stage++) sum += Math.max(0, weights[stage] ?? 0);
  return sum;
};

/** 확률(‰) → 단계표 굴림. 다치지 않으면 0 */
function rollStage(seed: number, chancePm: number, weights: InjuryStageWeights): number {
  const rng = createRng(seed);
  const chance = Math.min(1000, Math.max(0, Math.trunc(chancePm)));
  if (rng.nextInt(1000) >= chance) return INJURY_GREEN;
  const sum = weightSum(weights);
  return sum > 0 ? pickInjuryStage(weights, rng.nextInt(sum)) : INJURY_GREEN;
}

/** 난수 흐름(부상) — 다른 흐름과 섞이지 않게 고정값을 넣는다 */
const STREAM_WORK = 0x4a17;
const STREAM_COMBAT = 0x4a18;

const injurySeed = (seed: number, stream: number, unit: number, step: number): number =>
  mix32(
    mix32(seed ^ Math.imul(stream, 0x27d4_eb2f)) ^
      Math.imul(unit, 0x9e37_79b1) ^
      Math.imul((step % 0x7fff_ffff) + 1, 0x85eb_ca6b),
  );

/** 작업 중 부상 확률(‰): 기본 + 기본 × 피로 몫 × 피로 비율 */
export function workInjuryChancePm(fatigue: number, fatigueMax: number, c: InjuryCoefficients): number {
  const base = Math.max(0, c.workChancePm);
  const ratio = fatigueMax > 0 ? Math.min(fatigueMax, Math.max(0, fatigue)) : 0;
  const extra =
    fatigueMax > 0 ? Math.floor((base * Math.max(0, c.workFatiguePm) * ratio) / (1000 * fatigueMax)) : 0;
  return Math.min(1000, base + extra);
}

/**
 * 작업 주기 경계 하나의 부상 단계(0 = 다치지 않음). index = 경계 시각 ÷ 작업 주기(정수). 채집 줄기도 이 함수를 부른다(ADR "고리").
 * 난수는 (시드, 유닛, index)로만 정한다
 */
export function workInjuryStage(
  input: {
    readonly seed: number;
    readonly unit: number;
    readonly index: number;
    readonly fatigue: number;
    readonly fatigueMax: number;
  },
  c: InjuryCoefficients,
): number {
  return rollStage(
    injurySeed(input.seed, STREAM_WORK, input.unit, input.index),
    workInjuryChancePm(input.fatigue, input.fatigueMax, c),
    c.workStagePm,
  );
}

/** 작업 주기 경계 하나(그 유닛이 그 시각에 일 단계였다) */
export interface WorkInjuryCheck {
  readonly atMs: number;
  /** 경계 번호(= atMs ÷ 작업 주기) */
  readonly index: number;
  /** 그 시각의 피로 */
  readonly fatigue: number;
}

/** 한 번 정산에서 보는 경계 수 상한(작업 주기를 아주 짧게 맞춘 실수로 정산이 멈추지 않게) */
export const MAX_WORK_INJURY_CHECKS = 20_000;

/**
 * (fromMs, toMs] 안 작업 주기 경계 가운데 그 유닛이 일 단계였던 것(settle.ts와 같은 직무 진행·일할 수 있는 끝). state = fromMs의 직무 상태.
 * 직무 없음이면 빈 목록. 나눠 불러도 같은 경계가 같은 피로로 나온다(settleJob을 경계에서 나눠 센 것과 같다)
 */
export function workInjuryChecks(
  state: JobState,
  fromMs: number,
  toMs: number,
  offlineSinceMs: number | null,
  rules: JobRules,
  periodMs: number,
): WorkInjuryCheck[] {
  if (state.job === JOB_NONE || periodMs < 1 || toMs <= fromMs) return [];
  const end = Math.min(toMs, jobCutoffMs(state.job, offlineSinceMs));
  const out: WorkInjuryCheck[] = [];
  let job = state;
  let at = fromMs;
  for (
    let boundary = (Math.floor(fromMs / periodMs) + 1) * periodMs, seen = 0;
    boundary <= end && seen < MAX_WORK_INJURY_CHECKS;
    boundary += periodMs, seen++
  ) {
    job = advanceJob(job, boundary - at, rules).state;
    at = boundary;
    if (job.phase === PHASE_WORK)
      out.push({ atMs: boundary, index: boundary / periodMs, fatigue: job.fatigue });
  }
  return out;
}

/**
 * 유닛 하나의 (fromMs, toMs] 작업 중 부상을 더한다(소유 주체 정산이 직무 정산 전 상태로 부른다). 다친 경계마다 injure(그 경계 시각)
 */
export function settleWorkInjury(
  input: {
    readonly injury: InjuryState;
    readonly job: JobState;
    readonly unit: number;
    readonly seed: number;
    readonly fromMs: number;
    readonly toMs: number;
    readonly offlineSinceMs: number | null;
    readonly rules: JobRules;
  },
  c: InjuryCoefficients,
): InjuryState {
  let injury = input.injury;
  for (const check of workInjuryChecks(
    input.job,
    input.fromMs,
    input.toMs,
    input.offlineSinceMs,
    input.rules,
    c.workPeriodMs,
  )) {
    const stage = workInjuryStage(
      {
        seed: input.seed,
        unit: input.unit,
        index: check.index,
        fatigue: check.fatigue,
        fatigueMax: input.rules.fatigueMax,
      },
      c,
    );
    if (stage > 0) injury = injure(injury, stage, check.atMs, c);
  }
  return injury;
}

/**
 * 전투 뒤 유닛 하나의 부상 단계(0 = 다치지 않음): 끝 HP가 0이면 쓰러짐 확률·단계표, 아니면 잃은 HP(시작 − 끝) ÷ 최대 몫에 비례한 확률·단계표.
 * 난수는 (전투 시드, 유닛)으로만 정한다
 */
export function combatInjuryStage(
  input: {
    readonly seed: number;
    readonly unit: number;
    readonly maxHp: number;
    readonly startHp: number;
    readonly endHp: number;
  },
  c: InjuryCoefficients,
): number {
  const seed = injurySeed(input.seed, STREAM_COMBAT, input.unit, 0);
  if (input.endHp <= 0) return rollStage(seed, c.combatDownedChancePm, c.combatDownedStagePm);
  const max = Math.max(1, Math.trunc(input.maxHp));
  const lost = Math.min(max, Math.max(0, Math.trunc(input.startHp) - Math.trunc(input.endHp)));
  if (lost <= 0) return INJURY_GREEN;
  const chance = Math.floor((Math.max(0, c.combatHitChancePm) * lost) / max);
  return rollStage(seed, chance, c.combatHitStagePm);
}

/** 병원 하나의 치료 조건 */
export interface HospitalInput {
  /** 병원 레벨(다 지은 레벨, 1 이상) */
  readonly level: number;
  /** 의사(그 병원에 직무 배치된 유닛 가운데 가장 나은)의 INT + WIS. 의사가 없으면 0 */
  readonly doctorStat: number;
  /** 의사의 치유 스킬(모양 heal) 가장 높은 등급(1~10). 없으면 0 */
  readonly doctorSkillGrade: number;
}

/** 병원 치유 배율(‰): 기본 + 레벨 몫 + 의사 스탯 몫 + 스킬 몫, 자연 치유 이상·상한 이하 */
export function hospitalSpeedPm(input: HospitalInput, c: InjuryCoefficients): number {
  const h = c.hospital;
  const level = Math.max(1, Math.trunc(input.level));
  const raw =
    Math.max(0, h.baseSpeedPm) +
    Math.max(0, h.levelSpeedPm) * (level - 1) +
    Math.max(0, h.statSpeedPm) * Math.max(0, Math.trunc(input.doctorStat)) +
    Math.max(0, h.skillSpeedPm) * Math.min(10, Math.max(0, Math.trunc(input.doctorSkillGrade)));
  return Math.max(NATURAL_HEAL_PM, Math.min(Math.max(NATURAL_HEAL_PM, h.maxSpeedPm), raw));
}

/** 병원 치료 견적 */
export interface TreatmentQuote {
  readonly speedPm: number;
  /** 치료하면 초록이 되는 시각 */
  readonly greenAtMs: number;
  /** 치료하지 않으면 초록이 되는 시각 */
  readonly naturalGreenAtMs: number;
  /** 값(최소 단위) */
  readonly cost: bigint;
}

/**
 * 치료 비용(최소 단위): 지금 상태 그대로 초록까지 남은 시간(ms)의 날 몫 × 하루 값(올림) × (1 + 레벨 몫). 정수(BigInt)만 쓴다
 */
export function treatmentCost(remainingMs: number, level: number, c: InjuryCoefficients): bigint {
  const h = c.hospital;
  if (remainingMs <= 0) return 0n;
  const perDay = BigInt(Math.max(0, Math.trunc(h.costPerDay)));
  const base = (perDay * BigInt(Math.trunc(remainingMs)) + BigInt(DAY_MS - 1)) / BigInt(DAY_MS);
  const levelPm = BigInt(
    1000 + Math.max(0, Math.trunc(h.levelCostPm)) * (Math.max(1, Math.trunc(level)) - 1),
  );
  return (base * levelPm) / 1000n;
}

/**
 * 치료 견적: 다쳤고 그 병원 배율이 지금 배율보다 빠를 때만. 아니면 undefined(초록이거나 이미 같은·더 빠른 치료 중)
 */
export function treatmentQuote(
  state: InjuryState,
  atMs: number,
  input: HospitalInput,
  c: InjuryCoefficients,
): TreatmentQuote | undefined {
  const now = injuryNow(state, atMs, c);
  const naturalGreenAtMs = injuryGreenAtMs(now, atMs, c);
  if (now.stage <= 0 || naturalGreenAtMs === null) return undefined;
  const speedPm = hospitalSpeedPm(input, c);
  if (speedPm <= now.healPm) return undefined;
  const treated = treatInjury(now, atMs, speedPm, c);
  const greenAtMs = injuryGreenAtMs(treated, atMs, c) ?? atMs;
  return {
    speedPm,
    greenAtMs,
    naturalGreenAtMs,
    cost: treatmentCost(naturalGreenAtMs - atMs, input.level, c),
  };
}

/**
 * 병원 치료: 지금 단계의 남은 시간을 배율 비로 줄이고 이후 단계도 그 배율로 지난다. 배율이 지금보다 빠르지 않으면 그대로
 */
export function treatInjury(
  state: InjuryState,
  atMs: number,
  speedPm: number,
  c: InjuryCoefficients,
): InjuryState {
  const now = injuryNow(state, atMs, c);
  if (now.stage <= 0 || now.untilMs === null || speedPm <= now.healPm) return now;
  const left = Math.max(0, now.untilMs - atMs);
  const scaled = Math.max(1, Math.floor((left * now.healPm) / speedPm));
  return { stage: now.stage, untilMs: atMs + scaled, healPm: speedPm };
}
