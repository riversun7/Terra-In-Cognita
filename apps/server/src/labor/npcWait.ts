// NPC 일꾼 소유자의 기다림·해지 판단 — 기획 D-573 2045(일시 중지된 계약: "소유자에게 경고창이 뜨고 기다릴지 해지하고 다른곳으로 갈지 정함", NPC 소유자는 성향
// 규칙 D-212·D-323 — 기획 해석), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-573)". 플레이어 소유자는 처리할 일(labor/pausedInbox.ts)을 보고 손으로 정한다.
// [임시] 규칙식(D-323 "규칙식"): 기다리는 날 = 설정 칸 business_npc_wait_days × (1500 − 상업 성향 치우침) ÷ 1000. 상업 성향이 축 끝(1000)이면 절반(더 나은
// 일자리를 빨리 찾아 떠난다), 0이면 1.5배. 일시 중지된 지 그 날수가 지나면 해지하고(사유 worker) 다른 곳으로 간다. 날수 0이면 바로 해지.
// 정수만 쓴다(판정 결정성).

const DAY_MS = 86_400_000;

/** 성향 축 범위(@terra/sim NpcCoefficients traitMin·traitMax와 같은 뜻) */
export interface TraitRange {
  readonly traitMin: number;
  readonly traitMax: number;
}

/** 기다리는 시간(ms, 위 머리 주석) */
export function npcWaitMs(commerce: number, waitDays: number, range: TraitRange): number {
  const days = Math.max(0, Math.trunc(waitDays));
  const span = Math.max(1, range.traitMax - range.traitMin);
  const tilt = Math.trunc(
    ((Math.min(range.traitMax, Math.max(range.traitMin, commerce)) - range.traitMin) * 1000) / span,
  );
  return Math.trunc((days * DAY_MS * (1500 - tilt)) / 1000);
}

/** 일시 중지된 계약을 NPC 소유자가 해지하나(pausedSinceMs = 처음 못 낸 지급 시각) */
export function npcQuits(input: {
  readonly commerce: number;
  readonly waitDays: number;
  readonly range: TraitRange;
  readonly pausedSinceMs: number;
  readonly nowMs: number;
}): boolean {
  return input.nowMs - input.pausedSinceMs >= npcWaitMs(input.commerce, input.waitDays, input.range);
}
