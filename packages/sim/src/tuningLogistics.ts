// 숙소 회복·채집소 옮김 설정 칸 값 ↔ 계수표 — 질문 1047 다·1049 나·1050 가(D-533), docs/adr/2026-11-11-city-building-layout.md
// "바뀜 (2026-11-12)". 출발값은 society/logisticsCoefficients.ts START_LOGISTICS(모두 [임시]). 49에 칸이 없어 lodging_*·haul_*를 앞머리로 쓴다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `logistics.${path}`,
  structural: false,
  ko,
  en,
});

export const LOGISTICS_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "lodging_recovery_mode",
    "lodgingMode",
    "숙소 회복을 도시 생산에 셈(1 = 셈, 0 = 쉼터 자리만)",
    "Count lodging recovery in city output (1 = on, 0 = rest spot only)",
  ),
  k("lodging_beds_per_level", "lodgingBedsPerLevel", "숙소 레벨당 침대 수", "Lodging beds per level"),
  k(
    "lodging_fee_per_night",
    "lodgingFeePerNight",
    "숙소 하룻밤 요금(최소 단위)",
    "Lodging fee per night (minor units)",
  ),
  k(
    "lodging_home_recovery_pm",
    "homeRecoveryPm",
    "숙소 없는 집 회복 배율(‰)",
    "Recovery at a home without lodging (‰)",
  ),
  k(
    "haul_distance_mode",
    "haulMode",
    "채집소 → 창고 옮김에 거리 셈(1 = 셈, 0 = 바로)",
    "Station to storehouse haul takes distance time (1 = on, 0 = instant)",
  ),
  k(
    "worker_rest_cycle_mode",
    "restCycleMode",
    "NPC 일꾼이 피로 바퀴로 일터 ↔ 쉼터를 오감(1 = 피로 바퀴, 0 = 지역 낮·밤)",
    "NPC workers walk between work and rest on the fatigue cycle (1 = fatigue, 0 = local day/night)",
  ),
  k(
    "npc_worker_job_mode",
    "npcJobMode",
    "NPC 일꾼도 플레이어 유닛과 같은 직무 상태(1 = 묶음마다 피로·쉬면 생산에서 빠짐, 0 = 옛 셈)",
    "NPC workers use the same job state as player units (1 = fatigue per lot, resting workers stop producing; 0 = old model)",
  ),
  k(
    "logistics_npc_build_waits",
    "npcBuildWaits",
    "NPC 물류센터 증축: 기다리는 운반 일 수(상업 성향 배율 곱)",
    "NPC logistics center build: waiting haul jobs (times commerce trait scale)",
  ),
  k(
    "logistics_npc_build_humans",
    "npcBuildHumans",
    "NPC 물류센터 증축: 도시 휴먼 수 하한",
    "NPC logistics center build: minimum city humans",
  ),
];
