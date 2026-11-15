// 구인 카드 고용 메시지 스키마 시험 — 왕복, 결과 코드, 값 모양(D-469)
import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  ProtocolError,
  RECRUIT_HOUSE_PROTOCOL_VERSION,
  RECRUIT_PROTOCOL_VERSION,
  RECRUIT_RESULT_CODES,
  legacyRecruitCode,
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

describe("구인 카드 고용 메시지(프로토콜 7)", () => {
  it("고용 명령이 왕복하고, 창·자리·값 모양을 본다", () => {
    expect(RECRUIT_PROTOCOL_VERSION).toBe(7);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(RECRUIT_PROTOCOL_VERSION);
    const hire = { t: "recruit_hire", id: 7, cityId: 3, window: 40_000, slot: 2, cost: "65" } as const;
    expect(decodeClientMessage(encodeMessage(hire))).toEqual(hire);
    expect(decodes(decodeClientMessage, { ...hire, cost: "-1" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...hire, cost: "01" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...hire, slot: 64 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...hire, cityId: 0 })).toBe(false);
  });

  it("결과는 성공(새 유닛 ID) 또는 코드", () => {
    const ok = { t: "recruit_result", id: 7, ok: true, unitId: 99 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of RECRUIT_RESULT_CODES)
      expect(decodes(decodeServerMessage, { t: "recruit_result", id: 1, ok: false, code })).toBe(true);
    expect(decodes(decodeServerMessage, { t: "recruit_result", id: 1, ok: false, code: "nope" })).toBe(false);
  });
});

describe("구인 가문 검사 코드(프로토콜 39, D-565)", () => {
  it("no_house는 39판 연결에만 가고 38판 연결은 internal_error로 낮춘다", () => {
    expect(RECRUIT_HOUSE_PROTOCOL_VERSION).toBe(39);
    expect(RECRUIT_RESULT_CODES).toContain("no_house");
    expect(legacyRecruitCode("no_house", 39)).toBe("no_house");
    expect(legacyRecruitCode("no_house", 38)).toBe("internal_error");
    expect(legacyRecruitCode("taken", 38)).toBe("taken");
  });
});
