// 가문 창설(프로토콜 22)·가입(23) 메시지 스키마 시험( docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)") — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  HOUSE_MEMBER_ACTIONS,
  HOUSE_MEMBER_PROTOCOL_VERSION,
  HOUSE_MEMBER_RESULT_CODES,
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

describe("가문 가입 메시지(프로토콜 23, 질문 985 다)", () => {
  const USER = "0b6f3f7e-1a2b-4c3d-8e9f-0123456789ab";

  it("판: 23부터", () => {
    expect(HOUSE_MEMBER_PROTOCOL_VERSION).toBe(23);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_MEMBER_PROTOCOL_VERSION);
  });

  it("초대·신청·답·거두기·나가기·내보내기가 왕복한다", () => {
    const messages = [
      { t: "house_invite", id: 1, name: "철수" },
      { t: "house_apply", id: 2, factionId: 40 },
      { t: "house_answer", id: 3, requestId: 9, accept: true },
      { t: "house_answer", id: 4, requestId: 9, accept: false },
      { t: "house_withdraw", id: 5, requestId: 9 },
      { t: "house_leave", id: 6 },
      { t: "house_kick", id: 7, userId: USER },
    ] as const;
    for (const message of messages) expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
  });

  it("모양이 틀리면 거절: 빈 이름·33자 이름·0 가문·uuid가 아닌 사용자·답 없는 받기", () => {
    expect(decodes(decodeClientMessage, { t: "house_invite", id: 1, name: "" })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_invite", id: 1, name: "가".repeat(33) })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_apply", id: 1, factionId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_kick", id: 1, userId: "user_1" })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_answer", id: 1, requestId: 3 })).toBe(false);
  });

  it("결과: 성공한 일과 실패 코드", () => {
    for (const action of HOUSE_MEMBER_ACTIONS) {
      const ok = { t: "house_member_result", id: 7, ok: true, action, factionId: 40 } as const;
      expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    }
    for (const code of HOUSE_MEMBER_RESULT_CODES) {
      const fail = { t: "house_member_result", id: 7, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(
      decodes(decodeServerMessage, {
        t: "house_member_result",
        id: 7,
        ok: true,
        action: "nope",
        factionId: 1,
      }),
    ).toBe(false);
  });
});
