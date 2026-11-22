// 경비대(국력 등급 씨앗) 시뮬 시험 — 시나리오 guards 칸, 수비·원정 차례, 요약의 묶음별 수, 구인 규칙식의 다시 채우기(기획 답 920 나).
// docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)"·"바뀜 (2026-11-11, 916~925 답)". 값은 시험용 가짜다.
import { describe, expect, it } from "vitest";
import { TEST_ASSET_CREDIT } from "../settle/owner.ts";
import { JOB_NONE } from "../settle/settle.ts";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { systemRule } from "./economyRun.ts";
import { createSimLoop } from "./loop.ts";
import { createMetricsRecorder } from "./metrics.ts";
import { type NpcContext, type SimEvent, decide, emptyNpcCounts } from "./npcRun.ts";
import { runSimulation } from "./run.ts";
import { type Scenario, parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { type SimWorld, createWorld, defenseOrder, expeditionOrder } from "./world.ts";

const tiers = parseScenario({
  id: "test_tiers",
  factions: [
    { code: "big", count: 1, fixed: true, cities: 3, workers: 30, guards: 4, credit: "200000", tech: 3 },
    { code: "small", count: 2, fixed: true, cities: 1, workers: 8, guards: 2, credit: "20000", tech: 1 },
    { code: "plain", count: 1, fixed: true, cities: 2, workers: 6, credit: "20000", tech: 1 },
  ],
  npc: { decideEveryMs: 6 * 3_600_000 },
});

describe("경비대(시나리오 guards)", () => {
  it("도시마다 정해진 수의 경비대가 직무 없이 서고, 일꾼과 따로 센다(칸이 없으면 0)", () => {
    const world = createWorld(tiers, 1, 0);
    const guards = [...world.units.values()].filter((unit) => unit.guard === true);
    expect(guards).toHaveLength(3 * 4 + 2 * 1 * 2);
    expect(guards.every((unit) => unit.job.job === JOB_NONE)).toBe(true);
    const big = [...world.factions.values()].find((faction) => faction.code === "big");
    expect(big?.units.size).toBe(30 + 12);
    for (const cityId of big?.cities ?? [])
      expect(guards.filter((unit) => unit.city === cityId)).toHaveLength(4);
    const plain = [...world.factions.values()].find((faction) => faction.code === "plain");
    expect([...(plain?.units ?? [])].some((id) => world.units.get(id)?.guard === true)).toBe(false);
  });

  it("수비는 경비대 먼저, 원정은 경비대를 맨 뒤로(그 안은 유닛 ID 차례)", () => {
    const units = [{ id: 5, guard: true }, { id: 1 }, { id: 9, guard: true }, { id: 3 }];
    expect(units.toSorted(defenseOrder).map((unit) => unit.id)).toEqual([5, 9, 1, 3]);
    expect(units.toSorted(expeditionOrder).map((unit) => unit.id)).toEqual([1, 3, 5, 9]);
    // 경비대가 없으면 유닛 ID 차례 그대로(옛 결과)
    expect([{ id: 2 }, { id: 1 }].toSorted(defenseOrder).map((unit) => unit.id)).toEqual([1, 2]);
  });

  // 시간 한도: 속성 공격력 INT + ⌊WIS ÷ 2⌋(사용자 답 1257, 2026-11-13) 뒤로 이 시나리오의 웨이브 공성 전투가 길어져 한 번에 약 10초 걸린다
  // (공유 기계 기준, 두 번 돈다). 결과가 아니라 시간만 늘었다
  it("요약에 묶음마다 처음·끝 수가 실리고(묶음 합계), 불변 조건 위반이 없다", { timeout: 60_000 }, () => {
    const summary = runSimulation({ scenario: tiers, seed: 3, days: 10 });
    expect(summary.invariants.violations).toBe(0);
    expect(summary.groups.map((group) => [group.code, group.factions, group.start])).toEqual([
      ["big", 1, { cities: 3, units: 42, guards: 12, tech: 3 }],
      ["small", 2, { cities: 2, units: 20, guards: 4, tech: 1 }],
      ["plain", 1, { cities: 2, units: 6, guards: 0, tech: 1 }],
    ]);
    // 고정 세력은 사라지지 않는다(D-324)
    expect(summary.groups.map((group) => group.end.alive)).toEqual([1, 2, 1]);
    // 같은 시드면 같다
    expect(JSON.stringify(runSimulation({ scenario: tiers, seed: 3, days: 10 }))).toBe(
      JSON.stringify(summary),
    );
  });
});

const HOUR = 3_600_000;

/** 시뮬 run.ts와 같은 모양의 NPC 판단 맥락(경제·전투 없이) */
function npcContext(
  scenario: Scenario,
  c: SocietyCoefficients = TEST_SOCIETY_COEFFICIENTS,
): { world: SimWorld; ctx: NpcContext } {
  const world = createWorld(scenario, 5, 0, { systemRule });
  const recorder = createMetricsRecorder({ startMs: 0, sink: () => {} });
  const loop = createSimLoop<SimEvent>({ startMs: 0, handle: () => {} });
  const ctx: NpcContext = {
    world,
    loop,
    recorder,
    c,
    decideEveryMs: 6 * HOUR,
    settings: scenario.society,
    trips: undefined,
    counts: emptyNpcCounts(),
  };
  ctx.society = attachSociety(
    {
      world,
      settings: scenario.society,
      recorder,
      c,
      hooks: undefined,
      combat: undefined,
      scheduleFaction: () => {},
      scheduleUnit: () => {},
      cancel: () => {},
    },
    0,
  );
  return { world, ctx };
}

/** 그 도시의 경비대 ID(ID 차례) */
const guardsIn = (world: SimWorld, cityId: number): number[] =>
  [...world.units.values()]
    .filter((unit) => unit.city === cityId && unit.guard === true)
    .map((unit) => unit.id)
    .toSorted((a, b) => a - b);

/** 경비대 둘을 없앤다(전투에서 죽은 셈 — 세력·세계에서 뺀다) */
function killGuards(world: SimWorld, cityId: number, n: number): void {
  for (const id of guardsIn(world, cityId).slice(0, n)) {
    const unit = world.units.get(id);
    world.units.delete(id);
    if (unit) world.factions.get(unit.owner)?.units.delete(id);
  }
}

// 휴먼 목표가 이미 찬 세력(주거 = 일꾼 + 경비대): 구인 규칙식이 사는 카드는 경비대 몫뿐이다
const refill = (credit: string): Scenario =>
  parseScenario({
    id: "test_guard_refill",
    factions: [
      { code: "big", count: 1, fixed: true, cities: 1, workers: 10, guards: 4, credit, tech: 1, housing: 14 },
    ],
    npc: { decideEveryMs: 6 * HOUR },
  });

/** 국방 투자 경비대 늘리기를 끈 계수표 */
const NO_EXTRA: SocietyCoefficients = {
  ...TEST_SOCIETY_COEFFICIENTS,
  npc: { ...TEST_SOCIETY_COEFFICIENTS.npc, investGuardExtraPm: 0 },
};

describe("경비대 다시 채우기(기획 답 920 나 — 구인 규칙식, 시뮬·서버 같은 함수)", () => {
  it("죽은 경비대를 구인 카드로 등급 값까지 다시 채우고, 카드 값을 국고에서 소각한다. 등급 값을 넘지 않는다", () => {
    // 국고가 넉넉해야 다음 판단이 연구 시설을 고른다(SIM 72 — 연구 점수에서 비용 몫을 빼므로 국고가 얇으면 붐빈 세력이 마을을 세워 경비대가 떠난다)
    // 국방 투자로 더 들이기(fixes-1117e, 질문 2565 나)는 끄고 다시 채우기만 본다(아래 따로)
    const { world, ctx } = npcContext(refill("2000000"), NO_EXTRA);
    const faction = world.factions.get(1);
    if (!faction) throw new Error("faction");
    expect(faction.guardsPerCity).toBe(4);
    killGuards(world, 1, 2);
    expect(guardsIn(world, 1)).toHaveLength(2);
    const before = world.book.balanceOf(1, TEST_ASSET_CREDIT);
    decide(ctx, 1, HOUR);
    const guards = guardsIn(world, 1);
    expect(guards).toHaveLength(4);
    expect(ctx.counts.guardRefills).toBe(2);
    // 새 경비대는 직무 없이(세계 차리기와 같은 모양) 구인 카드 스탯을 받는다
    const fresh = guards.slice(2).map((id) => world.units.get(id));
    expect(fresh.every((unit) => unit?.job.job === JOB_NONE && unit.recruit !== null)).toBe(true);
    const spent = before - world.book.balanceOf(1, TEST_ASSET_CREDIT);
    expect(spent).toBeGreaterThan(0n);
    // 다음 판단(같은 창): 이미 등급 값이라 더 사지 않는다
    decide(ctx, 1, 2 * HOUR);
    expect(guardsIn(world, 1)).toHaveLength(4);
    expect(ctx.counts.guardRefills).toBe(2);
  });

  it("국방 투자(fixes-1117e, 질문 2565 나 — D-591): 국고가 넉넉하면 등급 값 위로 더 들이되 상한(등급 값 × 500‰)·남는 주거를 넘지 않는다", () => {
    const { world, ctx } = npcContext(refill("2000000"));
    killGuards(world, 1, 2);
    decide(ctx, 1, HOUR);
    // 등급 값 4 + 덧붙는 2(4 × 500‰ = 2, 남는 주거 14 − 12 = 2)
    expect(guardsIn(world, 1)).toHaveLength(6);
    expect(ctx.counts.guardRefills).toBe(4);
    // 주거가 찼다 — 다음 판단에 더 들이지 않는다
    decide(ctx, 1, 2 * HOUR);
    expect(guardsIn(world, 1)).toHaveLength(6);
  });

  it("국고가 없으면 채우지 않는다(공짜로 세우지 않는다)", () => {
    const { world, ctx } = npcContext(refill("0"));
    killGuards(world, 1, 3);
    decide(ctx, 1, HOUR);
    expect(guardsIn(world, 1)).toHaveLength(1);
    expect(ctx.counts.guardRefills).toBe(0);
  });

  it("등급 값이 없는 세력(guards 칸 없음)은 경비대를 사지 않는다", () => {
    const { world, ctx } = npcContext(
      parseScenario({
        id: "test_guard_none",
        factions: [
          {
            code: "plain",
            count: 1,
            fixed: true,
            cities: 1,
            workers: 2,
            credit: "200000",
            tech: 1,
            housing: 10,
          },
        ],
        npc: { decideEveryMs: 6 * HOUR },
      }),
    );
    decide(ctx, 1, HOUR);
    expect([...world.units.values()].some((unit) => unit.guard === true)).toBe(false);
    expect(ctx.counts.guardRefills).toBe(0);
  });
});
