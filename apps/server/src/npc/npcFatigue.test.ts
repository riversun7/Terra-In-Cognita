// NPC 상태 기반 피로 저장소(npcFatigue.ts) 시험 — docs/adr/2026-11-27-npc-stateful-fatigue.md.
// 검증 항목:
// 1. 일할 때(aiState === "work" && activeWork)만 피로가 누적되고, 쉬는 중("rest")에는 피로가 단조 감소한다(절대 상승하지 않는다).
// 2. 숙소(1500‰) > 집(1000‰) > 노숙(100‰) 순으로 쉼터 회복 배율이 정확히 반영된다.
// 3. 정지·재료부족 등 비가동 시설(activeWork = false) 일꾼은 피로가 오르지 않고 기존 피로가 회복된다.
// 4. 규율 성향(0..1000)에 따라 restAt(70..110)이 달라지며, 높은 규율 NPC는 N23 피로 스탯 불이익 구간(90/100/110 → -10/-20/-30%)에 실제 도달한다.
// 5. 5상태 FSM(bots.ts resolveBotAiState/botActivity)과 연결 시 조기 휴식 전환 후에도 피로가 역행 상승하지 않고 0까지 회복 후 재출근한다.
import { TEST_JOB_RULES, TEST_SOCIETY_COEFFICIENTS, fatigueStatCutPm } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type BotHome, botActivity, resolveBotAiState } from "../world/bots.ts";
import { type NpcFatigueWorkerContext, createNpcFatigueStore } from "./npcFatigue.ts";

const MIN = TEST_JOB_RULES.cycleMs; // 60_000ms = 피로 +1
const REST_STEP = TEST_JOB_RULES.restStepMs; // 120_000ms = 집 기준 피로 -1
const BASE_TRAITS = {
  belligerence: 500,
  greed: 500,
  boldness: 500,
  communalism: 500,
  autonomy: 500,
  openness: 500,
  discipline: 500,
};

function workerHome(discipline: number): BotHome {
  return {
    x: 100,
    y: 100,
    work: { x: 60, y: 60, radius: 5 },
    shift: { lonDeg: 0, startPm: 250, endPm: 750, cycle: { workMs: 120 * MIN, periodMs: 240 * MIN } },
    aiEnabled: true,
    traits: { ...BASE_TRAITS, discipline },
  };
}

