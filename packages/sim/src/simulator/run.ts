// 시뮬레이터 실행 — docs/adr/2026-10-31-rules-simulator.md
// 시나리오 + 시드 + 날 수 → JSON 줄(머리·시작·사건·하루·요약)과 요약. DB·실제 시각·타이머를 쓰지 않는다.
// 하루마다: 그날 끝 전까지 예약을 비운다 → 모든 세력을 그 시각까지 정산 → 하루 몫을 기록 → 불변 조건 검사(checkEveryDays).
// 같은 (시나리오, 시드, 날 수, 콘텐츠 판)이면 줄과 요약이 바이트까지 같다(run.test.ts). 걸린 시간은 요약에 넣지 않는다.
import { createFnv1a } from "../math/hash.ts";
import { SIM_VERSION } from "../version.ts";
import { createSimLoop } from "./loop.ts";
import { DAY_MS, type FactionDay, type MetricsSummary, createMetricsRecorder } from "./metrics.ts";
import type { Scenario } from "./scenario.ts";
import type { EconomyCatalog } from "./catalog.ts";
import { type EconomyRun, type EconomySummary, attachEconomy, systemRule } from "./economyRun.ts";
import {
  EVENT_ARRIVE,
  EVENT_DECIDE,
  type SimEvent,
  type StubContext,
  decide,
  scheduleDecide,
  scheduleTrip,
} from "./stubRules.ts";
import {
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  checkWorld,
  createWorld,
  settleFaction,
  totalOwnerAsset,
} from "./world.ts";

/** 출력 형식 판(줄·요약의 모양이 바뀌면 올린다. 관전판·관리자 화면이 읽는다). 2: econ 줄·요약 economy 칸(R2) */
export const SIM_OUTPUT_FORMAT = 2;
/** 가상 시계 시작 시각(ms). 정산 경계(정시)가 0에서 센 시각이라 0으로 둔다 */
export const SIM_START_MS = 0;
/** 요약에 남기는 불변 조건 위반 문장 수 */
const FIRST_PROBLEMS = 10;

export interface RunOptions {
  readonly scenario: Scenario;
  /** 세계 시드(부호 없는 32비트로 읽는다) */
  readonly seed: number;
  readonly days: number;
  /** 콘텐츠 팩 판·해시(보고서에 적는다, 판정 판·콘텐츠 판·시드 원칙) */
  readonly content?: { version: string; hash: string } | undefined;
  /** JSON 줄을 한 줄씩 받는다 */
  readonly sink?: ((line: string) => void) | undefined;
  /** 불변 조건 검사 간격(날, 기본 1). 끝에서도 한 번 한다 */
  readonly checkEveryDays?: number | undefined;
  /** 경제 목록(시나리오에 economy 칸이 있으면 꼭 준다. 실행 도구가 콘텐츠 팩에서 만든다) */
  readonly catalog?: EconomyCatalog | undefined;
  /** 하루가 끝날 때마다(진행 표시용, 판정에 영향 없음) */
  readonly onDay?: ((day: number, processed: number) => void) | undefined;
}

export interface RunSummary {
  readonly format: number;
  readonly simVersion: number;
  readonly scenario: string;
  readonly seed: number;
  readonly days: number;
  readonly content: { version: string; hash: string } | null;
  readonly metrics: MetricsSummary;
  readonly world: {
    factions: number;
    cities: number;
    units: number;
    credit: string;
    ore: string;
    upkeepArrears: number;
  };
  readonly events: { processed: number; byKind: Record<string, number> };
  /** 경제(시나리오에 economy 칸이 없으면 null) */
  readonly economy: EconomySummary | null;
  readonly ledger: { transactions: number; accounts: number };
  readonly invariants: { checks: number; violations: number; first: string[] };
  /** 요약 앞까지 쓴 줄 수와 그 줄들의 FNV-1a 해시(지표 해시) */
  readonly lines: number;
  readonly linesHash: string;
}

