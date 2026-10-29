// 메시지 인코딩 — 지금은 JSON. 측정 후 MessagePack으로 바꿀 수 있게 이 파일에만 둔다.
import type { z } from "zod";
import {
  type ClientMessage,
  type ServerMessage,
  clientMessageSchema,
  serverMessageSchema,
} from "./messages.ts";
import { ProtocolError } from "./errors.ts";
import { MAX_MESSAGE_BYTES } from "./version.ts";

export { ProtocolError };

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

/** 문자열의 UTF-8 바이트 길이 (브라우저·Node 공통, 환경 API 없이 계산) */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x1_0000 ? 3 : 4;
  }
  return bytes;
}

function decodeWith<T>(schema: z.ZodType<T>, raw: string): T {
  // 바이트 길이 한도 검사 (UTF-8 기준)
  if (utf8ByteLength(raw) > MAX_MESSAGE_BYTES) {
    throw new ProtocolError("message too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProtocolError("message is not valid JSON");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ProtocolError("message does not match schema");
  }
  return result.data;
}

export function decodeClientMessage(raw: string): ClientMessage {
  return decodeWith(clientMessageSchema, raw);
}

export function decodeServerMessage(raw: string): ServerMessage {
  return decodeWith(serverMessageSchema, raw);
}
