import { describe, expect, it } from "vitest";
import { JOB_GATHER, JOB_NONE, PHASE_WORK, TEST_JOB_RULES, settleJob } from "../settle/settle.ts";
import {
  INJURY_RED,
  INJURY_WHITE,
  INJURY_YELLOW,
  NO_INJURY,
  START_INJURY_COEFFICIENTS as C,
  combatInjuryStage,
  hospitalSpeedPm,
  injure,
  injuryGreenAtMs,
  injuryNow,
  pickInjuryStage,
  settleWorkInjury,
  treatInjury,
  treatmentCost,
  treatmentQuote,
  workInjuryChecks,
  workInjuryStage,
} from "./injury.ts";

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("부상 단계 자연 치유(D-521: 빨강 → 노랑 3일 → 흰 2일 → 초록 1일)", () => {
  it("빨강은 한 단계씩 내려가 6일 뒤 초록이 된다", () => {
    const red = injure(NO_INJURY, INJURY_RED, 0, C);
    expect(red).toEqual({ stage: INJURY_RED, untilMs: 3 * DAY, healPm: 1000 });
    expect(injuryNow(red, 3 * DAY - 1, C).stage).toBe(INJURY_RED);
    expect(injuryNow(red, 3 * DAY, C)).toEqual({ stage: INJURY_YELLOW, untilMs: 5 * DAY, healPm: 1000 });
    expect(injuryNow(red, 5 * DAY, C)).toEqual({ stage: INJURY_WHITE, untilMs: 6 * DAY, healPm: 1000 });
    expect(injuryNow(red, 6 * DAY, C)).toEqual(NO_INJURY);
    expect(injuryGreenAtMs(red, 0, C)).toBe(6 * DAY);
    // 언제 읽어도 같다(오프라인이어도 쓰기 없이)
    expect(injuryNow(injuryNow(red, 4 * DAY, C), 5 * DAY + 1, C)).toEqual(injuryNow(red, 5 * DAY + 1, C));
  });

  it("더 무거운 부상은 새로 시작하고, 같은 단계는 시간을 다시 세고, 가벼운 부상은 그대로", () => {
    const white = injure(NO_INJURY, INJURY_WHITE, 0, C);
    expect(injure(white, INJURY_YELLOW, HOUR, C)).toEqual({
      stage: INJURY_YELLOW,
      untilMs: HOUR + 2 * DAY,
      healPm: 1000,
    });
    expect(injure(white, INJURY_WHITE, 10 * HOUR, C).untilMs).toBe(10 * HOUR + DAY);
    const yellow = injure(NO_INJURY, INJURY_YELLOW, 0, C);
    expect(injure(yellow, INJURY_WHITE, HOUR, C)).toEqual(yellow);
  });

  it("단계표 뽑기", () => {
    expect(pickInjuryStage([0, 800, 180, 20], 0)).toBe(INJURY_WHITE);
    expect(pickInjuryStage([0, 800, 180, 20], 800)).toBe(INJURY_YELLOW);
    expect(pickInjuryStage([0, 800, 180, 20], 999)).toBe(INJURY_RED);
  });
});

/** 같은 시드 경계 4000개 가운데 다친 수(피로 고정) */
const injuredCount = (fatigue: number): number =>
  Array.from({ length: 4000 }, (_, index) =>
    workInjuryStage({ seed: 1, unit: 3, index, fatigue, fatigueMax: 120 }, { ...C, workChancePm: 100 }),
  ).filter((stage) => stage > 0).length;

