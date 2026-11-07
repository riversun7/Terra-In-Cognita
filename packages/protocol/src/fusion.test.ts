// 사이보그 유닛 융합·유전자 메시지 스키마 시험 — 왕복, 결과 코드, 값 모양(D-470·D-478·D-516)
import { describe, expect, it } from "vitest";
import {
  DEV_GRANT_GOODS_MAX,
  FUSION_PROTOCOL_VERSION,
  FUSION_RESULT_CODES,
  GENE_CONVERT_PROTOCOL_VERSION,
  GENE_INCUBATE_LAB_PROTOCOL_VERSION,
  GENE_PROTOCOL_VERSION,
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

describe("융합 메시지(프로토콜 9)", () => {
  it("융합·개발 받기 명령이 왕복하고 값 모양을 본다", () => {
    expect(FUSION_PROTOCOL_VERSION).toBe(9);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(FUSION_PROTOCOL_VERSION);
    const fuse = { t: "cyborg_fuse", id: 3, human: 41, cost: "5000" } as const;
    expect(decodeClientMessage(encodeMessage(fuse))).toEqual(fuse);
    expect(decodes(decodeClientMessage, { ...fuse, cost: "05" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...fuse, human: 0 })).toBe(false);
    const grant = { t: "dev_grant_goods", id: 5, item: "titanium_ingot", quantity: 50 } as const;
    expect(decodeClientMessage(encodeMessage(grant))).toEqual(grant);
    expect(decodes(decodeClientMessage, { ...grant, quantity: DEV_GRANT_GOODS_MAX + 1 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...grant, item: "Titanium" })).toBe(false);
  });

  it("유전자 환생(unit_rebirth)은 11에서 빠졌다(D-516)", () => {
    expect(decodes(decodeClientMessage, { t: "unit_rebirth", id: 4, unit: 41, shards: 1 })).toBe(false);
  });
});

describe("유전자 메시지(프로토콜 11, D-516)", () => {
  it("합성·주입·인큐베이터·개발 시험 명령이 왕복하고 값 모양을 본다", () => {
    expect(GENE_PROTOCOL_VERSION).toBe(11);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(GENE_PROTOCOL_VERSION);
    const synth = { t: "gene_synthesize", id: 1, a: 7, b: 8 } as const;
    expect(decodeClientMessage(encodeMessage(synth))).toEqual(synth);
    expect(decodes(decodeClientMessage, { ...synth, b: 0 })).toBe(false);
    const inject = { t: "gene_inject", id: 2, gene: 7, unit: 41 } as const;
    expect(decodeClientMessage(encodeMessage(inject))).toEqual(inject);
    const incubate = { t: "gene_incubate", id: 3, gene: 7, apply: "main" } as const;
    expect(decodeClientMessage(encodeMessage(incubate))).toEqual(incubate);
    expect(decodes(decodeClientMessage, { ...incubate, apply: "random" })).toBe(false);
    // 판 13: 생명과학 연구소 칸(연구소와 본 값은 함께)
    const lab = { ...incubate, buildingId: 12, cost: "5000" } as const;
    expect(decodeClientMessage(encodeMessage(lab))).toEqual(lab);
    expect(decodes(decodeClientMessage, { ...incubate, buildingId: 12 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...incubate, cost: "5000" })).toBe(false);
    expect(decodes(decodeClientMessage, { ...lab, cost: "05" })).toBe(false);
    expect(GENE_INCUBATE_LAB_PROTOCOL_VERSION).toBe(13);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(GENE_INCUBATE_LAB_PROTOCOL_VERSION);
    const devGene = { t: "dev_grant_gene", id: 4, kind: "skill", skill: "fireball" } as const;
    expect(decodeClientMessage(encodeMessage(devGene))).toEqual(devGene);
    expect(decodes(decodeClientMessage, { t: "dev_grant_gene", id: 4, kind: "stat" })).toBe(true);
    expect(decodes(decodeClientMessage, { ...devGene, skill: "Fire" })).toBe(false);
    const expire = { t: "dev_expire_unit", id: 5, unit: 41 } as const;
    expect(decodeClientMessage(encodeMessage(expire))).toEqual(expire);
  });

  it("결과는 성공(유닛·스탯·보너스·유전자·합성 결과·스킬) 또는 코드", () => {
    const ok = {
      t: "fusion_result" as const,
      id: 3,
      ok: true as const,
      unitId: 41,
      stats: [12, 13, 14, 20, 21, 22],
      bonusPm: 1100,
    };
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    expect(decodes(decodeServerMessage, { ...ok, stats: [1, 2, 3] })).toBe(false);
    const synth = { t: "fusion_result", id: 4, ok: true, gene: 9, outcome: "up", total: 73 } as const;
    expect(decodeServerMessage(encodeMessage(synth))).toEqual(synth);
    expect(decodes(decodeServerMessage, { ...synth, outcome: "boom" })).toBe(false);
    const expired = { t: "fusion_result" as const, id: 5, ok: true as const, unitId: 41, genes: [10, 11] };
    expect(decodeServerMessage(encodeMessage(expired))).toEqual(expired);
    for (const code of FUSION_RESULT_CODES)
      expect(decodes(decodeServerMessage, { t: "fusion_result", id: 1, ok: false, code })).toBe(true);
    expect(decodes(decodeServerMessage, { t: "fusion_result", id: 1, ok: false, code: "alive" })).toBe(false);
  });
});

describe("유전자 변환 메시지(프로토콜 12, D-517)", () => {
  it("비활성 휴먼 변환이 왕복하고 값 모양을 본다", () => {
    expect(GENE_CONVERT_PROTOCOL_VERSION).toBe(12);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(GENE_CONVERT_PROTOCOL_VERSION);
    const convert = { t: "gene_convert", id: 6, buildingId: 9, unit: 41, cost: "1000" } as const;
    expect(decodeClientMessage(encodeMessage(convert))).toEqual(convert);
    expect(decodes(decodeClientMessage, { ...convert, buildingId: 0 })).toBe(false);
    expect(decodes(decodeClientMessage, { ...convert, cost: "01" })).toBe(false);
    for (const code of ["not_inactive", "not_lab", "lab_closed", "wrong_city"])
      expect(decodes(decodeServerMessage, { t: "fusion_result", id: 6, ok: false, code })).toBe(true);
  });
});
