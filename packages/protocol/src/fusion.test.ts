// 사이보그 유닛 융합·유전자 환생 메시지 스키마 시험 — 왕복, 결과 코드, 값 모양(D-470·D-478)
import { describe, expect, it } from "vitest";
import {
  DEV_GRANT_GOODS_MAX,
  FUSION_PROTOCOL_VERSION,
  FUSION_RESULT_CODES,
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

describe("융합·유전자 메시지(프로토콜 9)", () => {
  it("융합·환생·개발 받기 명령이 왕복하고 값 모양을 본다", () => {
    expect(FUSION_PROTOCOL_VERSION).toBe(9);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(FUSION_PROTOCOL_VERSION);
    const fuse = { t: "cyborg_fuse", id: 3, human: 41, cost: "5000" } as const;
    expect(decodeClientMessage(encodeMessage(fuse))).toEqual(fuse);
    expect(decodes(decodeClientMessage, { ...fuse, cost: "05" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...fuse, human: 0 })).toBe(false);
    const rebirth = { t: "unit_rebirth", id: 4, unit: 41, shards: 1 } as const;
    expect(decodeClientMessage(encodeMessage(rebirth))).toEqual(rebirth);
    expect(decodes(decodeClientMessage, { ...rebirth, shards: 0 })).toBe(false);
    const grant = { t: "dev_grant_goods", id: 5, item: "titanium_ingot", quantity: 50 } as const;
    expect(decodeClientMessage(encodeMessage(grant))).toEqual(grant);
    expect(decodes(decodeClientMessage, { ...grant, quantity: DEV_GRANT_GOODS_MAX + 1 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...grant, item: "Titanium" })).toBe(false);
  });

  it("결과는 성공(유닛·스탯·보너스·조각 수) 또는 코드", () => {
    const ok = {
      t: "fusion_result",
      id: 3,
      ok: true,
      unitId: 41,
      stats: [12, 13, 14, 20, 21, 22],
      bonusPm: 1100,
    } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    expect(decodes(decodeServerMessage, { ...ok, stats: [1, 2, 3] })).toBe(false);
    for (const code of FUSION_RESULT_CODES)
      expect(decodes(decodeServerMessage, { t: "fusion_result", id: 1, ok: false, code })).toBe(true);
    expect(decodes(decodeServerMessage, { t: "fusion_result", id: 1, ok: false, code: "nope" })).toBe(false);
  });
});
