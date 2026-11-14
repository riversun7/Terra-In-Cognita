// 병원 치료 메시지 스키마 시험(프로토콜 17, docs/adr/2026-11-08-injury.md) — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  HOSPITAL_PROTOCOL_VERSION,
  HOSPITAL_RESULT_CODES,
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

describe("병원 메시지(프로토콜 17)", () => {
  it("판: 병원은 17부터, 받는 가장 낮은 판 = 현재 − 1", () => {
    expect(HOSPITAL_PROTOCOL_VERSION).toBe(17);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOSPITAL_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBeGreaterThanOrEqual(PROTOCOL_VERSION - 1);
  });

  it("치료·개발 시험 부상이 왕복하고 값 모양을 본다", () => {
    const treat = { t: "hospital_treat", id: 1, buildingId: 9, unit: 41, cost: "1500" } as const;
    expect(decodeClientMessage(encodeMessage(treat))).toEqual(treat);
    expect(decodes(decodeClientMessage, { ...treat, cost: "-1" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...treat, cost: "01" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...treat, unit: 0 })).toBe(false);
    const injure = { t: "dev_injure_unit", id: 2, unit: 41, stage: 3 } as const;
    expect(decodeClientMessage(encodeMessage(injure))).toEqual(injure);
    expect(decodes(decodeClientMessage, { ...injure, stage: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...injure, stage: 4 })).toBe(false);
  });

  it("결과: 성공 칸과 실패 코드", () => {
    const ok = {
      t: "hospital_result",
      id: 1,
      ok: true,
      unitId: 41,
      stage: 3,
      untilMs: 1_800_000_000_000,
      greenAtMs: 1_800_100_000_000,
      paid: "1500",
    } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of HOSPITAL_RESULT_CODES) {
      const fail = { t: "hospital_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(decodes(decodeServerMessage, { t: "hospital_result", id: 3, ok: false, code: "nope" })).toBe(
      false,
    );
  });
});
