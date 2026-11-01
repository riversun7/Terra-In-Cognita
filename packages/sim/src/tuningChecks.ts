// 설정 칸 여러 칸 규칙 검사 — docs/adr/2026-11-01-dev-settings-panel.md 3절(D1)
// 칸마다의 기술 범위(팩 min·max)로는 막지 못하는 것: 합·순서처럼 여러 칸이 함께 맞아야 하는 것. 어기면 규칙 함수가 던지거나
// (예: rollStatSpread의 N9 RangeError → 사이보그 굴리기가 모두 실패) 뜻이 뒤집힌다(하한 > 상한).
// 팩 값은 문제가 없어야 하고(tuningChecks.test.ts가 팩을 읽어 본다), 서버는 덮어쓰기가 새 문제를 만들면 받지 않는다.
// 문제 코드 목록은 @terra/shared TUNING_PROBLEMS(화면 문구 표가 같은 목록을 쓴다).
import { BASIC_ELEMENTS, ELEMENT_MAX } from "@terra/shared/cyborg";
import type { TuningProblem } from "@terra/shared/tuning";
import type { SocietyCoefficients } from "./society/coefficients.ts";

/** 1차 스탯 수(N9 합을 칸마다 나눈다) */
const PRIMARY_COUNT = 6;
/** 행 식의 1차 변수 이름(가중치 칸 차례) */
const PRIMARY_VAR_NAMES = ["STR", "DEX", "AGI", "VIT", "INT", "WIS"];

/** 오르는 차례인가(같은 값 허용) */
const ascending = (values: readonly number[]): boolean =>
  values.every((value, index) => index === 0 || (values[index - 1] ?? value) <= value);

/** 세력·사회 계수표(팩 값 + 덮어쓰기를 얹은 것)의 여러 칸 문제. 없으면 빈 목록. 차례는 TUNING_PROBLEMS 차례 */
export function tuningProblems(c: SocietyCoefficients): TuningProblem[] {
  const problems: TuningProblem[] = [];
  const cy = c.cyborg;
  // N9: 칸 최소 ≥ 1, 최소 ≤ 최대, 최소 × 6 ≤ 합 ≤ 최대 × 6 (rollStatSpread가 던지는 조건과 같다)
  if (
    cy.initialMin < 1 ||
    cy.initialMin > cy.initialMax ||
    cy.initialMin * PRIMARY_COUNT > cy.initialSum ||
    cy.initialMax * PRIMARY_COUNT < cy.initialSum
  )
    problems.push("n9_fit");
  // N6: K 범위(kFromRolls: 최소 + (최대 − 최소 + 1) × 굴림)
  if (cy.kMinPm < 1 || cy.kMinPm > cy.kMaxPm) problems.push("n6_order");
  // N36: 기본 4원소 안 칸 수, 점수는 칸 × 칸 상한(10) 이하(아니면 만들기 분배가 늘 실패한다)
  if (
    cy.elementCells < 1 ||
    cy.elementCells > BASIC_ELEMENTS.length ||
    cy.elementPoints < 0 ||
    cy.elementPoints > cy.elementCells * ELEMENT_MAX
  )
    problems.push("n36_fit");
  // N39: 배율 최소 ≤ 최대
  if (cy.grantMinPm > cy.grantMaxPm) problems.push("n39_order");
  // D-6041: 붐빔 보통 ≤ 붐빔
  if (cy.startCrowdNormal > cy.startCrowdBusy) problems.push("crowd_order");
  // S26·N35: 민심 표 문턱 반란 ≤ 예고 ≤ 태업(@terra/shared unrestLevel이 이 차례로 본다)
  if (!ascending([c.rebellionThreshold, c.rebellionWarningAt, c.sabotageAt])) problems.push("unrest_order");
  // T4: 수명 최소 ≤ 최대
  if (c.lifespanMinMs > c.lifespanMaxMs) problems.push("lifespan_order");
  // N21·N23: 피로 구간 시작이 오르고 피로 상한 이하
  const bandStarts = c.fatigueBands.map((band) => band.from);
  if (!ascending(bandStarts) || (bandStarts.at(-1) ?? 0) > c.fatigueMax) problems.push("fatigue_order");
  // N27: 단가 하한 ≤ 상한
  if (c.wageRateMinPm > c.wageRateMaxPm) problems.push("wage_order");
  // N28: 고용주 조정 하한 ≤ 상한
  if (c.employerAdjustMinPm > c.employerAdjustMaxPm) problems.push("employer_order");
  // N33: 포만감 효율 구간 문턱이 오른다
  if (!ascending(c.foodEfficiency.map((band) => band.atMost))) problems.push("food_order");
  return problems;
}

/** after에만 있는 문제(덮어쓰기가 새로 만든 것). 이미 있던 문제는 막지 않는다(고치는 길을 막지 않게) */
export function newTuningProblems(
  before: readonly TuningProblem[],
  after: readonly TuningProblem[],
): TuningProblem[] {
  return after.filter((problem) => !before.includes(problem));
}

/**
 * 가중치 표(stat_rows 실효 표, 켜진 행)의 여러 칸 문제 — docs/adr/2026-11-01-balance-screen.md 1절.
 * 모든 행에서 가중치가 0인 1차 스탯이 있으면 stat_primary_unused(그 1차는 어느 2차 스탯에도 들지 않는다, D-458 "가치 없는 1차").
 * 더 약한 신호(+10 승률이 오르지 않음)는 밸런스 화면이 보이기만 한다
 */
export function statTableProblems(
  table: readonly {
    readonly weights: readonly number[];
    readonly formula?: { readonly vars: readonly string[] } | undefined;
  }[],
): TuningProblem[] {
  // 표가 없으면(가중치 표를 싣지 않은 접근자·시험) 볼 것이 없다
  if (table.length === 0) return [];
  // 행 식이 있는 행은 식이 쓰는 1차 변수로 본다(docs/adr/2026-11-01-formula-editor.md)
  const uses = (row: (typeof table)[number], column: number): boolean =>
    row.formula
      ? row.formula.vars.includes(PRIMARY_VAR_NAMES[column] ?? "")
      : (row.weights[column] ?? 0) !== 0;
  for (let column = 0; column < PRIMARY_COUNT; column++)
    if (table.every((row) => !uses(row, column))) return ["stat_primary_unused"];
  return [];
}
