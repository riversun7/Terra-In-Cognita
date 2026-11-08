// 공성 결과 셋·환생 어드밴티지 모음(진입점 index.ts가 그대로 다시 내보낸다 — index.ts 1,000줄 상한) — 기획 D-520·D-527,
// docs/adr/2026-11-07-war-outcomes.md. 규칙(society/warOutcomes.ts)·고르기(npc/policy.ts)·실행(simulator/societyWar.ts)은 시뮬·서버 같은 함수다.
export {
  START_WAR_COEFFICIENTS,
  WAR_OUTCOMES,
  WAR_STATE_END_REASONS,
  bpShare,
  govRebuildCost,
  isWarOutcome,
  isWarStateEndReason,
  occupationTax,
  rebuildCost,
  type WarCoefficients,
  type WarOutcome,
  type WarStateEndReason,
} from "../society/warOutcomes.ts";
export { occupationChoice, type OccupationChoice } from "../npc/policy.ts";
export type { SocietyWar, WarSummary } from "./societyWar.ts";
export type { WarOutcomeEvent } from "./societyTypes.ts";
export type { SimOccupation } from "./world.ts";
export {
  HUMAN_BASE_K_PM,
  applyRebirthAdvantage,
  rebirthAdvantage,
  type RebirthAdvantage,
} from "../society/temple.ts";
