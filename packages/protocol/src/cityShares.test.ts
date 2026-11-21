// 도시(정부) 지분 주문 메시지(기획 D-583, 질문 2438 답) 스키마 시험 — 왕복, 값·주 수 꼴, asHouse 선택, 결과 코드
import { describe, expect, it } from "vitest";
import {
  CITY_SHARE_PROTOCOL_VERSION,
  CITY_SHARE_RESULT_CODES,
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

const order = { t: "city_share_order", id: 3, cityId: 12, side: "sell", price: "250", shares: "40" } as const;

describe("도시 지분 주문 메시지", () => {
  it("판: 지금 판 안, 받는 가장 낮은 판 = 지금 − 1", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(CITY_SHARE_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("왕복: 내 계정·가문 이름으로·거두기", () => {
    expect(decodeClientMessage(encodeMessage(order))).toEqual(order);
    const house = { ...order, side: "buy", asHouse: true } as const;
    expect(decodeClientMessage(encodeMessage(house))).toEqual(house);
    const cancel = { t: "city_share_cancel", id: 4, orderId: 77 } as const;
    expect(decodeClientMessage(encodeMessage(cancel))).toEqual(cancel);
  });

  it("값·주 수는 1 이상 10진 정수 글자, 도시는 양의 정수", () => {
    expect(decodes(decodeClientMessage, { ...order, price: "0" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...order, shares: "-1" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...order, shares: "1.5" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...order, price: 250 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...order, cityId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...order, side: "hold" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...order, price: "1".repeat(19) })).toBe(false);
  });

  it("결과: 성공(주문 ID)·실패 코드", () => {
    const ok = { t: "city_share_result", id: 3, ok: true, orderId: 9 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of CITY_SHARE_RESULT_CODES) {
      const failed = { t: "city_share_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    expect(CITY_SHARE_RESULT_CODES).toContain("dictatorship_majority");
    expect(decodes(decodeServerMessage, { t: "city_share_result", id: 3, ok: false, code: "nope" })).toBe(
      false,
    );
  });
});
