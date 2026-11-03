// WebSocket 세션 — 접속 핸드셰이크(버전 확인), 시계 동기화 ping/pong, 연결 유지 확인, 2차맵 메시지 넘기기
// 2차맵 메시지(구독·명령)는 프로토콜 2로 인사한 연결만 보낼 수 있다. 1로 인사한 연결이 보내면 invalid_message로 거절한다
// (프로토콜 1에는 없는 메시지다). 그래서 1로 인사한 기기는 2차맵 서버 메시지를 받지 않는다.
import {
  HEARTBEAT_INTERVAL_MS,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  SECOND_MAP_PROTOCOL_VERSION,
  CYBORG_PROTOCOL_VERSION,
  CYBORG_ELEMENTS_PROTOCOL_VERSION,
  TERRITORY_PROTOCOL_VERSION,
  ITEM_PROTOCOL_VERSION,
  type ServerMessage,
  decodeClientMessage,
  encodeMessage,
  isProtocolSupported,
} from "@terra/protocol";
import type { WebSocket } from "@fastify/websocket";
import type { RawData } from "ws";
import type { Viewer } from "./trpc/context.ts";
import type { CyborgGateway, CyborgSocket } from "./cyborg/gateway.ts";
import type { TerritoryGateway, TerritorySocket } from "./territory/gateway.ts";
import type { ItemGateway, ItemSocket } from "./holdings/gateway.ts";
import type { WorldGateway, WorldSocket } from "./world/gateway.ts";

export interface SessionContext {
  simVersion: number;
  contentVersion: string;
  now: () => number;
  /** 2차맵(S1). 없으면 2차맵 요청에 unknown_map */
  world?: WorldGateway | undefined;
  /** 사이보그 만들기(프로토콜 4, docs/adr/2026-11-01-first-login-cyborg.md 4절). 없으면 busy */
  cyborg?: CyborgGateway | undefined;
  /** 영토 비콘(프로토콜 7, docs/adr/2026-11-03-territory-layer.md 4절). 없으면 busy */
  territory?: TerritoryGateway | undefined;
  /** 보유 물건(프로토콜 6, docs/adr/2026-11-03-item-holdings.md 5절). 없으면 busy */
  items?: ItemGateway | undefined;
  /** 이 연결의 로그인 사용자(쿠키). 로그인하지 않았거나 인증이 꺼져 있으면 null */
  viewer?: (() => Promise<Viewer | null>) | undefined;
  /**
   * 접속 상태(S3 ADR 4절, D-136): 인사한 로그인 연결마다 connect, 끊기면 돌려받은 함수를 부른다.
   * 모든 연결이 끊긴 시각부터 오프라인 24시간을 센다
   */
  presence?: { connect(userId: string): () => void } | undefined;
}

// 정책 위반으로 닫을 때 쓰는 WebSocket 종료 코드
const CLOSE_POLICY_VIOLATION = 1008;

const signedOut = (): Promise<Viewer | null> => Promise.resolve(null);

/** ws가 넘겨주는 메시지 데이터(Buffer, ArrayBuffer, Buffer 배열)를 UTF-8 문자열로 */
function rawDataToText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

export function handleSession(socket: WebSocket, context: SessionContext): void {
  let greeted = false;
  let protocolVersion = 0;
  let alive = true;
  let closed = false;
  let worldSocket: WorldSocket | undefined;
  let cyborgSocket: CyborgSocket | undefined;
  let territorySocket: TerritorySocket | undefined;
  let itemSocket: ItemSocket | undefined;
  let releasePresence: (() => void) | undefined;

  const sendText = (text: string): void => {
    if (socket.readyState === socket.OPEN) socket.send(text);
  };
  const send = (message: ServerMessage): void => {
    sendText(encodeMessage(message));
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
  socket.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    worldSocket?.close();
    cyborgSocket?.close();
    territorySocket?.close();
    itemSocket?.close();
    releasePresence?.();
  });

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
      protocolVersion = message.protocolVersion;
      send({
        t: "welcome",
        protocolVersion: PROTOCOL_VERSION,
        simVersion: context.simVersion,
        contentVersion: context.contentVersion,
        serverTime: context.now(),
      });
      const { presence, viewer } = context;
      if (presence && viewer) {
        void viewer().then(
          (found) => {
            if (found && !closed) releasePresence = presence.connect(found.id);
          },
          () => undefined,
        );
      }
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
      case "subscribe":
      case "unsubscribe":
      case "move_unit":
      case "place_building":
      case "remove_building":
      case "dev_spawn_units": {
        if (protocolVersion < SECOND_MAP_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.world) {
          send({ t: "result", id: message.id, ok: false, code: "unknown_map" });
          return;
        }
        worldSocket ??= context.world.open({
          send: sendText,
          bufferedAmount: () => socket.bufferedAmount,
          viewer: context.viewer ?? signedOut,
        });
        worldSocket.handle(message);
        return;
      }
      case "cyborg_roll":
      case "cyborg_create":
      case "cyborg_elements": {
        // 굴리기·만들기는 프로토콜 4, 속성 분배는 5의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다(2차맵 메시지와 같은 규칙)
        const needs =
          message.t === "cyborg_elements" ? CYBORG_ELEMENTS_PROTOCOL_VERSION : CYBORG_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.cyborg) {
          send({ t: "cyborg_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        cyborgSocket ??= context.cyborg.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        cyborgSocket.handle(message);
        return;
      }
      case "beacon_place":
      case "beacon_remove": {
        // 영토 비콘은 프로토콜 7의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < TERRITORY_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.territory) {
          send({ t: "beacon_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        territorySocket ??= context.territory.open({ send: sendText, viewer: context.viewer ?? signedOut });
        territorySocket.handle(message);
        return;
      }
      case "item_equip":
      case "item_unequip":
      case "item_use":
      case "dev_grant_item": {
        // 프로토콜 6의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다(사이보그 메시지와 같은 규칙)
        if (protocolVersion < ITEM_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.items) {
          send({ t: "item_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        itemSocket ??= context.items.open({ send: sendText, viewer: context.viewer ?? signedOut });
        itemSocket.handle(message);
        return;
      }
    }
  });
}
