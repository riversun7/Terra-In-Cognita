// 원자재 오브젝트 채집·건물 들어가기 메시지 스키마 시험(프로토콜 17, docs/adr/2026-11-07-gather-objects.md) — 왕복, 값 모양, 결과 코드, 판
import { describe, expect, it } from "vitest";
import {
  GATHER_PROTOCOL_VERSION,
  GATHER_RESULT_CODES,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
} from "./index.ts";

function decodes(decode: (text: string) => unknown, message: unknown): boolean {
  try {
    decode(JSON.stringify(message));
    return true;
  } catch (error) {
    if (error instanceof ProtocolError) return false;
    throw error;
  }
}

describe("채집·들어가기 메시지(프로토콜 17)", () => {
  it("판: 17부터, 받는 가장 낮은 판 16", () => {
    expect(GATHER_PROTOCOL_VERSION).toBe(17);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(17);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("채집 시작·멈추기·들어가기가 왕복하고 값 모양을 본다", () => {
    const start = {
      t: "gather_start",
      id: 1,
      unitId: 7,
      mapKey: 2 ** 40 + 9,
      objectId: 256 * 3 + 4,
    } as const;
    expect(decodeClientMessage(encodeMessage(start))).toEqual(start);
    const stop = { t: "gather_stop", id: 2, unitId: 7 } as const;
    expect(decodeClientMessage(encodeMessage(stop))).toEqual(stop);
    const enter = { t: "unit_enter", id: 3, unitId: 7, buildingId: 42 } as const;
    expect(decodeClientMessage(encodeMessage(enter))).toEqual(enter);
    expect(decodes(decodeClientMessage, { ...start, objectId: 65_536 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...start, unitId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...enter, buildingId: -1 })).toBe(false);
  });

  it("결과: 성공·모든 실패 코드, 모르는 코드는 거절", () => {
    expect(decodes(decodeServerMessage, { t: "gather_result", id: 1, ok: true })).toBe(true);
    for (const code of GATHER_RESULT_CODES)
      expect(decodes(decodeServerMessage, { t: "gather_result", id: 2, ok: false, code })).toBe(true);
    expect(decodes(decodeServerMessage, { t: "gather_result", id: 3, ok: false, code: "nope" })).toBe(false);
  });
});
