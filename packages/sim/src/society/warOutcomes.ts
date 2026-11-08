// 공성 결과 셋 — 기획 D-520·D-527(사용자 원문 "1.약탈 : 해당 정부가 재건될때까지 창고 등의 자원을 약탈세력은 자유롭게 꺼내갈 수 있음. 해당
// 세력재건시 다시 전쟁. 2.귀속 : 재건시도. 3.점령 : 기존 세력이 체제는 유지하나 세금 등의 재정을 가져감."), 45 §10.4·46 §5.1 ①,
// docs/adr/2026-11-07-war-outcomes.md "바뀜 (D-527)". 공성 패배 = 그 도시 정부가 무너진 것이다. 이긴 쪽이 셋 가운데 하나를 고른다(고르기는 부르는
// 쪽: NPC 규칙식 npc/policy.ts occupationChoice, 유저 세력 층이 생기면 유저 명령). 이 파일은 수만 셈한다(순수 함수, 정수만):
// - 약탈(loot): 소유는 옛 세력 그대로. 옛 세력이 정부를 재건할 때까지 약탈 세력이 하루마다 그 도시 금고 몫(lootTakeBp)과 공공 창고 몫(raidGoodsBp —
//   그 도시 창고의 도시 주인 세력 물건)을 꺼내 간다(NPC의 "자유롭게 꺼내 감"을 하루 몫으로). 옛 세력은 govRebuildDays가 지나면 재건 비용
//   (주거 × govRebuildPerHousing, 모자라면 있는 만큼)을 내고 정부를 다시 세운다 → 다시 전쟁.
// - 점령·귀속(integrate): 도시를 가져가 재건을 시도한다(46 §5.1 ②~⑤ 그대로). 재건 비용 = 주거 × rebuildPerHousing(점령자 국고에서 소각), 그 도시
//   휴먼 만족도 회복이 annexPenaltyDays 동안 annexRecoveryPm ‰ 빠르기로만 오른다(충성도 칸이 아직 없어 만족도로 대신 — 확인 대기 682).
// - 점령 상태(occupy): 옛 세력이 체제를 유지하고 점령자가 occupyTaxEveryDays마다 그 도시 몫 세금(도시 주인 국고 ÷ 주인 도시 수 × occupyTaxBp)을
//   가져간다. 정해진 끝은 없다: 저절로 회복(occupyDays, 약 7일)·옛 세력이 힘을 회복(유닛 수 ≥ 점령자 × occupyExpelStrengthPm ‰)·반란 등으로
//   도시 주인이 바뀜·한쪽 세력이 사라짐으로 끝난다.

/** 공성 결과 셋(저장된 값이라 이름을 바꾸지 않는다): 약탈 · 점령·귀속 · 점령 상태 */
export const WAR_OUTCOMES = ["loot", "integrate", "occupy"] as const;
export type WarOutcome = (typeof WAR_OUTCOMES)[number];

export const isWarOutcome = (value: unknown): value is WarOutcome =>
  typeof value === "string" && (WAR_OUTCOMES as readonly string[]).includes(value);

/** 남은 상태가 끝난 까닭(D-527, 표 war_outcomes.end_reason에 저장된 값이라 이름을 바꾸지 않는다) */
export const WAR_STATE_END_REASONS = [
  "rebuilt", // 약탈: 옛 세력이 정부를 재건했다(다시 전쟁)
  "recovered", // 점령 상태: 저절로 회복했다
  "expelled", // 점령 상태: 옛 세력이 힘을 회복해 몰아냈다
  "owner_changed", // 도시 주인이 바뀌었다(다른 점령·반란·독립·폐허)
  "gone", // 점령자나 주인 세력이 사라졌다
  "replaced", // 같은 도시에 새 공성 결과가 왔다
  "expired", // 점령·귀속 회복 불이익 기간이 끝났다
] as const;
export type WarStateEndReason = (typeof WAR_STATE_END_REASONS)[number];

export const isWarStateEndReason = (value: unknown): value is WarStateEndReason =>
  typeof value === "string" && (WAR_STATE_END_REASONS as readonly string[]).includes(value);

