// 시설 건설 시간 설정 칸 값 ↔ 계수표 — 기획 49 M14·D-508, docs/adr/2026-11-02-building-editor.md
// 팩 항목 ID ↔ 세력·사회 계수표 facilityBuild 칸(경로). 출발값 = 옛 seeds/building_seed.js(시간 = 재료 무게 합 × 10초 × 티어 계수)이고
// 값은 @terra/shared OLD_FACILITY_BUILD_RULES다. 건설 재료(레벨 구간)는 팩 facilities.build. 셈은 @terra/shared/facilityBuild(buildTimeAt).
// 짓기·레벨업은 서버 건물 서비스(apps/server/src/facilities/)와 건물 편집기 미리 보기가 읽는다. 하루 유지비 칸(m14_upkeep_pm·m14_upkeep_min)은 뺐다: 화폐 유지비 없음(D-171, 49 N50
// — 건물 유지 = 내구도 + 수리 재료), 팩 id-changes에 지움 기록(core@32).
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

/** 건물 노화·수리·창고·장비 수리 시간(49 N50·M15·N54, D-509·D-514) — 계수표 facilityRuntime 칸 */
const r = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path: `facilityRuntime.${path}`,
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
  r("n50_damaged", "N50", "damagedPm", "손상 문턱(‰)", "Damaged below (‰)"),
  r("n50_disabled", "N50", "disabledPm", "기능 정지 문턱(‰)", "Stops working below (‰)"),
  r("n50_idle_floor", "N50", "idleFloorPm", "쓰지 않을 때 노화가 멈추는 곳(‰)", "Idle decay stops at (‰)"),
  r("n50_idle_decay_ms", "N50", "idleDecayMs", "가득에서 멈추는 곳까지 노화 시간(ms)", "Idle decay time to the floor (ms)"),
  r("n50_use_wear", "N50", "useWearPmPerDay", "쓸 때 더 닳는 양(‰/일)", "Extra wear while used (‰/day)"),
  r("n50_repair_step", "N50", "repairStepPm", "수리 한 번의 최대 회복(‰)", "Repair per step, max (‰)"),
  r("n50_builder_cut", "N50", "builderCutPm", "일꾼 하나당 시간 단축(‰)", "Time cut per builder (‰)"),
  r("n50_builder_cut_max", "N50", "builderCutMaxPm", "일꾼 단축 상한(‰)", "Builder time cut, max (‰)"),
  r("m15_durability_step", "M15", "durabilityLevelStepPm", "레벨당 최대 내구도 증가(‰)", "Max durability per level (‰)"),
  r("n50_storage_step", "N50", "storageLevelStepPm", "레벨당 창고 용량 증가(‰)", "Storage capacity per level (‰)"),
  r("n54_repair_base_ms", "N54", "equipRepairBaseMs", "장비 수리 기준 시간(ms)", "Equipment repair base time (ms)"),
  r("n50_craft_scale", "N50", "craftTimeScale", "장인 보정 분자(10 ÷ 평균 × √수)", "Craft time scale (10 ÷ avg × √n)"),
  r("n50_craft_min", "N50", "craftTimeMinPm", "장인 보정 하한(‰)", "Craft time factor, min (‰)"),
  r("n50_craft_max", "N50", "craftTimeMaxPm", "장인 보정 상한(‰)", "Craft time factor, max (‰)"),
];
