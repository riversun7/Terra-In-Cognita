// 서버 NPC 도시 경제가 쓰는 시뮬 경제 실행·NPC 거래 규칙 모음(진입점 index.ts가 그대로 다시 내보낸다) — docs/adr/2026-11-07-play-flow.md WP4.
// 서버(apps/server/src/npc/economy.ts)는 시나리오 경제(createEconomy) 대신 거울 세계에서 경제 자료를 차리고 같은 실행(runEconomy)을 돌린다.
export {
  EVENT_CARGO,
  EVENT_FX,
  EVENT_PRODUCE,
  EVENT_TRADE,
  EVENT_UPKEEP,
  checkEconomy,
  defaultGatherStat,
  oldestHome,
  scheduleEconomy,
  scheduleProduce,
  workerEffects,
  type EcoFacility,
  type Economy,
  type GatherSettings,
  type RuinedGoodsHome,
} from "./economy.ts";
export { runEconomy, type EconomyRun, type EconomySummary } from "./economyRun.ts";
export { cityTargets, marketRefPrice, onTrade } from "./npcTrade.ts";
export type { ScenarioEconomy } from "./scenario.ts";
