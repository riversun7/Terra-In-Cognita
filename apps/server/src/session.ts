// WebSocket 세션 — 접속 핸드셰이크(버전 확인), 시계 동기화 ping/pong, 연결 유지 확인
import {
  HEARTBEAT_INTERVAL_MS,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  type ServerMessage,
  decodeClientMessage,
  encodeMessage,
  isProtocolSupported,
} from "@terra/protocol";
import type { WebSocket } from "@fastify/websocket";
import type { RawData } from "ws";

export interface SessionContext {
  simVersion: number;
  contentVersion: string;
  now: () => number;
}

// 정책 위반으로 닫을 때 쓰는 WebSocket 종료 코드
const CLOSE_POLICY_VIOLATION = 1008;

/** ws가 넘겨주는 메시지 데이터(Buffer, ArrayBuffer, Buffer 배열)를 UTF-8 문자열로 */
function rawDataToText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

export function handleSession(socket: WebSocket, context: SessionContext): void {
  let greeted = false;
  let alive = true;

  const send = (message: ServerMessage): void => {
    socket.send(encodeMessage(message));
  };

  const reject = (code: "protocol_unsupported" | "hello_required" | "invalid_message"): void => {
    send({ t: "reject", code, minProtocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION });
    socket.close(CLOSE_POLICY_VIOLATION, code);
  };

  // 프록시 유휴 끊김 방지 + 죽은 연결 정리
  const heartbeat = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);
  socket.on("pong", () => {
    alive = true;
  });
  socket.on("close", () => clearInterval(heartbeat));

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      reject("invalid_message");
      return;
    }
    let message: ReturnType<typeof decodeClientMessage>;
    try {
      message = decodeClientMessage(rawDataToText(data));
    } catch (error) {
      if (error instanceof ProtocolError) {
        reject("invalid_message");
        return;
      }
      throw error;
    }

    if (!greeted) {
      if (message.t !== "hello") {
        reject("hello_required");
        return;
      }
      if (!isProtocolSupported(message.protocolVersion)) {
        reject("protocol_unsupported");
        return;
      }
      greeted = true;
      send({
        t: "welcome",
        protocolVersion: PROTOCOL_VERSION,
        simVersion: context.simVersion,
        contentVersion: context.contentVersion,
        serverTime: context.now(),
      });
      return;
    }

    switch (message.t) {
      case "ping":
        send({
          t: "pong",
          id: message.id,
          clientSendTime: message.clientSendTime,
          serverTime: context.now(),
        });
        return;
      case "hello":
        // 이미 인사한 연결의 중복 hello는 무시한다
        return;
    }
  });
}
