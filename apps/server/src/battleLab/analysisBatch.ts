// 밸런스 분석 묶음 일(순수 함수) — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)" 3절
// 짝(분포 상성 칸·영향도 변형) 여러 개를 전투 실험실과 같은 몬테카를로(arena.ts runArenaMonteCarlo, sim 전투 코어 runBattle)로 돌린다.
// 워커(balance/duelWorker.ts의 "batch" 일)가 이 함수를 돌고, 시험·DB 없는 개발은 같은 스레드에서 칸마다 양보하며 돈다(analysisRunner.ts).
// 일에는 사양·지도·계수·시드를 다 담는다(요청 시작 때 값 한 벌, 구조화 복제가 되는 값만). 칸 시드는 계획(analysis.ts)이 정한다 →
// 칸을 어떤 차례·묶음으로 돌려도 같은 결과다.
import type { AnalysisDuelStats } from "@terra/shared/balanceAnalysis";
import type { BattleMapInput, CombatCoefficients } from "@terra/sim";
import { type ArenaMonteResult, type ArenaParty, runArenaMonteCarlo } from "./arena.ts";

/** 짝 하나: 편 A(분포 i·변형)·편 B(분포 j·기준), 이 칸의 시드 */
export interface BatchCell {
  readonly a: ArenaParty;
  readonly b: ArenaParty;
  readonly seed: number;
}

export interface BatchJob {
  readonly cells: readonly BatchCell[];
  readonly map: BattleMapInput;
  readonly coefficients: CombatCoefficients;
  readonly limitMs: number;
  /** 칸마다 판 수(짝수) */
  readonly runs: number;
}

/** 워커로 보내는 일(duelWorker.ts가 kind로 가른다) */
export interface BatchWorkerJob {
  readonly kind: "batch";
  readonly batch: BatchJob;
}

/** 편마다 평균 준 피해 합 ÷ 평균 전투 시간(초당) */
function teamDps(result: ArenaMonteResult, team: "a" | "b"): number {
  if (result.avgMs <= 0) return 0;
  const dealt = result.units
    .filter((unit) => unit.team === team)
    .reduce((sum, unit) => sum + unit.dealtAvg, 0);
  return Math.round((dealt * 1000) / result.avgMs);
}

/** 편마다 유닛 생존율 평균(‰) */
function teamSurvival(result: ArenaMonteResult, team: "a" | "b"): number {
  const units = result.units.filter((unit) => unit.team === team);
  if (units.length === 0) return 0;
  return Math.round(units.reduce((sum, unit) => sum + unit.survivalPm, 0) / units.length);
}

/** 몬테카를로 결과 → 편 A 쪽 통계 */
export function duelStatsOf(result: ArenaMonteResult): AnalysisDuelStats {
  return {
    runs: result.runs,
    wins: result.teams.a.wins,
    losses: result.teams.b.wins,
    timeoutWins: result.teams.a.timeoutWins,
    timeoutLosses: result.teams.b.timeoutWins,
    even: result.timeoutEven,
    scorePm: result.teams.a.scorePm,
    avgMs: result.avgMs,
    medianMs: result.medianMs,
    dpsA: teamDps(result, "a"),
    dpsB: teamDps(result, "b"),
    survivalA: teamSurvival(result, "a"),
    survivalB: teamSurvival(result, "b"),
  };
}

/** 칸 하나(onRun = 판 하나 끝날 때마다) */
export function runBatchCell(
  job: BatchJob,
  index: number,
  onRun?: (done: number) => void,
): AnalysisDuelStats {
  const cell = job.cells[index];
  if (!cell) throw new RangeError(`batch cell ${index} out of range`);
  const result = runArenaMonteCarlo(
    {
      a: cell.a,
      b: cell.b,
      map: job.map,
      coefficients: job.coefficients,
      limitMs: job.limitMs,
      seed: cell.seed,
    },
    job.runs,
    onRun,
  );
  return duelStatsOf(result);
}

/** 묶음 전체(onProgress = 지금까지 끝난 판 수) */
export function runBatch(job: BatchJob, onProgress?: (done: number) => void): AnalysisDuelStats[] {
  const out: AnalysisDuelStats[] = [];
  for (let index = 0; index < job.cells.length; index++) {
    const before = index * job.runs;
    out.push(runBatchCell(job, index, onProgress ? (done) => onProgress(before + done) : undefined));
  }
  return out;
}
