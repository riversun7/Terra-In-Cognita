// 배 메시지 스키마 시험(프로토콜 27, docs/adr/2026-11-13-boats.md) — 왕복, 값 모양, 결과 코드, 판
import { describe, expect, it } from "vitest";
import {
  BOAT_B2_PROTOCOL_VERSION,
  BOAT_PROTOCOL_VERSION,
  BOAT_RESULT_CODES,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  RESULT_CODES,
  UNIT_WIRE_KINDS,
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

describe("배 메시지(프로토콜 27)", () => {
  it("판: 27부터, 받는 가장 낮은 판 = 현재 − 1", () => {
    expect(BOAT_PROTOCOL_VERSION).toBe(27);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(BOAT_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("만들기·타기·내리기가 왕복하고 값 모양을 본다", () => {
    const build = { t: "boat_build", id: 1, buildingId: 12 } as const;
    expect(decodeClientMessage(encodeMessage(build))).toEqual(build);
    const board = { t: "boat_board", id: 2, unitId: 7, boatId: 9 } as const;
    expect(decodeClientMessage(encodeMessage(board))).toEqual(board);
    const leave = { t: "boat_leave", id: 3, boatId: 9 } as const;
    expect(decodeClientMessage(encodeMessage(leave))).toEqual(leave);
    expect(decodes(decodeClientMessage, { ...board, boatId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...build, buildingId: -1 })).toBe(false);
  });

  it("결과: 성공 칸(배 ID·걷는 중)과 실패 코드", () => {
    const made = { t: "boat_result", id: 1, ok: true, boatId: 40 } as const;
    expect(decodeServerMessage(encodeMessage(made))).toEqual(made);
    const walking = { t: "boat_result", id: 2, ok: true, walking: true } as const;
    expect(decodeServerMessage(encodeMessage(walking))).toEqual(walking);
    for (const code of BOAT_RESULT_CODES) {
      const failed = { t: "boat_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    expect(decodes(decodeServerMessage, { t: "boat_result", id: 3, ok: false, code: "nope" })).toBe(false);
  });

  it("B2(28): 만드는 중 readyAtMs·dock_busy", () => {
    expect(BOAT_B2_PROTOCOL_VERSION).toBe(28);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(BOAT_B2_PROTOCOL_VERSION);
    const started = { t: "boat_result", id: 4, ok: true, readyAtMs: 1_800_000_000_000 } as const;
    expect(decodeServerMessage(encodeMessage(started))).toEqual(started);
    const busy = {
      t: "boat_result",
      id: 5,
      ok: false,
      code: "dock_busy",
      readyAtMs: 1_800_000_000_000,
    } as const;
    expect(decodeServerMessage(encodeMessage(busy))).toEqual(busy);
    expect(decodes(decodeServerMessage, { ...started, readyAtMs: -1 })).toBe(false);
  });

  it("이동 결과 코드 aboard, 표시 종류 boat", () => {
    expect(RESULT_CODES).toContain("aboard");
    expect(UNIT_WIRE_KINDS).toContain("boat");
  });
});
