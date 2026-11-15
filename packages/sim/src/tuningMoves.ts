// 움직임·계수 곡선 설정 칸 값 ↔ 계수표(moves) — docs/adr/2026-11-15-combat-moves.md 1·3절. 49에 칸 없음(기획 결정 번호가 붙기 전),
// 모두 [임시] 출발값이다(질문 1582·1584·1589~1594). 식은 combat/curves.ts·moves.ts.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "combat",
  path: `moves.${path}`,
  structural: false,
  ko,
  en,
});

export const MOVE_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "moves_run_interval_pm",
    "run.intervalPm",
    "달리기: 한 칸 가는 시간 배율(‰)",
    "Running: step interval multiplier (\u2030)",
  ),
  k(
    "moves_run_stamina_per_sec",
    "run.staminaPerSec",
    "달리기: 초당 스태미나 소모(기본)",
    "Running: stamina per second (base)",
  ),
  k(
    "moves_run_resume_sec",
    "run.resumeSec",
    "달리기: 다시 켜려면 있어야 할 스태미나(초 몫)",
    "Running: stamina needed to restart (seconds' worth)",
  ),
  k(
    "moves_detect_cells",
    "detectCells",
    "은신: 기본 감지 반지름(칸)",
    "Stealth: base detection radius (cells)",
  ),
  k(
    "moves_range_interval_per_cell_pm",
    "rangeInterval.perCellPm",
    "사거리 예산: 칸당 공격 간격 더함(‰)",
    "Range budget: interval added per cell (\u2030)",
  ),
  k(
    "moves_range_interval_max_pm",
    "rangeInterval.maxPm",
    "사거리 예산: 공격 간격 위 끝(‰)",
    "Range budget: interval cap (\u2030)",
  ),
  k(
    "moves_magic_distance_near_pm",
    "magicDistance.nearPm",
    "마법 거리: 붙어서 배율(‰)",
    "Magic distance: point-blank multiplier (\u2030)",
  ),
  k(
    "moves_magic_distance_slope_pm",
    "magicDistance.slopePm",
    "마법 거리: 칸당 줄임(‰)",
    "Magic distance: falloff per cell (\u2030)",
  ),
  k(
    "moves_magic_distance_min_pm",
    "magicDistance.minPm",
    "마법 거리: 아래 끝(‰)",
    "Magic distance: floor (\u2030)",
  ),
  k(
    "moves_magic_targets_area_pm",
    "magicTargets.areaPm",
    "마법 대상 수: 둘째 대상부터 배율(‰)",
    "Magic targets: multiplier from 2 targets (\u2030)",
  ),
  k(
    "moves_magic_targets_step_pm",
    "magicTargets.stepPm",
    "마법 대상 수: 대상 하나 더할 때마다 줄임(‰)",
    "Magic targets: reduction per extra target (\u2030)",
  ),
  k(
    "moves_magic_targets_min_pm",
    "magicTargets.minPm",
    "마법 대상 수: 아래 끝(‰)",
    "Magic targets: floor (\u2030)",
  ),
  k(
    "moves_dot_total_free_ms",
    "dotTotal.freeMs",
    "지속 피해 합: 줄이지 않는 지속(ms)",
    "DoT total: unpenalised duration (ms)",
  ),
  k(
    "moves_dot_total_step_pm",
    "dotTotal.stepPm",
    "지속 피해 합: 초당 줄임(‰)",
    "DoT total: reduction per second (\u2030)",
  ),
  k("moves_dot_total_min_pm", "dotTotal.minPm", "지속 피해 합: 아래 끝(‰)", "DoT total: floor (\u2030)"),
  k(
    "moves_multishot_step_pm",
    "multishot.stepPm",
    "연사: 한 발 더할 때마다 줄임(‰)",
    "Multishot: reduction per extra shot (\u2030)",
  ),
  k(
    "moves_multishot_min_pm",
    "multishot.minPm",
    "연사: 한 발 아래 끝(‰)",
    "Multishot: per-shot floor (\u2030)",
  ),
  k("moves_close_shot_cells", "closeShot.cells", "가까이 쏘기: 거리(칸)", "Close shot: distance (cells)"),
  k("moves_close_shot_bonus_pm", "closeShot.bonusPm", "가까이 쏘기: 보너스(‰)", "Close shot: bonus (\u2030)"),
];
