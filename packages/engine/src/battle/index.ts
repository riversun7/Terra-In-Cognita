// @terra/engine/battle — 전투 효과 층(2차맵 엔진 덧그림 층). docs/adr/2026-11-01-battle-replay.md 6절.
// 따로 진입점이라 지도 화면 묶음에 들지 않는다(전투 보기 화면만 가져온다)
export {
  BATTLE_ELEMENT_COLORS,
  BATTLE_FX_COLORS,
  BATTLE_TEAM_COLORS,
  BattleFxLayer,
  type BattleFxItem,
  type BattleFxUnit,
  elementColor,
  teamColor,
} from "./battleFx.ts";
