// 숙소 회복·채집소 옮김(물류) — 질문 1047 다·1049 나·1050 가(기획 정리 D-533 "1047~1055 추천대로", 사용자 원문 2026-11-11 "숙소는 노동자
// 회복 루트, 창고와 원자재채집소와의 관계도 고려"). docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)".
// - 숙소 회복(기획 48 §7.1 D-430): 회복 = 기본 × 주거 등급 배율 × 만족도 배율 × 노숙 배율, 숙소 ×1.5~3 → 숙소 레벨 = 주거 등급(N24 칸
//   n24_housing_1~3). 숙소에 자리가 없으면 도시 주거 수 안에서는 숙소 없는 집(설정 칸 lodging_home_recovery_pm), 그 밖은 노숙(S25).
// - 일한 몫: 정산 엔진(settle.ts advanceJob)의 일·쉼 바퀴 그대로 — 일 = 피로 상한 × 일 주기, 쉼 = 피로 상한 × 1점 푸는 시간(기본 N24 ÷ 회복 배율),
//   오감 = 일터 ↔ 쉼터 왕복(한 바퀴에 한 번, 걷기 D-120). 도시 경제는 이 몫을 기준(숙소 없는 집·오감 0)에 견준 ‰로 생산 속도에 곱한다.
// - 옮김(기획 43 §7.1 직접 운반 = 유닛이 들고 감·운임 없음, §7.3 일을 마치면 가장 가까운 창고에 넣는다): 한 번에 화물 상한(설정 칸
//   gather_obj_carry_g)씩, 한 번 = 왕복 2 × 칸 × 걷기 ms. 나르는 사람이 여럿이면 나눠 진다.
// 수치는 모두 [임시](49에 칸이 없다 → lodging_*·haul_* 앞머리). 정수만 쓴다.
import { TEST_JOB_RULES } from "../settle/settle.ts";
import { CELL_UNITS, MS_PER_SECOND, WALK_SPEED } from "../units.ts";

/** 하루 ms(실제 시간, D-5030) */
const DAY_MS_LOGISTICS = 24 * 60 * 60 * 1000;
import type { SocietyCoefficients } from "./coefficients.ts";
import { SATISFACTION_MAX_MILLI, recoveryPm } from "./labor.ts";

export { type LogisticsCoefficients, START_LOGISTICS } from "./logisticsCoefficients.ts";

/** 일꾼이 쉬는 곳: 숙소(레벨), 숙소 없는 집(도시 주거 수 안), 노숙 */
export type RestPlace =
  | { readonly kind: "lodging"; readonly level: number }
  | { readonly kind: "home" }
  | { readonly kind: "homeless" };

/** 숙소 하나의 침대 수(레벨 × 칸) */
export function lodgingBeds(level: number, c: Pick<SocietyCoefficients, "logistics">): number {
  return Math.max(0, Math.trunc(level)) * Math.max(0, Math.trunc(c.logistics.lodgingBedsPerLevel));
}

/**
 * 도시 인구 상한(질문 1089 나, 기획 정리 D-534 "숙소 침대가 인구 상한을 늘림") = 주거 수(집) + 숙소 침대 합. 구인 목표(D-469 구인 규칙식)·붐빔(마을
 * 세우기)·만족도 주거 칸이 이 값을 본다. 시작 도시 숙소 수(질문 1049 나 = 주거 ÷ 침대)와 처음 인구(주거 × 천분율)는 주거 수(집)만 본다 — 침대로
 * 숙소 수를 셈하면 서로 물고 돈다
 */
export function cityHousingCap(city: {
  readonly housing: number;
  readonly beds?: number | undefined;
}): number {
  return Math.max(0, Math.trunc(city.housing)) + Math.max(0, Math.trunc(city.beds ?? 0));
}

/** 걷기 한 칸 ms(D-120 WALK_SPEED, 올림) */
export function walkMsPerCell(): number {
  return Math.ceil((CELL_UNITS * MS_PER_SECOND) / WALK_SPEED);
}

/** 쉬는 곳의 회복 배율(‰). 만족도는 가득으로 본다(도시 경제는 사람마다 만족도를 모른다 [임시]) */
export function restRecoveryPm(place: RestPlace, c: SocietyCoefficients): number {
  if (place.kind === "lodging") return recoveryPm(Math.max(1, place.level), SATISFACTION_MAX_MILLI, c);
  if (place.kind === "homeless") return recoveryPm(0, SATISFACTION_MAX_MILLI, c);
  return Math.max(1, Math.trunc(c.logistics.homeRecoveryPm));
}

