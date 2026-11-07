// 신전·종교 메시지 스키마 시험(프로토콜 12, docs/adr/2026-11-07-temple-religion.md) — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  ProtocolError,
  TEMPLE_PROTOCOL_VERSION,
  TEMPLE_RESULT_CODES,
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

describe("신전 메시지(프로토콜 12)", () => {
  it("기도·헌금·의식·비활성 만들기가 왕복하고 값 모양을 본다", () => {
    expect(TEMPLE_PROTOCOL_VERSION).toBe(12);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(TEMPLE_PROTOCOL_VERSION);
    const pray = { t: "temple_pray", id: 1, buildingId: 9 } as const;
    expect(decodeClientMessage(encodeMessage(pray))).toEqual(pray);
    const offer = { t: "temple_offer", id: 2, buildingId: 9, amount: "2500" } as const;
    expect(decodeClientMessage(encodeMessage(offer))).toEqual(offer);
    expect(decodes(decodeClientMessage, { ...offer, amount: "0" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...offer, amount: "-5" })).toBe(false);
    const rite = { t: "temple_rite", id: 3, buildingId: 9, unit: 41, rite: "deify", cost: "20000" } as const;
    expect(decodeClientMessage(encodeMessage(rite))).toEqual(rite);
    expect(decodes(decodeClientMessage, { ...rite, rite: "resurrect" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...rite, cost: "007" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...rite, unit: 0 })).toBe(false);
    const inactivate = { t: "dev_inactivate_unit", id: 4, unit: 41 } as const;
    expect(decodeClientMessage(encodeMessage(inactivate))).toEqual(inactivate);
  });

  it("결과: 성공 칸(유닛·신앙도·얻은 양)과 코드", () => {
    const ok = { t: "temple_result", id: 1, ok: true, faith: 51, gained: 1 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    expect(decodes(decodeServerMessage, { ...ok, faith: 101 })).toBe(false);
    for (const code of TEMPLE_RESULT_CODES) {
      const fail = { t: "temple_result", id: 2, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(decodes(decodeServerMessage, { t: "temple_result", id: 2, ok: false, code: "nope" })).toBe(false);
  });
});
