// 사는 곳 고르기 메시지(프로토콜 61, D-585 1) 스키마 시험 — 왕복, null = 풀기, 결과 코드, 판
import { describe, expect, it } from "vitest";
import {
  HOUSE_HEIR_PROTOCOL_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  FACILITY_RESULT_CODES,
  FLOOR_PROTOCOL_VERSION,
  ProtocolError,
  RESIDENCE_FULL_PROTOCOL_VERSION,
  RESIDENCE_RENT_PROTOCOL_VERSION,
  RESIDENCE_RENT_RESULT_CODES,
  RESIDENCE_PROTOCOL_VERSION,
  RESIDENCE_RESULT_CODES,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
  legacyResidenceCode,
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

describe("사는 곳 고르기 메시지(프로토콜 61)", () => {
  it("판: 이 메시지 판(61) 이상, 직전 판까지 받는다", () => {
    expect(RESIDENCE_PROTOCOL_VERSION).toBe(61);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(RESIDENCE_PROTOCOL_VERSION);
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

describe("사는 곳 정원·가문 후계자(줄기 governance-6 — 프로토콜 62)", () => {
  it("full은 62판부터, 더 낮은 판은 not_eligible로 낮춘다", () => {
    expect(RESIDENCE_FULL_PROTOCOL_VERSION).toBe(62);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(RESIDENCE_FULL_PROTOCOL_VERSION);
    expect(RESIDENCE_RESULT_CODES).toContain("full");
    expect(legacyResidenceCode("full", RESIDENCE_FULL_PROTOCOL_VERSION)).toBe("full");
    expect(legacyResidenceCode("full", RESIDENCE_FULL_PROTOCOL_VERSION - 1)).toBe("not_eligible");
    expect(legacyResidenceCode("unchanged", 60)).toBe("unchanged");
    expect(decodes(decodeServerMessage, { t: "residence_result", id: 1, ok: false, code: "full" })).toBe(
      true,
    );
  });

  it("house_heir: 가문원 ID 또는 null(풀기), 결과 한 일 heir_set", () => {
    expect(HOUSE_HEIR_PROTOCOL_VERSION).toBe(62);
    expect(HOUSE_HEIR_PROTOCOL_VERSION).toBeLessThanOrEqual(PROTOCOL_VERSION);
    const user = "0190a0b0-0000-7000-8000-000000000001";
    expect(decodes(decodeClientMessage, { t: "house_heir", id: 1, userId: user })).toBe(true);
    expect(decodes(decodeClientMessage, { t: "house_heir", id: 1, userId: null })).toBe(true);
    expect(decodes(decodeClientMessage, { t: "house_heir", id: 1, userId: "x" })).toBe(false);
    expect(
      decodes(decodeServerMessage, {
        t: "house_member_result",
        id: 1,
        ok: true,
        action: "heir_set",
        factionId: 3,
      }),
    ).toBe(true);
  });
});

describe("층 올리기·집세(묶음 1117h 프로토콜 67 — 줄기 residence-3 판 145, D-591)", () => {
  it("판: 묶음 판(67) — 지금 판 이하", () => {
    expect(FLOOR_PROTOCOL_VERSION).toBe(67);
    expect(RESIDENCE_RENT_PROTOCOL_VERSION).toBe(67);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(RESIDENCE_RENT_PROTOCOL_VERSION);
  });

  it("facility_floor: 건물·일꾼(선택), 답 코드 floor_full", () => {
    const floor = { t: "facility_floor" as const, id: 4, buildingId: 900, unitIds: [41] };
    expect(decodeClientMessage(encodeMessage(floor))).toEqual(floor);
    expect(decodes(decodeClientMessage, { t: "facility_floor", id: 4, buildingId: 900 })).toBe(true);
    expect(decodes(decodeClientMessage, { t: "facility_floor", id: 4, buildingId: 0 })).toBe(false);
    expect(FACILITY_RESULT_CODES).toContain("floor_full");
    expect(decodes(decodeServerMessage, { t: "facility_result", id: 4, ok: false, code: "floor_full" })).toBe(
      true,
    );
  });

  it("residence_rent: 집세 정수 글자 또는 null(세 거두기), 결과", () => {
    const set = { t: "residence_rent", id: 5, buildingId: 900, rent: "120" } as const;
    expect(decodeClientMessage(encodeMessage(set))).toEqual(set);
    expect(decodes(decodeClientMessage, { ...set, rent: null })).toBe(true);
    expect(decodes(decodeClientMessage, { ...set, rent: "0" })).toBe(true);
    expect(decodes(decodeClientMessage, { ...set, rent: "-1" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...set, rent: "1.5" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...set, rent: 120 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...set, rent: "1".repeat(19) })).toBe(false);
    const ok = { t: "residence_rent_result", id: 5, ok: true, buildingId: 900, rent: "120" } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of RESIDENCE_RENT_RESULT_CODES) {
      const fail = { t: "residence_rent_result", id: 5, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
  });

  it("insufficient_funds는 67판부터, 더 낮은 판은 not_eligible로 낮춘다", () => {
    expect(RESIDENCE_RESULT_CODES).toContain("insufficient_funds");
    expect(legacyResidenceCode("insufficient_funds", RESIDENCE_RENT_PROTOCOL_VERSION)).toBe(
      "insufficient_funds",
    );
    expect(legacyResidenceCode("insufficient_funds", RESIDENCE_RENT_PROTOCOL_VERSION - 1)).toBe(
      "not_eligible",
    );
    expect(legacyResidenceCode("full", RESIDENCE_RENT_PROTOCOL_VERSION - 1)).toBe("full");
  });
});
