// 유닛 조우 설정 칸 값 ↔ 계수표 — 기획 D-564 1641·D-570, 질문 1905(조우 수치를 설정 칸으로), docs/adr/2026-11-15-unloaded-second-maps.md
// "바뀜 (D-570, 좌표 이동 3)". 출발값은 society/encounterCoefficients.ts START_ENCOUNTER(모두 [임시]). 49에 칸이 없어 encounter_*를 앞머리로 쓴다.
// 서버 travel/encounterWorld.ts가 틱마다 실효 값을 읽는다(live). 시뮬은 읽지 않는다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `encounter.${path}`,
  structural: false,
  ko,
  en,
});

export const ENCOUNTER_TUNING_KEYS: readonly TuningKey[] = [
  k("encounter_scan_ms", "scanMs", "[임시] 조우 찾기 간격(ms)", "[temp] Encounter scan interval (ms)"),
  k(
    "encounter_cooldown_ms",
    "cooldownMs",
    "[임시] 조우 뒤 그 2차맵·나라 짝을 다시 보지 않는 시간(ms)",
    "[temp] Encounter cooldown per map and nation pair (ms)",
  ),
  k(
    "encounter_max_per_scan",
    "maxPerScan",
    "[임시] 한 번에 여는 조우 전투 수",
    "[temp] Encounter battles per scan",
  ),
  k(
    "encounter_map_size",
    "mapSize",
    "[임시] 조우 전투맵 한 변(칸)",
    "[temp] Encounter battle map edge (cells)",
  ),
  k(
    "encounter_radius_cells",
    "radiusCells",
    "[임시] 띄운 2차맵에서 만났다고 보는 거리(칸)",
    "[temp] Encounter reach on loaded maps (cells)",
  ),
  k(
    "encounter_max_side_units",
    "maxSideUnits",
    "[임시] 조우 한 편 유닛 상한",
    "[temp] Units per encounter side",
  ),
  k(
    "encounter_war_ratio_pm",
    "warRatioPm",
    "[임시] 전쟁 상대에게 싸움을 거는 전력 비(‰)",
    "[temp] Power ratio to attack a war enemy (‰)",
  ),
  k(
    "encounter_loot_ratio_pm",
    "lootRatioPm",
    "[임시] 다른 나라 짐을 약탈하러 거는 전력 비(‰)",
    "[temp] Power ratio to raid another nation's cargo (‰)",
  ),
  k(
    "encounter_aggression_pm",
    "aggressionPm",
    "[임시] NPC 공격 성향이 문턱을 옮기는 세기(‰)",
    "[temp] How far NPC aggression moves the thresholds (‰)",
  ),
  k(
    "encounter_player_policy",
    "playerPolicy",
    "[임시] 플레이어 유닛 자동 판단(0 = 회피, 1 = NPC와 같은 판단)",
    "[temp] Player unit auto decision (0 = avoid, 1 = same as NPC)",
  ),
  k(
    "encounter_full_pm",
    "fullPm",
    "[임시] 조우 뒤 짐 정리하러 가는 짐 몫(‰)",
    "[temp] Cargo share that sends a unit to unload after an encounter (‰)",
  ),
  k(
    "encounter_regroup_hp_pm",
    "regroupHpPm",
    "[임시] 조우 뒤 재정비하러 돌아가는 남은 HP 몫(‰)",
    "[temp] Remaining HP share that sends a unit back to regroup (‰)",
  ),
];
