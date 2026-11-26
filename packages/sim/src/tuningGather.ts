// 2차맵 원자재 오브젝트 채집 설정 칸 값 ↔ 계수표 — docs/adr/2026-11-07-gather-objects.md. 출발값은 society/gatherObjects.ts START_GATHER_OBJECTS
// (모두 [임시]). 49에 칸이 없어 앞머리 gather_obj_를 쓴다(npc_seed_*와 같은 꼴).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `gatherObjects.${path}`,
  structural: false,
  ko,
  en,
});

export const GATHER_OBJECT_TUNING_KEYS: readonly TuningKey[] = [
  k("gather_obj_carry_g", "carryGrams", "채집 화물 상한(g)", "Gather carry limit (g)"),
  k("gather_obj_direct_pm", "directYieldPm", "직접 채집 수확 배율(‰)", "Direct gather yield (‰)"),
  k(
    "gather_obj_camp_radius",
    "campRadiusCells",
    "벌목장·광산 반경(배치 칸)",
    "Lumber camp/mine radius (cells)",
  ),
  k(
    "gather_obj_camp_level_pm",
    "campLevelPm",
    "시설 레벨당 수확 더함(‰)",
    "Extra yield per facility level (‰)",
  ),
  k(
    "gather_obj_camp_fatigue_pm",
    "campFatiguePm",
    "시설 반경 안 피로 배율(‰)",
    "Fatigue near a facility (‰)",
  ),
  k(
    "gather_obj_camp_regrow_pm",
    "campRegrowPm",
    "시설 반경 안 다시 자람 시간 배율(‰)",
    "Regrow time near a facility (‰)",
  ),
  k("gather_obj_fatigue", "fatiguePerGather", "채집 한 번의 피로(점)", "Fatigue per gather (points)"),
  k(
    "gather_obj_job_fatigue",
    "jobFatiguePerLot",
    "직무 묶음 하나의 피로(점)",
    "Fatigue per job lot (points)",
  ),
  k("gather_obj_exp", "expPerGather", "채집 한 번의 기본 경험치", "Base experience per gather"),
  k("gather_obj_exp_tier", "expPerTier", "채집 티어당 더하는 경험치", "Experience added per gather tier"),
  k(
    "gather_obj_next_radius",
    "nextRadiusCells",
    "다음 오브젝트 찾는 반경(배치 칸)",
    "Next object search radius (cells)",
  ),
  k(
    "gather_obj_pollution_pm",
    "pollutionRegrowPm",
    "오염 최대일 때 다시 자람 시간 더함(‰)",
    "Extra regrow time at full pollution (‰)",
  ),
  // 채집소 레벨 버프·창고 옮김(사용자 지적 2026-11-08 "원자재채집소의 기능도 필요", 모두 [임시])
  k(
    "gather_obj_station_radius_step",
    "stationRadiusStep",
    "채집소 레벨당 반경 더함(배치 칸)",
    "Gather station radius per level (cells)",
  ),
  k(
    "gather_obj_station_fatigue_step_pm",
    "stationFatigueStepPm",
    "채집소 레벨당 피로 배율 줄임(‰)",
    "Gather station fatigue cut per level (‰)",
  ),
  k(
    "gather_obj_station_regrow_step_pm",
    "stationRegrowStepPm",
    "채집소 레벨당 다시 자람 배율 줄임(‰)",
    "Gather station regrow cut per level (‰)",
  ),
  k(
    "gather_obj_station_floor_pm",
    "stationFloorPm",
    "채집소 피로·다시 자람 배율 하한(‰)",
    "Gather station fatigue/regrow floor (‰)",
  ),
  k(
    "gather_obj_station_haul_ms",
    "stationHaulMs",
    "채집소 창고 → 도시 창고 자동 옮김 간격(ms)",
    "Gather station auto haul interval (ms)",
  ),
];

/** 건물 채집소 칸(경로 buildingGather.*) */
const b = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `buildingGather.${path}`,
  structural: false,
  ko,
  en,
});

/**
 * 건물 채집소(농장·목장·약초원 — 기획 D-566 1721·D-567, docs/adr/2026-11-15-gather-object-tiers.md "바뀜 (2026-11-15, D-566·D-567)").
 * 49에 칸이 없어 앞머리 building_gather_·plot_module_ [임시]. 기르는 티어 = 건물 레벨 최고 티어(D-5001, 구조 값이라 칸 없음)
 */
export const BUILDING_GATHER_TUNING_KEYS: readonly TuningKey[] = [
  b(
    "building_gather_stat_per_tier",
    "statPerTier",
    "건물 채집소 티어당 권장 스탯 합",
    "Building gatherer recommended stat sum per tier",
  ),
  b(
    "building_gather_short_step_pm",
    "shortStepPm",
    "권장 스탯 1점 모자랄 때 깎는 수확 효율(‰)",
    "Harvest efficiency cut per missing stat point (‰)",
  ),
  b(
    "building_gather_floor_pm",
    "floorPm",
    "건물 채집소 수확 효율 바닥(‰)",
    "Building gatherer harvest efficiency floor (‰)",
  ),
  b(
    "plot_module_area_pm",
    "plotAreaPm",
    "면적 모듈 하나의 수확 더함(‰)",
    "Extra harvest per area module (‰)",
  ),
  b(
    "plot_module_slots_per_level",
    "plotSlotsPerLevel",
    "시설 레벨당 면적 모듈 자리",
    "Area module slots per facility level",
  ),
];
