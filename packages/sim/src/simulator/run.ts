// 시뮬레이터 실행 — docs/adr/2026-10-31-rules-simulator.md
// 시나리오 + 시드 + 날 수 → JSON 줄(머리·시작·사건·하루·요약)과 요약. DB·실제 시각·타이머를 쓰지 않는다.
// 하루마다: 그날 끝 전까지 예약을 비운다 → 모든 세력을 그 시각까지 정산 → 하루 몫을 기록 → 불변 조건 검사(checkEveryDays).
// 같은 (시나리오, 시드, 날 수, 콘텐츠 판)이면 줄과 요약이 바이트까지 같다(run.test.ts). 걸린 시간은 요약에 넣지 않는다.
import { createFnv1a, mix32 } from "../math/hash.ts";
import { createBattle } from "../combat/battle.ts";
import { TEST_COMBAT_CATALOG } from "../combat/catalog.ts";
import { squareGrid } from "../gardener/pollution.ts";
import { type GardenerRun, type GardenerSummary, attachGardener } from "./gardenerRun.ts";
import { type MetricsRecorder } from "./metrics.ts";
import { GARDENER_SIDE_FACTION, runWaveToEnd, waveBattleInit } from "./waveBattle.ts";
import { SIM_VERSION } from "../version.ts";
import { createSimLoop } from "./loop.ts";
import { DAY_MS, type FactionDay, type MetricsSummary, createMetricsRecorder } from "./metrics.ts";
import type { Scenario } from "./scenario.ts";
import type { EconomyCatalog } from "./catalog.ts";
import { defaultGatherStat } from "./economy.ts";
import { type EconomyRun, type EconomySummary, attachEconomy, systemRule } from "./economyRun.ts";
import { type CombatSummary, attachCombat } from "./combatRun.ts";
import type { CombatCatalog } from "../combat/catalog.ts";
import type { CombatFormulaSet } from "../combat/formulas.ts";
import { combatCoefficientsFrom, societyCoefficientsFrom } from "../tuning.ts";
import { type SocietySummary, attachSociety } from "./society.ts";
import {
  EVENT_ARRIVE,
  EVENT_DECIDE,
  type NpcContext,
  type NpcCounts,
  type SimEvent,
  decide,
  emptyNpcCounts,
  scheduleDecide,
  scheduleTrip,
} from "./npcRun.ts";
import {
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  checkWorld,
  createWorld,
  settleFaction,
  totalOwnerAsset,
} from "./world.ts";

/**
 * 출력 형식 판(줄·요약의 모양이 바뀌면 올린다. 관전판·관리자 화면이 읽는다). 2: econ 줄·요약 economy 칸(R2),
 * 3: battle 줄·요약 combat 칸(R3), 4: 하루 줄 세력 칸 satisfaction·regime·overlord, 요약 society 칸, born 줄 mode·city(R4b),
 * 5: 요약 society 칸에 dividends(도시 세금 정산 D-304)·tributes(D-443),
 * 6: 요약 npc 칸(NPC 판단 행동 수·강화 거절·세율 바꿈), society 칸에 wars·stalled(docs/adr/2026-11-01-npc-brain-r5.md),
 * 7: wave 줄(웨이브·유목 예고·결과)·gardener 하루 줄, battle 줄 city 칸, 요약 gardener 칸, society 칸 ruins(docs/adr/2026-11-01-gardener-r5b.md)
 * 8: econ 줄·요약 economy 칸에 produced(생산한 양, 물건 자산 → 기본 단위. 채집 티어 추첨 D-506 확인용)
 * 9: 출생 없음(D-469): 요약 society 칸 births → recruited(구인 카드로 고용한 휴먼)·recruitSpent(자산 → 쓴 값), 하루 줄 세력 칸 recruited
 *    (그날 고용 수), 요약 npc 칸 recruits(구인 규칙식이 산 카드). born 줄은 그대로 세력이 생긴 사건이다(D-391)
 * 10: 정원사 2(docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07)"): wave 줄 kind "protection"(보호 레이드 예고·결과, D-500),
 *    도시 웨이브 예고에 factionSum(세력 오염), 막아 낸 도시 웨이브 결과에 reward(D-499), gardener 하루 줄 factions([세력, 세력 오염,
 *    관계도]), 요약 gardener 칸 protection·relations·rewards
 */
export const SIM_OUTPUT_FORMAT = 10;
/** 가상 시계 시작 시각(ms). 정산 경계(정시)가 0에서 센 시각이라 0으로 둔다 */
export const SIM_START_MS = 0;
/** 정원사 합성 격자 한 변(도시마다 3칸 간격, 한 줄 32도시 — 1만 도시까지), 웨이브 전투 기본값(시나리오에 combat 칸이 없을 때) */
const SIM_GRID_SIZE = 1024;
const SIM_GRID_ROW = 32;
const DEFAULT_WAVE_MAP = 128;
const DEFAULT_NEXUS = 2000;
const DEFAULT_WAVE_DEFENDERS = 10;
/** 정원사 크리쳐 전투 유닛 ID 시작(시뮬 유닛 ID와 겹치지 않게) */
const WAVE_CREATURE_ID_BASE = 1_900_000_000;

