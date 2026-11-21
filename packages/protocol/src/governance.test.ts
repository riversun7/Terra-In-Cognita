// 나라 의결 메시지(프로토콜 56 — 줄기 판 94, docs/adr/2026-11-21-governance.md) 스키마 시험 — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_PROTOCOL_VERSION,
  GOVERNANCE_RESULT_CODES,
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

describe("나라 의결 메시지", () => {
  it("판: 지금 판 이하", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(GOVERNANCE_PROTOCOL_VERSION);
  });

  it("올리기·표·후보가 왕복하고 값 모양을 본다", () => {
    const propose = { t: "gov_propose", id: 1, kind: "regime_change", regime: "capitalism" } as const;
    expect(decodeClientMessage(encodeMessage(propose))).toEqual(propose);
    const war = { t: "gov_propose", id: 2, kind: "war_declaration", targetNationId: 7 } as const;
    expect(decodeClientMessage(encodeMessage(war))).toEqual(war);
    expect(decodes(decodeClientMessage, { ...propose, kind: "tax_change" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...propose, regime: "monarchy" })).toBe(false);
    for (const choice of ["yes", "no", "abstain", "p:12", "n:3"]) {
      const vote = { t: "gov_vote", id: 3, agendaId: 9, choice } as const;
      expect(decodeClientMessage(encodeMessage(vote))).toEqual(vote);
    }
    expect(decodes(decodeClientMessage, { t: "gov_vote", id: 3, agendaId: 9, choice: "o:1" })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "gov_vote", id: 3, agendaId: 9, choice: "p:0" })).toBe(false);
    const candidate = { t: "gov_candidate", id: 4, agendaId: 9 } as const;
    expect(decodeClientMessage(encodeMessage(candidate))).toEqual(candidate);
    expect(decodes(decodeClientMessage, { ...candidate, agendaId: 0 })).toBe(false);
  });

  it("결과: 성공(한 일)·실패 코드", () => {
    const ok = { t: "gov_result", id: 4, ok: true, agendaId: 9, action: "decided" } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of GOVERNANCE_RESULT_CODES) {
      const failed = { t: "gov_result", id: 5, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    expect(decodes(decodeServerMessage, { t: "gov_result", id: 5, ok: false, code: "nope" })).toBe(false);
  });
});
