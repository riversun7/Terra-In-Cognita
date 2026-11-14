// 전투 보고서 집계(순수 함수) — docs/adr/2026-11-14-battle-report.md "판정·집계"
// 판(play.ts)이 관찰자 셈을 RunSink로 넘기면 설정 하나의 합(줄·편·흐름·승패·공성)으로 모은다. 판을 어떤 묶음으로 나눠 돌려도
// 같은 합이다(판마다 시드가 판 번호로 정해지고, 합은 더하기라 차례와 상관없다 — 전투 시간 목록만 판 번호 차례로 둔다).
import type { AttackStages } from "@terra/sim";
import {
  FLOW_VALUE_STAGES,
  type FlowValueStage,
  REPORT_LIMITS,
  REPORT_SAMPLE_MAX,
  type ReportCounters,
  type ReportDurations,
  type ReportFlow,
  type ReportHitTrace,
  type ReportOutcome,
  type ReportResult,
  addCounters,
  addFlow,
  emptyCounters,
  emptyFlow,
  flowBin,
  wilsonPm,
} from "@terra/shared/battleReport";
import { type PlayEnd, type PlaySetup, hitTraceOf } from "./play.ts";

/** 판 하나가 셈을 넘기는 곳(줄 번호 −1 = 모름, 버린다) */
export interface RunSink {
  attack(row: number, outcome: "miss" | "evaded" | "hit", crit: boolean, damage: number): void;
  skillCast(row: number): void;
  skillHit(row: number, outcome: "miss" | "evaded" | "hit"): void;
  dealt(row: number, physical: number, elemental: number): void;
  taken(row: number, physical: number, elemental: number): void;
  dot(source: number, target: number, amount: number): void;
  heal(source: number, target: number, amount: number): void;
  kill(row: number): void;
  death(row: number, ms: number): void;
  retreat(row: number): void;
  alive(row: number, ms: number): void;
  staminaWait(row: number, ms: number): void;
  staminaLimited(row: number): void;
  building(row: number, kind: "nexus" | "wall" | "other", damage: number): void;
  stages(attacker: number, target: number, stages: AttackStages, ms: number): void;
}

/** 설정 하나의 쌓이는 합(워커 안) */
export interface SetupTotals {
  readonly counters: ReportCounters[];
  readonly deathMsSum: number[];
  readonly flowA: ReportFlow;
  readonly flowB: ReportFlow;
  readonly pairs: Map<string, ReportFlow>;
  /** 판 번호 차례의 끝 */
  readonly ends: PlayEnd[];
  readonly samples: ReportHitTrace[];
  cpuMs: number;
}

export function newTotals(setup: PlaySetup): SetupTotals {
  return {
    counters: setup.rows.map(() => emptyCounters()),
    deathMsSum: setup.rows.map(() => 0),
    flowA: emptyFlow(true),
    flowB: emptyFlow(true),
    pairs: new Map(),
    ends: [],
    samples: [],
    cpuMs: 0,
  };
}

/** 막대에 하나 더한다(정렬된 [칸, 수] 목록) */
function bump(hist: [number, number][], value: number): void {
  const bin = flowBin(value);
  let low = 0;
  let high = hist.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((hist[mid]?.[0] ?? 0) < bin) low = mid + 1;
    else high = mid;
  }
  const at = hist[low];
  if (at && at[0] === bin) at[1] += 1;
  else hist.splice(low, 0, [bin, 1]);
}

