// 전투 보고서 일(순수 함수, 워커가 돈다) — docs/adr/2026-11-14-battle-report.md "부하"
// 설정 A(와 B)를 같은 판 시드로 runs판씩 돌려 합을 낸다(A/B가 같은 굴림 시드를 써서 바꾼 것 하나의 차이만 남는다 — 공통 난수).
// 판 시드 = mix32(seed ^ (판 번호 + 1) × 황금비 상수): 전투 실험실 몬테카를로(arena.ts runSeed)와 같은 꼴이라 같은 시드면 다시 돈다.
// 한 대 풀이(trace)는 저장된 입력의 판 하나를 단계 기록과 함께 다시 돈다.
import { mix32 } from "@terra/sim";
import { REPORT_TRACE_MAX, type ReportHitTrace, type ReportResult } from "@terra/shared/battleReport";
import { type SetupTotals, finishTotals, newTotals, sinkOf } from "./aggregate.ts";
import { type PlayEnd, type PlaySetup, hitTraceOf, playRun } from "./play.ts";

/** 판 시드 */
export const reportRunSeed = (seed: number, run: number): number =>
  mix32(seed ^ Math.imul(run + 1, 0x9e37_79b1));

export interface ReportJob {
  readonly setups: readonly PlaySetup[];
  readonly runs: number;
  readonly seed: number;
}

/** 워커로 보내는 일(duelWorker.ts가 kind로 가른다) */
export type ReportWorkerJob =
  | { readonly kind: "report"; readonly job: ReportJob }
  | { readonly kind: "reportTrace"; readonly trace: ReportTraceJob };

export interface ReportTraceJob {
  readonly setup: PlaySetup;
  readonly run: number;
  readonly seed: number;
}

export interface ReportTraceResult {
  readonly hits: ReportHitTrace[];
  readonly dropped: number;
  readonly end: PlayEnd;
}

/** 판 구간 [from, to)를 돈다(설정 차례 그대로) */
export function runReportRange(
  job: ReportJob,
  setupIndex: number,
  from: number,
  to: number,
  totals: SetupTotals,
  now: () => number,
): void {
  const setup = job.setups[setupIndex];
  if (!setup) throw new RangeError(`report setup ${setupIndex} out of range`);
  const started = now();
  for (let run = from; run < to; run++) {
    const end = playRun(setup, run, reportRunSeed(job.seed, run), sinkOf(setup, totals, run));
    totals.ends.push(end);
  }
  totals.cpuMs += now() - started;
}

/** 일 전체(onRun = 끝난 판 수, 설정 둘이면 합) */
export function runReport(job: ReportJob, now: () => number, onRun?: (done: number) => void): ReportResult[] {
  const out: ReportResult[] = [];
  let done = 0;
  job.setups.forEach((setup, index) => {
    const totals = newTotals(setup);
    for (let run = 0; run < job.runs; run++) {
      runReportRange(job, index, run, run + 1, totals, now);
      done += 1;
      onRun?.(done);
    }
    out.push(finishTotals(setup, totals));
  });
  return out;
}

/** 판 하나를 단계 기록과 함께(상한 REPORT_TRACE_MAX 줄) */
export function runReportTrace(trace: ReportTraceJob): ReportTraceResult {
  const { setup } = trace;
  const totals = newTotals(setup);
  const hits: ReportHitTrace[] = [];
  let dropped = 0;
  const base = sinkOf(setup, totals, -1);
  const key = (row: number): string => setup.rows[row]?.key ?? "?";
  const end = playRun(setup, trace.run, reportRunSeed(trace.seed, trace.run), {
    ...base,
    stages(attacker, target, stages, ms) {
      if (hits.length < REPORT_TRACE_MAX) hits.push(hitTraceOf(stages, ms, key(attacker), key(target)));
      else dropped += 1;
    },
  });
  return { hits, dropped, end };
}
