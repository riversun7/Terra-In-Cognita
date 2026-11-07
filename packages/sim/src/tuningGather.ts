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
];
