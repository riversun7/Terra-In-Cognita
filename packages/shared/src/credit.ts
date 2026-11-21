// 신용 점수 — 기획 D-581(질문 2374 답: 신용은 도시 주민·나라 주민에게 붙는다 — 도시 신용과 나라 신용을 따로, 주민세 빚·대출 연체·사업장 적자 등으로 깎이고
// 빚을 갚으면 바로 회복, 은행 지급준비·대출 한도(D-138)·국가 채권(D-147)·세금 등급 등에 쓴다, 점수 범위·깎는 크기는 설정 칸).
// docs/adr/2026-11-21-credit.md. 서버(apps/server/src/credit/)가 깎은 몫을 기억하고, 이 파일은 점수 셈과 화면 응답 꼴만 둔다. 정수만 쓴다.

/** 깎은 까닭: 주민세 빚(debt:resident:…)·사업장 적자(debt:business:…). 대출 연체는 대출이 생기면 더한다 */
export type CreditCause = "resident" | "business";

/** 신용 점수 범위(설정 칸 credit_min·credit_max·credit_start) */
export interface CreditRange {
  readonly min: number;
  readonly max: number;
  readonly start: number;
}

/** 점수 = 시작값 − 깎은 몫 합, [아래, 위]로 자른다(아래 > 위로 잘못 정하면 위를 아래로 본다). 깎은 몫이 음수면 0으로 본다 */
export function creditScore(range: CreditRange, cut: number): number {
  const lo = Math.trunc(range.min);
  const hi = Math.max(lo, Math.trunc(range.max));
  const value = Math.trunc(range.start) - Math.max(0, Math.trunc(cut));
  return Math.min(hi, Math.max(lo, value));
}

/** 깎은 몫 한 줄(갚지 않은 빚 하나) */
export interface CreditMarkView {
  readonly cause: CreditCause;
  /** 도시 신용에서 깎은 점수 */
  readonly cityPoints: number;
  /** 나라 신용에서 깎은 점수 */
  readonly nationPoints: number;
  /** 깎은 횟수(주민세는 못 낸 주기 수, 사업장 적자는 1) */
  readonly count: number;
  readonly sinceMs: number;
}

/** 신용 한 줄: 주체(주인 자신 또는 그 주인의 유닛) × 도시(그 도시의 나라 신용을 함께) */
export interface CreditLine {
  readonly subject: "owner" | "unit";
  /** 유닛 몫이면 그 유닛(집 몫 주민세 — 유닛 지갑에서 낸다) */
  readonly unitId: number | null;
  readonly cityId: number;
  /** 아는 도시면 이름(모르는 도시는 null — 화면이 #ID로 보인다) */
  readonly cityName: string | null;
  /** 그 도시를 다스리는(깎을 때의) 나라 = 국고 주인 ID */
  readonly nationId: number;
  readonly cityScore: number;
  readonly nationScore: number;
  readonly marks: readonly CreditMarkView[];
}

/** economy.credit 응답 — 내 신용(깎인 곳만. 없으면 모든 도시·나라에서 시작값) */
export interface CreditResponse {
  readonly generatedAt: number;
  readonly status: "ready" | "not_ready";
  readonly range: CreditRange;
  readonly lines: readonly CreditLine[];
}
