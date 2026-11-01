// 무거운 계산 일(워커 한 번에 하나) — 밸런스 화면 대결(docs/adr/2026-11-01-balance-screen.md 4절)과 전투 실험실 전투장
// ("바뀜 (2026-11-01, 전투 실험실)" 4절)이 같은 워커 진입 파일(duelWorker.ts)과 같은 바쁨 표시(gate.ts)를 쓴다.
// 일은 구조화 복제가 되는 값만 든다(요청 시작 때 값 한 벌). 같은 일이면 같은 결과다.
import {
  type ArenaBattleResult,
  type ArenaJob,
  type ArenaMonteResult,
  runArenaBattle,
  runArenaMonteCarlo,
} from "../battleLab/arena.ts";
import { type DuelJob, type DuelJobResult, runDuelJob } from "./compute.ts";

export type WorkerJob =
  | { readonly kind: "duels"; readonly job: DuelJob }
  | { readonly kind: "battle"; readonly job: ArenaJob; readonly logMax: number }
  | { readonly kind: "monte"; readonly job: ArenaJob; readonly runs: number };

export type WorkerResult =
  | { readonly kind: "duels"; readonly result: DuelJobResult }
  | { readonly kind: "battle"; readonly result: ArenaBattleResult }
  | { readonly kind: "monte"; readonly result: ArenaMonteResult };

/** 일 하나를 끝까지 돈다 */
export function runWorkerJob(job: WorkerJob): WorkerResult {
  switch (job.kind) {
    case "duels":
      return { kind: "duels", result: runDuelJob(job.job) };
    case "battle":
      return { kind: "battle", result: runArenaBattle(job.job, job.logMax) };
    default:
      return { kind: "monte", result: runArenaMonteCarlo(job.job, job.runs) };
  }
}
