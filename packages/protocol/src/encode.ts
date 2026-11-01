// 메시지 보내기 형식 — 지금은 JSON. 읽기(검사)는 codec.ts. 측정 후 MessagePack으로 바꾸면 이 파일과 codec.ts 둘만 고친다.
// 따로 둔 이유: 보내기만 하는 쪽(기기의 기능 통로, 첫 화면 묶음)이 메시지 스키마(zod)를 끌고 오지 않게
// (errors.ts와 같은 까닭, ADR 2026-10-29-app-shell 11절 "첫 화면 줄이기").
import type { ClientMessage, ServerMessage } from "./messages.ts";

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}