/** 단계 기록 하나를 흐름에 더한다 */
export function addStages(flow: ReportFlow, s: AttackStages): void {
  flow.attacks += 1;
  if (s.source === "skill") flow.skillAttacks += 1;
  const sums = flow.sums;
  sums.hitPm += s.hitPm;
  if (s.outcome === "miss") return;
  flow.hitPassed += 1;
  sums.evadeBasePm += s.evadeBasePm;
  sums.evadeRelativePm += s.evadeRelativePm;
  sums.evadePm += s.evadePm;
  if (s.evadePm <= 10) sums.evadeAtMin += 1;
  if (s.evadePm >= 850) sums.evadeAtMax += 1;
  if (s.outcome === "evaded") return;
  flow.hits += 1;
  if (s.crit) {
    flow.crits += 1;
    sums.critMulPm += s.critMulPm;
  }
  if (s.floored) flow.floored += 1;
  sums.critPm += s.critPm;
  sums.statAttack += s.statAttack;
  sums.weaponAttack += s.weaponAttack;
  if (s.kind === "physical") {
    sums.physicalHits += 1;
    sums.ratePm += s.ratePm;
    sums.defenseRatePm += s.defenseRatePm;
    sums.penetrationPm += s.penetrationPm;
    sums.defenseFlat += s.defenseFlat;
  }
  if (s.elementalRaw > 0) {
    sums.elementalHits += 1;
    sums.matchupPm += s.matchupPm;
    sums.elementalDefensePm += s.elementalDefensePm;
    sums.resistPm += s.resistPm;
  }
  sums.skillMulPm += s.skillMulPm;
  sums.buffPm += s.buffPm;
  sums.physicalRaw += s.physicalRaw;
  sums.elementalRaw += s.elementalRaw;
  sums.physicalFinal += s.physical;
  sums.elementalFinal += s.elemental;
  sums.toArmor += s.toArmor;
  sums.toShield += s.toShield;
  sums.toHp += s.toHp;
  sums.overkill += s.overkill;
  const values: Record<FlowValueStage, number> = {
    raw: s.physicalRaw + s.elementalRaw,
    rate: (s.kind === "physical" ? s.physicalAfterRate : s.physicalRaw) + s.elementalRaw,
    flat: s.physicalAfterFlat + s.elementalRaw,
    matchup: s.physicalAfterFlat + (s.elementalRaw > 0 ? s.elementalAfterMatchup : 0),
    elementalDefense: s.physicalAfterFlat + (s.elementalRaw > 0 ? s.elementalAfterDefense : 0),
    resist: s.physicalAfterFlat + s.elementalAfterResist,
    crit: s.physicalAfterCrit + s.elementalAfterCrit,
    skill: s.physicalAfterSkill + s.elementalAfterSkill,
    buff: s.physicalAfterBuff + s.elementalAfterBuff,
    floor: s.physical + s.elemental,
    final: s.physical + s.elemental + s.flat,
    applied: s.toArmor + s.toShield + s.toHp,
  };
  for (const stage of FLOW_VALUE_STAGES) {
    const value = values[stage];
    flow.values[stage] += value;
    if (flow.hist) bump(flow.hist[stage], value);
  }
}

