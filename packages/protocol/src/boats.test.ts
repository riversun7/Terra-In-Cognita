// 배 메시지 스키마 시험(프로토콜 27, docs/adr/2026-11-13-boats.md) — 왕복, 값 모양, 결과 코드, 판
import { describe, expect, it } from "vitest";
import {
  BOAT_B2_PROTOCOL_VERSION,
  BOAT_PROTOCOL_VERSION,
  BOAT_RESULT_CODES,
  type ClientMessage,
  HARBOR_PROTOCOL_VERSION,
  VOYAGE_PROTOCOL_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  RESULT_CODES,
  UNIT_WIRE_KINDS,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
  HOLD_PROTOCOL_VERSION,
  legacyBoatCode,
  legacyGearCode,
  legacyOrderCode,
  legacyHoldCode,
  legacyVoyageCode,
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

describe("배 메시지(프로토콜 27)", () => {
  it("판: 27부터, 받는 가장 낮은 판 = 현재 − 1", () => {
    expect(BOAT_PROTOCOL_VERSION).toBe(27);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(BOAT_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("만들기·타기·내리기가 왕복하고 값 모양을 본다", () => {
    const build = { t: "boat_build", id: 1, buildingId: 12 } as const;
    expect(decodeClientMessage(encodeMessage(build))).toEqual(build);
    const board = { t: "boat_board", id: 2, unitId: 7, boatId: 9 } as const;
    expect(decodeClientMessage(encodeMessage(board))).toEqual(board);
    const leave = { t: "boat_leave", id: 3, boatId: 9 } as const;
    expect(decodeClientMessage(encodeMessage(leave))).toEqual(leave);
    expect(decodes(decodeClientMessage, { ...board, boatId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...build, buildingId: -1 })).toBe(false);
  });

  it("결과: 성공 칸(배 ID·걷는 중)과 실패 코드", () => {
    const made = { t: "boat_result", id: 1, ok: true, boatId: 40 } as const;
    expect(decodeServerMessage(encodeMessage(made))).toEqual(made);
    const walking = { t: "boat_result", id: 2, ok: true, walking: true } as const;
    expect(decodeServerMessage(encodeMessage(walking))).toEqual(walking);
    for (const code of BOAT_RESULT_CODES) {
      const failed = { t: "boat_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    expect(decodes(decodeServerMessage, { t: "boat_result", id: 3, ok: false, code: "nope" })).toBe(false);
  });

  it("B2(28): 만드는 중 readyAtMs·dock_busy", () => {
    expect(BOAT_B2_PROTOCOL_VERSION).toBe(28);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(BOAT_B2_PROTOCOL_VERSION);
    const started = { t: "boat_result", id: 4, ok: true, readyAtMs: 1_800_000_000_000 } as const;
    expect(decodeServerMessage(encodeMessage(started))).toEqual(started);
    const busy = {
      t: "boat_result",
      id: 5,
      ok: false,
      code: "dock_busy",
      readyAtMs: 1_800_000_000_000,
    } as const;
    expect(decodeServerMessage(encodeMessage(busy))).toEqual(busy);
    expect(decodes(decodeServerMessage, { ...started, readyAtMs: -1 })).toBe(false);
  });

  it("이동 결과 코드 aboard, 표시 종류 boat", () => {
    expect(RESULT_CODES).toContain("aboard");
    expect(UNIT_WIRE_KINDS).toContain("boat");
  });

  it("30: 조선소 배 종류·수리·집 정박장·교역 부두 시간·주인 설정(D-547)", () => {
    expect(HARBOR_PROTOCOL_VERSION).toBe(30);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HARBOR_PROTOCOL_VERSION);
    const build = { t: "boat_build", id: 1, buildingId: 12, boatType: "cargo_boat" } as const;
    expect(decodeClientMessage(encodeMessage(build))).toEqual(build);
    expect(decodes(decodeClientMessage, { ...build, boatType: "Big Boat" })).toBe(false);
    const repair = { t: "boat_repair", id: 2, boatId: 9, buildingId: 12 } as const;
    expect(decodeClientMessage(encodeMessage(repair))).toEqual(repair);
    const berth = { t: "boat_berth", id: 3, boatId: 9, buildingId: 14 } as const;
    expect(decodeClientMessage(encodeMessage(berth))).toEqual(berth);
    const away = { t: "boat_berth", id: 4, boatId: 9, buildingId: null } as const;
    expect(decodeClientMessage(encodeMessage(away))).toEqual(away);
    const time = { t: "boat_dock_time", id: 5, boatId: 9, buildingId: 15, hours: 3 } as const;
    expect(decodeClientMessage(encodeMessage(time))).toEqual(time);
    expect(decodes(decodeClientMessage, { ...time, hours: 0 })).toBe(false);
    const policy = {
      t: "harbor_policy",
      id: 6,
      buildingId: 14,
      access: "peace",
      fee: 25,
      module: null,
    } as const;
    expect(decodeClientMessage(encodeMessage(policy))).toEqual(policy);
    expect(decodes(decodeClientMessage, { ...policy, access: "everyone" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...policy, fee: -1 })).toBe(false);
  });

  it("30판 새 결과 코드는 29판 연결에 옛 코드로", () => {
    const old = BOAT_RESULT_CODES.slice(0, BOAT_RESULT_CODES.indexOf("dock_busy") + 1);
    // 37판 코드는 먼저 36판 코드로 낮춘 뒤(게이트웨이 차례와 같다)
    for (const code of BOAT_RESULT_CODES) expect(old).toContain(legacyBoatCode(legacyVoyageCode(code)));
    expect(legacyBoatCode("not_shipyard")).toBe("not_dock");
    expect(legacyBoatCode("dock_busy")).toBe("dock_busy");
  });

  it("37: 도크 출고·모듈 묶음·연료 보급·오버히트·보직·빼앗기(D-559)", () => {
    expect(VOYAGE_PROTOCOL_VERSION).toBe(37);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(VOYAGE_PROTOCOL_VERSION);
    const messages: ClientMessage[] = [
      { t: "boat_release", id: 1, boatId: 9 },
      { t: "boat_refuel", id: 2, boatId: 9, buildingId: 15 },
      { t: "boat_overheat", id: 3, boatId: 9, on: true },
      { t: "boat_crew", id: 4, boatId: 9, unitId: 11, post: "deck" },
      { t: "boat_crew", id: 5, boatId: 9, unitId: 11, post: null },
      { t: "boat_seize", id: 6, boatId: 9, unitId: 11 },
      { t: "harbor_policy", id: 7, buildingId: 14, modules: ["docks", "build"] },
    ];
    for (const message of messages) expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
    expect(decodes(decodeClientMessage, { t: "boat_crew", id: 8, boatId: 9, unitId: 11, post: "cook" })).toBe(
      false,
    );
    expect(
      decodes(decodeClientMessage, { t: "harbor_policy", id: 9, buildingId: 14, modules: ["wings"] }),
    ).toBe(false);
    const cooling = {
      t: "boat_result",
      id: 10,
      ok: false,
      code: "cooling",
      readyAtMs: 1_800_000_000_000,
    } as const;
    expect(decodeServerMessage(encodeMessage(cooling))).toEqual(cooling);
  });

  it("52: 배 판매가 0(order_closed)은 51판 이하 연결에 forbidden으로(기획 대조 2057)", () => {
    expect(legacyOrderCode("order_closed")).toBe("forbidden");
    expect(legacyOrderCode("busy")).toBe("busy");
    expect(legacyGearCode("order_closed")).toBe("forbidden");
  });

  it("37판 새 결과 코드는 36판 연결에 옛 코드로", () => {
    const old = BOAT_RESULT_CODES.slice(0, BOAT_RESULT_CODES.indexOf("invalid_policy") + 1);
    for (const code of BOAT_RESULT_CODES) expect(old).toContain(legacyVoyageCode(code));
    expect(legacyVoyageCode("not_docked")).toBe("forbidden");
    expect(legacyVoyageCode("cooling")).toBe("busy");
    expect(legacyVoyageCode("hull_full")).toBe("hull_full");
  });

  it("43: 배 창고 내리기·연료 아이템 코드(D-564·D-568), 42판 연결에는 옛 코드로", () => {
    expect(HOLD_PROTOCOL_VERSION).toBe(43);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOLD_PROTOCOL_VERSION);
    const unload: ClientMessage = { t: "boat_unload", id: 1, boatId: 9, buildingId: 15 };
    expect(decodeClientMessage(encodeMessage(unload))).toEqual(unload);
    expect(decodes(decodeClientMessage, { t: "boat_unload", id: 2, boatId: 9 })).toBe(false);
    const old = BOAT_RESULT_CODES.slice(0, BOAT_RESULT_CODES.indexOf("not_drifting") + 1);
    for (const code of BOAT_RESULT_CODES) expect(old).toContain(legacyHoldCode(legacyGearCode(code)));
    expect(legacyHoldCode("no_fuel_items")).toBe("insufficient_materials");
    expect(legacyHoldCode("hold_empty")).toBe("empty");
    const result = { t: "boat_result", id: 3, ok: false, code: "no_fuel_items" } as const;
    expect(decodeServerMessage(encodeMessage(result))).toEqual(result);
  });
});