export function runSimulation(options: RunOptions): RunSummary {
  const { scenario, days } = options;
  if (!Number.isSafeInteger(days) || days < 1)
    throw new RangeError(`days must be a positive integer: ${days}`);
  const seed = options.seed >>> 0;
  const hash = createFnv1a();
  let lineCount = 0;
  const emit = (line: string): void => {
    for (let i = 0; i < line.length; i++) hash.update32(line.charCodeAt(i));
    hash.updateByte(10);
    lineCount += 1;
    options.sink?.(line);
  };
  const content = options.content ?? null;
  emit(
    JSON.stringify({
      t: "header",
      format: SIM_OUTPUT_FORMAT,
      simVersion: SIM_VERSION,
      scenario: scenario.id,
      seed,
      days,
      startMs: SIM_START_MS,
      content,
    }),
  );

  if (scenario.economy && !options.catalog) throw new Error("scenario with economy needs a catalog");
  const world = createWorld(scenario, seed, SIM_START_MS, { systemRule });
  const recorder = createMetricsRecorder({ startMs: SIM_START_MS, sink: emit });
  const byKind = new Map<string, number>();
  const ctxRef: { ctx?: StubContext } = {};
  const loop = createSimLoop<SimEvent>({
    startMs: SIM_START_MS,
    handle: (event, sim) => {
      const ctx = ctxRef.ctx;
      if (!ctx) return;
      byKind.set(event.payload.kind, (byKind.get(event.payload.kind) ?? 0) + 1);
      if (econ?.handle(event, sim.nowMs)) return;
      if (event.payload.kind === EVENT_DECIDE) decide(ctx, event.payload.subject, sim.nowMs);
      else if (event.payload.kind === EVENT_ARRIVE) scheduleTrip(ctx, event.payload.subject, sim.nowMs);
    },
  });
  // 경제: 사건 처리기가 쓰기 전에 붙인다(예약은 아직 돌지 않는다)
  const econ: EconomyRun | undefined =
    scenario.economy && options.catalog
      ? attachEconomy(world, scenario, options.catalog, loop, SIM_START_MS)
      : undefined;
  const ctx: StubContext = {
    world,
    loop,
    recorder,
    stub: scenario.stub,
    trips: scenario.trips,
    hooks: econ?.hooks,
  };
  ctxRef.ctx = ctx;

  recorder.start(
    [...world.factions.values()].map((faction) => ({
      id: faction.id,
      fixed: faction.fixed,
      tech: faction.tech,
    })),
  );
  for (const faction of world.factions.values()) scheduleDecide(ctx, faction, SIM_START_MS);
  if (scenario.trips) for (const unit of world.units.values()) scheduleTrip(ctx, unit.id, SIM_START_MS);

  const checkEvery = Math.max(1, options.checkEveryDays ?? 1);
  let checks = 0;
  let violations = 0;
  const first: string[] = [];
  const check = (nowMs: number): void => {
    checks += 1;
    const problems = [...checkWorld(world, nowMs, scenario.trips !== undefined), ...(econ?.check() ?? [])];
    violations += problems.length;
    for (const problem of problems) if (first.length < FIRST_PROBLEMS) first.push(`${nowMs}: ${problem}`);
  };

  for (let day = 1; day <= days; day++) {
    const endMs = SIM_START_MS + day * DAY_MS;
    loop.runUntil(endMs);
    econ?.endOfDay(endMs);
    const rows: FactionDay[] = [];
    for (const faction of world.factions.values()) {
      if (!faction.alive) continue;
      settleFaction(world, faction, endMs);
      rows.push({
        id: faction.id,
        cities: faction.cities.size,
        population: faction.units.size,
        tech: faction.tech,
        treasury: world.book.balanceOf(
          faction.id,
          econ ? econ.hooks.treasuryAsset(faction) : TEST_ASSET_CREDIT,
        ),
      });
    }
    recorder.day(day, rows);
    if (econ) recorder.econ(day, econ.dayLine());
    if (day % checkEvery === 0 || day === days) check(endMs);
    options.onDay?.(day, loop.processed);
  }

  const endMs = SIM_START_MS + days * DAY_MS;
  let living = 0;
  let arrears = 0;
  for (const faction of world.factions.values()) {
    if (!faction.alive) continue;
    living += 1;
    arrears += faction.upkeepArrears;
  }
  const kinds: Record<string, number> = {};
  for (const kind of [...byKind.keys()].toSorted()) kinds[kind] = byKind.get(kind) ?? 0;
  const summary: RunSummary = {
    format: SIM_OUTPUT_FORMAT,
    simVersion: SIM_VERSION,
    scenario: scenario.id,
    seed,
    days,
    content,
    metrics: recorder.summary(endMs),
    world: {
      factions: living,
      cities: world.cities.size,
      units: world.units.size,
      credit: totalOwnerAsset(world, TEST_ASSET_CREDIT).toString(),
      ore: totalOwnerAsset(world, TEST_ASSET_ORE).toString(),
      upkeepArrears: arrears,
    },
    events: { processed: loop.processed, byKind: kinds },
    economy: econ ? econ.summary() : null,
    ledger: { transactions: world.audit.transactions, accounts: [...world.book.accounts()].length },
    invariants: { checks, violations, first },
    lines: lineCount,
    linesHash: hash.digest(),
  };
  options.sink?.(JSON.stringify({ t: "summary", ...summary }));
  return summary;
}