/** 도시 → 합성 격자 칸(도시 ID 차례로 3칸 간격, 가장자리에서 4칸 띄움) */
function simCityCell(grid: ReturnType<typeof squareGrid>, cityId: number): number | undefined {
  const slot = cityId - 1;
  const x = 4 + (slot % SIM_GRID_ROW) * 3;
  const y = 4 + Math.floor(slot / SIM_GRID_ROW) * 3;
  return slot < 0 || y >= SIM_GRID_SIZE - 4 ? undefined : grid.cellOf(x, y);
}

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
  /** 스탯 가중치 표(콘텐츠 팩 stat_rows). 없으면 TEST_STAT_TABLE */
  /** 전투 자료(스탯 표·효과·스킬·장비·유닛 종류). 없으면 TEST_COMBAT_CATALOG */
  readonly combatCatalog?: CombatCatalog | undefined;
  /** 설정 칸 값(콘텐츠 팩 tuning: 항목 ID → 정수). 없으면 TEST 계수표 */
  readonly tuning?: ReadonlyMap<string, number> | undefined;
  /** 전투 계산식 묶음(콘텐츠 팩 formulas + 차이의 식, docs/adr/2026-11-01-formula-editor.md). 없으면 기본 식 */
  readonly combatFormulas?: CombatFormulaSet | undefined;
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
  /** 전투(시나리오에 combat 칸이 없으면 null) */
  readonly combat: CombatSummary | null;
  /** 세력·사회(R4b 규칙) */
  readonly society: SocietySummary;
  /** NPC 판단(R5) */
  readonly npc: NpcCounts;
  /** 정원사(R5b). 시나리오에서 껐으면 null */
  readonly gardener: GardenerSummary | null;
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
  const societyCoefficients = societyCoefficientsFrom(options.tuning ?? new Map());
  const world = createWorld(scenario, seed, SIM_START_MS, { systemRule, npc: societyCoefficients.npc });
  const recorder = createMetricsRecorder({ startMs: SIM_START_MS, sink: emit });
  const byKind = new Map<string, number>();
  const ctxRef: { ctx?: NpcContext } = {};
  const gardenerRef: { run?: GardenerRun } = {};
  // 전투 한 번 = 그 도시 칸 오염 +battle(조우는 건 세력의 가장 오래된 도시, 질문 223 가)
  const combatRecorder: MetricsRecorder = {
    ...recorder,
    battle(atMs, data) {
      recorder.battle(atMs, data);
      const gardener = gardenerRef.run;
      if (!gardener) return;
      const city = typeof data.city === "number" ? data.city : undefined;
      const attacker = typeof data.attacker === "number" ? world.factions.get(data.attacker) : undefined;
      const home = city ?? (attacker ? [...attacker.cities].toSorted((a, b) => a - b)[0] : undefined);
      if (home !== undefined) gardener.addBattle(home);
    },
  };
  const loop = createSimLoop<SimEvent>({
    startMs: SIM_START_MS,
    handle: (event, sim) => {
      const ctx = ctxRef.ctx;
      if (!ctx) return;
      byKind.set(event.payload.kind, (byKind.get(event.payload.kind) ?? 0) + 1);
      if (econ?.handle(event, sim.nowMs)) return;
      if (gardenerRef.run?.handle(event.payload.kind, event.payload.subject, sim.nowMs)) return;
      if (event.payload.kind === EVENT_DECIDE) decide(ctx, event.payload.subject, sim.nowMs);
      else if (event.payload.kind === EVENT_ARRIVE) scheduleTrip(ctx, event.payload.subject, sim.nowMs);
    },
  });
  // 경제: 사건 처리기가 쓰기 전에 붙인다(예약은 아직 돌지 않는다)
  const econ: EconomyRun | undefined =
    scenario.economy && options.catalog
      ? attachEconomy(world, scenario, options.catalog, loop, SIM_START_MS, societyCoefficients.npc, {
          levelBonus: societyCoefficients.gatherLevelBonus,
          defaultStat: defaultGatherStat(societyCoefficients.cyborg.initialSum),
          progressDivisor: societyCoefficients.productionMainDivisor,
          yieldPerStatPm: societyCoefficients.productionSubYieldPm,
          tierProgressBase: societyCoefficients.gatherTierProgressBase,
          tierProgressStep: societyCoefficients.gatherTierProgressStep,
          tickMs: societyCoefficients.gatherTickMs,
          oreGrams: societyCoefficients.gatherOreGrams,
        })
      : undefined;
  const ctx: NpcContext = {
    world,
    loop,
    recorder,
    c: societyCoefficients,
    decideEveryMs: scenario.npc.decideEveryMs ?? societyCoefficients.npc.decideEveryMs,
    settings: scenario.society,
    counts: emptyNpcCounts(),
    trips: scenario.trips,
    hooks: econ?.hooks,
    combat: scenario.combat
      ? attachCombat(
          world,
          scenario.combat,
          combatRecorder,
          options.combatCatalog,
          combatCoefficientsFrom(options.tuning ?? new Map(), undefined, options.combatFormulas),
        )
      : undefined,
    encounterPerMille: scenario.combat?.encounterPerMille,
  };
  ctxRef.ctx = ctx;
  const society = attachSociety(
    {
      world,
      settings: scenario.society,
      recorder,
      c: societyCoefficients,
      hooks: econ?.hooks,
      combat: ctx.combat,
      scheduleFaction: (faction, nowMs) => scheduleDecide(ctx, faction, nowMs),
      scheduleUnit: (unitId, nowMs) => {
        if (scenario.trips) scheduleTrip(ctx, unitId, nowMs);
      },
      cancel: (eventId) => loop.cancel(eventId),
    },
    SIM_START_MS,
  );
  ctx.society = society;

  // 정원사(R5b): 시뮬 세계에는 지형이 없어 도시마다 합성 격자 칸(3칸 간격)을 준다. 모함 칸은 격자 끝(도시에서 멀다)
  const combatCoefficients = combatCoefficientsFrom(
    options.tuning ?? new Map(),
    undefined,
    options.combatFormulas,
  );
  let waveBattles = 0;
  if (scenario.gardener.enabled) {
    const grid = squareGrid(SIM_GRID_SIZE);
    const gardener = attachGardener({
      world,
      rules: () => societyCoefficients.gardener,
      grid,
      cellOf: (cityId) => simCityCell(grid, cityId),
      mothershipCell: grid.cellOf(SIM_GRID_SIZE - 1, SIM_GRID_SIZE - 1),
      recorder,
      society,
      schedule: (atMs, kind, subject) => loop.schedule(atMs, { kind, subject }),
      cancel: (eventId) => loop.cancel(eventId),
      treasuryOf: (faction) =>
        world.book.balanceOf(faction.id, econ ? econ.hooks.treasuryAsset(faction) : TEST_ASSET_CREDIT),
      seed,
      fight: (wave, defenders, nowMs) => {
        const city = world.cities.get(wave.city);
        const owner = city ? world.factions.get(city.owner) : undefined;
        if (!owner) return true;
        waveBattles += 1;
        const init = waveBattleInit(
          {
            battleId: waveBattles,
            seed: mix32(seed ^ Math.imul(waveBattles, 0x2545_f491) ^ 0x6a09_e667),
            defenderFaction: owner.id,
            defenders,
            defenderTech: owner.tech,
            strength: wave.strength,
            physical: wave.physical,
            creatureTech: owner.tech,
            firstCreatureId: WAVE_CREATURE_ID_BASE,
            mapSize: scenario.combat?.siegeMapSize ?? DEFAULT_WAVE_MAP,
            nexusDurability: scenario.combat?.nexusDurability ?? DEFAULT_NEXUS,
            maxDefenders: scenario.combat?.siegeUnits ?? DEFAULT_WAVE_DEFENDERS,
          },
          options.combatCatalog ?? TEST_COMBAT_CATALOG,
          combatCoefficients,
        );
        const { result } = runWaveToEnd(createBattle(init, combatCoefficients), []);
        if (!result) throw new Error("wave battle did not end");
        recorder.battle(nowMs, {
          kind: "wave",
          attacker: GARDENER_SIDE_FACTION,
          defender: owner.id,
          winner: result.winner === 1 ? GARDENER_SIDE_FACTION : owner.id,
          reason: result.reason,
          ticks: result.endTick,
          city: wave.city,
        });
        return result.winner === 1;
      },
    });
    gardenerRef.run = gardener;
    if (econ) econ.onWork = (cityId, weightedWorkMs) => gardener.addWork(cityId, weightedWorkMs);
    // 보호 레이드(D-500): 필수 NPC 세력의 도시를 치는 세력에게
    ctx.onAttack = (attacker, target, cityId, nowMs) => {
      gardener.protect(attacker, target, cityId, nowMs);
    };
  }

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
    const problems = [
      ...checkWorld(world, nowMs, scenario.trips !== undefined),
      ...(econ?.check() ?? []),
      ...society.check(nowMs),
      ...(gardenerRef.run?.check() ?? []),
    ];
    violations += problems.length;
    for (const problem of problems) if (first.length < FIRST_PROBLEMS) first.push(`${nowMs}: ${problem}`);
  };

  for (let day = 1; day <= days; day++) {
    const endMs = SIM_START_MS + day * DAY_MS;
    loop.runUntil(endMs);
    econ?.endOfDay(endMs);
    society.endOfDay(endMs);
    gardenerRef.run?.endOfDay(endMs, day);
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
        ...society.dayFields(faction),
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
    combat: ctx.combat ? ctx.combat.summary() : null,
    society: society.summary(),
    npc: ctx.counts,
    gardener: gardenerRef.run ? gardenerRef.run.summary() : null,
    ledger: { transactions: world.audit.transactions, accounts: [...world.book.accounts()].length },
    invariants: { checks, violations, first },
    lines: lineCount,
    linesHash: hash.digest(),
  };
  options.sink?.(JSON.stringify({ t: "summary", ...summary }));
  return summary;
}
