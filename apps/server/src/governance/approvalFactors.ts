// 지도자 신임도 오르내림(줄기 gov-coup — 사용자 결정 D-588 2493 "알아서": 세금을 올리면 내리고 내리면 오른다, 전쟁 자체는 벌점이지만 승리하면 오른다, 그 밖의 알맞은 것).
// 기술 기본값 — 크기는 모두 설정 칸(gov_approval_*), 식은 [임시](질문 2541). 순수 함수: 의결 틱(leaderAgendas.ts)이 지난 틱에 본 값(표 governance_approval 칸 넷)과 지금 값을 넘긴다.
// - 세금(사건): 나라 세금 수준(‰ = 소득세 bp ÷ 10 + 주민세 ‰ + 거래세 bp ÷ 10 — 세율 안건 폭과 같은 단위, 2407 가)이 오른 만큼 × gov_approval_tax_per_pm 내림, 내린 만큼 올림.
// - 전쟁(사건): 새 전쟁 하나마다 gov_approval_war_start 내림, 끝난 전쟁(강화·상대가 사라짐) 하나마다 gov_approval_peace 올림.
// - 도시(사건 — 승리·패배): 늘어난 도시 하나마다 gov_approval_city_won 올림(점령), 줄어든 도시 하나마다 gov_approval_city_lost 내림(빼앗김·반란·독립·쿠데타로 떨어져 나감).
// - 하루마다(실제 하루, 밀린 날은 7일까지): 지금 하는 전쟁 하나마다 gov_approval_war_daily 내림, 그다음 주민 평균 만족도(0~100 × 10) 쪽으로 남은 차이의 gov_approval_satisfaction_pull_pm‰만큼
//   다가간다(만족도를 모르는 나라 — 플레이어 가문 나라 — 는 건너뜀).
// - 처음 보는 값(칸 null — 배포 직후·지배 가문이 바뀐 뒤)은 기준만 적고 바꾸지 않는다. 결과는 0~1000.
import { APPROVAL_MAX } from "./approval.ts";

/** 하루(실제 시간 — 신임도의 하루 셈) */
export const APPROVAL_DAY_MS = 86_400_000;
/** 밀린 하루 셈 상한(서버가 오래 꺼져 있었을 때) */
const MAX_CATCH_UP_DAYS = 7;

export interface ApprovalFactorRules {
  /** 해임·반란 보정 기준점(‰ — 이 값 아래에서만 쉬워진다) */
  readonly neutralPm: number;
  readonly taxPerPm: number;
  readonly warStart: number;
  readonly warDaily: number;
  readonly peace: number;
  readonly cityWon: number;
  readonly cityLost: number;
  readonly satisfactionPullPm: number;
}

/** 지난 틱에 본 값(null = 아직 보지 않음) */
export interface ApprovalSnapshot {
  readonly taxLevelPm: number | null;
  readonly cities: number | null;
  readonly wars: number | null;
  readonly dayAtMs: number | null;
}

/** 지금 본 나라 */
export interface ApprovalObservation {
  /** 세금 수준(‰). 모르면 undefined(세금 칸은 건너뛰고 기준도 그대로) */
  readonly taxLevelPm: number | undefined;
  readonly cities: number;
  readonly wars: number;
  /** 주민 평균 만족도(0~100). 모르면 undefined */
  readonly satisfaction: number | undefined;
}

/** 한 번 셈한 바뀜(감사·시험용 — 칸마다 더한 점) */
export interface ApprovalChanges {
  readonly tax: number;
  readonly warStart: number;
  readonly peace: number;
  readonly cityWon: number;
  readonly cityLost: number;
  readonly warDaily: number;
  readonly satisfaction: number;
}

export interface ApprovalStep {
  readonly approval: number;
  readonly snapshot: ApprovalSnapshot;
  readonly changes: ApprovalChanges;
}

const clamp = (value: number): number => Math.min(APPROVAL_MAX, Math.max(0, Math.trunc(value)));