describe("NPC 상태 기반 피로 저장소(NpcFatigueStore)", () => {
  it("일할 때만 피로가 오르고, restAt 도달 후 휴식 구간에서는 단조 감소해 0에서 복귀한다", () => {
    const workers = new Map<number, NpcFatigueWorkerContext>([
      [1, { activeWork: true, place: { kind: "home" }, discipline: 500, home: workerHome(500) }],
    ]);
    const store = createNpcFatigueStore({
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      workerIds: () => workers.keys(),
      workerOf: (id) => workers.get(id),
    });

    let now = 1_000_000;
    store.tick(now);
    expect(store.fatigueOf(1, now)).toBe(0);
    expect(store.snapshot(1, now)).toMatchObject({ aiState: "work", restAt: 90, resumeAt: 0 });

    // 45분 일함 → 피로 45
    now += 45 * MIN;
    store.tick(now);
    expect(store.fatigueOf(1, now)).toBe(45);
    expect(store.snapshot(1, now)?.aiState).toBe("work");

    // 45분 더 일함 → 피로 90(restAt 도달) → 즉시 rest로 전환
    now += 45 * MIN;
    store.tick(now);
    expect(store.fatigueOf(1, now)).toBe(90);
    expect(store.snapshot(1, now)?.aiState).toBe("rest");

    // 쉬는 동안 1분 단위로 180분 확인: 피로가 절대 오르지 않고 단조 감소해 0에 도달
    let prev = 90;
    for (let m = 1; m <= 180; m++) {
      now += MIN;
      store.tick(now);
      const cur = store.fatigueOf(1, now) ?? -1;
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
      if (m < 180) {
        expect(store.snapshot(1, now)?.aiState).toBe("rest");
      }
    }
    expect(store.fatigueOf(1, now)).toBe(0);
    expect(store.snapshot(1, now)?.aiState).toBe("work");
  });

  it("쉼터 회복 배율(숙소 > 집 > 노숙)이 휴식 시 정확히 다르게 적용된다", () => {
    const workers = new Map<number, NpcFatigueWorkerContext>([
      [1, { activeWork: true, place: { kind: "lodging", level: 1 }, discipline: 500, home: workerHome(500) }],
      [2, { activeWork: true, place: { kind: "home" }, discipline: 500, home: workerHome(500) }],
      [3, { activeWork: true, place: { kind: "homeless" }, discipline: 500, home: workerHome(500) }],
    ]);
    const store = createNpcFatigueStore({
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      workerIds: () => workers.keys(),
      workerOf: (id) => workers.get(id),
    });

    let now = 1_000_000;
    store.tick(now);
    // 모두 90분 일해 restAt(90) 도달 → rest 전환
    now += 90 * MIN;
    store.tick(now);
    expect(store.fatigueOf(1, now)).toBe(90);
    expect(store.fatigueOf(2, now)).toBe(90);
    expect(store.fatigueOf(3, now)).toBe(90);

    // 20분(10 REST_STEP) 휴식:
    // 숙소 Lv1(1500‰) = -15 → 75, 집(1000‰) = -10 → 80, 노숙(100‰) = -1 → 89
    now += 10 * REST_STEP;
    store.tick(now);
    expect(store.fatigueOf(1, now)).toBe(75);
    expect(store.fatigueOf(2, now)).toBe(80);
    expect(store.fatigueOf(3, now)).toBe(89);
  });

  it("비가동 시설(정지·재료 부족·빈 물류센터) 일꾼은 피로가 오르지 않고 기존 피로는 회복된다", () => {
    let active = false;
    const workers = new Map<number, NpcFatigueWorkerContext>();
    const makeCtx = (): NpcFatigueWorkerContext => ({
      activeWork: active,
      place: { kind: "home" },
      discipline: 500,
      home: workerHome(500),
    });
    const store = createNpcFatigueStore({
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      workerIds: () => [10],
      workerOf: (id) => (id === 10 ? makeCtx() : undefined),
    });

    let now = 1_000_000;
    store.tick(now);
    // 비가동 상태로 60분 경과 → 피로 0 유지
    now += 60 * MIN;
    store.tick(now);
    expect(store.fatigueOf(10, now)).toBe(0);
    expect(store.isWorking(10, now)).toBe(false);

    // 가동 시작 → 40분 일하면 피로 40
    active = true;
    store.tick(now);
    now += 40 * MIN;
    store.tick(now);
    expect(store.fatigueOf(10, now)).toBe(40);
    expect(store.isWorking(10, now)).toBe(true);

    // 시설 정지(재료 부족 등) → 20분 경과 시 오르지 않고 집 배율로 -10 회복 → 30
    active = false;
    now += 10 * REST_STEP;
    store.tick(now);
    expect(store.fatigueOf(10, now)).toBe(30);
    expect(store.isWorking(10, now)).toBe(false);
    expect(workers.size).toBe(0);
  });

  it("성향별 restAt(70~110)이 적용되고 높은 규율 NPC는 N23 피로 스탯 불이익(90/100/110 → -10/-20/-30%)에 도달한다", () => {
    const workers = new Map<number, NpcFatigueWorkerContext>([
      [1, { activeWork: true, place: { kind: "home" }, discipline: 0, home: workerHome(0) }],
      [2, { activeWork: true, place: { kind: "home" }, discipline: 500, home: workerHome(500) }],
      [3, { activeWork: true, place: { kind: "home" }, discipline: 1000, home: workerHome(1000) }],
    ]);
    const store = createNpcFatigueStore({
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      workerIds: () => workers.keys(),
      workerOf: (id) => workers.get(id),
    });

    let now = 1_000_000;
    store.tick(now);
    expect(store.snapshot(1, now)?.restAt).toBe(70);
    expect(store.snapshot(2, now)?.restAt).toBe(90);
    expect(store.snapshot(3, now)?.restAt).toBe(110);

    // 70분: 규율 0은 restAt(70)에 도달해 휴식, 규율 500·1000은 계속 일함
    now += 70 * MIN;
    store.tick(now);
    expect(store.fatigueOf(1, now)).toBe(70);
    expect(store.snapshot(1, now)?.aiState).toBe("rest");
    expect(store.fatigueOf(3, now)).toBe(70);
    expect(store.snapshot(3, now)?.aiState).toBe("work");

    // 25분 더(누적 95분): 규율 1000은 피로 95로 N23 1단계 불이익(-10% = 100‰)을 받으며 계속 일함
    now += 25 * MIN;
    store.tick(now);
    const f95 = store.fatigueOf(3, now) ?? 0;
    expect(f95).toBe(95);
    expect(store.snapshot(3, now)?.aiState).toBe("work");
    expect(fatigueStatCutPm(f95, TEST_SOCIETY_COEFFICIENTS)).toBe(100);

    // 10분 더(누적 105분): 피로 105 → N23 2단계(-20% = 200‰)
    now += 10 * MIN;
    store.tick(now);
    const f105 = store.fatigueOf(3, now) ?? 0;
    expect(f105).toBe(105);
    expect(store.snapshot(3, now)?.aiState).toBe("work");
    expect(fatigueStatCutPm(f105, TEST_SOCIETY_COEFFICIENTS)).toBe(200);

    // 5분 더(누적 110분): 피로 110 → N23 3단계(-30% = 300‰) 도달 후 restAt(110)으로 휴식 전환
    now += 5 * MIN;
    store.tick(now);
    const f110 = store.fatigueOf(3, now) ?? 0;
    expect(f110).toBe(110);
    expect(fatigueStatCutPm(f110, TEST_SOCIETY_COEFFICIENTS)).toBe(300);
    expect(store.snapshot(3, now)?.aiState).toBe("rest");
  });

  it("조기 휴식(피로 64에서 rest 전환) 시에도 피로가 72로 오르지 않고 즉시 단조 감소한다", () => {
    const home = workerHome(0);
    const workers = new Map<number, NpcFatigueWorkerContext>([
      [7, { activeWork: true, place: { kind: "home" }, discipline: 0, home }],
    ]);
    const store = createNpcFatigueStore({
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      workerIds: () => workers.keys(),
      workerOf: (id) => workers.get(id),
    });

    let now = 1_000_000;
    store.tick(now);
    now += 64 * MIN;
    store.tick(now);
    expect(store.fatigueOf(7, now)).toBe(64);
    // FSM 또는 외부 전이로 피로 64에서 rest로 조기 전환
    store.commitState?.(7, "rest", now);
    expect(botActivity(home, 7, now, store).state).toBe("rest");
    expect(resolveBotAiState(home, 7, now, store)?.state).toBe("rest");

    // 10분 뒤: 과거 어림값처럼 72로 상승하는 모순 없이 59로 감소해야 한다
    now += 10 * MIN;
    expect(store.fatigueOf(7, now)).toBe(59);
    expect(botActivity(home, 7, now, store).state).toBe("rest");
  });

  it("짧은 간격(50ms) 조회를 반복해도 반올림 누락 없이 1분 작업 시 피로 1점이 정확히 쌓인다", () => {
    const workers = new Map<number, NpcFatigueWorkerContext>([
      [1, { activeWork: true, place: { kind: "home" }, discipline: 500, home: workerHome(500) }],
    ]);
    const store = createNpcFatigueStore({
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      workerIds: () => workers.keys(),
      workerOf: (id) => workers.get(id),
    });

    let now = 1_000_000;
    store.tick(now);
    for (let i = 0; i < 1200; i++) {
      now += 50; // 1200 × 50ms = 60_000ms (1분)
      store.fatigueOf(1, now);
    }
    expect(store.fatigueOf(1, now)).toBe(1);
  });
});
