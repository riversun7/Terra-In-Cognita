// 부상 단계·치료 설정 칸 값 ↔ 계수표 — 기획 D-521·49 N55, docs/adr/2026-11-08-injury.md. 세력·사회 계수표 injury 칸(경로 "injury.*").
// 출발값은 society/injury.ts START_INJURY_COEFFICIENTS: 단계별 자연 치유(흰 1일·노랑 2일·빨강 3일)만 D-521 원문이고 나머지는 [임시](D-515).
// 팩 항목의 단위·기술 범위(unit·min·max)는 content/core/tuning.json에 적는다. 서버는 쓸 때마다 읽는다(live, apps/server/src/tuning/scope.ts).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "N55",
  target: "society",
  path: `injury.${path}`,
  structural: false,
  ko,
  en,
});

const STAGES: readonly (readonly [number, string, string])[] = [
  [1, "흰", "white"],
  [2, "노랑", "yellow"],
  [3, "빨강", "red"],
];

/** 단계표 세 칸(흰·노랑·빨강 무게) */
const weights = (prefix: string, path: string, ko: string, en: string): TuningKey[] =>
  STAGES.map(([stage, stageKo, stageEn]) =>
    k(`${prefix}_${stage}`, `${path}.${stage}`, `${ko}: ${stageKo} 무게`, `${en}: ${stageEn} weight`),
  );

export const INJURY_TUNING_KEYS: readonly TuningKey[] = [
  k("n55_heal_white_ms", "healMs.1", "자연 치유: 흰 → 초록(ms)", "Natural healing: white → green (ms)"),
  k("n55_heal_yellow_ms", "healMs.2", "자연 치유: 노랑 → 흰(ms)", "Natural healing: yellow → white (ms)"),
  k("n55_heal_red_ms", "healMs.3", "자연 치유: 빨강 → 노랑(ms)", "Natural healing: red → yellow (ms)"),
  k("n55_work_period_ms", "workPeriodMs", "작업 중 부상 굴림 주기(ms)", "Work injury roll period (ms)"),
  k(
    "n55_work_chance",
    "workChancePm",
    "작업 주기마다 부상 확률(‰, 피로 0)",
    "Injury chance per work period (‰, no fatigue)",
  ),
  k(
    "n55_work_fatigue",
    "workFatiguePm",
    "피로 가득일 때 더하는 확률 몫(‰)",
    "Extra chance at full fatigue (‰ of chance)",
  ),
  ...weights("n55_work_stage", "workStagePm", "작업 중 부상 단계표", "Work injury table"),
  k(
    "n55_combat_downed",
    "combatDownedChancePm",
    "전투에서 쓰러지면 부상 확률(‰)",
    "Injury chance when downed (‰)",
  ),
  ...weights("n55_combat_downed_stage", "combatDownedStagePm", "쓰러짐 부상 단계표", "Downed injury table"),
  k(
    "n55_combat_hit",
    "combatHitChancePm",
    "전투 피해 부상 확률(‰, HP를 모두 잃었을 때, 잃은 몫에 비례)",
    "Battle damage injury chance (‰ at full HP lost, proportional)",
  ),
  ...weights(
    "n55_combat_hit_stage",
    "combatHitStagePm",
    "전투 피해 부상 단계표",
    "Battle damage injury table",
  ),
  k(
    "n55_hospital_base",
    "hospital.baseSpeedPm",
    "병원 기본 치유 배율(‰, 레벨 1·의사 없음)",
    "Hospital base healing speed (‰)",
  ),
  k(
    "n55_hospital_level",
    "hospital.levelSpeedPm",
    "병원 레벨마다 더하는 배율(‰)",
    "Hospital speed per level (‰)",
  ),
  k(
    "n55_hospital_stat",
    "hospital.statSpeedPm",
    "의사 INT + WIS 1당 배율(‰)",
    "Speed per doctor INT + WIS point (‰)",
  ),
  k(
    "n55_hospital_skill",
    "hospital.skillSpeedPm",
    "의사 치유 스킬 등급 1당 배율(‰)",
    "Speed per doctor heal skill grade (‰)",
  ),
  k("n55_hospital_max", "hospital.maxSpeedPm", "병원 치유 배율 상한(‰)", "Hospital speed cap (‰)"),
  k(
    "n55_hospital_cost_day",
    "hospital.costPerDay",
    "병원 값: 남은 치유 하루당(최소 단위)",
    "Hospital fee per remaining healing day (minor units)",
  ),
  k(
    "n55_hospital_cost_level",
    "hospital.levelCostPm",
    "병원 레벨마다 값에 더하는 몫(‰)",
    "Hospital fee per level (‰)",
  ),
];