/** 세금 수준(‰): 소득세 bp ÷ 10 + 주민세 ‰ + 거래세 bp ÷ 10(정하지 않은 칸 = 0). 모두 모르면 undefined */
export function taxLevelPm(taxes: {
  readonly incomeTaxBp?: number | null | undefined;
  readonly residentTaxPm?: number | null | undefined;
  readonly tradeTaxBp?: number | null | undefined;
}): number | undefined {
  const parts = [
    taxes.incomeTaxBp === null || taxes.incomeTaxBp === undefined ? undefined : taxes.incomeTaxBp / 10,
    taxes.residentTaxPm ?? undefined,
    taxes.tradeTaxBp === null || taxes.tradeTaxBp === undefined ? undefined : taxes.tradeTaxBp / 10,
  ].filter((part): part is number => part !== undefined);
  return parts.length === 0 ? undefined : Math.trunc(parts.reduce((sum, part) => sum + part, 0));
}

/** 신임도 한 걸음(위 머리 주석) */
export function stepApproval(
  approval: number,
  snapshot: ApprovalSnapshot,
  seen: ApprovalObservation,
  rules: ApprovalFactorRules,
  nowMs: number,
): ApprovalStep {
  let value = clamp(approval);
  const changes = {
    tax: 0,
    warStart: 0,
    peace: 0,
    cityWon: 0,
    cityLost: 0,
    warDaily: 0,
    satisfaction: 0,
  };
  // 세금 수준: 오르면 내리고 내리면 오른다
  if (seen.taxLevelPm !== undefined && snapshot.taxLevelPm !== null)
    changes.tax = -(seen.taxLevelPm - snapshot.taxLevelPm) * rules.taxPerPm;
  // 전쟁 수: 새 전쟁은 벌점, 끝난 전쟁은 오름
  if (snapshot.wars !== null) {
    const diff = seen.wars - snapshot.wars;
    if (diff > 0) changes.warStart = -diff * rules.warStart;
    else if (diff < 0) changes.peace = -diff * rules.peace;
  }
  // 도시 수: 얻으면(승리) 오르고 잃으면 내린다
  if (snapshot.cities !== null) {
    const diff = seen.cities - snapshot.cities;
    if (diff > 0) changes.cityWon = diff * rules.cityWon;
    else if (diff < 0) changes.cityLost = diff * rules.cityLost;
  }
  value = clamp(value + changes.tax + changes.warStart + changes.peace + changes.cityWon + changes.cityLost);
  // 하루마다: 전쟁 벌점, 만족도 쪽으로 다가감
  let dayAtMs = snapshot.dayAtMs ?? nowMs;
  const days = Math.min(MAX_CATCH_UP_DAYS, Math.floor((nowMs - dayAtMs) / APPROVAL_DAY_MS));
  if (days > 0) {
    for (let day = 0; day < days; day += 1) {
      const before = value;
      value = clamp(value - seen.wars * rules.warDaily);
      changes.warDaily += value - before;
      if (seen.satisfaction !== undefined && rules.satisfactionPullPm > 0) {
        const target = clamp(seen.satisfaction * 10);
        const pulled = clamp(value + Math.trunc(((target - value) * rules.satisfactionPullPm) / 1000));
        changes.satisfaction += pulled - value;
        value = pulled;
      }
    }
    // 밀린 날이 상한을 넘으면 기준 시각을 지금으로 당긴다(다음 하루는 지금부터)
    dayAtMs =
      nowMs - dayAtMs >= (MAX_CATCH_UP_DAYS + 1) * APPROVAL_DAY_MS ? nowMs : dayAtMs + days * APPROVAL_DAY_MS;
  }
  return {
    approval: value,
    snapshot: {
      taxLevelPm: seen.taxLevelPm ?? snapshot.taxLevelPm,
      cities: seen.cities,
      wars: seen.wars,
      dayAtMs,
    },
    changes,
  };
}

/** 두 기준값이 같은가(바뀌지 않았으면 쓰지 않는다) */
export function sameSnapshot(a: ApprovalSnapshot, b: ApprovalSnapshot): boolean {
  return (
    a.taxLevelPm === b.taxLevelPm && a.cities === b.cities && a.wars === b.wars && a.dayAtMs === b.dayAtMs
  );
}
