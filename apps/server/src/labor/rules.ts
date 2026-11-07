// 노동 계약이 쓰는 규칙 값(서버) — docs/adr/2026-11-03-labor-contracts.md
// 세력·사회 계수표(설정 칸 실효 값)에서 N48 규칙과 임금 식(N27 기준 단가·N28 고용주 조정)을 꺼낸다. 부를 때마다 읽는다(live).
// 단가: D-432는 도시 노동 시장(일손 수요·공급)이 정한다고 했고 식(@terra/sim baseWageRateMilli)도 있지만, 서버에는 아직 도시별
// 일손 수요·공급을 세는 곳이 없다(옛 프로젝트도 같았다: salary_engine.js:159-163 getMarketRate "현재는 기본 단가 사용").
// 그래서 지금 단가는 N27 기준 단가 그대로다(도시마다 같다).
import { type LaborRules, type SocietyCoefficients, defaultGatherStat } from "@terra/sim";

export interface WageRules {
  readonly labor: LaborRules;
  /** [임시] 기준 유닛 효율점수 = 새 유닛 평균 1차 스탯 하나(유닛 스탯이 서버에 아직 없다, N9 초기 합 ÷ 6) */
  readonly efficiency: number;
  /** 단가(효율 1점당 밀리 화폐) = N27 기준 단가(도시 노동 시장이 아직 없다) */
  readonly rateMilli: number;
  readonly adjustMinPm: number;
  readonly adjustMaxPm: number;
  readonly society: SocietyCoefficients;
}

export function wageRulesOf(c: SocietyCoefficients): WageRules {
  return {
    labor: c.labor,
    efficiency: defaultGatherStat(c.cyborg.initialSum),
    rateMilli: c.wageRateMilli,
    adjustMinPm: c.employerAdjustMinPm,
    adjustMaxPm: c.employerAdjustMaxPm,
    society: c,
  };
}
