// 다시보기 계산(워커·같은 스레드 공용) — docs/adr/2026-11-01-battle-replay.md 4·5절.
// 일(job) = 요청 시작 때의 전투 자료(팩 + 그 세계 가중치 표)·계수(설정 칸 실효 값)·경기장·시드·이름. 워커는 DB·접근자를 모른다.
// 시범 6 대 6(sim demoSkirmish)을 기록기(recordBattleReplay)로 돌려 이진 리플레이를 base64로 돌려준다.
import {
  encodeBattleReplay,
  type ReplayArenaRef,
  type ReplayName,
  replayToBase64,
} from "@terra/protocol/battleReplay";
import {
  type BattleMapInput,
  type CombatCatalog,
  type CombatCoefficients,
  demoSkirmish,
  recordBattleReplay,
} from "@terra/sim";

export interface ReplayJob {
  readonly catalog: CombatCatalog;
  readonly coefficients: CombatCoefficients;
  readonly map: BattleMapInput;
  readonly arena: ReplayArenaRef | null;
  readonly seed: number;
  readonly names: {
    readonly skills: Readonly<Record<string, ReplayName>>;
    readonly effects: Readonly<Record<string, ReplayName>>;
  };
}

export interface ReplayJobResult {
  readonly replay: string;
  readonly bytes: number;
  readonly events: number;
  readonly endTick: number;
}

export function runReplayJob(job: ReplayJob): ReplayJobResult {
  const { init, labels } = demoSkirmish({
    catalog: job.catalog,
    map: job.map,
    seed: job.seed,
    coefficients: job.coefficients,
  });
  const { replay } = recordBattleReplay(init, {
    coefficients: job.coefficients,
    arena: job.arena,
    units: labels,
    names: job.names,
  });
  const bytes = encodeBattleReplay(replay);
  return {
    replay: replayToBase64(bytes),
    bytes: bytes.length,
    events: replay.events.length,
    endTick: replay.result.endTick,
  };
}
