import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_BYTES,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  SEGMENT_SPEED_PROTOCOL_VERSION,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
  isProtocolSupported,
} from "./index.ts";
import { utf8ByteLength } from "./codec.ts";

describe("codec", () => {
  it("hello 메시지를 왕복 변환한다", () => {
    const raw = encodeMessage({ t: "hello", protocolVersion: PROTOCOL_VERSION, clientBuild: "dev" });
    expect(decodeClientMessage(raw)).toEqual({
      t: "hello",
      protocolVersion: PROTOCOL_VERSION,
      clientBuild: "dev",
    });
  });

  it("스키마에 맞지 않는 메시지는 거부한다", () => {
    expect(() => decodeClientMessage('{"t":"hello"}')).toThrow(ProtocolError);
    expect(() => decodeClientMessage("not json")).toThrow(ProtocolError);
    expect(() => decodeClientMessage('{"t":"unknown"}')).toThrow(ProtocolError);
  });

  it("크기 한도를 넘는 메시지는 거부한다", () => {
    const big = JSON.stringify({
      t: "hello",
      protocolVersion: 1,
      clientBuild: "x".repeat(MAX_MESSAGE_BYTES),
    });
    expect(() => decodeClientMessage(big)).toThrow(ProtocolError);
  });

  it("서버 메시지를 검증한다", () => {
    const raw = encodeMessage({ t: "pong", id: 1, clientSendTime: 10, serverTime: 20 });
    expect(decodeServerMessage(raw)).toEqual({ t: "pong", id: 1, clientSendTime: 10, serverTime: 20 });
  });
});

describe("utf8ByteLength", () => {
  it("한글·이모지 바이트 수를 센다", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("한")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("🙂")).toBe(4);
  });
});

describe("isProtocolSupported", () => {
  it("현재 버전은 지원하고 범위 밖은 거부한다", () => {
    expect(isProtocolSupported(PROTOCOL_VERSION)).toBe(true);
    // 3은 예외로 직전 버전(2)을 받지 않는다: 시야 전송은 보안 규칙이라 걸러지지 않은 2판 흐름을 남기지 않는다(version.ts).
    // 4는 더하기만 해서(사이보그 만들기) 직전 버전 3을 받았다. 5(속성 분배)는 직전 버전 4를 받는다(현재 + 직전 1개, ADR 7).
    // 6(보유 물건)·7(영토 비콘)도 현재 + 직전 1개다(ADR 7)
    expect(isProtocolSupported(MIN_SUPPORTED_PROTOCOL_VERSION)).toBe(true);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBeGreaterThanOrEqual(PROTOCOL_VERSION - 1);
    // 29는 예외로 직전 버전(28)을 받지 않는다: 구간 걸음 배율(pace)을 모르는 기기는 유닛 위치를 틀리게 그린다(version.ts)
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(SEGMENT_SPEED_PROTOCOL_VERSION);
    expect(isProtocolSupported(MIN_SUPPORTED_PROTOCOL_VERSION - 1)).toBe(false);
    expect(isProtocolSupported(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isProtocolSupported(0)).toBe(false);
    expect(isProtocolSupported(1.5)).toBe(false);
  });
});
