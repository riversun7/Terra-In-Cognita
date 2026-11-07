// 노동 계약 메시지 스키마 시험 — 왕복, 금액 글자, 결과 코드, 프로토콜 판(계약 7, 구인 게시 8)
import { describe, expect, it } from "vitest";
import {
  LABOR_JOBS_PROTOCOL_VERSION,
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

  it("구인 내기·거두기·받기는 왕복하고, 자리(1~100)·조정·기간 모양을 본다. 결과에 새 게시 ID", () => {
    const messages = [
      { t: "labor_post_job", id: 1, buildingId: 3, adjustPm: 1200, slots: 2 },
      { t: "labor_post_job", id: 2, buildingId: 3, adjustPm: 800, slots: 1, termHours: 72 },
      { t: "labor_withdraw_job", id: 3, jobId: 4 },
      { t: "labor_accept_job", id: 4, jobId: 4, unitId: 9 },
    ] as const;
    for (const message of messages) expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
    const post = messages[0];
    for (const slots of [0, 101, 1.5]) expect(decodes(decodeClientMessage, { ...post, slots })).toBe(false);
    expect(decodes(decodeClientMessage, { ...post, adjustPm: -1 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...post, termHours: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "labor_accept_job", id: 1, jobId: 4 })).toBe(false);
    expect(decodeServerMessage(encodeMessage({ t: "labor_result", id: 7, ok: true, jobId: 3 }))).toEqual({
      t: "labor_result",
      id: 7,
      ok: true,
      jobId: 3,
    });
  });

  it("계약 명령은 판 7, 구인 게시는 판 8(메시지를 더해 올렸다)", () => {
    expect(LABOR_PROTOCOL_VERSION).toBe(7);
    expect(LABOR_JOBS_PROTOCOL_VERSION).toBe(8);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(LABOR_JOBS_PROTOCOL_VERSION);
  });
});
