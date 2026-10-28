import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  ProtocolError,
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
    expect(isProtocolSupported(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isProtocolSupported(0)).toBe(false);
    expect(isProtocolSupported(1.5)).toBe(false);
  });
});
