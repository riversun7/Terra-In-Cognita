// 컨디션·초기 스탯 합 설정 칸 값 ↔ 계수표 — 기획 D-534, 49 N43(컨디션 합계 상한 ±40)·N9(초기 스탯 합).
// docs/adr/2026-11-12-unit-condition.md. 출발값은 society/condition.ts START_CONDITION·society/coefficients.ts statSums(상한 말고는 [임시]).
// 49에 칸이 없는 컨디션 몫은 앞머리 condition_을 쓴다(gather_obj_*와 같은 꼴).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path,
  structural: false,
  ko,
  en,
});

export const CONDITION_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "n9_human_sum_max",
    "N9",
    "statSums.humanMax",
    "휴먼 초기 스탯 합 최대(100 이하)",
    "Human initial stat sum max (100 or less)",
  ),
  k(
    "n9_creature_sum_max",
    "N9",
    "statSums.creatureMax",
    "크리쳐 초기 스탯 합 최대(100 이하)",
    "Creature initial stat sum max (100 or less)",
  ),
  k("condition_cap", "N43", "condition.cap", "컨디션 합계 상한(±)", "Condition total cap (±)"),
  k(
    "condition_housing_match",
    "",
    "condition.housingMatch",
    "컨디션: 선호 등급 이상 숙소",
    "Condition: lodging at or above preferred grade",
  ),
  k(
    "condition_housing_short_step",
    "",
    "condition.housingShortStep",
    "컨디션: 선호보다 한 등급 낮을 때마다 빼는 값",
    "Condition: cut per grade below preferred",
  ),
  k("condition_housing_home", "", "condition.housingHome", "컨디션: 숙소 없는 집", "Condition: home without lodging"),
  k("condition_housing_homeless", "", "condition.housingHomeless", "컨디션: 노숙", "Condition: homeless"),
  k("condition_food_full", "", "condition.foodFull", "컨디션: 생필품 가득", "Condition: necessities full"),
  k("condition_food_hungry", "", "condition.foodHungry", "컨디션: 생필품 없음", "Condition: necessities empty"),
  k(
    "condition_food_neutral_pm",
    "",
    "condition.foodNeutralPm",
    "컨디션: 음식 몫이 0인 생필품 충족(‰)",
    "Condition: necessities level with no food effect (‰)",
  ),
  k(
    "condition_prefer_grade2_from",
    "",
    "condition.preferGrade2From",
    "컨디션: 선호 주거 2등급이 되는 초기 스탯 합",
    "Condition: initial stat sum preferring grade 2 housing",
  ),
  k(
    "condition_prefer_grade3_from",
    "",
    "condition.preferGrade3From",
    "컨디션: 선호 주거 3등급이 되는 초기 스탯 합",
    "Condition: initial stat sum preferring grade 3 housing",
  ),
];
