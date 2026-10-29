// 타일 원천이 준 것 → 풀어 둔 타일. 메시 워커(tileWorker.ts)와 화면 스레드 대체 경로(tileBuilder.ts)가 같이 쓴다.
// 워커가 tileBuilder.ts의 값을 가져오면 그 안의 `new Worker(new URL(…))`까지 워커 묶음에 들어가므로 따로 둔다.
// 해석기는 진입점 "@terra/protocol/planetTile"에서 가져온다: 묶음 전체("@terra/protocol")는 zod 메시지 스키마까지
// 워커에 넣는다(빌드로 확인: 메시 워커 5.5kB → 103kB).
import { decodePlanetTile } from "@terra/protocol/planetTile";
import { type DecodedTile, type EncodedTile, isEncodedTile } from "./planetTypes.ts";

/** 받은 이진이면 풀고(틀리면 ProtocolError: 마법 값·형식 버전·머리 값·길이), 풀어 둔 타일이면 그대로 */
export function decodeTileInput(input: DecodedTile | EncodedTile): DecodedTile {
  return isEncodedTile(input) ? decodePlanetTile(input.bytes) : input;
}