/** 판 하나의 셈을 totals에 쌓는 sink(run = 판 번호: 표본은 0번 판에서만) */
export function sinkOf(setup: PlaySetup, totals: SetupTotals, run: number): RunSink {
  const at = (row: number): ReportCounters | undefined => totals.counters[row];
  const rowKey = (row: number): string => setup.rows[row]?.key ?? "?";
  return {
    attack(row, outcome, crit, damage) {
      const c = at(row);
      if (!c) return;
      c.attacks += 1;
      if (outcome === "miss") c.misses += 1;
      else if (outcome === "evaded") c.evades += 1;
      else {
        c.hits += 1;
        c.attackDamage += damage;
        if (crit) {
          c.crits += 1;
          c.critDamage += damage;
        }
      }
    },
    skillCast(row) {
      const c = at(row);
      if (c) c.skillCasts += 1;
    },
    skillHit(row, outcome) {
      const c = at(row);
      if (!c) return;
      if (outcome === "miss") c.skillMisses += 1;
      else if (outcome === "evaded") c.skillEvades += 1;
      else c.skillHits += 1;
    },
    dealt(row, physical, elemental) {
      const c = at(row);
      if (!c) return;
      c.physicalDealt += physical;
      c.elementalDealt += elemental;
    },
    taken(row, physical, elemental) {
      const c = at(row);
      if (!c) return;
      c.physicalTaken += physical;
      c.elementalTaken += elemental;
    },
    dot(source, target, amount) {
      const s = at(source);
      if (s) s.dotDealt += amount;
      const t = at(target);
      if (t) t.dotTaken += amount;
    },
    heal(source, target, amount) {
      const s = at(source);
      if (s) s.healed += amount;
      const t = at(target);
      if (t) t.healReceived += amount;
    },
    kill(row) {
      const c = at(row);
      if (c) c.kills += 1;
    },
    death(row, ms) {
      const c = at(row);
      if (!c) return;
      c.deaths += 1;
      totals.deathMsSum[row] = (totals.deathMsSum[row] ?? 0) + ms;
    },
    retreat(row) {
      const c = at(row);
      if (c) c.retreats += 1;
    },
    alive(row, ms) {
      const c = at(row);
      if (c) c.aliveMs += ms;
    },
    staminaWait(row, ms) {
      const c = at(row);
      if (c) c.staminaWaitMs += ms;
    },
    staminaLimited(row) {
      const c = at(row);
      if (c) c.staminaWaits += 1;
    },
    building(row, kind, damage) {
      const c = at(row);
      if (!c) return;
      if (kind === "nexus") c.nexusDamage += damage;
      else if (kind === "wall") c.wallDamage += damage;
      else c.otherBuildingDamage += damage;
    },
    stages(attacker, target, stages, ms) {
      const team = setup.rows[attacker]?.team;
      if (!team) return;
      addStages(team === "a" ? totals.flowA : totals.flowB, stages);
      const key = `${rowKey(attacker)}>${rowKey(target)}`;
      let pair = totals.pairs.get(key);
      if (!pair) {
        pair = emptyFlow(false);
        totals.pairs.set(key, pair);
      }
      addStages(pair, stages);
      // 표본: 0번 판, 편마다 반씩
      if (run === 0 && totals.samples.length < REPORT_SAMPLE_MAX) {
        const mine = totals.samples.filter(
          (sample) => setup.rows.find((r) => r.key === sample.attacker)?.team === team,
        );
        if (mine.length < REPORT_SAMPLE_MAX / 2)
          totals.samples.push(hitTraceOf(stages, ms, rowKey(attacker), rowKey(target)));
      }
    },
  };
}

/** 정렬된 목록의 q 분위(가장 가까운 순위) */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? 0;
}

