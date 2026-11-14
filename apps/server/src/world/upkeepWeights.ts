// 유닛 종류별 유지비 무게(‰, 보통 유닛 1000) — 세계 정산(settlement.ts upkeepWeightPm)이 정산할 때마다 읽는다. world.ts(1,000줄 상한)에서 뗐다.
// - 사이보그 유닛은 비싸다(D-470, 설정 칸 n46_upkeep → fusion.upkeepPm).
// - 배는 사람보다 싸다(기획 D-541 1277 다, 설정 칸 boat_upkeep_pm → boats.upkeepPm, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)").
//   배 유지비는 그 배 주인 몫이고 사람과 같은 정시 경계(settle.ts)에 함께 낸다.
import type { SocietyCoefficients } from "@terra/sim";
import { UNIT_KIND_BOAT, UNIT_KIND_CYBORG_UNIT } from "./unitKinds.ts";

/** 보통 유닛의 유지비 무게(‰) */
export const BASE_UPKEEP_PM = 1000;

/** 무게 하나(음수·틀린 값은 0) */
const weight = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

/** 종류 코드 → 유지비 무게(설정 칸 실효 값을 부를 때마다 읽는다) */
export function upkeepWeightOf(
  rules: () => Pick<SocietyCoefficients, "fusion" | "boats">,
): (kind: number) => number {
  return (kind) => {
    if (kind === UNIT_KIND_CYBORG_UNIT) return weight(rules().fusion.upkeepPm);
    if (kind === UNIT_KIND_BOAT) return weight(rules().boats.upkeepPm);
    return BASE_UPKEEP_PM;
  };
}
