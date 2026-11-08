// 보유 물건 메시지 스키마 시험 — 왕복, 모양 검사, 결과 코드(docs/adr/2026-11-03-item-holdings.md 5절)
import { describe, expect, it } from "vitest";
import {
  ITEM_PROTOCOL_VERSION,
  ITEM_RESULT_CODES,
  PROTOCOL_VERSION,
  TREAT_PROTOCOL_VERSION,
  UNPACK_PROTOCOL_VERSION,
  ProtocolError,
  type ServerMessage,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
} from "./index.ts";

describe("보유 물건 메시지", () => {
  it("프로토콜 6부터다(개발 시험 병원 치료는 9부터, D-514)", () => {
    expect(ITEM_PROTOCOL_VERSION).toBe(6);
    expect(TREAT_PROTOCOL_VERSION).toBe(9);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(TREAT_PROTOCOL_VERSION);
  });

  it("식품 포장 풀기는 19부터다(D-524)", () => {
    expect(UNPACK_PROTOCOL_VERSION).toBe(19);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(UNPACK_PROTOCOL_VERSION);
    expect(ITEM_RESULT_CODES).toContain("not_packed");
    const messages = [
      { t: "item_unpack", id: 7, holding: 12 },
      { t: "item_unpack", id: 8, holding: 12, quantity: 100 },
    ] as const;
    for (const message of messages) expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
    for (const quantity of [0, 101, 1.5])
      expect(() =>
        decodeClientMessage(JSON.stringify({ t: "item_unpack", id: 9, holding: 12, quantity })),
      ).toThrow(ProtocolError);
  });

  it("입기·벗기·쓰기·개발 받기 명령이 왕복한다", () => {
    const messages = [
      { t: "item_equip", id: 1, holding: 10, slot: 3 },
      { t: "item_unequip", id: 2, holding: 10 },
      { t: "item_use", id: 3, holding: 11, confirm: true },
      { t: "dev_grant_item", id: 4, item: "test_vest", quantity: 2, unit: 7 },
      { t: "dev_treat_unit", id: 5, unit: 7 },
      { t: "dev_treat_unit", id: 6 },
    ] as const;
    for (const message of messages) expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
  });

  it("틀린 모양은 받지 않는다(칸 번호·수량·아이디 모양)", () => {
    const bad = [
      { t: "item_equip", id: 1, holding: 10, slot: 32 },
      { t: "item_equip", id: 1, holding: 0, slot: 3 },
      { t: "dev_grant_item", id: 4, item: "Test Vest", quantity: 1 },
      { t: "dev_grant_item", id: 4, item: "test_vest", quantity: 1001 },
      { t: "dev_treat_unit", id: 5, unit: 0 },
    ];
    for (const message of bad)
      expect(() => decodeClientMessage(JSON.stringify(message))).toThrow(ProtocolError);
  });

  it("결과: 성공(받은 칸·효과량)과 실패(코드·사라질 효과)가 왕복한다", () => {
    const ok: ServerMessage = {
      t: "item_result",
      id: 3,
      ok: true,
      effects: [{ effect: "meal_str", amount: 44 }],
    };
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    const ask: ServerMessage = {
      t: "item_result",
      id: 4,
      ok: false,
      code: "confirm_replace",
      effects: ["meal_str"],
    };
    expect(decodeServerMessage(encodeMessage(ask))).toEqual(ask);
    expect(ITEM_RESULT_CODES).toContain("not_better");
    expect(new Set(ITEM_RESULT_CODES).size).toBe(ITEM_RESULT_CODES.length);
  });
});
