// 운영자 모드 메시지 시험(프로토콜 36, 기획 D-560) — 운영자 배율 operator_pace·텔레포트 칸 teleport·사이보그 만들기 옛 칸 선택
import { describe, expect, it } from "vitest";
import {
  OPERATOR_PACE_MAX,
  OPERATOR_PACE_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  TELEPORT_PROTOCOL_VERSION,
  decodeClientMessage,
} from "./index.ts";

function decodes(message: unknown): boolean {
  try {
    decodeClientMessage(JSON.stringify(message));
    return true;
  } catch (error) {
    if (error instanceof ProtocolError) return false;
    throw error;
  }
}

describe("운영자 모드 메시지(프로토콜 36)", () => {
  it("판", () => {
    expect(OPERATOR_PACE_PROTOCOL_VERSION).toBe(36);
    expect(TELEPORT_PROTOCOL_VERSION).toBe(36);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(36);
  });

  it("operator_pace: 배율 1 ~ OPERATOR_PACE_MAX 정수만", () => {
    const base = { t: "operator_pace", id: 1, mapKey: 9 };
    expect(decodes({ ...base, factor: 1 })).toBe(true);
    expect(decodes({ ...base, factor: OPERATOR_PACE_MAX })).toBe(true);
    expect(decodes({ ...base, factor: 0 })).toBe(false);
    expect(decodes({ ...base, factor: OPERATOR_PACE_MAX + 1 })).toBe(false);
    expect(decodes({ ...base, factor: 2.5 })).toBe(false);
    expect(decodes(base)).toBe(false);
  });

  it("travel_start teleport는 true만(선택 칸)", () => {
    const start = { t: "travel_start", id: 1, unitId: 5, mapKey: 9, x: 10, y: 20, kind: "move" };
    expect(decodes(start)).toBe(true);
    expect(decodes({ ...start, teleport: true })).toBe(true);
    expect(decodes({ ...start, teleport: false })).toBe(false);
  });

  it("cyborg_create: 옛 2D 칸 appearance는 선택 칸(D-560 1421)", () => {
    const create = { t: "cyborg_create", id: 2, name: "철수", factionId: 1, cityId: 3 };
    expect(decodes(create)).toBe(true);
    expect(decodes({ ...create, appearance: { head: "dome" } })).toBe(false);
  });
});
