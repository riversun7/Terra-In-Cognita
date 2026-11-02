// 시설 건설 시간·유지비 설정 칸 값 ↔ 계수표 — 기획 49 M14·D-508, docs/adr/2026-11-02-building-editor.md
// 팩 항목 ID ↔ 세력·사회 계수표 facilityBuild 칸(경로). 출발값 = 옛 seeds/building_seed.js(시간 = 재료 무게 합 × 10초 × 티어 계수,
// 유지비 = 하루 비용 단위 합의 1%, 최소 1)이고 값은 @terra/shared OLD_FACILITY_BUILD_RULES다. 건설 재료(레벨 구간)는 팩 facilities.build.
// 셈은 @terra/shared/facilityBuild(buildTimeAt·buildUpkeepAt). 지금 짓기가 없어 건물 편집기 미리 보기만 읽는다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "M14",
  target: "society",
  path: `facilityBuild.${path}`,
  structural: false,
  ko,
  en,
});

export const BUILD_TUNING_KEYS: readonly TuningKey[] = [
  k("m14_build_ms_per_kg", "msPerKg", "건설 시간: 재료 1kg당(ms)", "Build time per kg of materials (ms)"),
  ...[1, 2, 3, 4, 5].map((level) =>
    k(
      `m14_time_factor_l${level}`,
      `timeFactorPm.${level - 1}`,
      `건설 시간 레벨 ${level} 계수(‰)`,
      `Build time factor, level ${level} (‰)`,
    ),
  ),
  k(
    "m14_upkeep_pm",
    "upkeepPm",
    "건물 하루 유지비(비용 단위 합의 ‰)",
    "Building daily upkeep (‰ of cost units)",
  ),
  k(
    "m14_upkeep_min",
    "upkeepMin",
    "건물 하루 유지비 최소(비용 단위)",
    "Building daily upkeep minimum (cost units)",
  ),
];
