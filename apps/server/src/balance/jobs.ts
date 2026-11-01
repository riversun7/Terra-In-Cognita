// 무거운 계산 일(워커 한 번에 하나) — 밸런스 화면 대결(docs/adr/2026-11-01-balance-screen.md 4절)과 전투 실험실 전투장
// ("바뀜 (2026-11-01, 전투 실험실)" 4절)이 같은 워커 진입 파일(duelWorker.ts)과 같은 바쁨 표시(gate.ts)를 쓴다.
// 일은 구조화 복제가 되는 값만 든다(요청 시작 때 값 한 벌). 같은 일이면 같은 결과다.
// 3D 관람(replay)은 같은 전투장 일을 리플레이 기록기(@terra/sim recordBattleReplay, docs/adr/2026-11-01-battle-replay.md)로
// 돌려 이진 리플레이(base64)를 낸다. 같은 시드면 [한 판]과 같은 전투다(기록기는 판정을 바꾸지 않는다).
import {
  type ReplayArenaRef,
  type ReplayName,
  encodeBattleReplay,
  replayToBase64,
} from "@terra/protocol/battleReplay";
import { recordBattleReplay } from "@terra/sim";
import {
  type ArenaBattleResult,
  type ArenaJob,
  type ArenaMonteResult,
  arenaInit,
  runArenaBattle,
  runArenaMonteCarlo,
} from "../battleLab/arena.ts";
import { type DuelJob, type DuelJobResult, runDuelJob } from "./compute.ts";

/** 3D 관람 일: 전투장 일 + 지형 참조·유닛 이름표·스킬·효과 이름 */
export interface ReplayLabJob {
  readonly job: ArenaJob;
  readonly arena: ReplayArenaRef | null;
  readonly units: Readonly<Record<number, { readonly name: string; readonly kind: string }>>;
  readonly names: {
    readonly skills: Readonly<Record<string, ReplayName>>;
    readonly effects: Readonly<Record<string, ReplayName>>;
  };
}

export interface ReplayLabResult {
  readonly replay: string;
  readonly bytes: number;
  readonly events: number;
  readonly endTick: number;
}

export type WorkerJob =
  | { readonly kind: "duels"; readonly job: DuelJob }
  | { readonly kind: "battle"; readonly job: ArenaJob; readonly logMax: number }
  | { readonly kind: "monte"; readonly job: ArenaJob; readonly runs: number }
  | { readonly kind: "replay"; readonly replay: ReplayLabJob };

export type WorkerResult =
  | { readonly kind: "duels"; readonly result: DuelJobResult }
  | { readonly kind: "battle"; readonly result: ArenaBattleResult }
  | { readonly kind: "monte"; readonly result: ArenaMonteResult }
  | { readonly kind: "replay"; readonly result: ReplayLabResult };

/** 전투장 한 판(팀 A 서쪽)을 리플레이로 기록한다 */
export function runReplayLabJob(input: ReplayLabJob): ReplayLabResult {
  const { replay } = recordBattleReplay(arenaInit(input.job, input.job.seed, false), {
    coefficients: input.job.coefficients,
    arena: input.arena,
    units: input.units,
    names: input.names,
  });
  const bytes = encodeBattleReplay(replay);
  return {
    replay: replayToBase64(bytes),
    bytes: bytes.length,
    events: replay.events.length,
    endTick: replay.result.endTick,
  };
}

/** 일 하나를 끝까지 돈다 */
export function runWorkerJob(job: WorkerJob): WorkerResult {
  switch (job.kind) {
    case "duels":
      return { kind: "duels", result: runDuelJob(job.job) };
    case "battle":
      return { kind: "battle", result: runArenaBattle(job.job, job.logMax) };
    case "monte":
      return { kind: "monte", result: runArenaMonteCarlo(job.job, job.runs) };
    default:
      return { kind: "replay", result: runReplayLabJob(job.replay) };
  }
}
