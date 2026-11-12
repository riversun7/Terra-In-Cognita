// 1차 스탯 성장·초기 스탯 합 상한 — 기획 D-417(성장 곱셈형), D-534(초기 합: 사이보그 60, 크리쳐·휴먼 최대 80, BM 포함 어떤 경우에도 100 이하).
// 판정(@terra/sim combat/stats.ts가 다시 내보낸다 — 식은 여기 하나)과 화면 미리 보기(생산 편집기 예상 채집 확률표)가 같은 함수를 쓴다.
// 정수 연산만 쓴다(판정 코드 규칙).

/**
 * 초기 스탯 합의 절대 상한(D-534 사용자 원문 "bm요소나 어떠한 경우에도 상한 100을 지키는 쪽으로"). 설정 칸이 아니다 — 설정 칸(사이보그 합 N9,
 * 휴먼·크리쳐 최대)은 이 값을 넘을 수 없다(설정 칸 여러 칸 검사 stat_sum_cap)
 */
export const STAT_SUM_ABSOLUTE_MAX = 100;

/** 1차 스탯 성장(D-417): 초기 × (1000 + 성장률‰ × K‰ × (Lv − 1) ÷ 1000) ÷ 1000 */
export function primaryAtLevel(initial: number, growthPm: number, kPm: number, level: number): number {
  const factor = 1000 + Math.floor((growthPm * kPm * (level - 1)) / 1000);
  return Math.floor((initial * factor) / 1000);
}

/**
 * 초기 스탯 칸들의 합을 max 이하로 줄인다(D-534). 합이 max 이하면 그대로(복사본). 넘으면 칸 값 비례로 나눈 몫(가장 큰 나머지, 같으면 칸 차례
 * 앞쪽)으로 줄인다 — 칸마다 원래 값을 넘지 않는다. max는 STAT_SUM_ABSOLUTE_MAX로 다시 묶는다. 음수·정수 아닌 칸은 0으로 본다
 */
export function capStatSum(stats: readonly number[], max: number): number[] {
  const values = stats.map((value) => (Number.isInteger(value) && value > 0 ? value : 0));
  const limit = Math.max(0, Math.min(STAT_SUM_ABSOLUTE_MAX, Math.trunc(max)));
  const total = values.reduce((acc, value) => acc + value, 0);
  if (total <= limit) return values;
  const parts = values.map((value, index) => {
    const scaled = value * limit;
    return { index, value: Math.floor(scaled / total), rest: scaled % total };
  });
  let spare = limit - parts.reduce((acc, part) => acc + part.value, 0);
  for (const part of parts.toSorted((a, b) => b.rest - a.rest || a.index - b.index)) {
    if (spare <= 0) break;
    part.value += 1;
    spare -= 1;
  }
  return parts.map((part) => part.value);
}

/** 칸들의 합 */
export function statSum(stats: readonly number[]): number {
  return stats.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
}
