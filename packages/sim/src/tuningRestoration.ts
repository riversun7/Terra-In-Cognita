// 폐허 복원 설정 칸 값 ↔ 계수표 — 기획 D-510·D-339·D-343·D-344, docs/adr/2026-11-07-ruins-restoration.md.
// 팩 항목 ID ↔ 세력·사회 계수표 restoration 칸(경로). 출발값은 society/restoration.ts START_RESTORATION_COEFFICIENTS(모두 [임시]).
// 49에 칸이 없어 결정 번호를 앞머리로 쓴다(d499_*·d517_*와 같은 꼴). 폐허 2(기획 답 480~489, docs/adr/2026-11-07-ruins-restoration.md
// "바뀜"): 주거 1당 목표(482 나)·모금 기한(485 다)과 NPC 판단 계수 칸(npc 경로) 정부 짓기 행동 점수(484 다)·약탈하고 폐허로 두는 문턱(486 나).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string, group = "restoration"): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `${group}.${path}`,
  structural: false,
  ko,
  en,
});

export const RESTORATION_TUNING_KEYS: readonly TuningKey[] = [
  k("d510_claim_cost", "claimCost", "NPC 정부 짓기 값(최소 단위)", "NPC government build cost (minor units)"),
  k(
    "d510_restore_goal",
    "goal",
    "복원 목표 기본값(옛 주거를 모를 때, 최소 단위)",
    "Restoration goal fallback (unknown housing, minor units)",
  ),
  k(
    "d510_goal_per_housing",
    "goalPerHousing",
    "복원 목표의 주거 1당 값(최소 단위)",
    "Restoration goal per housing (minor units)",
  ),
  k(
    "d510_fund_days",
    "fundDays",
    "복원 모금 기한(일, 0 = 없음)",
    "Restoration funding deadline (days, 0 = none)",
  ),
  k(
    "d510_npc_claim_after_days",
    "npcClaimAfterDays",
    "옛 주인이 아닌 NPC가 폐허에 정부를 짓기까지(일)",
    "Days before other NPCs may claim a ruin",
  ),
  k(
    "d510_npc_fund_pm",
    "npcFundPm",
    "주인 NPC 하루 넣는 국고 몫(‰)",
    "Owner NPC daily funding (‰ of treasury)",
  ),
  k(
    "d510_npc_invest_pm",
    "npcInvestPm",
    "다른 NPC 하루 투자 몫(‰, 상업 1000일 때)",
    "Other NPC daily investment (‰ at commerce 1000)",
  ),
  k(
    "d510_npc_restore_score",
    "restoreClaimScore",
    "NPC 폐허 정부 짓기 기본 점수",
    "NPC ruin claim base score",
    "npc",
  ),
  k(
    "d510_raze_aggression",
    "razeAggression",
    "약탈하고 폐허로 두는 공격 성향 문턱",
    "Aggression threshold to raze a conquered city",
    "npc",
  ),
];
