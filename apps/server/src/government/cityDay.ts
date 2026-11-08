// 정부 판의 도시 하루 값(만족도·발전도·생필품 충족) — 기획 정리 743 나(정부 판 = 서버가 하루마다 셈하는 값), docs/adr/2026-11-07-play-flow.md
// "WP-NPC3". 새 규칙 없이 읽기만 한다(시험 대상, cityDay.test.ts):
// - 만족도: NPC 사회 런타임 거울 세계의 그 도시 휴먼 satisfactionMilli 평균 ÷ 1000(시뮬 하루 줄 society.ts dayFields와 같은 셈 — 세력 대신 도시).
//   하루 끝마다 목표값으로 다가간다(D-433). 휴먼이 없으면 null.
// - 발전도: 거울 도시 development(하루 끝마다 society.ts가 셈, world_cities.development로 저장).
// - 생필품 충족: 지난 하루 끝에 도시 경제가 그날 셈한 값(economyRun.ts foodPmOf — 하루 끝 만족도가 쓴 그 값, 기획 정리 781 나 "WP-NPC4",
//   npc/cityDayStore.ts가 저장 — 부르는 쪽이 넘긴다). 경제가 없거나 아직 하루 끝 전이면 null.
import type { GovernmentCityDay } from "@terra/shared/government";
import type { SimCity, SimUnit } from "@terra/sim";

/** 만족도 밀리점 → 점(0~100) */
const MILLI_PER_POINT = 1000;

export function cityDayOf(
  city: Pick<SimCity, "id" | "development">,
  units: Iterable<Pick<SimUnit, "city" | "satisfactionMilli">>,
  necessitiesPm: number | undefined,
): GovernmentCityDay {
  let count = 0;
  let sum = 0;
  for (const unit of units) {
    if (unit.city !== city.id) continue;
    count += 1;
    sum += unit.satisfactionMilli;
  }
  return {
    satisfaction: count === 0 ? null : Math.floor(sum / count / MILLI_PER_POINT),
    development: city.development,
    necessitiesPm: necessitiesPm === undefined ? null : Math.max(0, Math.min(1000, necessitiesPm)),
  };
}
