// 물자 거래소 메시지 스키마 시험(프로토콜 14, docs/adr/2026-11-07-play-flow.md WP4) — 왕복, 값 모양, 결과 코드, 체결 알림
import { describe, expect, it } from "vitest";
import {
  FX_PROTOCOL_VERSION,
  FX_RESULT_CODES,
  MARKET_EXPIRY_DAYS_MAX,
  MARKET_PROTOCOL_VERSION,
  MARKET_RESULT_CODES,
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

describe("물자 거래소 메시지(프로토콜 14)", () => {
  it("주문 넣기·취소·알림 켜기가 왕복하고 값 모양을 본다", () => {
    expect(MARKET_PROTOCOL_VERSION).toBe(14);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(14);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBeGreaterThanOrEqual(PROTOCOL_VERSION - 1);
    const place = {
      t: "market_place",
      id: 1,
      city: 3,
      item: "iron_ore",
      side: "sell",
      kind: "limit",
      price: "12",
      qty: "5",
      expiryDays: 7,
    } as const;
    expect(decodeClientMessage(encodeMessage(place))).toEqual(place);
    const market = {
      t: "market_place",
      id: 4,
      city: 3,
      item: "grain",
      side: "buy",
      kind: "market",
      price: "9",
      qty: "2",
    } as const;
    expect(decodeClientMessage(encodeMessage(market))).toEqual(market);
    expect(decodes(decodeClientMessage, { ...place, price: "0" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, qty: "01" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, qty: "-3" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, item: "Iron" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, city: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, side: "hold" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, kind: "conditional" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, expiryDays: MARKET_EXPIRY_DAYS_MAX + 1 })).toBe(false);
    const cancel = { t: "market_cancel", id: 2, order: 41 } as const;
    expect(decodeClientMessage(encodeMessage(cancel))).toEqual(cancel);
    expect(decodes(decodeClientMessage, { ...cancel, order: -1 })).toBe(false);
    const watch = { t: "market_watch", id: 3, on: true } as const;
    expect(decodeClientMessage(encodeMessage(watch))).toEqual(watch);
  });

  it("결과(체결·남은 양)·실패 코드·체결 알림", () => {
    const ok = { t: "market_result", id: 1, ok: true, orderId: 41, filled: "2", resting: "3" } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    const bare = { t: "market_result", id: 3, ok: true } as const;
    expect(decodeServerMessage(encodeMessage(bare))).toEqual(bare);
    for (const code of MARKET_RESULT_CODES) {
      const failed = { t: "market_result", id: 2, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    expect(decodes(decodeServerMessage, { t: "market_result", id: 2, ok: false, code: "nope" })).toBe(false);
    const fill = {
      t: "market_fill",
      order: 41,
      city: 3,
      item: "iron_ore",
      side: "sell",
      price: "12",
      qty: "2",
      remaining: "0",
      at: 1_800_000_000_000,
    } as const;
    expect(decodeServerMessage(encodeMessage(fill))).toEqual(fill);
    expect(decodes(decodeServerMessage, { ...fill, qty: "0" })).toBe(false);
  });

  it("환전 주문 내기·거두기와 결과(프로토콜 15)", () => {
    expect(FX_PROTOCOL_VERSION).toBe(15);
    const place = {
      t: "fx_place",
      id: 7,
      currency: "placeholder_cur_02",
      side: "buy",
      price: "102",
      lots: "3",
    } as const;
    expect(decodeClientMessage(encodeMessage(place))).toEqual(place);
    expect(decodes(decodeClientMessage, { ...place, currency: "cur:placeholder_cur_02" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, lots: "0" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...place, price: "1.5" })).toBe(false);
    const cancel = { t: "fx_cancel", id: 8, order: 5 } as const;
    expect(decodeClientMessage(encodeMessage(cancel))).toEqual(cancel);
    const ok = { t: "fx_result", id: 7, ok: true, orderId: 5 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of FX_RESULT_CODES) {
      const failed = { t: "fx_result", id: 7, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    expect(decodes(decodeServerMessage, { t: "fx_result", id: 7, ok: false, code: "no_liquidity" })).toBe(
      false,
    );
  });
});