/** 공성 결과 계수(팩 tuning 경로 "war.*", 49에 칸이 없어 d520_*·d527_* — 모두 [임시]) */
export interface WarCoefficients {
  /** 약탈: 정부 재건 전까지 하루마다 꺼내 가는 그 도시 창고의 도시 주인 세력 물건 몫(만분율, 남은 것의). 금고 몫은 lootTakeBp(D-186) */
  readonly raidGoodsBp: number;
  /** 약탈: 옛 세력이 정부를 재건할 수 있게 되기까지 날 수(최소 1) */
  readonly govRebuildDays: number;
  /** 약탈: 옛 세력의 정부 재건 비용 = 주거 1당 이 값(옛 세력 국고 화폐 최소 단위, 소각). 모자라면 있는 만큼 내고 재건한다 */
  readonly govRebuildPerHousing: number;
  /** 점령·귀속 재건 비용 = 주거 1당 이 값(점령자 국고 화폐 최소 단위, 소각). 국고가 모자라면 NPC는 고르지 않는다 */
  readonly rebuildPerHousing: number;
  /** 점령·귀속 불이익 기간(일, 0 = 없음) */
  readonly annexPenaltyDays: number;
  /** 불이익 동안 만족도가 오르는 빠르기(‰, 1000 = 평소). 내려가는 빠르기는 그대로 */
  readonly annexRecoveryPm: number;
  /** 점령 상태 자율 회복 날 수(D-527 "7일가량", 최소 1). 정해진 끝이 아니라 저절로 벗어나는 데 걸리는 날 */
  readonly occupyDays: number;
  /** 점령 상태 세금 주기(일, 최소 1) */
  readonly occupyTaxEveryDays: number;
  /** 점령 상태 세금 = 도시 주인 국고 ÷ 주인 도시 수 × 이 만분율 */
  readonly occupyTaxBp: number;
  /** 점령 상태가 시작될 때 그 도시 휴먼 만족도 하락(점) */
  readonly occupySatisfactionDrop: number;
  /** 점령 상태: 옛 세력 유닛 수가 점령자 유닛 수 × 이 ‰ 이상이면 몰아낸다(0 = 힘으로는 끝나지 않음) */
  readonly occupyExpelStrengthPm: number;
  /** NPC 고르기 가중치: 점령·귀속 기본(약탈 = 공격 성향, 점령 상태 = 상업 성향, 0~1000) */
  readonly npcAnnexWeight: number;
}

/**
 * 출발값(모두 [임시], 기획 값 없음 — D-515): 약탈 창고 몫 하루 25%, 정부 재건 7일(점령 자율 회복과 같게)·주거 1당 200(점령·귀속 재건 500보다
 * 싸게 — 제 도시 정부만 다시 세움), 점령·귀속 재건 비용 주거 1당 500(폐허 복원 목표 주거 1당 700보다 조금 싸게 — "매우 큼"), 불이익 30일 동안 회복
 * ⅕(200‰), 점령 상태 자율 회복 7일(D-527 "7일가량")·하루마다 그 도시 몫 국고 10%·만족도 −10, 몰아내기 = 옛 세력 유닛이 점령자의 1.2배,
 * 점령·귀속 가중 300(공격·상업 성향 0~1000과 견준다)
 */
export const START_WAR_COEFFICIENTS: WarCoefficients = {
  raidGoodsBp: 2500,
  govRebuildDays: 7,
  govRebuildPerHousing: 200,
  rebuildPerHousing: 500,
  annexPenaltyDays: 30,
  annexRecoveryPm: 200,
  occupyDays: 7,
  occupyTaxEveryDays: 1,
  occupyTaxBp: 1000,
  occupySatisfactionDrop: 10,
  occupyExpelStrengthPm: 1200,
  npcAnnexWeight: 300,
};

const DAY_MS = 86_400_000;

/** 만분율 몫(내림, 음수·0은 0) */
export function bpShare(amount: bigint, bp: number): bigint {
  if (amount <= 0n || bp <= 0) return 0n;
  return (amount * BigInt(Math.min(10_000, Math.trunc(bp)))) / 10_000n;
}

/** 약탈 뒤 옛 세력이 정부를 재건할 수 있게 되는 시각 */
export function govRebuildFrom(nowMs: number, c: WarCoefficients): number {
  return nowMs + Math.max(1, Math.trunc(c.govRebuildDays)) * DAY_MS;
}

/** 옛 세력의 정부 재건 비용(주거 × 주거 1당 값, 음수는 0) */
export function govRebuildCost(housing: number, c: WarCoefficients): bigint {
  return BigInt(Math.max(0, Math.trunc(housing))) * BigInt(Math.max(0, Math.trunc(c.govRebuildPerHousing)));
}

/** 점령·귀속 재건 비용(주거 × 주거 1당 값, 음수는 0) */
export function rebuildCost(housing: number, c: WarCoefficients): bigint {
  return BigInt(Math.max(0, Math.trunc(housing))) * BigInt(Math.max(0, Math.trunc(c.rebuildPerHousing)));
}

/** 점령 상태 세금 한 번(도시 주인 국고 ÷ 주인 도시 수 × 만분율) */
export function occupationTax(ownerTreasury: bigint, ownerCities: number, c: WarCoefficients): bigint {
  return bpShare(ownerTreasury, c.occupyTaxBp) / BigInt(Math.max(1, ownerCities));
}

/** 점령 상태가 저절로 회복되는 시각과 첫 세금 시각 */
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

/** 옛 세력이 힘을 회복해 점령자를 몰아내는가(유닛 수 비교, 옛 세력 유닛이 0이면 아니다) */
export function occupationExpelled(
  ownerStrength: number,
  occupierStrength: number,
  c: WarCoefficients,
): boolean {
  const pm = Math.trunc(c.occupyExpelStrengthPm);
  if (pm <= 0 || ownerStrength <= 0) return false;
  return ownerStrength * 1000 >= Math.max(0, occupierStrength) * pm;
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
