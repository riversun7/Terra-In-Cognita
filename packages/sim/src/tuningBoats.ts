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
];
