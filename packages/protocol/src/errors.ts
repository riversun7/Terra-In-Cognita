// 프로토콜 읽기 오류 — 메시지(codec.ts)·이진 형식(terrain.ts·planetTile.ts)이 같이 쓴다.
// 따로 둔 이유: 이진 형식만 쓰는 쪽(1차맵 메시 워커, 진입점 "@terra/protocol/planetTile")이 메시지 스키마(zod)를 끌고 오지 않게.
export class ProtocolError extends Error {
  override readonly name = "ProtocolError";
}
