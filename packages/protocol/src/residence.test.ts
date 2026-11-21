// 사는 곳 고르기 메시지(줄기 판 99, D-585 1) 스키마 시험 — 왕복, null = 풀기, 결과 코드, 판
import { describe, expect, it } from "vitest";
import {
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  RESIDENCE_PROTOCOL_VERSION,
  RESIDENCE_RESULT_CODES,
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

describe("사는 곳 고르기 메시지(줄기 판 99)", () => {
  it("판: 지금 판 = 이 메시지 판, 직전 판까지 받는다", () => {
    expect(RESIDENCE_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("왕복·null = 고른 것 풀기", () => {
    const pick = { t: "residence_set", id: 3, unitId: 41, buildingId: 900 } as const;
    expect(decodeClientMessage(encodeMessage(pick))).toEqual(pick);
    const clear = { ...pick, buildingId: null };
    expect(decodeClientMessage(encodeMessage(clear))).toEqual(clear);
  });

  it("유닛·건물 번호가 틀리면 거절", () => {
    const base = { t: "residence_set", id: 3, unitId: 41, buildingId: 900 };
    expect(decodes(decodeClientMessage, { ...base, unitId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...base, buildingId: 1.5 })).toBe(false);
    const { buildingId: _gone, ...missing } = base;
    expect(decodes(decodeClientMessage, missing)).toBe(false);
  });

  it("결과: 성공(고른 집·도시 또는 풀기)·실패 코드", () => {
    const ok = { t: "residence_result", id: 3, ok: true, unitId: 41, buildingId: 900, cityId: 7 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    const cleared = { ...ok, buildingId: null, cityId: null };
    expect(decodeServerMessage(encodeMessage(cleared))).toEqual(cleared);
    for (const code of RESIDENCE_RESULT_CODES) {
      const fail = { t: "residence_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(decodes(decodeServerMessage, { t: "residence_result", id: 3, ok: false, code: "nope" })).toBe(
      false,
    );
  });
});
