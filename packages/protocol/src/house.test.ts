// 가문 창설(프로토콜 22)·가입(23) 메시지 스키마 시험( docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)") — 왕복, 값 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  HOUSE_HOME_NOTICE_PROTOCOL_VERSION,
  legacyHouseMemberAction,
  HOUSE_CITY_PROTOCOL_VERSION,
  HOUSE_CITY_RESULT_CODES,
  HOUSE_HOME_PROTOCOL_VERSION,
  HOUSE_MEMBER_ACTIONS,
  HOUSE_MEMBER_PROTOCOL_VERSION,
  HOUSE_MEMBER_RESULT_CODES,
  HOUSE_PROTOCOL_VERSION,
  HOUSE_RESULT_CODES,
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

describe("가문 창설 메시지(프로토콜 22)", () => {
  it("판: 22부터", () => {
    expect(HOUSE_PROTOCOL_VERSION).toBe(22);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_PROTOCOL_VERSION);
  });

  it("창설이 왕복하고 비용 모양을 본다(음수·앞자리 0 거절)", () => {
    const found = { t: "house_found", id: 7, cost: "0" } as const;
    expect(decodeClientMessage(encodeMessage(found))).toEqual(found);
    expect(decodes(decodeClientMessage, { ...found, cost: "250" })).toBe(true);
    expect(decodes(decodeClientMessage, { ...found, cost: "-1" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...found, cost: "01" })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_found", id: 7 })).toBe(false);
  });

  it("결과: 성공 칸과 실패 코드", () => {
    const ok = { t: "house_result", id: 7, ok: true, factionId: 40, paid: "0" } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of HOUSE_RESULT_CODES) {
      const fail = { t: "house_result", id: 7, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(decodes(decodeServerMessage, { t: "house_result", id: 7, ok: false, code: "nope" })).toBe(false);
  });
});

describe("가문 가입 메시지(프로토콜 23, 질문 985 다)", () => {
  const USER = "0b6f3f7e-1a2b-4c3d-8e9f-0123456789ab";

  it("판: 23부터", () => {
    expect(HOUSE_MEMBER_PROTOCOL_VERSION).toBe(23);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_MEMBER_PROTOCOL_VERSION);
  });

  it("초대·신청·답·거두기·나가기·내보내기가 왕복한다", () => {
    const messages = [
      { t: "house_invite", id: 1, name: "철수" },
      { t: "house_apply", id: 2, factionId: 40 },
      { t: "house_answer", id: 3, requestId: 9, accept: true },
      { t: "house_answer", id: 4, requestId: 9, accept: false },
      { t: "house_withdraw", id: 5, requestId: 9 },
      { t: "house_leave", id: 6 },
      { t: "house_kick", id: 7, userId: USER },
    ] as const;
    for (const message of messages) expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
  });

  it("모양이 틀리면 거절: 빈 이름·33자 이름·0 가문·uuid가 아닌 사용자·답 없는 받기", () => {
    expect(decodes(decodeClientMessage, { t: "house_invite", id: 1, name: "" })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_invite", id: 1, name: "가".repeat(33) })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_apply", id: 1, factionId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_kick", id: 1, userId: "user_1" })).toBe(false);
    expect(decodes(decodeClientMessage, { t: "house_answer", id: 1, requestId: 3 })).toBe(false);
  });

  it("결과: 성공한 일과 실패 코드", () => {
    for (const action of HOUSE_MEMBER_ACTIONS) {
      const ok = { t: "house_member_result", id: 7, ok: true, action, factionId: 40 } as const;
      expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    }
    for (const code of HOUSE_MEMBER_RESULT_CODES) {
      const fail = { t: "house_member_result", id: 7, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
    expect(
      decodes(decodeServerMessage, {
        t: "house_member_result",
        id: 7,
        ok: true,
        action: "nope",
        factionId: 1,
      }),
    ).toBe(false);
  });
});

describe("가문장 넘기기·해산·가문 도시(프로토콜 24, 질문 1003 가·1005 가)", () => {
  const USER = "0b6f3f7e-1a2b-4c3d-8e9f-0123456789ab";

  it("판: 24부터", () => {
    expect(HOUSE_CITY_PROTOCOL_VERSION).toBe(24);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_CITY_PROTOCOL_VERSION);
  });

  it("넘기기·해산이 왕복하고 가입 결과에 새 일·코드가 있다", () => {
    for (const message of [
      { t: "house_handover", id: 1, userId: USER },
      { t: "house_dissolve", id: 2 },
    ] as const)
      expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
    expect(decodes(decodeClientMessage, { t: "house_handover", id: 1, userId: "x" })).toBe(false);
    for (const action of ["handed_over", "dissolved"] as const) {
      expect(HOUSE_MEMBER_ACTIONS).toContain(action);
      const ok = { t: "house_member_result", id: 1, ok: true, action, factionId: 9 } as const;
      expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    }
    for (const code of ["not_alone", "has_city"] as const) expect(HOUSE_MEMBER_RESULT_CODES).toContain(code);
  });

  it("마을 세우기·폐허 고르기: 봉신·독립과 체제, 자리 모양", () => {
    const village = {
      t: "house_village",
      id: 3,
      mapKey: 123456,
      x: 40,
      y: 50,
      cost: "5000",
      mode: "independent",
      regime: "capitalism",
    } as const;
    expect(decodeClientMessage(encodeMessage(village))).toEqual(village);
    expect(decodes(decodeClientMessage, { ...village, mode: "vassal", regime: undefined })).toBe(true);
    expect(decodes(decodeClientMessage, { ...village, mode: "free" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...village, regime: "monarchy" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...village, x: -1 })).toBe(false);
    const ruin = { t: "house_ruin", id: 4, ruinId: 77, mode: "vassal" } as const;
    expect(decodeClientMessage(encodeMessage(ruin))).toEqual(ruin);
  });

  it("가문 도시 결과: 성공 칸과 실패 코드", () => {
    const ok = {
      t: "house_city_result",
      id: 3,
      ok: true,
      factionId: 9,
      mode: "vassal",
      cityId: 120,
      paid: "5000",
    } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of HOUSE_CITY_RESULT_CODES) {
      const fail = { t: "house_city_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(fail))).toEqual(fail);
    }
  });
});

describe("가문 소속 도시(프로토콜 39, D-565)", () => {
  it("판: 39부터, 창설에 소속 도시(선택 칸)·소속 도시 바꾸기가 왕복한다", () => {
    expect(HOUSE_HOME_PROTOCOL_VERSION).toBe(39);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_HOME_PROTOCOL_VERSION);
    const found = { t: "house_found", id: 3, cost: "0", cityId: 12 } as const;
    expect(decodeClientMessage(encodeMessage(found))).toEqual(found);
    expect(decodes(decodeClientMessage, { ...found, cityId: 0 })).toBe(false);
    const home = { t: "house_home", id: 4, cityId: 12 } as const;
    expect(decodeClientMessage(encodeMessage(home))).toEqual(home);
    expect(decodes(decodeClientMessage, { t: "house_home", id: 4 })).toBe(false);
  });

  it("결과: 창설 unknown_city, 가입 결과 home_set·unknown_city·same_city·home_wait", () => {
    expect(HOUSE_RESULT_CODES).toContain("unknown_city");
    for (const code of ["unknown_city", "same_city", "home_wait"])
      expect(HOUSE_MEMBER_RESULT_CODES).toContain(code);
    expect(HOUSE_MEMBER_ACTIONS).toContain("home_set");
    const ok = { t: "house_member_result", id: 4, ok: true, action: "home_set", factionId: 9 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
  });
  it("공고(D-570): 48부터 한 일 home_announced·home_cancelled, 47판 연결은 home_set으로 낮춘다", () => {
    expect(HOUSE_HOME_NOTICE_PROTOCOL_VERSION).toBe(48);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_HOME_NOTICE_PROTOCOL_VERSION);
    for (const action of ["home_announced", "home_cancelled"] as const) {
      expect(HOUSE_MEMBER_ACTIONS).toContain(action);
      const ok = { t: "house_member_result", id: 5, ok: true, action, factionId: 9 } as const;
      expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
      expect(legacyHouseMemberAction(action, 48)).toBe(action);
      expect(legacyHouseMemberAction(action, 47)).toBe("home_set");
    }
    expect(legacyHouseMemberAction("joined", 47)).toBe("joined");
  });
});
