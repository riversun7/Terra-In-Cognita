// 가문 창설 메시지 스키마 시험(프로토콜 22, docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)") — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  HOUSE_PROTOCOL_VERSION,
  HOUSE_RESULT_CODES,
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

describe("가문 창설 메시지(프로토콜 22)", () => {
  it("판: 22부터", () => {
    expect(HOUSE_PROTOCOL_VERSION).toBe(22);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_PROTOCOL_VERSION);
  });

  it("창설이 왕복하고 비용 모양을 본다(음수·앞자리 0 거절)", () => {
    const found = { t: "house_found", id: 7, cost: "0" } as const;
    expect(decodeClientMessage(encodeMessage(found))).toEqual(found);
    expect(decodes(decodeClientMessage, { ...found, cost: "250" })).toBe(true);
    expect(decodes(decodeClientMessage, { ...found, cost: "-1" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...found, cost: "01" })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_found", id: 7 })).toBe(false);
  });

  it("결과: 성공 칸과 실패 코드", () => {
    const ok = { t: "house_result", id: 7, ok: true, factionId: 40, paid: "0" } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of HOUSE_RESULT_CODES) {
      const fail = { t: "house_result", id: 7, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(decodes(decodeServerMessage, { t: "house_result", id: 7, ok: false, code: "nope" })).toBe(false);
  });
});
