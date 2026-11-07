// 공성 결과 셋 — 기획 D-520(사용자 원문 "약탈시 경제적 이득만 취함. 소유는 원래 집단 그대로. 점령 및 도시 귀속시 재건 비용이 매우 크고 유닛들의
// 충성도나 전쟁으로 인한 만족도 회복이 매우 힘든 패널티가 있다. 점령 상태로 일정 기간 마다 세금 등을 계속 취득하는 점령상태"), 45 §10.4·46 §5.1 ①,
// docs/adr/2026-11-07-war-outcomes.md. 공성에서 이긴 쪽이 셋 가운데 하나를 고른다(고르기는 부르는 쪽: NPC 규칙식 npc/policy.ts occupationChoice,
// 유저 세력 층이 생기면 유저 명령). 이 파일은 수만 셈한다(순수 함수, 정수만):
// - 약탈(loot): 도시 금고 몫(lootTakeBp, D-186)과 공공 창고 몫(raidGoodsBp — 그 도시 창고의 도시 주인 세력 물건)을 가져간다. 도시 소유는 그대로,
//   폐허가 되지 않는다(486 가로 되돌림).
// - 점령·귀속(integrate): 도시를 가져간다(46 §5.1 ②~⑤ 그대로). 재건 비용 = 주거 × rebuildPerHousing(점령자 국고에서 소각), 그 도시 휴먼 만족도
//   회복이 annexPenaltyDays 동안 annexRecoveryPm ‰ 빠르기로만 오른다(충성도 칸이 아직 없어 만족도로 대신 — 확인 대기 682).
// - 점령 상태(occupy): 소유는 그대로, 점령자가 occupyTaxEveryDays마다 그 도시 몫 세금(도시 주인 국고 ÷ 주인 도시 수 × occupyTaxBp)을 거둔다.
//   occupyDays가 지나거나, 도시 주인이 바뀌거나(다른 점령·반란·독립·폐허), 점령자가 사라지면 끝난다(확인 대기 681).

/** 공성 결과 셋(저장된 값이라 이름을 바꾸지 않는다): 약탈 · 점령·귀속 · 점령 상태 */
export const WAR_OUTCOMES = ["loot", "integrate", "occupy"] as const;
export type WarOutcome = (typeof WAR_OUTCOMES)[number];

export const isWarOutcome = (value: unknown): value is WarOutcome =>
  typeof value === "string" && (WAR_OUTCOMES as readonly string[]).includes(value);

/** 공성 결과 계수(팩 tuning 경로 "war.*", 49에 칸이 없어 d520_* — 모두 [임시]) */
export interface WarCoefficients {
  /** 약탈: 그 도시 창고의 도시 주인 세력 물건 가운데 가져가는 몫(만분율). 금고 몫은 lootTakeBp(D-186) */
  readonly raidGoodsBp: number;
  /** 점령·귀속 재건 비용 = 주거 1당 이 값(점령자 국고 화폐 최소 단위, 소각). 국고가 모자라면 NPC는 고르지 않는다 */
  readonly rebuildPerHousing: number;
  /** 점령·귀속 불이익 기간(일, 0 = 없음) */
  readonly annexPenaltyDays: number;
  /** 불이익 동안 만족도가 오르는 빠르기(‰, 1000 = 평소). 내려가는 빠르기는 그대로 */
  readonly annexRecoveryPm: number;
  /** 점령 상태 기간(일, 최소 1) */
  readonly occupyDays: number;
  /** 점령 상태 세금 주기(일, 최소 1) */
  readonly occupyTaxEveryDays: number;
  /** 점령 상태 세금 = 도시 주인 국고 ÷ 주인 도시 수 × 이 만분율 */
  readonly occupyTaxBp: number;
  /** 점령 상태가 시작될 때 그 도시 휴먼 만족도 하락(점) */
  readonly occupySatisfactionDrop: number;
  /** NPC 고르기 가중치: 점령·귀속 기본(약탈 = 공격 성향, 점령 상태 = 상업 성향, 0~1000) */
  readonly npcAnnexWeight: number;
}

/**
 * 출발값(모두 [임시], 기획 값 없음 — D-515): 약탈 창고 몫 = 금고 몫(D-186 5000)의 절반, 재건 비용 주거 1당 500(폐허 복원 목표 주거 1당 700보다
 * 조금 싸게 — 복원보다 싸지만 "매우 큼"), 불이익 30일 동안 회복 ⅕(200‰), 점령 상태 30일·7일마다(배당 주기와 같게) 그 도시 몫 국고 10%,
 * 점령 상태 만족도 −10, 점령·귀속 가중 300(공격·상업 성향 0~1000과 견준다)
 */
export const START_WAR_COEFFICIENTS: WarCoefficients = {
  raidGoodsBp: 2500,
  rebuildPerHousing: 500,
  annexPenaltyDays: 30,
  annexRecoveryPm: 200,
  occupyDays: 30,
  occupyTaxEveryDays: 7,
  occupyTaxBp: 1000,
  occupySatisfactionDrop: 10,
  npcAnnexWeight: 300,
};

const DAY_MS = 86_400_000;

/** 만분율 몫(내림, 음수·0은 0) */
export function bpShare(amount: bigint, bp: number): bigint {
  if (amount <= 0n || bp <= 0) return 0n;
  return (amount * BigInt(Math.min(10_000, Math.trunc(bp)))) / 10_000n;
}

/** 점령·귀속 재건 비용(주거 × 주거 1당 값, 음수는 0) */
export function rebuildCost(housing: number, c: WarCoefficients): bigint {
  return BigInt(Math.max(0, Math.trunc(housing))) * BigInt(Math.max(0, Math.trunc(c.rebuildPerHousing)));
}

/** 점령 상태 세금 한 번(도시 주인 국고 ÷ 주인 도시 수 × 만분율) */
export function occupationTax(ownerTreasury: bigint, ownerCities: number, c: WarCoefficients): bigint {
  return bpShare(ownerTreasury, c.occupyTaxBp) / BigInt(Math.max(1, ownerCities));
}

/** 점령 상태가 끝나는 시각과 첫 세금 시각 */
export function occupationWindow(
  nowMs: number,
  c: WarCoefficients,
): { readonly untilMs: number; readonly nextTaxMs: number } {
  return {
    untilMs: nowMs + Math.max(1, Math.trunc(c.occupyDays)) * DAY_MS,
    nextTaxMs: nowMs + Math.max(1, Math.trunc(c.occupyTaxEveryDays)) * DAY_MS,
  };
}

/** 다음 세금 시각(지금 거둔 뒤) */
export function nextOccupationTaxMs(fromMs: number, c: WarCoefficients): number {
  return fromMs + Math.max(1, Math.trunc(c.occupyTaxEveryDays)) * DAY_MS;
}

/** 점령·귀속 불이익이 끝나는 시각(기간 0이면 지금 — 불이익 없음) */
export function annexPenaltyUntil(nowMs: number, c: WarCoefficients): number {
  return nowMs + Math.max(0, Math.trunc(c.annexPenaltyDays)) * DAY_MS;
}

/**
 * 하루 만족도 다가가기의 빠르기(dayPm, labor.ts satisfactionToward에 준다): 불이익 중이고 목표가 지금보다 높으면(회복) annexRecoveryPm,
 * 아니면 1000(내려가는 빠르기는 그대로)
 */
export function recoveryDayPm(
  penalized: boolean,
  milli: number,
  targetMilli: number,
  c: WarCoefficients,
): number {
  if (!penalized || targetMilli <= milli) return 1000;
  return Math.max(0, Math.min(1000, Math.trunc(c.annexRecoveryPm)));
}
