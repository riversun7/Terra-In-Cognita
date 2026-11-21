// 지도자끼리 조약 메시지(사용자 결정 D-588 — 질문 2497 가·나) 스키마 시험 — 왕복, 조항 꼴, 결과 코드·행동
import { describe, expect, it } from "vitest";
import {
  DIPLOMACY_ACTIONS,
  DIPLOMACY_PROTOCOL_VERSION,
  DIPLOMACY_RESULT_CODES,
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

const propose = {
  t: "dip_propose" as const,
  id: 3,
  targetNationId: 12,
  clauses: [
    { kind: "alliance" as const },
    { kind: "protection" as const, protector: "them" as const, tributePm: 30 },
  ],
  days: 14,
};

describe("조약 메시지", () => {
  it("판: 프로토콜 63(묶음 1117c, 줄기 판 131) — 지금 판 안, 받는 가장 낮은 판 = 지금 − 1", () => {
    expect(DIPLOMACY_PROTOCOL_VERSION).toBe(63);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(DIPLOMACY_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("왕복: 제안·맞제안·답·참전 요청·참전 답", () => {
    expect(decodeClientMessage(encodeMessage(propose))).toEqual(propose);
    const counter = {
      t: "dip_counter" as const,
      id: 4,
      treatyId: 9,
      clauses: [{ kind: "non_aggression" as const }],
      days: 7,
    };
    expect(decodeClientMessage(encodeMessage(counter))).toEqual(counter);
    const respond = { t: "dip_respond", id: 5, treatyId: 9, accept: false } as const;
    expect(decodeClientMessage(encodeMessage(respond))).toEqual(respond);
    const request = { t: "dip_war_request", id: 6, treatyId: 9, enemyNationId: 4 } as const;
    expect(decodeClientMessage(encodeMessage(request))).toEqual(request);
    const answer = { t: "dip_war_respond", id: 7, requestId: 2, accept: true } as const;
    expect(decodeClientMessage(encodeMessage(answer))).toEqual(answer);
  });

  it("조항: 모르는 카드·빈 목록·카드보다 많은 줄·틀린 보호 칸·기간 밖은 막는다", () => {
    expect(decodes(decodeClientMessage, { ...propose, clauses: [{ kind: "trade" }] })).toBe(false);
    expect(decodes(decodeClientMessage, { ...propose, clauses: [] })).toBe(false);
    expect(
      decodes(decodeClientMessage, {
        ...propose,
        clauses: Array.from({ length: 5 }, () => ({ kind: "alliance" })),
      }),
    ).toBe(false);
    expect(
      decodes(decodeClientMessage, { ...propose, clauses: [{ kind: "protection", protector: "mine" }] }),
    ).toBe(false);
    expect(
      decodes(decodeClientMessage, { ...propose, clauses: [{ kind: "protection", tributePm: 1001 }] }),
    ).toBe(false);
    expect(decodes(decodeClientMessage, { ...propose, days: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...propose, days: 1.5 })).toBe(false);
  });

  it("결과: 성공(행동·ID)·실패 코드", () => {
    for (const action of DIPLOMACY_ACTIONS) {
      const ok = { t: "dip_result", id: 3, ok: true, action, ref: 9 } as const;
      expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    }
    for (const code of DIPLOMACY_RESULT_CODES) {
      const failed = { t: "dip_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    expect(decodes(decodeServerMessage, { t: "dip_result", id: 3, ok: false, code: "nope" })).toBe(false);
  });
});
