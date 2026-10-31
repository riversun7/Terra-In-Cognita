// 사이보그 만들기 메시지 스키마 시험 — 왕복, 외형 칸, 결과 코드, 프로토콜 버전
import { describe, expect, it } from "vitest";
import {
  CYBORG_PROTOCOL_VERSION,
  CYBORG_RESULT_CODES,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
  isProtocolSupported,
} from "./index.ts";

const appearance = {
  head: "dome",
  face: "visor",
  body: "slim",
  limbs: "piston",
  primary: "mint",
  accent: "lemon",
};

function decodes(decode: (text: string) => unknown, message: unknown): boolean {
  try {
    decode(JSON.stringify(message));
    return true;
  } catch (error) {
    if (error instanceof ProtocolError) return false;
    throw error;
  }
}

describe("사이보그 만들기 메시지", () => {
  it("프로토콜 4부터이고, 3판 기기도 그대로 받는다", () => {
    expect(PROTOCOL_VERSION).toBe(4);
    expect(CYBORG_PROTOCOL_VERSION).toBe(4);
    expect(isProtocolSupported(3)).toBe(true);
    expect(isProtocolSupported(4)).toBe(true);
  });

  it("굴리기·만들기 명령이 왕복한다", () => {
    const roll = { t: "cyborg_roll", id: 1, temperament: "combat" } as const;
    expect(decodeClientMessage(encodeMessage(roll))).toEqual(roll);
    const create = { t: "cyborg_create", id: 2, name: "철수", appearance, factionId: 1, cityId: 3 } as const;
    expect(decodeClientMessage(encodeMessage(create))).toEqual(create);
  });

  it("외형은 여섯 칸만, ID 모양만 본다(목록은 서버가 본다)", () => {
    const base = { t: "cyborg_create", id: 2, name: "nova", factionId: 1, cityId: 3 };
    expect(decodes(decodeClientMessage, { ...base, appearance: { ...appearance, hat: "dome" } })).toBe(false);
    expect(decodes(decodeClientMessage, { ...base, appearance: { ...appearance, head: "Dome!" } })).toBe(
      false,
    );
    const { accent: _accent, ...missing } = appearance;
    expect(decodes(decodeClientMessage, { ...base, appearance: missing })).toBe(false);
    expect(decodes(decodeClientMessage, { ...base, appearance, name: "" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...base, appearance, cityId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "cyborg_roll", id: 1, temperament: "BIG" })).toBe(false);
  });

  it("결과: 성공(굴림 있음·없음)과 실패 코드", () => {
    const roll = {
      t: "cyborg_result",
      id: 1,
      ok: true,
      roll: {
        temperament: "combat",
        stats: { str: 14, dex: 8, agi: 9, vit: 13, int: 8, wis: 8 },
        rollsLeft: 3,
        rollsMax: 4,
      },
    };
    expect(decodeServerMessage(JSON.stringify(roll))).toEqual(roll);
    expect(decodes(decodeServerMessage, { t: "cyborg_result", id: 2, ok: true })).toBe(true);
    for (const code of CYBORG_RESULT_CODES) {
      expect(decodes(decodeServerMessage, { t: "cyborg_result", id: 3, ok: false, code })).toBe(true);
    }
    expect(decodes(decodeServerMessage, { t: "cyborg_result", id: 3, ok: false, code: "nope" })).toBe(false);
    expect(decodes(decodeServerMessage, { t: "cyborg_result", id: 3, ok: false })).toBe(false);
  });
});
