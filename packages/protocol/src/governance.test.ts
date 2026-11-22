// 나라 의결 메시지(프로토콜 56 — 줄기 판 94, docs/adr/2026-11-21-governance.md) 스키마 시험 — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  COUP_PROTOCOL_VERSION,
  GOVERNANCE5_PROTOCOL_VERSION,
  GOV_COUP_PROTOCOL_VERSION,
  COUP_DISPATCH_PROTOCOL_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
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
    // 세율 안건(질문 2407 가 — 58판, 묶음 1116x — 줄기 governance-2 판 98): taxes 칸과 함께 왕복, 범위 밖 값은 거절
    const tax = {
      t: "gov_propose",
      id: 3,
      kind: "tax_change",
      taxes: { incomeTaxBp: 500, residentTaxPm: null, residentEveryDays: 7, residentNationPm: 100 },
    } as const;
    expect(decodeClientMessage(encodeMessage(tax))).toEqual(tax);
    expect(decodes(decodeClientMessage, { ...tax, taxes: { ...tax.taxes, incomeTaxBp: 10_001 } })).toBe(
      false,
    );
    expect(decodes(decodeClientMessage, { ...propose, kind: "peace_treaty" })).toBe(false);
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

  it("쿠데타·국고 지분 팔기(59판, 묶음 1116y — 줄기 governance-3 판 98 — 질문 2433·2438 답 D-583)", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(COUP_PROTOCOL_VERSION);
    const coup = { t: "gov_coup", id: 5 } as const;
    expect(decodeClientMessage(encodeMessage(coup))).toEqual(coup);
    const join = { t: "gov_coup_join", id: 6, coupId: 3, side: "government" } as const;
    expect(decodeClientMessage(encodeMessage(join))).toEqual(join);
    expect(decodes(decodeClientMessage, { ...join, side: "neutral" })).toBe(false);
    const sale = {
      t: "gov_propose",
      id: 7,
      kind: "treasury_share_sale",
      cityId: 4,
      shares: "100",
      minPrice: "0",
    } as const;
    expect(decodeClientMessage(encodeMessage(sale))).toEqual(sale);
    expect(decodes(decodeClientMessage, { ...sale, shares: "0" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...sale, minPrice: "-1" })).toBe(false);
    const started = { t: "gov_result", id: 5, ok: true, agendaId: 3, action: "coup_started" } as const;
    expect(decodeServerMessage(encodeMessage(started))).toEqual(started);
  });

  it("강화·화폐 단계·가문 독립·쿠데타 병력·거래세(61판, 묶음 1117a — 줄기 governance-5 판 99 — 질문 2451~2460 답)", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(GOVERNANCE5_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
    const peace = { t: "gov_propose", id: 8, kind: "peace", targetNationId: 12 } as const;
    expect(decodeClientMessage(encodeMessage(peace))).toEqual(peace);
    const money = {
      t: "gov_propose",
      id: 9,
      kind: "currency_stage",
      monetaryMode: "manual",
      monetaryRateBp: -50,
    } as const;
    expect(decodeClientMessage(encodeMessage(money))).toEqual(money);
    expect(decodes(decodeClientMessage, { ...money, monetaryMode: "gold" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...money, monetaryRateBp: 10_001 })).toBe(false);
    const independence = { t: "gov_propose", id: 10, kind: "house_independence", cityId: 3 } as const;
    expect(decodeClientMessage(encodeMessage(independence))).toEqual(independence);
    const join = { t: "gov_coup_join" as const, id: 11, coupId: 3, side: "rebel" as const, unitIds: [4, 5] };
    expect(decodeClientMessage(encodeMessage(join))).toEqual(join);
    expect(decodes(decodeClientMessage, { ...join, unitIds: [0] })).toBe(false);
    const taxes = {
      t: "gov_propose",
      id: 12,
      kind: "tax_change",
      taxes: {
        incomeTaxBp: null,
        residentTaxPm: null,
        residentEveryDays: null,
        residentNationPm: null,
        tradeTaxBp: 300,
      },
    } as const;
    expect(decodeClientMessage(encodeMessage(taxes))).toEqual(taxes);
    const nationTax = {
      t: "nation_tax",
      id: 13,
      incomeTaxBp: null,
      residentTaxPm: null,
      residentEveryDays: null,
      residentNationPm: null,
      tradeTaxBp: 250,
    } as const;
    expect(decodeClientMessage(encodeMessage(nationTax))).toEqual(nationTax);
    expect(decodes(decodeClientMessage, { ...nationTax, tradeTaxBp: 10_001 })).toBe(false);
  });

  it("쿠데타 병력 파견(줄기 no-teleport 판 125 — D-591): 메시지 모양은 그대로, 뜻만 바뀌어 판을 올린다", () => {
    expect(COUP_DISPATCH_PROTOCOL_VERSION).toBe(125);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(COUP_DISPATCH_PROTOCOL_VERSION);
    const join = {
      t: "gov_coup_join" as const,
      id: 16,
      coupId: 3,
      side: "government" as const,
      unitIds: [11, 12],
    };
    expect(decodeClientMessage(encodeMessage(join))).toEqual(join);
  });

  it("쿠데타 도시·손 조절 목표 물가 상한(프로토콜 63 — 묶음 1117c, 줄기 gov-coup 판 121, 사용자 결정 D-588 2492·2499)", () => {
    expect(GOV_COUP_PROTOCOL_VERSION).toBe(63);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(GOV_COUP_PROTOCOL_VERSION);
    const coup = { t: "gov_coup", id: 14, cityId: 7 } as const;
    expect(decodeClientMessage(encodeMessage(coup))).toEqual(coup);
    expect(decodes(decodeClientMessage, { ...coup, cityId: 0 })).toBe(false);
    const money = {
      t: "gov_propose",
      id: 15,
      kind: "currency_stage",
      monetaryMode: "manual",
      monetaryRateBp: 40,
      monetaryCapMilli: 1300,
    } as const;
    expect(decodeClientMessage(encodeMessage(money))).toEqual(money);
    expect(decodes(decodeClientMessage, { ...money, monetaryCapMilli: 0 })).toBe(false);
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
