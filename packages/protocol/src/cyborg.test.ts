// 사이보그 만들기 메시지 스키마 시험 — 왕복, 외형 칸, 속성 분배(5), 결과 코드, 프로토콜 버전
import { describe, expect, it } from "vitest";
import {
  CYBORG_ELEMENTS_PROTOCOL_VERSION,
  CYBORG_ELEMENT_IDS,
  CYBORG_PROTOCOL_VERSION,
  CYBORG_RESULT_CODES,
  PROTOCOL_VERSION,
  characterLookSchema,
  cyborgElementsSchema,
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
  it("만들기는 프로토콜 4부터, 속성 분배는 5부터. 지금 판과 직전 판만 받는다(폐허 2 판 15 — 14·15)", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(15);
    expect(CYBORG_PROTOCOL_VERSION).toBe(4);
    expect(CYBORG_ELEMENTS_PROTOCOL_VERSION).toBe(5);
    for (let version = 4; version < PROTOCOL_VERSION - 1; version++)
      expect(isProtocolSupported(version)).toBe(false);
    expect(isProtocolSupported(PROTOCOL_VERSION - 1)).toBe(true);
    expect(isProtocolSupported(PROTOCOL_VERSION)).toBe(true);
    expect(isProtocolSupported(PROTOCOL_VERSION + 1)).toBe(false);
  });

  it("굴리기·만들기 명령이 왕복한다", () => {
    const roll = { t: "cyborg_roll", id: 1, temperament: "combat" } as const;
    expect(decodeClientMessage(encodeMessage(roll))).toEqual(roll);
    const create = { t: "cyborg_create", id: 2, name: "철수", appearance, factionId: 1, cityId: 3 } as const;
    expect(decodeClientMessage(encodeMessage(create))).toEqual(create);
  });

  it("속성 분배(5): 만들기에 덧붙이거나(4판 기기는 보내지 않는다) 따로 보낸다. 칸 이름은 12속성, 값은 0~10 정수", () => {
    expect(CYBORG_ELEMENT_IDS).toHaveLength(12);
    expect(Object.keys(cyborgElementsSchema.shape)).toEqual([...CYBORG_ELEMENT_IDS]);
    const create = {
      t: "cyborg_create",
      id: 2,
      name: "철수",
      appearance,
      factionId: 1,
      cityId: 3,
      elements: { fire: 6, wind: 4 },
    } as const;
    expect(decodeClientMessage(encodeMessage(create))).toEqual(create);
    const allocate = { t: "cyborg_elements", id: 4, elements: { earth: 10 } } as const;
    expect(decodeClientMessage(encodeMessage(allocate))).toEqual(allocate);
    // 모양만 본다: 칸 수·합·4원소인지는 서버가 본다(N36 설정값)
    expect(decodes(decodeClientMessage, { ...allocate, elements: { light: 3, frost: 2 } })).toBe(true);
    expect(decodes(decodeClientMessage, { ...allocate, elements: { plasma: 3 } })).toBe(false);
    expect(decodes(decodeClientMessage, { ...allocate, elements: { fire: 11 } })).toBe(false);
    expect(decodes(decodeClientMessage, { ...allocate, elements: { fire: 2.5 } })).toBe(false);
    expect(decodes(decodeClientMessage, { ...allocate, elements: [10] })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "cyborg_elements", id: 4 })).toBe(false);
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

  it("3D 외형(선택 칸 look): 판 번호 2 + 부위·색 ID + 키·장갑 정수만, 다른 칸은 받지 않는다(목록·범위는 서버가 본다)", () => {
    const look = {
      v: 2,
      build: "standard",
      height: 100,
      head: "round",
      face: "visor",
      top: "antenna",
      torso: "suit",
      arms: "plain",
      legs: "boots",
      back: "pack",
      extra: "scarf",
      plating: 1,
      skin: "mint",
      primary: "teal",
      secondary: "charcoal",
      accent: "lemon",
      glow: "lemon",
    } as const;
    const create = {
      t: "cyborg_create",
      id: 2,
      name: "철수",
      appearance,
      factionId: 1,
      cityId: 3,
      look,
    } as const;
    expect(decodeClientMessage(encodeMessage(create))).toEqual(create);
    expect(Object.keys(characterLookSchema.shape)).toHaveLength(17);
    expect(decodes(decodeClientMessage, { ...create, look: { ...look, v: 1 } })).toBe(false);
    expect(decodes(decodeClientMessage, { ...create, look: { ...look, hat: "cap" } })).toBe(false);
    expect(decodes(decodeClientMessage, { ...create, look: { ...look, head: "Round!" } })).toBe(false);
    expect(decodes(decodeClientMessage, { ...create, look: { ...look, height: 100.5 } })).toBe(false);
    expect(decodes(decodeClientMessage, { ...create, look: { ...look, plating: -1 } })).toBe(false);
    const { glow: _glow, ...missing } = look;
    expect(decodes(decodeClientMessage, { ...create, look: missing })).toBe(false);
    // 모르는 최상위 칸은 버린다(z.object) — 그래서 이 칸을 모르는 옛 서버도 새 기기의 만들기를 받는다(프로토콜 판을 올리지 않았다)
    const decoded = decodeClientMessage(encodeMessage({ ...create, someday: 1 }));
    expect(decoded).toEqual(create);
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
