// 개발자 전투 다시보기 요청 처리 — tRPC battleReplay.*(src/trpc/battleReplay.ts)가 D1 권한(tuning:read 두 겹)·조회 속도 제한을
// 거친 뒤 부른다. docs/adr/2026-11-01-battle-replay.md 5절. 서버가 켤 때 한 번 만든다.
// - demo: 시범 6 대 6을 그 세계 설정(가중치 표·전투 계수 실효 값)과 시험 2차맵 경기장으로 기록한다. 무겁다 → 워커(runner).
//   요청 시작 때 값 한 벌(전투 자료·계수·경기장)을 일에 담는다. 사용자마다 속도 제한, 서버 전체 한 번에 하나(바쁘면 busy).
// 조회만 한다(게임 상태를 바꾸지 않는다).
import type { BattleReplayDemoResponse } from "@terra/shared/battleReplay";
import type { ReplayName } from "@terra/protocol/battleReplay";
import { combatCoefficientsFrom } from "@terra/sim";
import { createRateLimiter } from "../rateLimit.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { BattleReplayServices, Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import type { TuningShared } from "../tuning/services.ts";
import { type ArenaPick, plainArena } from "./arena.ts";
import type { ReplayJob, ReplayJobResult } from "./compute.ts";
import { type JobRunner, JobRunError } from "./jobRunner.ts";

/** 서버 기록 메시지: 다시보기 한 번(걸린 시간·바이트) */
export const BATTLE_REPLAY_MESSAGE = "battle replay";
/** 워커 한 번의 제한 시간(ms): 시범 한 판이 이 컨테이너에서 1초 안팎(ADR 결과 절). NAS 여유로 크게 */
export const REPLAY_TIMEOUT_MS = 30_000;
/** 워커 V8 힙 상한(MB) */
export const REPLAY_WORKER_HEAP_MB = 128;

export interface BattleReplayLimits {
  /** 사용자마다 다시보기 속도 제한 */
  perUser: { capacity: number; refillPerMinute: number };
}

/** 한 판이 1초 안팎이고 서버 전체 한 번에 하나라 밸런스 대결(순간 2·분당 4)보다 넉넉히: 순간 5·분당 12 */
export const DEFAULT_BATTLE_REPLAY_LIMITS: BattleReplayLimits = {
  perUser: { capacity: 5, refillPerMinute: 12 },
};

export interface BattleReplayLog {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

export function createBattleReplayServices(deps: {
  tuning: TuningShared;
  roster: RosterCatalog;
  /** 시험 2차맵 경기장(월드가 없으면 null → 빈 평지) */
  arena: () => ArenaPick | null;
  runner: JobRunner<ReplayJob, ReplayJobResult>;
  /** 효과 이름(팩 effects, 없으면 ID를 보인다) */
  effectNames?: Readonly<Record<string, ReplayName>> | undefined;
  now: () => number;
  log: BattleReplayLog;
  limits?: Partial<BattleReplayLimits> | undefined;
}): BattleReplayServices {
  const { tuning, roster, runner, now, log } = deps;
  const limits = { ...DEFAULT_BATTLE_REPLAY_LIMITS, ...deps.limits };
  const limiter = createRateLimiter({ ...limits.perUser, now });
  let busy = false;

  return {
    async demo(viewer: Viewer, input: { seed: number }): Promise<BattleReplayDemoResponse> {
      if (!limiter.take(viewer.id)) throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
      if (busy) throw reasonedError("TOO_MANY_REQUESTS", "BATTLE_REPLAY_BUSY", "busy");
      busy = true;
      try {
        let pick: ArenaPick | null = null;
        try {
          pick = deps.arena();
        } catch (error) {
          // 경기장을 못 만들면(지형 파일이 틀림 등) 빈 평지로 계속한다
          log.warn({ err: error }, "battle replay arena failed");
        }
        const job: ReplayJob = {
          catalog: roster.combat,
          coefficients: combatCoefficientsFrom(
            tuning.state.snapshot().values,
            undefined,
            tuning.state.combatFormulas(),
          ),
          map: pick?.map ?? plainArena(),
          arena: pick?.ref ?? null,
          seed: input.seed,
          names: { skills: { ...roster.names.skills }, effects: { ...deps.effectNames } },
        };
        const started = now();
        let result: ReplayJobResult;
        try {
          result = await runner(job);
        } catch (error) {
          const reason = error instanceof JobRunError ? error.reason : "failed";
          log.warn({ err: error, reason }, "battle replay failed");
          throw reasonedError("INTERNAL_SERVER_ERROR", "BATTLE_REPLAY_FAILED", reason);
        }
        const ms = now() - started;
        log.info(
          { ms, seed: input.seed, bytes: result.bytes, events: result.events, endTick: result.endTick },
          BATTLE_REPLAY_MESSAGE,
        );
        return {
          replay: result.replay,
          bytes: result.bytes,
          seed: input.seed,
          ms,
          arena: pick ? "second_map" : "plain",
        };
      } finally {
        busy = false;
      }
    },
  };
}
