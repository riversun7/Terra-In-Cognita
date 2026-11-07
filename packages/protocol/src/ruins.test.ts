// 폐허 복원 메시지 스키마 시험(프로토콜 13, docs/adr/2026-11-07-ruins-restoration.md) — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  FACILITY_RESULT_CODES,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  RESTORATION_RESULT_CODES,
  RUINS_PROTOCOL_VERSION,
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

describe("폐허 복원 메시지(프로토콜 13)", () => {
  it("모금 열기·넣기·개발 폐허가 왕복하고 값 모양을 본다", () => {
    expect(RUINS_PROTOCOL_VERSION).toBe(13);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(RUINS_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBeLessThanOrEqual(PROTOCOL_VERSION);
    const open = { t: "restoration_open", id: 1, ruin: 12 } as const;
    expect(decodeClientMessage(encodeMessage(open))).toEqual(open);
    expect(decodes(decodeClientMessage, { ...open, ruin: 0 })).toBe(false);
    const fund = { t: "restoration_fund", id: 2, ruin: 12, amount: "2500" } as const;
    expect(decodeClientMessage(encodeMessage(fund))).toEqual(fund);
    expect(decodes(decodeClientMessage, { ...fund, amount: "0" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...fund, amount: "-1" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...fund, amount: "01" })).toBe(false);
    const dev = { t: "dev_make_ruin", id: 3 } as const;
    expect(decodeClientMessage(encodeMessage(dev))).toEqual(dev);
  });

  it("결과: 성공 칸(받은 값·모인 값·복원)과 실패 코드, 행정 건물 짓기의 새 건물 코드", () => {
    const ok = {
      t: "restoration_result",
      id: 2,
      ok: true,
      ruinId: 12,
      accepted: "3000",
      raised: "10000",
      restored: true,
    } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of RESTORATION_RESULT_CODES) {
      const fail = { t: "restoration_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(decodes(decodeServerMessage, { t: "restoration_result", id: 3, ok: false, code: "nope" })).toBe(
      false,
    );
    expect(FACILITY_RESULT_CODES).toContain("not_ruin");
    expect(FACILITY_RESULT_CODES).toContain("ruin_claimed");
  });
});
