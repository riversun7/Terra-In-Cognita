// 군단 명령 2단계(기획 D-558) 내보내기 묶음 — 지휘 계급·대형·전개 방식·웨이브 수비 상한. index.ts가 통째로 다시 내보낸다(1,000줄 상한으로 나눔)
export { FOLLOW_GAP_CELLS } from "./orders.ts";
export {
  COMMAND_TIER_STEPS,
  COMMAND_TITLE_STEPS,
  type CommandCapCoefficients,
  type CommandRank,
  combatTierIndex,
  commandCapOf,
  commanderOrder,
} from "./command.ts";
export {
  DEFAULT_FORMATION,
  FORMATION_SHAPES,
  type FormationShape,
  formationOffsets,
  isFormationShape,
} from "./formation.ts";
export { TACTICS, type Tactic, isTactic, talentUnit } from "./tactics.ts";
export { WAVE_DEFENDERS_DEFAULT, waveDefendersMaxOf } from "../gardener/coefficients.ts";
