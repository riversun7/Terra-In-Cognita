// 폐허 복원 규칙·실행 모음(진입점 index.ts가 그대로 다시 내보낸다 — index.ts 1,000줄 상한) — docs/adr/2026-11-07-ruins-restoration.md.
// 규칙(society/restoration.ts)·실행(simulator/societyRuins.ts)은 시뮬·서버 같은 함수다. 서버는 정부 건물 상태 고리(GovernmentLookup)를 붙인다.
export type {
  GovernmentLookup,
  GovernmentStatus,
  RuinResult,
  RuinsSummary,
  SocietyRuins,
} from "./societyRuins.ts";
export {
  START_RESTORATION_COEFFICIENTS,
  contributionList,
  raisedOf,
  restorationGoal,
  restorationShares,
  type RestorationCoefficients,
} from "../society/restoration.ts";
