// 나라 세금 정하기 메시지(프로토콜 57, 기획 D-128·D-579, 질문 2322 나·2373 가) 스키마 시험 — 왕복, 칸 범위, null = 정하지 않음, 결과 코드
import { describe, expect, it } from "vitest";
import {
  NATION_TAX_LIMITS,
  NATION_TAX_PERIOD_PROTOCOL_VERSION,
  NATION_TAX_PROTOCOL_VERSION,
  NATION_TAX_RESULT_CODES,
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

const base = {
  t: "nation_tax",
  id: 4,
  incomeTaxBp: 300,
  residentTaxPm: 5,
  residentEveryDays: 7,
  residentNationPm: 200,
} as const;

describe("나라 세금 메시지(프로토콜 57)", () => {
  it("판: 지금 판 안", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(NATION_TAX_PROTOCOL_VERSION);
    // 주기 목록 밖 코드(D-585 2)는 프로토콜 61부터
    expect(NATION_TAX_PERIOD_PROTOCOL_VERSION).toBe(61);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(NATION_TAX_PERIOD_PROTOCOL_VERSION);
    expect(NATION_TAX_RESULT_CODES).toContain("invalid_period");
  });

  it("왕복·null = 정하지 않음", () => {
    expect(decodeClientMessage(encodeMessage(base))).toEqual(base);
    const unset = {
      ...base,
      incomeTaxBp: null,
      residentTaxPm: null,
      residentEveryDays: null,
      residentNationPm: null,
    };
    expect(decodeClientMessage(encodeMessage(unset))).toEqual(unset);
  });

  it("범위 밖·정수 아님·칸 빠짐은 거절(상한 = 셈이 뜻을 갖는 끝 — D-128 시스템 상한 없음)", () => {
    expect(decodes(decodeClientMessage, { ...base, incomeTaxBp: NATION_TAX_LIMITS.incomeTaxBp.max })).toBe(
      true,
    );
    expect(decodes(decodeClientMessage, { ...base, incomeTaxBp: 10_001 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...base, residentTaxPm: -1 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...base, residentEveryDays: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...base, residentEveryDays: 366 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...base, residentNationPm: 1.5 })).toBe(false);
    const { residentNationPm: _gone, ...missing } = base;
    expect(decodes(decodeClientMessage, missing)).toBe(false);
  });

  it("결과: 성공(나라)·실패 코드", () => {
    const ok = { t: "nation_tax_result", id: 4, ok: true, factionId: 12 } as const;
    // 세율 안건을 열었으면 agendaId(질문 2407 가 — 58판, 묶음 1116x — 줄기 governance-2 판 98)
    const agenda = { t: "nation_tax_result", id: 5, ok: true, factionId: 12, agendaId: 9 } as const;
    expect(decodeServerMessage(encodeMessage(agenda))).toEqual(agenda);
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of NATION_TAX_RESULT_CODES) {
      const fail = { t: "nation_tax_result", id: 4, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(decodes(decodeServerMessage, { t: "nation_tax_result", id: 4, ok: false, code: "nope" })).toBe(
      false,
    );
  });
});
