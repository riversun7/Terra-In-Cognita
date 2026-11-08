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
