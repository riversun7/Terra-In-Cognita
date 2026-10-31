// 사이보그 만들기 판정 진입점(@terra/sim/cyborg) — ADR 2026-11-01-first-login-cyborg 3절.
// 꾸러미 진입점(index.ts)과 나눠 둔다(세력 줄기와 같은 파일을 덜 고치게).
export {
  CYBORG_TEMPERAMENTS,
  TEST_CYBORG_CREATION,
  crowdingBand,
  cyborgRollLimit,
  isCyborgTemperament,
  isInitialDistribution,
  rollGrowthK,
  rollInitialStats,
  temperamentWeights,
  type CyborgCreationCoefficients,
  type CyborgTemperamentId,
  type GrowthKRange,
  type InitialStatRange,
} from "./initialStats.ts";
export { cyborgCreationFrom } from "../tuning.ts";
