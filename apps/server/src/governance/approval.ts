// 바뀜(줄기 gov-coup — 사용자 결정 D-588 2493 "알아서"): 오르내림은 approvalFactors.ts(세금·전쟁·도시·만족도). 고리 둘은 기준점(gov_approval_neutral_pm, 출발값 500) 아래에서만
// 쉬워진다: 보정 = ⌊폭 × (기준점 − 신임도) ÷ 기준점⌋(신임도 ≥ 기준점이면 0). 폭 출발값 = 해임 300‰·반란 15점(옛 0 = 효과 없음). 기준점을 1000으로 두면 옛 식과 같다.
// 지도자 신임도(줄기 governance-5 — 사용자 답 D-585 "신임도 = 주민이 지도자를 얼마나 믿나, 신용과 다른 새 값. 플레이어 지도자는 낮게 시작, 낮으면 해임 투표·반란이 쉽다").
// 오르고 내리는 규칙은 approvalFactors.ts(줄기 gov-coup — D-588 2493). 여기는 값 자리와 고리:
// - 저장: 표 governance_approval(나라마다 지금 지배 가문의 신임도 한 줄). 지배 가문이 바뀌면 그 가문 종류의 시작값으로 다시 적는다(플레이어 지도자 =
//   gov_approval_player_start, NPC 지도자 = gov_approval_npc_start). 빈자리면 줄을 그대로 둔다(지도자가 없어 고리가 쓰지 않는다).
// - 해임 투표 고리: 해임 가결 문턱 − ⌊gov_approval_removal_ease_pm × (1000 − 신임도) ÷ 1000⌋ [임시 식] (칸 출발값 0 = 보정 없음).
// - 반란 고리(@terra/sim SimHooks.rebellionThresholdShift — npc/governanceHooks.ts): 반란 문턱 + ⌊gov_approval_rebellion_ease × (1000 − 신임도) ÷ 1000⌋ [임시 식]
//   (칸 출발값 0 = 보정 없음). 거울 세계마다 표(WeakMap)를 두고 의결 틱이 채운다.
// 신임도는 0~1000(‰) 정수.

/** 신임도 범위 위 끝 */
export const APPROVAL_MAX = 1000;

const clampApproval = (value: number): number => Math.min(APPROVAL_MAX, Math.max(0, Math.trunc(value)));

/** 기준점 아래 몫으로 폭을 나눈 보정(기준점 이상이면 0) */
function easeBelow(width: number, approval: number, neutralPm: number): number {
  const pivot = Math.min(APPROVAL_MAX, Math.max(1, Math.trunc(neutralPm)));
  const gap = pivot - clampApproval(approval);
  return gap <= 0 ? 0 : Math.floor((Math.trunc(width) * gap) / pivot);
}

/** 해임 가결 문턱(‰): 신임도가 기준점보다 낮을수록 낮아진다(ease 0 = 그대로). 1 아래로는 내리지 않는다 */
export function removalThresholdWithApproval(
  basePm: number,
  approval: number | undefined,
  easePm: number,
  neutralPm: number = APPROVAL_MAX,
): number {
  if (approval === undefined || easePm <= 0) return basePm;
  return Math.max(1, basePm - easeBelow(easePm, approval, neutralPm));
}

/** 반란 문턱 보정(만족도 점): 신임도가 기준점보다 낮을수록 크다(ease 0 = 0) */
export function rebellionShiftOf(
  approval: number | undefined,
  easePoints: number,
  neutralPm: number = APPROVAL_MAX,
): number {
  if (approval === undefined || easePoints <= 0) return 0;
  return easeBelow(easePoints, approval, neutralPm);
}

/** 거울 세계(시뮬 세계 객체)마다 나라(세력 ID = 소유 주체 ID) → 반란 문턱 보정 */
const shifts = new WeakMap<object, Map<number, number>>();

/** 의결 틱이 반란 문턱 보정 표를 바꾼다 */
export function setRebellionShifts(world: object, table: ReadonlyMap<number, number>): void {
  shifts.set(world, new Map(table));
}

/** 그 나라의 반란 문턱 보정(없으면 0) */
export function rebellionShift(world: object | undefined, factionId: number): number {
  return world ? (shifts.get(world)?.get(factionId) ?? 0) : 0;
}
