// 사업장 장부 메시지 스키마 시험(프로토콜 34, docs/adr/2026-11-15-business-ledger.md) — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  BUSINESS_PROTOCOL_VERSION,
  BUSINESS_RESULT_CODES,
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

describe("사업장 장부 메시지(프로토콜 34)", () => {
  it("판: 사업장 장부는 34부터, 받는 가장 낮은 판 = 현재 − 1", () => {
    expect(BUSINESS_PROTOCOL_VERSION).toBe(34);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(BUSINESS_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("기기 → 서버: 정산·넣기·사기·값·선물", () => {
    const messages = [
      { t: "business_settle", id: 1, buildingId: 7 },
      { t: "business_settle", id: 2, buildingId: 7, asset: "s3_test_credit", amount: "100" },
      { t: "business_invest", id: 3, buildingId: 7, asset: "cur:abc", amount: "5" },
      { t: "business_buy", id: 4, buildingId: 7, item: "item:wood", qty: 10 },
      { t: "business_price", id: 5, buildingId: 7, item: "item:wood", price: "0" },
      { t: "unit_gift", id: 6, unitId: 9, amount: "50" },
    ];
    for (const message of messages)
      expect(decodeClientMessage(encodeMessage(message as never))).toEqual(message);
  });

  it("틀린 값은 받지 않는다", () => {
    expect(
      decodes(decodeClientMessage, { t: "business_invest", id: 1, buildingId: 7, asset: "x", amount: "-1" }),
    ).toBe(false);
    expect(
      decodes(decodeClientMessage, { t: "business_buy", id: 1, buildingId: 7, item: "wood", qty: 1 }),
    ).toBe(false);
    expect(
      decodes(decodeClientMessage, { t: "business_buy", id: 1, buildingId: 7, item: "item:wood", qty: 0 }),
    ).toBe(false);
    expect(decodes(decodeClientMessage, { t: "unit_gift", id: 1, unitId: 0, amount: "1" })).toBe(false);
  });

  it("서버 → 기기: 결과", () => {
    expect(decodes(decodeServerMessage, { t: "business_result", id: 1, ok: true, paid: "10" })).toBe(true);
    for (const code of BUSINESS_RESULT_CODES)
      expect(decodes(decodeServerMessage, { t: "business_result", id: 1, ok: false, code })).toBe(true);
    expect(decodes(decodeServerMessage, { t: "business_result", id: 1, ok: false, code: "nope" })).toBe(
      false,
    );
  });
});
