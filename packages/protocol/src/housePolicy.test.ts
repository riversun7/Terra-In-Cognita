// 가문 금고 기부·가문세율·도시 짓기 정책 메시지(프로토콜 54, 기획 D-574 2150·2124) 스키마 시험 — 왕복, 값 모양, 새 한 일·코드
import { describe, expect, it } from "vitest";
import {
  HOUSE_MEMBER_ACTIONS,
  HOUSE_MEMBER_RESULT_CODES,
  HOUSE_POLICY_PROTOCOL_VERSION,
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

describe("가문 정책 메시지(프로토콜 54)", () => {
  it("판: 54부터", () => {
    expect(HOUSE_POLICY_PROTOCOL_VERSION).toBe(54);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_POLICY_PROTOCOL_VERSION);
  });

  it("기부: 양의 정수 글자(15자리까지)만 — 0·음수·앞자리 0·16자리 거절", () => {
    const donate = { t: "house_donate", id: 3, amount: "250" } as const;
    expect(decodeClientMessage(encodeMessage(donate))).toEqual(donate);
    for (const amount of ["0", "-5", "007", "1234567890123456", "1.5"])
      expect(decodes(decodeClientMessage, { ...donate, amount })).toBe(false);
  });

  it("금고 꺼내기(D-576): 기부와 같은 양 꼴", () => {
    const take = { t: "house_vault_take", id: 6, amount: "40" } as const;
    expect(decodeClientMessage(encodeMessage(take))).toEqual(take);
    expect(decodes(decodeClientMessage, { ...take, amount: "0" })).toBe(false);
  });

  it("가문세율: 0~1000‰ 정수", () => {
    const tax = { t: "house_tax", id: 4, ratePm: 125 } as const;
    expect(decodeClientMessage(encodeMessage(tax))).toEqual(tax);
    expect(decodes(decodeClientMessage, { ...tax, ratePm: 0 })).toBe(true);
    for (const ratePm of [-1, 1001, 2.5])
      expect(decodes(decodeClientMessage, { ...tax, ratePm })).toBe(false);
  });

  it("도시 짓기 정책: 도시 ID와 허용·막음·null(기본값)", () => {
    const build = { t: "house_build_policy", id: 5, cityId: 77, allow: false } as const;
    expect(decodeClientMessage(encodeMessage(build))).toEqual(build);
    expect(decodes(decodeClientMessage, { ...build, allow: null })).toBe(true);
    expect(decodes(decodeClientMessage, { ...build, cityId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_build_policy", id: 5, cityId: 77 })).toBe(false);
  });

  it("새 한 일·코드가 house_member_result로 간다", () => {
    for (const action of ["donated", "vault_taken", "tax_set", "build_policy_set"] as const) {
      expect(HOUSE_MEMBER_ACTIONS).toContain(action);
      const ok = { t: "house_member_result", id: 1, ok: true, action, factionId: 9 } as const;
      expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    }
    for (const code of ["insufficient_funds", "tax_too_high"] as const) {
      expect(HOUSE_MEMBER_RESULT_CODES).toContain(code);
      const no = { t: "house_member_result", id: 2, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(no))).toEqual(no);
    }
  });
});
