// 배 설정 칸 값 ↔ 계수표 — docs/adr/2026-11-13-boats.md(기획 D-540, 49 P20). 출발값은 society/boatCoefficients.ts START_BOATS(모두 [임시]).
// 49에 칸이 있는 것은 배 속도(P20)뿐이고 나머지는 boat_*를 앞머리로 쓴다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path: `boats.${path}`,
  structural: false,
  ko,
  en,
});

export const BOAT_TUNING_KEYS: readonly TuningKey[] = [
  k("boat_speed", "P20", "speed", "배 속도(단위/초, 1024 = 1칸/초)", "Boat speed (units/s, 1024 = 1 cell/s)"),
  k("boat_capacity", "", "capacity", "배 하나에 타는 유닛 수", "Units per boat"),
  k("boat_cost_pm", "", "costPm", "배 값(부두 레벨 1 재료 × ‰)", "Boat cost (dock level 1 materials × ‰)"),
  k("boat_board_cells", "", "boardCells", "타고 내리는 거리(칸)", "Board and leave reach (cells)"),
  // 기획 D-541(질문 1271 나·1277 다) — docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)"
  k(
    "boat_build_time_pm",
    "",
    "buildTimePm",
    "배 만드는 시간(부두 레벨 1 건설 시간 × ‰)",
    "Boat build time (dock level 1 build time × ‰)",
  ),
  k("boat_upkeep_pm", "", "upkeepPm", "배 유지비(보통 유닛 = 1000‰)", "Boat upkeep (a regular unit = 1000‰)"),
  // 기획 D-541 1280 가·D-542 1331 나 — docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B3)"
  k("boat_gather_cells", "", "gatherCells", "배에서 캐는 거리(칸)", "Gather reach from a boat (cells)"),
  k("npc_boats_per_dock", "", "npcPerDock", "NPC 부두 하나의 배 상한", "NPC boats per dock"),
  k("npc_boat_fishers", "", "npcFishers", "NPC 배 하나의 어부 수", "Fishers per NPC boat"),
];