describe("작업 중 부상", () => {
  const working = { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 };

  it("일 단계였던 정시 경계만 본다(직무 없음은 없음, 오프라인 24시간 뒤 멈춤)", () => {
    expect(workInjuryChecks({ ...working, job: JOB_NONE }, 0, DAY, null, TEST_JOB_RULES, HOUR)).toEqual([]);
    const checks = workInjuryChecks(working, 0, DAY, null, TEST_JOB_RULES, HOUR);
    // 시험 직무: 일 120분 → 쉼 240분(피로 120 × 2분) 주기
    expect(checks.map((check) => check.atMs / HOUR)).toEqual([1, 6, 7, 12, 13, 18, 19, 24]);
    expect(checks[0]?.fatigue).toBe(60);
    const offline = workInjuryChecks(working, 0, 3 * DAY, 0, TEST_JOB_RULES, HOUR);
    expect(offline.at(-1)?.atMs).toBe(DAY);
  });

  it("나눠 정산해도 같은 경계·피로·결과", () => {
    const c = { ...C, workChancePm: 400 };
    const whole = settleWorkInjury(
      {
        injury: NO_INJURY,
        job: working,
        unit: 7,
        seed: 42,
        fromMs: 0,
        toMs: 3 * DAY,
        offlineSinceMs: null,
        rules: TEST_JOB_RULES,
      },
      c,
    );
    let injury = NO_INJURY;
    let job = working;
    for (const [from, to] of [
      [0, 5 * HOUR + 17],
      [5 * HOUR + 17, DAY],
      [DAY, 3 * DAY],
    ] as const) {
      injury = settleWorkInjury(
        {
          injury,
          job,
          unit: 7,
          seed: 42,
          fromMs: from,
          toMs: to,
          offlineSinceMs: null,
          rules: TEST_JOB_RULES,
        },
        c,
      );
      job = settleJob(job, from, to, null, TEST_JOB_RULES).state;
    }
    expect(injury).toEqual(whole);
    expect(whole.stage).toBeGreaterThan(0);
  });

  it("피로가 높으면 더 자주 다친다(같은 시드 여러 경계)", () => {
    expect(injuredCount(120)).toBeGreaterThan(injuredCount(0) * 1.5);
  });
});

describe("전투 부상", () => {
  it("쓰러지면 늘(출발값 1000‰), 다치지 않았으면 없음, 같은 시드면 같다", () => {
    const downed = combatInjuryStage({ seed: 9, unit: 4, maxHp: 100, startHp: 100, endHp: 0 }, C);
    expect(downed).toBeGreaterThan(0);
    expect(combatInjuryStage({ seed: 9, unit: 4, maxHp: 100, startHp: 100, endHp: 0 }, C)).toBe(downed);
    expect(combatInjuryStage({ seed: 9, unit: 4, maxHp: 100, startHp: 80, endHp: 80 }, C)).toBe(0);
    const hits = Array.from({ length: 2000 }, (_, unit) =>
      combatInjuryStage({ seed: 5, unit, maxHp: 100, startHp: 100, endHp: 10 }, C),
    ).filter((stage) => stage > 0).length;
    // 90% 잃음 × 200‰ ≈ 18%
    expect(hits).toBeGreaterThan(250);
    expect(hits).toBeLessThan(470);
  });
});

describe("병원", () => {
  it("배율 = 기본 + 레벨 + 의사 스탯 + 스킬, 상한까지", () => {
    expect(hospitalSpeedPm({ level: 1, doctorStat: 0, doctorSkillGrade: 0 }, C)).toBe(4000);
    expect(hospitalSpeedPm({ level: 3, doctorStat: 40, doctorSkillGrade: 2 }, C)).toBe(
      4000 + 4000 + 2000 + 1000,
    );
    expect(hospitalSpeedPm({ level: 99, doctorStat: 9999, doctorSkillGrade: 10 }, C)).toBe(30_000);
  });

  it("치료하면 남은 시간과 이후 단계가 배율만큼 빨라진다. 비용은 남은 날 × 하루 값 × 레벨 몫", () => {
    const red = injure(NO_INJURY, INJURY_RED, 0, C);
    const quote = treatmentQuote(red, DAY, { level: 2, doctorStat: 0, doctorSkillGrade: 0 }, C);
    expect(quote?.speedPm).toBe(6000);
    expect(quote?.naturalGreenAtMs).toBe(6 * DAY);
    expect(quote?.greenAtMs).toBe(DAY + (5 * DAY) / 6);
    expect(quote?.cost).toBe((200n * 5n * 1500n) / 1000n);
    const treated = treatInjury(red, DAY, 6000, C);
    expect(injuryNow(treated, DAY + (2 * DAY) / 6, C).stage).toBe(INJURY_YELLOW);
    expect(injuryGreenAtMs(treated, DAY, C)).toBe(quote?.greenAtMs);
    // 같은·더 느린 배율로는 다시 치료하지 않는다
    expect(treatmentQuote(treated, DAY, { level: 2, doctorStat: 0, doctorSkillGrade: 0 }, C)).toBeUndefined();
    expect(treatmentQuote(NO_INJURY, 0, { level: 1, doctorStat: 0, doctorSkillGrade: 0 }, C)).toBeUndefined();
    expect(treatmentCost(HOUR, 1, C)).toBe(9n);
  });
});