/**
 * 일·쉼 한 바퀴에서 일한 몫(‰) = 일 ÷ (일 + 쉼 + 오감). 일 = 피로 상한 × 일 주기, 쉼 = 피로 상한 × (기본 1점 ms ÷ 회복 배율),
 * 오감 = 일터 ↔ 쉼터 왕복(commuteCells는 한쪽 칸 수)
 */
export function workSharePm(
  recovery: number,
  commuteCells: number,
  c: SocietyCoefficients,
  cycleMs: number = TEST_JOB_RULES.cycleMs,
): number {
  const max = Math.max(1, c.fatigueMax);
  const work = max * Math.max(1, cycleMs);
  const step = Math.max(1, Math.floor((c.fatigueRecoverStepMs * 1000) / Math.max(1, recovery)));
  const rest = max * step;
  const commute = 2 * Math.max(0, Math.trunc(commuteCells)) * walkMsPerCell();
  return Math.floor((work * 1000) / (work + rest + commute));
}

/** 하루(실제 시간)에 쉬는 번 수(일·쉼 한 바퀴의 수, 내림) — 숙소 요금은 쉴 때마다 낸다 */
export function restsPerDay(
  place: RestPlace,
  commuteCells: number,
  c: SocietyCoefficients,
  cycleMs: number = TEST_JOB_RULES.cycleMs,
): number {
  const max = Math.max(1, c.fatigueMax);
  const step = Math.max(
    1,
    Math.floor((c.fatigueRecoverStepMs * 1000) / Math.max(1, restRecoveryPm(place, c))),
  );
  const period =
    max * Math.max(1, cycleMs) + max * step + 2 * Math.max(0, Math.trunc(commuteCells)) * walkMsPerCell();
  return Math.floor(DAY_MS_LOGISTICS / period);
}

/**
 * 숙소 셈 배율(‰): 그 쉼터·오감의 일한 몫 ÷ 기준(숙소 없는 집, 오감 0). 도시 경제 생산 속도에 곱한다. 숙소 회복을 끄면(lodgingMode 0) 1000
 */
export function restDutyPm(place: RestPlace, commuteCells: number, c: SocietyCoefficients): number {
  if (Math.trunc(c.logistics.lodgingMode) !== 1) return 1000;
  const base = workSharePm(restRecoveryPm({ kind: "home" }, c), 0, c);
  const share = workSharePm(restRecoveryPm(place, c), commuteCells, c);
  return Math.max(1, Math.floor((share * 1000) / Math.max(1, base)));
}

/** 무게 weightG를 화물 상한 carryG씩 나르는 횟수(올림). 상한이 0이면 한 번 */
export function haulTrips(weightG: bigint, carryG: number): number {
  if (weightG <= 0n) return 0;
  const carry = BigInt(Math.max(1, Math.trunc(carryG)));
  return Number((weightG + carry - 1n) / carry);
}

/** 채집소 → 창고 옮김 시간(ms): 횟수(화물 상한 carryG씩) × 왕복(2 × 칸 × 걷기 ms) ÷ 나르는 사람 수(올림). 칸이 0이면 0 */
export function haulTimeMs(weightG: bigint, cells: number, carriers: number, carryG: number): number {
  if (cells <= 0 || weightG <= 0n) return 0;
  const roundTrip = 2 * Math.trunc(cells) * walkMsPerCell();
  return Math.ceil((haulTrips(weightG, carryG) * roundTrip) / Math.max(1, Math.trunc(carriers)));
}

/** 옮김 셈이 켜졌나(설정 칸 haul_distance_mode) */
export function haulOn(c: Pick<SocietyCoefficients, "logistics">): boolean {
  return Math.trunc(c.logistics.haulMode) === 1;
}

/** 설정 칸 화물 상한(gather_obj_carry_g)으로 haulTimeMs. 옮김 셈을 끄면(haulMode 0) 0 */
export function haulMs(weightG: bigint, cells: number, carriers: number, c: SocietyCoefficients): number {
  if (!haulOn(c)) return 0;
  return haulTimeMs(weightG, cells, carriers, c.gatherObjects.carryGrams);
}
