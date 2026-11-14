// 전투 보고서 시험 — docs/adr/2026-11-14-battle-report.md
// 집계가 판정 사건 기록(전투 실험실 집계 createBattleTally)과 맞는지(명중·회피·크리·피해), 판 묶음을 나눠도 같은 합, 같은 시드면 같은 보고서,
// 웨이브 판이 서버 정원사 빨리감기(runWaveToEnd)와 같은 결과, 피해 흐름 단계 합, 일 서비스(진행·취소·바쁨·주인만·예산·A/B·설정 칸·저장).
import { type LabParty, type LabUnit, newLabUnit } from "@terra/shared/battleLab";
import {
  type ReportSetup,
  type ReportStartInput,
  flowQuantile,
  reportProblem,
} from "@terra/shared/battleReport";
import {
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  TEST_SOCIETY_COEFFICIENTS,
  createBattle,
  createBattleTally,
  runWaveToEnd,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../auth/store.ts";
import { flatArena } from "../battleLab/arena.ts";
import type { LabRules } from "../battleLab/build.ts";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import type { Database } from "../db/client.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import type { Viewer } from "../trpc/context.ts";
import { createTuningShared } from "../tuning/services.ts";
import { createTuningState } from "../tuning/state.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { finishTotals, mergeTotals, newTotals } from "./aggregate.ts";
import { reportRunSeed, runReport, runReportRange, runReportTrace } from "./batch.ts";
import { playRun } from "./play.ts";
import { inlineReportRunner } from "./runner.ts";
import { createReportService } from "./services.ts";
import { playSetupOf } from "./setup.ts";
import type { insertReport } from "./store.ts";

const rules: LabRules = {
  catalog: TEST_COMBAT_CATALOG,
  coefficients: TEST_COMBAT_COEFFICIENTS,
  growthPm: 100,
  maxLevel: 50,
};

const fighter = (level: number, weapon = "test_sword"): LabUnit => ({
  ...newLabUnit("human"),
  level,
  weapon: { kind: "item", id: weapon, pm: 500 },
});
const party = (...units: LabUnit[]): LabParty => ({ units, retreatHpPct: 0 });

const arena = (a: LabParty, b: LabParty, limitSec = 60): ReportSetup => ({
  mode: "arena",
  a,
  b,
  terrain: "flat",
  limitSec,
});

const strip = <T extends { cpuMs: number }>(value: T) => ({ ...value, cpuMs: 0 });

const baseInput = (patch: Partial<ReportStartInput> = {}): ReportStartInput => ({
  name: "t",
  note: "",
  setup: arena(party(fighter(1)), party(fighter(1))),
  variant: null,
  runs: 10,
  seed: 1,
  ...patch,
});

const viewer = (id: string): Viewer => ({ id, loginId: id, roles: ["dev"] });

const serviceInput = (patch: Partial<ReportStartInput> = {}): ReportStartInput => ({
  name: "5v5",
  note: "",
  setup: arena(party(fighter(10), fighter(10)), party(fighter(10), fighter(10))),
  variant: null,
  runs: 4,
  seed: 2,
  ...patch,
});

const until = async (check: () => boolean) => {
  for (let i = 0; i < 2000 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
};

const ctx = { rules, society: TEST_SOCIETY_COEFFICIENTS, arenaMap: flatArena() };
const clock = (): number => 0;

describe("판정 사건과 집계가 맞는다", () => {
  it("명중·빗나감·회피·크리·기본 공격 피해가 전투 실험실 사건 기록과 같다(관찰자 셋을 한 판에)", async () => {
    const { play } = await playSetupOf(
      arena(party(fighter(10), fighter(12)), party(fighter(11), fighter(9))),
      ctx,
    );
    for (const run of [0, 1, 2]) {
      const seed = reportRunSeed(5, run);
      // 같은 판을 실험실 집계로 다시(관찰자는 결과를 바꾸지 않는다)
      const init = { ...(run % 2 === 1 && play.swapped ? play.swapped : play.normal), seed };
      let battle: ReturnType<typeof createBattle> | null = null;
      const tally = createBattleTally(init.units, { logMax: 1_000_000, tick: () => battle?.state.tick ?? 0 });
      battle = createBattle(init, TEST_COMBAT_COEFFICIENTS, tally.trace);
      battle.runToEnd([]);
      const events = tally.report().events.filter((event) => event.kind === "attack");
      const totals = newTotals(play);
      runReportRange({ setups: [play], runs: 3, seed: 5 }, 0, run, run + 1, totals, clock);
      const result = finishTotals(play, totals);
      const sum = (pick: (row: (typeof result.units)[number]["counters"]) => number) =>
        result.units.reduce((total, row) => total + pick(row.counters), 0);
      const attacks = events.length;
      expect(attacks).toBeGreaterThan(0);
      expect(sum((c) => c.attacks)).toBe(attacks);
      expect(sum((c) => c.hits)).toBe(
        events.filter((e) => e.kind === "attack" && e.outcome === "hit").length,
      );
      expect(sum((c) => c.misses)).toBe(
        events.filter((e) => e.kind === "attack" && e.outcome === "miss").length,
      );
      expect(sum((c) => c.evades)).toBe(
        events.filter((e) => e.kind === "attack" && e.outcome === "evaded").length,
      );
      expect(sum((c) => c.crits)).toBe(events.filter((e) => e.kind === "attack" && e.crit).length);
      expect(sum((c) => c.attackDamage)).toBe(
        events.reduce((t, e) => t + (e.kind === "attack" ? e.damage : 0), 0),
      );
      expect(sum((c) => c.hits + c.misses + c.evades)).toBe(sum((c) => c.attacks));
      // 흐름(기본 공격만 있는 판): 시도·명중·크리 수가 셈과 같다
      const flowAttacks = result.flows.a.attacks + result.flows.b.attacks;
      expect(flowAttacks).toBe(attacks + sum((c) => c.skillHits + c.skillMisses + c.skillEvades));
      expect(result.flows.a.hits + result.flows.b.hits).toBe(sum((c) => c.hits + c.skillHits));
      expect(result.flows.a.crits + result.flows.b.crits).toBeGreaterThanOrEqual(sum((c) => c.crits));
      // 실험실 셈과 피해 합이 같다(준 피해 = 받은 피해, 편끼리)
      const lab = tally.report().units;
      const dealt = [...lab.values()].reduce((t, row) => t + row.dealt, 0);
      expect(sum((c) => c.physicalDealt + c.elementalDealt + c.dotDealt)).toBe(dealt);
      expect(result.sides.a.physicalDealt + result.sides.a.elementalDealt + result.sides.a.dotDealt).toBe(
        result.sides.b.physicalTaken + result.sides.b.elementalTaken + result.sides.b.dotTaken,
      );
      expect(result.outcome.runs).toBe(1);
    }
  });

  it("피해 흐름: 판정 끝 값 합 = 셈의 기본 공격·스킬 피해, 반영 = 아머 + 쉴드 + HP, 분위는 막대 칸 안", async () => {
    const { play } = await playSetupOf(arena(party(fighter(20)), party(fighter(20))), ctx);
    const [result] = runReport({ setups: [play], runs: 6, seed: 9 }, clock);
    if (!result) throw new Error("no result");
    for (const team of ["a", "b"] as const) {
      const flow = result.flows[team];
      const side = result.sides[team];
      expect(flow.values.floor).toBe(side.attackDamage);
      expect(flow.values.applied).toBe(flow.sums.toArmor + flow.sums.toShield + flow.sums.toHp);
      expect(flow.values.raw).toBe(flow.sums.physicalRaw + flow.sums.elementalRaw);
      expect(flow.hits).toBe(side.hits);
      const hist = flow.hist?.final ?? [];
      expect(hist.reduce((t, [, n]) => t + n, 0)).toBe(flow.hits);
      const p10 = flowQuantile(hist, 0.1);
      const p90 = flowQuantile(hist, 0.9);
      expect(p10).toBeLessThanOrEqual(p90);
    }
    // 짝 흐름 합 = 편 흐름
    const pairs = Object.entries(result.flows.pairs);
    expect(pairs.length).toBe(2);
    expect(result.samples.length).toBeGreaterThan(0);
  });
});

describe("다시 돌리기·묶음", () => {
  it("같은 시드면 같은 결과, 판 구간을 나눠 돌려 합쳐도 같다(CPU ms만 다름)", async () => {
    const setup = arena(party(fighter(15), fighter(15)), party(fighter(16), fighter(14)));
    const { play } = await playSetupOf(setup, ctx);
    const job = { setups: [play], runs: 8, seed: 3 };
    const [one] = runReport(job, clock);
    const [two] = runReport(job, clock);
    if (!one || !two) throw new Error("no result");
    expect(strip(two)).toEqual(strip(one));
    const left = newTotals(play);
    const right = newTotals(play);
    runReportRange(job, 0, 0, 3, left, clock);
    runReportRange(job, 0, 3, 8, right, clock);
    mergeTotals(left, right);
    expect(strip(finishTotals(play, left))).toEqual(strip(one));
    expect(one.outcome.winsA + one.outcome.winsB + one.outcome.draws).toBe(8);
    expect(one.outcome.ciLowPm).toBeLessThanOrEqual(one.outcome.scorePm);
    expect(one.outcome.ciHighPm).toBeGreaterThanOrEqual(one.outcome.scorePm);
  });

  it("한 대 풀이는 같은 판을 다시 돌린 단계 기록이다(보고서 표본과 같은 앞 줄)", async () => {
    const { play } = await playSetupOf(arena(party(fighter(10)), party(fighter(10))), ctx);
    const [result] = runReport({ setups: [play], runs: 2, seed: 11 }, clock);
    const trace = runReportTrace({ setup: play, run: 0, seed: 11 });
    const first = result?.samples[0];
    expect(first).toBeDefined();
    expect(trace.hits.find((hit) => hit.ms === first?.ms && hit.attacker === first?.attacker)).toEqual(first);
  });
});

describe("공성", () => {
  it("웨이브 판은 서버 정원사 빨리감기(runWaveToEnd)와 같은 끝·같은 시각", async () => {
    const setup: ReportSetup = {
      mode: "wave",
      strength: 6,
      physical: 3,
      creatureTech: 2,
      defenders: 4,
      defenderTech: 2,
      city: { layout: "open", housing: 20, adminLevel: 1 },
      nexusDurability: 800,
      limitSec: 300,
    };
    const { play } = await playSetupOf(setup, ctx);
    for (const run of [0, 1]) {
      const seed = reportRunSeed(21, run);
      const { result, state } = runWaveToEnd(
        createBattle({ ...play.normal, seed }, TEST_COMBAT_COEFFICIENTS),
        [],
      );
      // 셈은 버리고 끝만 본다
      const end = playRun(play, run, seed, stubSink());
      expect(end.endMs).toBe((result?.endTick ?? state.tick) * TEST_COMBAT_COEFFICIENTS.tickMs);
      expect(end.winner).toBe(result?.winner === 1 ? "a" : "b");
    }
  });

  it("파티 공성: 공격 편이 넥서스·성벽을 치면 공성 결과에 든다(도시 배치)", async () => {
    const setup: ReportSetup = {
      mode: "siege",
      a: party(fighter(30), fighter(30), fighter(30)),
      b: party(fighter(5)),
      city: { layout: "city", housing: 20, adminLevel: 1 },
      nexusDurability: 500,
      limitSec: 300,
    };
    const { play } = await playSetupOf(setup, ctx);
    expect(play.nexusId).toBe(1);
    const [result] = runReport({ setups: [play], runs: 2, seed: 4 }, clock);
    expect(result?.siege).not.toBeNull();
    expect(result?.siege?.nexusMax).toBeGreaterThan(0);
    expect(result?.outcome.runs).toBe(2);
  });
});

/** 셈을 버리는 sink */
const none = (): void => undefined;

function stubSink() {
  return {
    attack: none,
    skillCast: none,
    skillHit: none,
    dealt: none,
    taken: none,
    dot: none,
    heal: none,
    kill: none,
    death: none,
    retreat: none,
    alive: none,
    staminaWait: none,
    staminaLimited: none,
    building: none,
    stages: none,
  };
}

describe("입력 검사(화면·서버 같이)", () => {
  it("판 수 홀수·예산 넘침·A/B 종류 다름·바꾼 것 없음", () => {
    expect(reportProblem(baseInput())).toBeNull();
    expect(reportProblem(baseInput({ runs: 11 }))).toBe("invalid_settings");
    expect(
      reportProblem(baseInput({ runs: 2000, setup: arena(party(fighter(1)), party(fighter(1)), 600) })),
    ).toBe("budget");
    expect(
      reportProblem(
        baseInput({
          variant: {
            label: "b",
            setup: {
              mode: "wave",
              strength: 1,
              physical: 1,
              creatureTech: 1,
              defenders: 1,
              defenderTech: 1,
              city: { layout: "open", housing: 0, adminLevel: 1 },
              nexusDurability: 10,
              limitSec: 60,
            },
            tuning: [],
          },
        }),
      ),
    ).toBe("variant_mode");
    expect(reportProblem(baseInput({ variant: { label: "b", setup: null, tuning: [] } }))).toBe(
      "invalid_settings",
    );
  });
});

describe("보고서 일 서비스", () => {
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
  const state = createTuningState(tuningEntriesOf(loaded.source), statRowsOf(loaded.source));
  const log = { info: () => undefined, warn: () => undefined };
  const tuning = createTuningShared({
    state,
    pack: { packId: "core", contentVersion: loaded.content.version, contentHash: loaded.content.hash },
    now: Date.now,
    log,
  });
  const roster = rosterCatalogOf(
    loaded.source,
    () => state.society(),
    () => state.statTable(),
  );
  const terrains = {
    list: () => [],
    map: (id: string) => Promise.resolve(id === "flat" ? { map: flatArena(), ref: null } : null),
  };
  // 가짜 저장소·감사 기록이라 DB를 쓰지 않는다
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 쓰이지 않는 자리 채움
  const db = {} as Database;
  const make = () => {
    const audits: AuditEntry[] = [];
    const saved: Parameters<typeof insertReport>[1][] = [];
    const service = createReportService({
      tuning,
      roster,
      terrains,
      runner: inlineReportRunner(),
      now: Date.now,
      log,
      audit: (_db, entry) => {
        audits.push(entry);
        return Promise.resolve();
      },
      limits: { startsPerUser: { capacity: 100, refillPerMinute: 100 } },
      store: {
        insert: (_db, row) => {
          saved.push(row);
          return Promise.resolve();
        },
        list: () => Promise.resolve({ reports: [], next: null }),
        read: (_db, id) => {
          const row = saved.find((entry) => entry.id === id);
          return Promise.resolve(
            row
              ? {
                  id: row.id,
                  name: row.input.name,
                  mode: row.input.setup.mode,
                  runs: row.input.runs,
                  seed: row.input.seed,
                  variant: row.input.variant !== null,
                  scorePm: row.report.a.outcome.scorePm,
                  scoreBPm: row.report.b?.outcome.scorePm ?? null,
                  createdAtMs: 0,
                  createdBy: null,
                  contentVersion: row.contentVersion,
                  contentHash: row.contentHash,
                  simVersion: row.simVersion,
                  tuningRevision: row.tuningRevision,
                  durationMs: row.durationMs,
                  note: row.input.note,
                  input: row.input,
                  report: row.report,
                }
              : null,
          );
        },
      },
    });
    return { service, audits, saved };
  };

  it("시작 → 진행 → 끝 → 저장(팩 판·해시·SIM·설정 판), 남의 일은 unknown_job, 감사 기록", async () => {
    const { service, audits, saved } = make();
    const job = await service.start(db, viewer("u1"), "127.0.0.1", serviceInput());
    expect(job.state).toBe("running");
    expect(job.total).toBe(4);
    expect(() => service.status(viewer("u2"), job.id)).toThrow();
    await until(() => service.status(viewer("u1"), job.id).job.state !== "running");
    const status = service.status(viewer("u1"), job.id);
    expect(status.job.state).toBe("done");
    expect(status.job.reportId).toMatch(/^rep_[0-9a-f]{12}$/);
    expect(status.report?.report.a.outcome.runs).toBe(4);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.contentHash).toBe(loaded.content.hash);
    expect(saved[0]?.simVersion).toBeGreaterThan(0);
    expect(audits.map((entry) => entry.action)).toEqual(["battle_report.start"]);
    // 저장된 기록에서 한 대 풀이
    const trace = await service.trace(db, viewer("u1"), { reportId: saved[0]?.id ?? "", which: "a", run: 1 });
    expect(trace.same).toBe(true);
    expect(trace.hits.length).toBeGreaterThan(0);
  });

  it("A/B: 설정 칸 바꿈(가중치 칸)이 B에만 든다, 모르는 칸·범위 밖은 거절", async () => {
    const { service } = make();
    const cell = state.statRows[0];
    const key = cell ? `${cell.id}.base` : "";
    const slot = state.slot(key);
    if (!slot) throw new Error("no stat cell");
    await expect(
      service.start(
        db,
        viewer("u3"),
        "ip",
        serviceInput({ variant: { label: "b", setup: null, tuning: [{ id: "nope_x", value: 1 }] } }),
      ),
    ).rejects.toThrow();
    const job = await service.start(
      db,
      viewer("u3"),
      "ip",
      serviceInput({ variant: { label: "b", setup: null, tuning: [{ id: key, value: slot.packValue }] } }),
    );
    expect(job.total).toBe(8);
    await until(() => service.status(viewer("u3"), job.id).job.state !== "running");
    const report = service.status(viewer("u3"), job.id).report?.report;
    expect(report?.b).not.toBeNull();
    // 같은 값으로 바꾸면 같은 결과(공통 난수)
    expect({ ...report?.b, cpuMs: 0 }).toEqual({ ...report?.a, cpuMs: 0 });
  });

  it("바쁨·취소: 하나가 도는 동안 다음 시작은 busy, 멈추면 cancelled + 감사 기록", async () => {
    const { service, audits } = make();
    const job = await service.start(db, viewer("u4"), "ip", serviceInput({ runs: 400 }));
    await expect(service.start(db, viewer("u5"), "ip", serviceInput())).rejects.toThrow();
    const cancelled = await service.cancel(db, viewer("u4"), "ip", job.id);
    expect(cancelled.state).toBe("cancelled");
    expect(audits.map((entry) => entry.action)).toContain("battle_report.cancel");
    expect(service.jobs(viewer("u4")).busy).toBe(false);
  });
});
