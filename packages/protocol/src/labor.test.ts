// 노동 계약 메시지 스키마 시험 — 왕복, 금액 글자, 결과 코드, 프로토콜 판(더하기만, 5 그대로)
import { describe, expect, it } from "vitest";
import {
  LABOR_PROTOCOL_VERSION,
  LABOR_RESULT_CODES,
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

const topUp = (amount: unknown) => ({ t: "labor_top_up", id: 1, contractId: 1, amount });
const rent = (value: string) => ({ t: "labor_set_rent", id: 1, buildingId: 1, rent: value });

describe("노동 계약 메시지", () => {
  it("맺기·해지·채우기·임대료는 왕복한다", () => {
    const messages = [
      { t: "labor_create", id: 1, kind: "wage", buildingId: 3, unitId: 9, adjustPm: 1200 },
      { t: "labor_create", id: 2, kind: "lease", buildingId: 3, unitId: 9, termHours: 48 },
      { t: "labor_terminate", id: 3, contractId: 5 },
      { t: "labor_top_up", id: 4, contractId: 5, amount: "600" },
      { t: "labor_set_rent", id: 5, buildingId: 3, rent: "0" },
    ] as const;
    for (const message of messages) expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
  });

  it("금액은 1 이상 10진 글자(앞자리 0·음수·소수·19자리 이상은 안 됨). 임대료만 0을 받는다", () => {
    expect(decodes(decodeClientMessage, topUp("1"))).toBe(true);
    for (const bad of ["0", "-5", "01", "1.5", "1".repeat(19), 600])
      expect(decodes(decodeClientMessage, topUp(bad))).toBe(false);
    expect(decodes(decodeClientMessage, rent("0"))).toBe(true);
    expect(decodes(decodeClientMessage, rent("00"))).toBe(false);
    expect(
      decodes(decodeClientMessage, { t: "labor_create", id: 1, kind: "share", buildingId: 1, unitId: 1 }),
    ).toBe(false);
  });

  it("결과: 성공(새 계약 ID)·실패 코드", () => {
    expect(decodeServerMessage(encodeMessage({ t: "labor_result", id: 7, ok: true, contractId: 2 }))).toEqual(
      {
        t: "labor_result",
        id: 7,
        ok: true,
        contractId: 2,
      },
    );
    for (const code of LABOR_RESULT_CODES)
      expect(decodes(decodeServerMessage, { t: "labor_result", id: 7, ok: false, code })).toBe(true);
    expect(decodes(decodeServerMessage, { t: "labor_result", id: 7, ok: false, code: "nope" })).toBe(false);
  });

  it("판을 올리지 않고 지금 판에 더했다", () => {
    expect(LABOR_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
  });
});
