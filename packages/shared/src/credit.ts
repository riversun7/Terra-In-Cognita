// 신용 점수 — 기획 D-581(질문 2374 답)·바뀜 사용자 결정 D-584(2026-11-21 "신용은 한 점수"): 신용은 그 사람이 **속한 나라에 대한 점수 하나**다(도시 신용·나라 신용을
// 따로 두지 않는다). 처음에는 낮게 시작해 그 나라에 속한 기간에 따라 저절로 오르고(상한까지), 사업장을 돌리면 오르며, 세금 체납·빚·쿠데타 가담·같은 나라 유저 공격으로
// 내린다. 빚으로 내린 몫은 **다 갚아야** 돌아온다(일부만 갚으면 그대로 — 2443 가). 자산·세수로 셈하지 않는다(D-147 대체 — 자산은 주민세 과세 기준일 뿐).
// 시작값·소속 기간 상한·크기는 모두 설정 칸. docs/adr/2026-11-21-credit.md "바뀜 (governance-5)". 서버(apps/server/src/credit/)가 몫을 기억하고, 이 파일은 점수 셈과
// 화면 응답 꼴만 둔다. 정수만 쓴다.

/**
 * 내린 까닭: 주민세 빚(debt:resident:…)·사업장 적자(debt:business:…)·유지비 체납(D-150 — 질문 2447 나)은 다 갚으면 되돌린다. 쿠데타 가담·같은 나라 유저 공격은 남는다.
 * 대출 연체는 대출이 생기면 더한다
 */
export type CreditCause = "resident" | "business" | "upkeep" | "coup_join" | "same_nation_attack";

/** 신용 점수 범위(설정 칸 credit_min·credit_max·credit_start) */
export interface CreditRange {
  readonly min: number;
  readonly max: number;
  readonly start: number;
}

/** 점수의 몫: 오른 몫(소속 기간·사업장 운영·보상)과 내린 몫(갚지 않은 빚·남는 벌점) */
export interface CreditParts {
  /** 소속 기간으로 오른 몫(상한을 이미 적용한 값) */
  readonly tenure: number;
  /** 사업장 운영·쿠데타 보상 등으로 쌓인 오른 몫 */
  readonly rise: number;
  /** 내린 몫 합 */
  readonly cut: number;
}

/** 점수 = 시작값 + 오른 몫 − 내린 몫, [아래, 위]로 자른다(아래 > 위로 잘못 정하면 위를 아래로 본다). 음수 몫은 0으로 본다 */
export function creditScore(range: CreditRange, parts: CreditParts): number {
  const lo = Math.trunc(range.min);
  const hi = Math.max(lo, Math.trunc(range.max));
  const up = Math.max(0, Math.trunc(parts.tenure)) + Math.max(0, Math.trunc(parts.rise));
  const value = Math.trunc(range.start) + up - Math.max(0, Math.trunc(parts.cut));
  return Math.min(hi, Math.max(lo, value));
}

/** 소속 기간으로 오른 몫 = ⌊지난 날 수⌋ × 하루 몫, 상한까지(D-584) */
export function tenureRise(sinceMs: number, nowMs: number, perDay: number, cap: number): number {
  const days = Math.max(0, Math.floor((Math.trunc(nowMs) - Math.trunc(sinceMs)) / 86_400_000));
  return Math.min(Math.max(0, Math.trunc(cap)), days * Math.max(0, Math.trunc(perDay)));
}

/** 내린 몫 한 줄 */
export interface CreditMarkView {
  readonly cause: CreditCause;
  /** 내린 점수 */
  readonly points: number;
  /** 횟수(주민세는 못 낸 주기 수, 유지비는 못 낸 시간 수, 사업장 적자는 1, 벌점은 일어난 수) */
  readonly count: number;
  readonly sinceMs: number;
}

/** 신용 한 줄: 주체(주인 자신 또는 그 주인의 유닛) × 나라 */
export interface CreditLine {
  readonly subject: "owner" | "unit";
  /** 유닛 몫이면 그 유닛(집 몫 주민세 — 유닛 지갑에서 낸다) */
  readonly unitId: number | null;
  /** 그 나라 = 국고 주인 ID */
  readonly nationId: number;
  /** 내가 지금 속한 나라 줄인가(아니면 옛 나라에 남은 내린 몫 줄 — 화면이 #ID로 보인다) */
  readonly current: boolean;
  readonly score: number;
  /** 소속 기간으로 오른 몫(유닛 줄은 0 — 주인·유닛 신용 따로, D-588 2495 나) */
  readonly tenure: number;
  /** 사업장 운영·보상으로 오른 몫 */
  readonly rise: number;
  readonly marks: readonly CreditMarkView[];
}

/** economy.credit 응답 — 내 신용(지금 속한 나라 줄 + 내린 몫이 남은 나라 줄) */
export interface CreditResponse {
  readonly generatedAt: number;
  readonly status: "ready" | "not_ready";
  readonly range: CreditRange;
  readonly lines: readonly CreditLine[];
}
