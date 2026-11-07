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
  nextFxRoundAt,
  scheduleEconomy,
  scheduleProduce,
  workerEffects,
  type EcoFacility,
  type Economy,
  type GatherSettings,
} from "./economy.ts";
// 폐허가 된 도시 창고 물건의 갈 곳(기획 D-518 535·540 나 — 시뮬·서버 같은 규칙)
export {
  nearestOtherCity,
  rehomeRuinedGoods,
  ruinedGoodsHome,
  type CityDistance,
  type RuinedGoodsHome,
} from "./ruinedGoods.ts";
export { runEconomy, type EconomyRun, type EconomySummary } from "./economyRun.ts";
export { cityTargets, marketRefPrice, onTrade, placeCityBids } from "./npcTrade.ts";
// 도시 일꾼 나누기(굶음 먼저, 기획 답 532 나 — docs/adr/2026-11-07-play-flow.md WP5)
export { assignCityWorkers, type CityWorkSlot } from "./cityWorkers.ts";
// 도시 계획(나라 특산이 건물 레시피를 고름 553 나, 처음 창고 = 생필품 몇 시간분 + 특산 고정 양 554 다 — WP10)
export {
  START_NECESSITY_HOURS,
  cityStartStock,
  planCityFacilities,
  type CityBuilding,
  type CityJob,
  type PlannedFacility,
} from "./cityPlan.ts";
export type { ScenarioEconomy } from "./scenario.ts";
