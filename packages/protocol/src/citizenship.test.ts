// 국적 바꾸기 메시지 스키마 시험(프로토콜 18, docs/adr/2026-11-08-citizenship.md) — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  CITIZENSHIP_PROTOCOL_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  NATIONALITY_RESULT_CODES,
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

describe("국적 바꾸기 메시지(프로토콜 18)", () => {
  it("판: 국적 바꾸기는 18부터, 받는 가장 낮은 판 = 현재 − 1", () => {
    expect(CITIZENSHIP_PROTOCOL_VERSION).toBe(18);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(CITIZENSHIP_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("신청이 왕복하고 값 모양을 본다", () => {
    const change = { t: "nationality_change", id: 3, buildingId: 12, factionId: 4, cost: "208" } as const;
    expect(decodeClientMessage(encodeMessage(change))).toEqual(change);
    expect(decodes(decodeClientMessage, { ...change, cost: "-1" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...change, cost: "007" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...change, buildingId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...change, factionId: 1.5 })).toBe(false);
    const { factionId: _faction, ...missing } = change;
    expect(decodes(decodeClientMessage, missing)).toBe(false);
  });

  it("결과: 성공 칸과 실패 코드", () => {
    const ok = {
      t: "nationality_result",
      id: 3,
      ok: true,
      factionId: 4,
      cityId: 9,
      paid: "100",
      returned: "108",
      nextAtMs: 1_800_000_000_000,
    } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    expect(decodes(decodeServerMessage, { ...ok, returned: "-5" })).toBe(false);
    for (const code of NATIONALITY_RESULT_CODES) {
      const fail = { t: "nationality_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(decodes(decodeServerMessage, { t: "nationality_result", id: 3, ok: false, code: "nope" })).toBe(
      false,
    );
  });
});
