// 공성 결과 셋 설정 칸 값 ↔ 계수표 — 기획 D-520·D-527, docs/adr/2026-11-07-war-outcomes.md.
// 팩 항목 ID ↔ 세력·사회 계수표 war 칸(경로). 출발값은 society/warOutcomes.ts START_WAR_COEFFICIENTS(모두 [임시]). 49에 칸이 없어 결정 번호를
// 앞머리로 쓴다(d510_*·d517_*와 같은 꼴).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `war.${path}`,
  structural: false,
  ko,
  en,
});

export const WAR_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "d520_raid_goods_bp",
    "raidGoodsBp",
    "약탈: 하루마다 꺼내 가는 공공 창고 몫(만분율)",
    "Loot: public storage share withdrawn per day (bp)",
  ),
  k(
    "d527_gov_rebuild_days",
    "govRebuildDays",
    "약탈: 정부 재건까지 날 수(일)",
    "Loot: days until the government can be rebuilt",
  ),
  k(
    "d527_gov_rebuild_per_housing",
    "govRebuildPerHousing",
    "약탈: 정부 재건 비용(주거 1당, 최소 단위)",
    "Loot: government rebuild cost per housing (minor units)",
  ),
  k(
    "d520_rebuild_per_housing",
    "rebuildPerHousing",
    "점령·귀속 재건 비용(주거 1당, 최소 단위)",
    "Annex rebuild cost per housing (minor units)",
  ),
  k(
    "d520_annex_penalty_days",
    "annexPenaltyDays",
    "점령·귀속 회복 불이익 기간(일)",
    "Annex recovery penalty (days)",
  ),
  k(
    "d520_annex_recovery_pm",
    "annexRecoveryPm",
    "점령·귀속 불이익 동안 만족도 회복 빠르기(‰)",
    "Satisfaction recovery speed during annex penalty (‰)",
  ),
  k("d520_occupy_days", "occupyDays", "점령 상태 자율 회복(일)", "Occupation self-recovery (days)"),
  k(
    "d520_occupy_tax_every_days",
    "occupyTaxEveryDays",
    "점령 상태 세금 주기(일)",
    "Occupation tax period (days)",
  ),
  k(
    "d520_occupy_tax_bp",
    "occupyTaxBp",
    "점령 상태 세금(도시 몫 국고의 만분율)",
    "Occupation tax (bp of the city's share of the treasury)",
  ),
  k(
    "d520_occupy_satisfaction_drop",
    "occupySatisfactionDrop",
    "점령 상태 만족도 하락(점)",
    "Occupation satisfaction drop (points)",
  ),
  k(
    "d527_occupy_expel_strength_pm",
    "occupyExpelStrengthPm",
    "점령 상태: 힘으로 몰아내는 유닛 비(‰)",
    "Occupation: unit ratio to expel the occupier (‰)",
  ),
  k(
    "d520_npc_annex_weight",
    "npcAnnexWeight",
    "NPC 공성 결과 고르기: 점령·귀속 가중치",
    "NPC siege outcome choice: annex weight",
  ),
];
