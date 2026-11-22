// 조약 조항 규칙 시험 — 사용자 결정 D-588(질문 2497·2498), docs/adr/2026-11-21-diplomacy-treaties.md
import { describe, expect, it } from "vitest";
import { clausesOf, normalizeClauses, npcJoinsWar, npcTreatyAnswer, tributeAmount } from "./clauses.ts";

describe("조항 고르기(normalizeClauses)", () => {
  it("보호하는 쪽(us | them)을 나라 행으로 바꾸고 카드 차례로 늘어놓는다", () => {
    expect(
      normalizeClauses(
        [{ kind: "protection", protector: "them", tributePm: 30 }, { kind: "alliance" }],
        7,
        9,
        false,
        50,
      ),
    ).toEqual([{ kind: "alliance" }, { kind: "protection", protectorNationId: 9, tributePm: 30 }]);
    expect(normalizeClauses([{ kind: "protection", protector: "us" }], 7, 9, false, 50)).toEqual([
      { kind: "protection", protectorNationId: 7, tributePm: 0 },
    ]);
  });

  it("같은 카드 둘·보호 칸 없음·공물 상한 넘음·다른 카드에 보호 칸·빈 목록은 막는다", () => {
    expect(normalizeClauses([{ kind: "alliance" }, { kind: "alliance" }], 1, 2, false, 50)).toBeUndefined();
    expect(normalizeClauses([{ kind: "protection" }], 1, 2, false, 50)).toBeUndefined();
    expect(
      normalizeClauses([{ kind: "protection", protector: "us", tributePm: 51 }], 1, 2, false, 50),
    ).toBeUndefined();
    expect(normalizeClauses([{ kind: "alliance", tributePm: 5 }], 1, 2, false, 50)).toBeUndefined();
    expect(normalizeClauses([], 1, 2, false, 50)).toBeUndefined();
  });

  it("전쟁 중이면 휴전·강화가 꼭 들고, 전쟁이 아니면 넣지 않는다(D-292)", () => {
    expect(normalizeClauses([{ kind: "alliance" }], 1, 2, true, 50)).toBeUndefined();
    expect(normalizeClauses([{ kind: "ceasefire" }], 1, 2, false, 50)).toBeUndefined();
    expect(normalizeClauses([{ kind: "non_aggression" }, { kind: "ceasefire" }], 1, 2, true, 50)).toEqual([
      { kind: "ceasefire" },
      { kind: "non_aggression" },
    ]);
  });

  it("저장 칸을 읽을 때 모르는 카드·틀린 보호 칸은 뺀다", () => {
    expect(
      clausesOf([
        { kind: "alliance" },
        { kind: "trade" },
        { kind: "protection" },
        { kind: "protection", protectorNationId: 4, tributePm: 20 },
        "x",
      ]),
    ).toEqual([{ kind: "alliance" }, { kind: "protection", protectorNationId: 4, tributePm: 20 }]);
    expect(clausesOf(null)).toEqual([]);
  });
});

describe("NPC 답(npcTreatyAnswer — [임시 2553])", () => {
  const base = {
    self: 5,
    atWar: false,
    peaceScore: 0,
    aggression: 300,
    myStrength: 10,
    otherStrength: 20,
    calmPm: 500,
  };
  it("휴전·강화는 전쟁 중이고 강화 규칙식이 받을 때만", () => {
    expect(npcTreatyAnswer({ ...base, clauses: [{ kind: "ceasefire" }], atWar: true, peaceScore: 1 })).toBe(
      true,
    );
    expect(npcTreatyAnswer({ ...base, clauses: [{ kind: "ceasefire" }], atWar: true, peaceScore: 0 })).toBe(
      false,
    );
  });
  it("불가침·동맹은 차분함(1000 − 공격 성향) ≥ 문턱", () => {
    expect(npcTreatyAnswer({ ...base, clauses: [{ kind: "alliance" }] })).toBe(true);
    expect(npcTreatyAnswer({ ...base, clauses: [{ kind: "non_aggression" }], aggression: 600 })).toBe(false);
  });
  it("보호: 보호하는 쪽이면 힘이 상대 이상, 보호받는 쪽이면 힘이 작고 차분할 때", () => {
    const protectMe = { kind: "protection" as const, protectorNationId: 9, tributePm: 10 };
    const iProtect = { kind: "protection" as const, protectorNationId: 5, tributePm: 10 };
    expect(npcTreatyAnswer({ ...base, clauses: [protectMe] })).toBe(true);
    expect(npcTreatyAnswer({ ...base, clauses: [protectMe], myStrength: 30 })).toBe(false);
    expect(npcTreatyAnswer({ ...base, clauses: [iProtect] })).toBe(false);
    expect(npcTreatyAnswer({ ...base, clauses: [iProtect], myStrength: 20 })).toBe(true);
  });
  it("조항이 모두 맞아야 받는다", () => {
    expect(
      npcTreatyAnswer({
        ...base,
        clauses: [{ kind: "alliance" }, { kind: "non_aggression" }],
        aggression: 501,
      }),
    ).toBe(false);
  });
});

describe("참전·공물", () => {
  it("NPC 참전 = 힘이 적 이상 [임시 2556]", () => {
    expect(npcJoinsWar(10, 10)).toBe(true);
    expect(npcJoinsWar(9, 10)).toBe(false);
  });
  it("NPC 참전 = 요청국과의 호감·그 나라 신뢰가 힘 비 문턱을 옮긴다(줄기 npc-diplo — 질문 2663)", () => {
    const weights = { relationJoinAffinityPm: 500, relationJoinTrustPm: 300 };
    expect(npcJoinsWar(8, 10, { affinity: 40 }, weights)).toBe(true);
    expect(npcJoinsWar(11, 10, { affinity: -40 }, weights)).toBe(false);
    expect(npcJoinsWar(10, 10, { trust: -30 }, weights)).toBe(false);
    expect(npcJoinsWar(10, 10, { affinity: -40 })).toBe(true);
  });
  it("공물 = 국고 × ‰ ÷ 1000(내림), 국고·‰가 0 이하면 0", () => {
    expect(tributeAmount(12_345n, 50)).toBe(617n);
    expect(tributeAmount(0n, 50)).toBe(0n);
    expect(tributeAmount(-5n, 50)).toBe(0n);
    expect(tributeAmount(1000n, 0)).toBe(0n);
  });
});
