// 폐허 복원 설정 칸 값 ↔ 계수표 — 기획 D-510·D-339·D-343·D-344, docs/adr/2026-11-07-ruins-restoration.md.
// 팩 항목 ID ↔ 세력·사회 계수표 restoration 칸(경로). 출발값은 society/restoration.ts START_RESTORATION_COEFFICIENTS(모두 [임시]).
// 49에 칸이 없어 결정 번호를 앞머리로 쓴다(d499_*·d517_*와 같은 꼴).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `restoration.${path}`,
  structural: false,
  ko,
  en,
});

export const RESTORATION_TUNING_KEYS: readonly TuningKey[] = [
  k("d510_claim_cost", "claimCost", "NPC 정부 짓기 값(최소 단위)", "NPC government build cost (minor units)"),
  k("d510_restore_goal", "goal", "복원 목표(최소 단위)", "Restoration goal (minor units)"),
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
];
