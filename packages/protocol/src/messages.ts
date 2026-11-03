// 메시지 정의 (Zod 스키마 = 런타임 검증 + 타입)
// 2차맵 메시지(구독·명령·전송)는 secondMap.ts(프로토콜 2부터), 사이보그 만들기 메시지는 cyborg.ts(프로토콜 4부터),
// 보유 물건 메시지는 items.ts(프로토콜 6부터), 구인 카드 고용 메시지는 recruit.ts(프로토콜 7부터)에 있다.
import { z } from "zod";
import { cyborgClientMessages, cyborgServerMessages } from "./cyborg.ts";
import { itemClientMessages, itemServerMessages } from "./items.ts";
import { recruitClientMessages, recruitServerMessages } from "./recruit.ts";
import { secondMapClientMessages, secondMapServerMessages } from "./secondMap.ts";

const nonNegativeInt = z.number().int().nonnegative();
const timestampMs = z.number().nonnegative();

// ---------- 기기 → 서버 ----------

/** 접속 직후 첫 메시지. 버전이 맞지 않으면 서버가 reject 후 연결을 끊는다. */
const helloMessage = z.object({
  t: z.literal("hello"),
  protocolVersion: nonNegativeInt,
  clientBuild: z.string().min(1).max(64),
});

/** 시계 차이 측정용 */
const pingMessage = z.object({
  t: z.literal("ping"),
  id: nonNegativeInt,
  clientSendTime: timestampMs,
});

export const clientMessageSchema = z.discriminatedUnion("t", [
  helloMessage,
  pingMessage,
  ...secondMapClientMessages,
  ...cyborgClientMessages,
  ...itemClientMessages,
  ...recruitClientMessages,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---------- 서버 → 기기 ----------

const welcomeMessage = z.object({
  t: z.literal("welcome"),
  protocolVersion: nonNegativeInt,
  simVersion: nonNegativeInt,
  contentVersion: z.string().min(1),
  serverTime: timestampMs,
});

/** 거절 사유는 문장 대신 코드로 보낸다 (기기가 번역) */
const rejectMessage = z.object({
  t: z.literal("reject"),
  code: z.enum(["protocol_unsupported", "hello_required", "invalid_message"]),
  minProtocolVersion: nonNegativeInt,
});

const pongMessage = z.object({
  t: z.literal("pong"),
  id: nonNegativeInt,
  clientSendTime: timestampMs,
  serverTime: timestampMs,
});

export const serverMessageSchema = z.discriminatedUnion("t", [
  welcomeMessage,
  rejectMessage,
  pongMessage,
  ...secondMapServerMessages,
  ...cyborgServerMessages,
  ...itemServerMessages,
  ...recruitServerMessages,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** `t`로 고른 메시지 타입 (예: `ClientMessageOf<"subscribe">`) */
export type ClientMessageOf<T extends ClientMessage["t"]> = Extract<ClientMessage, { t: T }>;
export type ServerMessageOf<T extends ServerMessage["t"]> = Extract<ServerMessage, { t: T }>;
