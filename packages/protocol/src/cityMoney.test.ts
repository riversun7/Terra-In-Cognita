// 도시 화폐 고르기 메시지(프로토콜 69) — docs/adr/2026-11-24-city-money.md
import { describe, expect, it } from "vitest";
import {
  CITY_MONEY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeClientMessage,
  decodeServerMessage,
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

describe("도시 화폐 고르기 메시지", () => {
  it("판 문턱은 69이고 지금 판 안이다", () => {
    expect(CITY_MONEY_PROTOCOL_VERSION).toBe(69);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(CITY_MONEY_PROTOCOL_VERSION);
  });

  it("city_currency: 화폐 코드 또는 null", () => {
    const message = { t: "city_currency", id: 1, cityId: 7, currency: "alder" };
    expect(decodes(decodeClientMessage, message)).toBe(true);
    expect(decodes(decodeClientMessage, { ...message, currency: null })).toBe(true);
    expect(decodes(decodeClientMessage, { ...message, currency: "cur:alder" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...message, cityId: 0 })).toBe(false);
  });

  it("city_currency_result: 성공·실패 코드", () => {
    expect(
      decodes(decodeServerMessage, {
        t: "city_currency_result",
        id: 1,
        ok: true,
        cityId: 7,
        currency: "alder",
      }),
    ).toBe(true);
    expect(
      decodes(decodeServerMessage, { t: "city_currency_result", id: 1, ok: false, code: "reserve_short" }),
    ).toBe(true);
    expect(decodes(decodeServerMessage, { t: "city_currency_result", id: 1, ok: false, code: "nope" })).toBe(
      false,
    );
  });
});