function durationsOf(times: readonly number[]): ReportDurations {
  const sorted = times.toSorted((x, y) => x - y);
  const min = sorted[0] ?? 0;
  const max = sorted.at(-1) ?? 0;
  const bins = REPORT_LIMITS.histogramBins;
  const width = Math.max(1, Math.ceil((max - min + 1) / bins));
  const histogram = Array.from({ length: bins }, (_, index) => ({
    fromMs: min + index * width,
    toMs: min + (index + 1) * width,
    count: 0,
  }));
  for (const value of sorted) {
    const bin = histogram[Math.min(bins - 1, Math.floor((value - min) / width))];
    if (bin) bin.count += 1;
  }
  const last = histogram.at(-1);
  if (last) last.toMs = Math.max(last.toMs, max);
  return {
    avgMs:
      sorted.length === 0 ? 0 : Math.floor(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    minMs: min,
    p10Ms: quantile(sorted, 0.1),
    p50Ms: quantile(sorted, 0.5),
    p90Ms: quantile(sorted, 0.9),
    maxMs: max,
    histogram: histogram.filter((bin, index) => bin.count > 0 || index < bins),
  };
}

function ttkOf(ends: readonly PlayEnd[], team: "a" | "b") {
  const times = ends
    .filter((end) => end.winner === team && (end.end === "wipe" || end.end === "nexus"))
    .map((end) => end.endMs)
    .toSorted((x, y) => x - y);
  return {
    runs: times.length,
    avgMs: times.length === 0 ? 0 : Math.floor(times.reduce((sum, value) => sum + value, 0) / times.length),
    p50Ms: quantile(times, 0.5),
  };
}

/** 쌓인 합 → 보고서 결과 */
export function finishTotals(setup: PlaySetup, totals: SetupTotals): ReportResult {
  const { ends } = totals;
  const runs = ends.length;
  const count = (pick: (end: PlayEnd) => boolean) => ends.filter(pick).length;
  const winsA = count((end) => end.winner === "a");
  const winsB = count((end) => end.winner === "b");
  const draws = count((end) => end.winner === null);
  const ci = wilsonPm(2 * winsA + draws, runs);
  const outcome: ReportOutcome = {
    runs,
    winsA,
    winsB,
    draws,
    timeoutWinsA: count((end) => end.winner === "a" && end.end === "timeout"),
    timeoutWinsB: count((end) => end.winner === "b" && end.end === "timeout"),
    ends: {
      wipe: count((end) => end.end === "wipe"),
      nexus: count((end) => end.end === "nexus"),
      timeout: count((end) => end.end === "timeout"),
      spent: count((end) => end.end === "spent"),
    },
    scorePm: runs === 0 ? 0 : Math.round(((2 * winsA + draws) * 1000) / (2 * runs)),
    ciLowPm: ci.low,
    ciHighPm: ci.high,
    durations: durationsOf(ends.map((end) => end.endMs)),
    timeToKill: { a: ttkOf(ends, "a"), b: ttkOf(ends, "b") },
  };
  const sides = { a: emptyCounters(), b: emptyCounters() };
  setup.rows.forEach((row, index) => {
    const counters = totals.counters[index];
    if (counters) addCounters(sides[row.team], counters);
  });
  const units = setup.rows.map((row, index) => ({
    key: row.key,
    team: row.team,
    label: row.label,
    members: row.members,
    counters: totals.counters[index] ?? emptyCounters(),
    deathMsSum: totals.deathMsSum[index] ?? 0,
  }));
  const pairs: Record<string, ReportFlow> = {};
  for (const [key, flow] of [...totals.pairs.entries()].toSorted(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
    pairs[key] = flow;
  const siege =
    setup.nexusId === null
      ? null
      : {
          nexusMax: setup.nexusMax,
          nexusDestroyed: outcome.ends.nexus,
          nexusLeftPmSum: ends.reduce((sum, end) => sum + end.nexusLeftPm, 0),
          nexusDamage: sides.a.nexusDamage + sides.b.nexusDamage,
          wallDamage: sides.a.wallDamage + sides.b.wallDamage,
          otherBuildingDamage: sides.a.otherBuildingDamage + sides.b.otherBuildingDamage,
          walls: setup.wallIds.length,
        };
  return {
    outcome,
    sides,
    units,
    siege,
    flows: { a: totals.flowA, b: totals.flowB, pairs },
    samples: totals.samples,
    cpuMs: Math.round(totals.cpuMs),
  };
}

/** 묶음 둘(같은 설정, 앞뒤 판 구간)을 합친다 — 묶음 나눔 시험·여러 조각 일에 쓴다 */
export function mergeTotals(into: SetupTotals, from: SetupTotals): void {
  from.counters.forEach((counters, index) => {
    const target = into.counters[index];
    if (target) addCounters(target, counters);
  });
  from.deathMsSum.forEach((value, index) => {
    into.deathMsSum[index] = (into.deathMsSum[index] ?? 0) + value;
  });
  addFlow(into.flowA, from.flowA);
  addFlow(into.flowB, from.flowB);
  for (const [key, flow] of from.pairs) {
    const target = into.pairs.get(key);
    if (target) addFlow(target, flow);
    else into.pairs.set(key, flow);
  }
  into.ends.push(...from.ends);
  for (const sample of from.samples) if (into.samples.length < REPORT_SAMPLE_MAX) into.samples.push(sample);
  into.cpuMs += from.cpuMs;
}
