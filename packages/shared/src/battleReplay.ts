// 개발자 전투 다시보기(/dev/battle-replay) 공용 자료 모양 — docs/adr/2026-11-01-battle-replay.md 5절.
// 서버(tRPC battleReplay.*, apps/server/src/battleReplay/)와 화면(apps/game/src/editor/battleReplayLab/)이 같이 쓴다.
// 리플레이 본문은 @terra/protocol/battleReplay 이진 형식을 base64로 싣는다(기기는 판정 코드를 받지 않는다).

/** 시드 범위(0 ~ 2^31 − 1) */
export const BATTLE_REPLAY_SEED_MAX = 0x7fff_ffff;

/** 받지 않은 요청·실패의 data.reason */
export const BATTLE_REPLAY_REASONS = ["rate_limited", "busy", "timeout", "failed"] as const;
export type BattleReplayReason = (typeof BATTLE_REPLAY_REASONS)[number];

export interface BattleReplayDemoResponse {
  /** 리플레이 이진 형식(TCBR)의 base64 */
  readonly replay: string;
  /** 이진 바이트 수 */
  readonly bytes: number;
  readonly seed: number;
  /** 서버 계산 시간(ms, 워커 띄우기 포함) */
  readonly ms: number;
  /** 경기장이 시험 2차맵 구역인가(아니면 빈 평지) */
  readonly arena: "second_map" | "plain";
}
