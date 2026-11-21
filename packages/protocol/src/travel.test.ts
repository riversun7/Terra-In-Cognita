// 2차맵 사이 이동 메시지 스키마 시험(프로토콜 16, docs/adr/2026-11-07-play-flow.md "WP9") — 왕복, 값 모양, 결과 코드, 판
import { describe, expect, it } from "vitest";
import {
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  TRAVEL_KINDS,
  TRAVEL_PROTOCOL_VERSION,
  TRAVEL_RESULT_CODES,
  UNIT_ATTACK_MAX_UNITS,
  UNIT_ATTACK_PROTOCOL_VERSION,
  UNIT_TACTICS_PRESETS,
  UNIT_TACTICS_PROTOCOL_VERSION,
  UNIT_TACTICS_TARGETS,
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

describe("2차맵 사이 이동 메시지(프로토콜 16)", () => {
  it("판: 이 메시지는 16부터, 받는 가장 낮은 판 = 현재 − 1(현재 + 직전 하나)", () => {
    expect(TRAVEL_PROTOCOL_VERSION).toBe(16);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(16);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
    expect(TRAVEL_KINDS).toEqual(["move", "scout"]);
  });

  it("보내기·멈추기가 왕복하고 값 모양을 본다", () => {
    const start = {
      t: "travel_start",
      id: 1,
      unitId: 7,
      mapKey: 312_905_547_382_793,
      x: 0,
      y: 255,
      kind: "scout",
    } as const;
    expect(decodeClientMessage(encodeMessage(start))).toEqual(start);
    expect(decodes(decodeClientMessage, { ...start, x: 256 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...start, kind: "attack" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...start, unitId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...start, mapKey: -1 })).toBe(false);
    const cancel = { t: "travel_cancel", id: 2, unitId: 7 } as const;
    expect(decodeClientMessage(encodeMessage(cancel))).toEqual(cancel);
  });

  it("결과: 성공(지나는 2차맵 수·도착 예상)과 실패 코드", () => {
    const ok = { t: "travel_result", id: 1, ok: true, maps: 3, arriveAt: 1_800_000_000_000 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of TRAVEL_RESULT_CODES) {
      const failed = { t: "travel_result", id: 2, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    expect(decodes(decodeServerMessage, { t: "travel_result", id: 3, ok: false, code: "nope" })).toBe(false);
  });

  it("유닛 AI 작전 저장(프로토콜 50): 슬라이더 0~10·퇴각 0~100·목록 안의 프리셋·목표", () => {
    expect(UNIT_TACTICS_PROTOCOL_VERSION).toBe(50);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(50);
    const message = {
      t: "unit_tactics",
      id: 4,
      unitId: 7,
      preset: "balanced",
      engage: 6,
      pursue: 5,
      cover: 6,
      escort: 5,
      saveSkill: 5,
      spread: 5,
      retreatPct: 30,
      target: "nearest",
    } as const;
    expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
    expect(decodes(decodeClientMessage, { ...message, engage: 11 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...message, cover: 2.5 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...message, retreatPct: 101 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...message, preset: "custom" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...message, target: "random" })).toBe(false);
    expect(UNIT_TACTICS_PRESETS).toEqual(["aggressive", "balanced", "defensive", "hold"]);
    expect(UNIT_TACTICS_TARGETS).toEqual(["nearest", "weakest", "threat"]);
  });

  it("유닛 공격(프로토콜 64 — 묶음 1117d, 줄기 판 123 — D-588 2496 가·2543): 내 유닛 1~30·대상 하나, 새 결과 코드", () => {
    expect(UNIT_ATTACK_PROTOCOL_VERSION).toBe(64);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(UNIT_ATTACK_PROTOCOL_VERSION);
    const message = { t: "unit_attack" as const, id: 5, unitIds: [7, 8], targetUnitId: 9 };
    expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
    expect(decodes(decodeClientMessage, { ...message, unitIds: [] })).toBe(false);
    expect(
      decodes(decodeClientMessage, {
        ...message,
        unitIds: Array.from({ length: UNIT_ATTACK_MAX_UNITS + 1 }, (_, i) => i + 1),
      }),
    ).toBe(false);
    expect(decodes(decodeClientMessage, { ...message, targetUnitId: 0 })).toBe(false);
    for (const code of ["out_of_reach", "own_target", "safe_zone"] as const)
      expect(TRAVEL_RESULT_CODES).toContain(code);
  });
});
