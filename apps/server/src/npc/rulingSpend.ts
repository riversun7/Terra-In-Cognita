// NPC 지배 가문장의 금고 꺼내기·쓰기 규칙식(순수) — 기획 D-576 "가문장이 개인 지갑으로 꺼낼 수 있다"를 NPC에도(D-555 1509 "NPC만으로도 그대로
// 똑같이"·D-212), 쓰는 몫은 D-554 "세력 성향마다 다양한 변수"(질문 2255 다안 — 코디네이터 전달 2026-11-16). docs/adr/2026-11-11-faction-identity.md
// "바뀜 (house-9)". 실행(원장 거래)은 rulingVault.ts가 한다.
// - 꺼내기: 국고로 돌려보낸 뒤 남은 금고 × 꺼내기 몫(설정 칸 house_npc_vault_take_pm) → 가문장(국가 지도자 유닛) 지갑.
// - 쓰기(꺼낸 돈에서, 배당 차례마다 한 번): 가문원 배당 = 몫 × 신앙 성향 배율, 도시 건설 투자 = 몫 × 상업 성향 배율. 배율 = 성향이 가장 낮으면
//   500‰, 가장 높으면 1500‰(가운데 1000‰, 선형). 두 몫 합이 1000‰을 넘으면 비율대로 줄인다. 나머지는 가문장 지갑에 남는다(사치·저축 — 그 돈은
//   가문장 자산 랭킹에 든다). 공격 성향은 국고 지원 쪽(국고로 돌려보내는 몫은 지금 규칙 그대로 상업 성향 — @terra/sim npcRulingVaultReturnPm).
// 정수만 쓴다(정수 나눗셈 — 결정적).

/** 성향 범위와 몫(설정 칸) */
export interface RulingSpendRule {
  readonly traitMin: number;
  readonly traitMax: number;
  /** 꺼내기 몫(‰) */
  readonly takePm: number;
  /** 가문원 배당·도시 건설 투자 몫(‰, 성향 가운데일 때) */
  readonly dividendPm: number;
  readonly investPm: number;
}

/** 한 번 쓰기의 몫(‰ — 꺼낸 돈에 곱한다) */
export interface RulingSpendShares {
  readonly dividendPm: number;
  readonly investPm: number;
}

const clampPm = (value: number): number =>
  Math.min(1000, Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0));

/** 성향 배율(‰): 가장 낮음 500 ~ 가장 높음 1500(범위가 없으면 1000) */
export function traitScalePm(value: number, rule: Pick<RulingSpendRule, "traitMin" | "traitMax">): number {
  const min = Math.min(rule.traitMin, rule.traitMax);
  const max = Math.max(rule.traitMin, rule.traitMax);
  const span = max - min;
  if (span <= 0) return 1000;
  const at = Math.min(max, Math.max(min, Number.isFinite(value) ? Math.trunc(value) : min));
  return 500 + Math.floor(((at - min) * 1000) / span);
}

/** 꺼낸 돈의 배당·투자 몫(‰). 합이 1000을 넘으면 비율대로 줄인다 */
export function rulingSpendShares(
  traits: { readonly faith: number; readonly commerce: number },
  rule: RulingSpendRule,
): RulingSpendShares {
  const dividend = Math.floor((clampPm(rule.dividendPm) * traitScalePm(traits.faith, rule)) / 1000);
  const invest = Math.floor((clampPm(rule.investPm) * traitScalePm(traits.commerce, rule)) / 1000);
  const sum = dividend + invest;
  if (sum <= 1000) return { dividendPm: dividend, investPm: invest };
  return {
    dividendPm: Math.floor((dividend * 1000) / sum),
    investPm: Math.floor((invest * 1000) / sum),
  };
}

/** 꺼낼 양(금고 잔고 × 꺼내기 몫, 내림) */
export const rulingTakeOf = (balance: bigint, rule: Pick<RulingSpendRule, "takePm">): bigint =>
  balance > 0n ? (balance * BigInt(clampPm(rule.takePm))) / 1000n : 0n;

/**
 * 배당을 가문원에게 똑같이 나눈다(가문원 차례 그대로, 내림). 나머지는 나누지 않는다(가문장 지갑에 남는다). 가문원이 없으면 빈 목록
 */
export function splitDividend(total: bigint, members: readonly number[]): { unit: number; amount: bigint }[] {
  if (total <= 0n || members.length === 0) return [];
  const each = total / BigInt(members.length);
  if (each <= 0n) return [];
  return members.map((unit) => ({ unit, amount: each }));
}
