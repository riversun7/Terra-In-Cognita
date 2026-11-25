// 생명 수치 회복 설정 칸 값 ↔ 계수표 — 기획 D-514·49 N54(HP 회복은 2차 스탯 행 hp_regen이라 가중치 표), docs/adr/2026-10-31-combat-core.md
// "바뀜 (2026-11-07, D-514·287)". 모두 [임시] 출발값이다(D-514: 값은 밸런스 화면·설정 칸에서 맞춘다, 기술은 출발값만).
// - 아머 회복(전투 계수표 armorRegenPm): 분당 최대 아머 HP의 ‰(쉴드처럼 전투 중에도 일정하게, 전투 밖은 분 단위).
// - 부상 단계별 회복 속도·불이익(세력·사회 계수표 vitals): 단계 1 흰·2 노랑·3 빨강(D-521이 옛 경상·중상·중태를 바꿈, 번호는 같다).
//   회복 속도 = 분당 HP 회복에 곱하는 ‰,
//   불이익 = 1차 스탯(능력치 6개)을 깎는 ‰(D-145 "경상 능력 −10~20%·중상 −30~50%", 옛 문서 Consolidated_Character.md 9.3 "능력치 감소").
import type { TuningKey } from "./tuning.ts";

const k = (id: string, target: TuningKey["target"], path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "N54",
  target,
  path,
  structural: false,
  ko,
  en,
});

const STAGES: readonly (readonly [number, string, string])[] = [
  [1, "흰 부상", "white injury"],
  [2, "노랑 부상", "yellow injury"],
  [3, "빨강 부상", "red injury"],
];

export const VITALS_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "n54_armor_regen",
    "combat",
    "armorRegenPm",
    "기본 아머 회복(분당 최대 아머 HP의 ‰, 기본 0 — 옵션 방어구만 재생)",
    "Base armor regen (‰ of max armor HP per minute, default 0 — option armor only)",
  ),
  k(
    "n54_armor_restore_per_dur",
    "society",
    "durability.armorRestorePerDurability",
    "전투 후 아머 회복당 방어구 내구도 기준(아머 HP)",
    "Armor HP restored per 1 armor durability after battle",
  ),
  ...STAGES.map(([stage, ko, en]) =>
    k(
      `n54_injury_regen_${stage}`,
      "society",
      `vitals.injuryRegenPm.${stage}`,
      `${ko} HP 회복 속도(‰, 분당 HP 회복에 곱함)`,
      `HP regen speed while ${en} (‰ of per-minute HP regen)`,
    ),
  ),
  ...STAGES.map(([stage, ko, en]) =>
    k(
      `n54_injury_penalty_${stage}`,
      "society",
      `vitals.injuryPenaltyPm.${stage}`,
      `${ko} 불이익(1차 스탯 ‰ 감소)`,
      `Penalty while ${en} (‰ off primary stats)`,
    ),
  ),
];
