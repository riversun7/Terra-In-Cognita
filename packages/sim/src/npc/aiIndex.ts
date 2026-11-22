// NPC 자율행동·7축 성향·조직 합성·충성도 개입 전용 진입점 (@terra/sim/npcAi)
// docs/adr/2026-11-20-npc-autonomous-ai.md
export * from "./aiCoefficients.ts";
export * from "./effectiveTraits.ts";
export * from "./unitBrain.ts";
export * from "./unitDrives.ts";
export * from "./houseBrain.ts";
export * from "./houseOrders.ts";
export * from "./diplomacyAi.ts";
export { chooseCombatTacticFromTraits, moveSkillAllowed, wantsRun } from "../combat/moveAi.ts";
export { NPC_AI_TUNING_KEYS } from "../tuningNpcAi.ts";
export * from "./relationScore.ts";
