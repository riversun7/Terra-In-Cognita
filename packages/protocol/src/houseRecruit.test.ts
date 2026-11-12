// 가문 도시 구인 메시지(프로토콜 25, 질문 1041 다) 스키마 시험 — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  HOUSE_RECRUIT_PROTOCOL_VERSION,
  HOUSE_RECRUIT_RESULT_CODES,
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

describe("가문 도시 구인 메시지(프로토콜 25)", () => {
  it("판: 25부터", () => {
    expect(HOUSE_RECRUIT_PROTOCOL_VERSION).toBe(25);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_RECRUIT_PROTOCOL_VERSION);
  });

  it("켬·끔과 사기가 왕복하고 값 모양을 본다", () => {
    const auto = { t: "house_recruit_auto", id: 3, on: false } as const;
    expect(decodeClientMessage(encodeMessage(auto))).toEqual(auto);
    expect(decodes(decodeClientMessage, { ...auto, on: "no" })).toBe(false);
    const hire = { t: "house_recruit_hire", id: 4, cityId: 12, window: 99, slot: 2, cost: "300" } as const;
    expect(decodeClientMessage(encodeMessage(hire))).toEqual(hire);
    expect(decodes(decodeClientMessage, { ...hire, cost: "-3" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...hire, slot: 64 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...hire, cityId: 0 })).toBe(false);
  });

  it("결과: 성공(낸 곳)·실패 코드", () => {
    const ok = {
      t: "house_recruit_result",
      id: 4,
      ok: true,
      auto: false,
      unitId: 77,
      payer: "leader",
    } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    expect(decodes(decodeServerMessage, { t: "house_recruit_result", id: 3, ok: true, auto: true })).toBe(
      true,
    );
    for (const code of HOUSE_RECRUIT_RESULT_CODES)
      expect(decodes(decodeServerMessage, { t: "house_recruit_result", id: 1, ok: false, code })).toBe(true);
    expect(decodes(decodeServerMessage, { t: "house_recruit_result", id: 1, ok: false, code: "nope" })).toBe(
      false,
    );
  });
});
