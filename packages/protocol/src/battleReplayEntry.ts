// 전투 리플레이 진입점 "@terra/protocol/battleReplay" — 모양(battleReplay.ts)과 이진 부호화(battleReplayCodec.ts).
// 따로 둔 이유: 리플레이를 쓰지 않는 묶음(첫 화면, 1차맵 워커)이 이 모듈을 끌고 오지 않게(planetTile 진입점과 같다)
export * from "./battleReplay.ts";
export {
  decodeBattleReplay,
  encodeBattleReplay,
  replayFromBase64,
  replayToBase64,
} from "./battleReplayCodec.ts";
export {
  type ReplayUnitState,
  admitJoined,
  applyReplayEvent,
  cloneState,
  replayStateAt,
  stateFromKeyframe,
} from "./battleReplayState.ts";
