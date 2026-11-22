// 세력 쌍 호감 장부 시험(affinity.ts — 줄기 gov-fix-4, 사용자 결정 D-591 2531·기획 D-255·D-290·D-291). 메모리 가짜로 본다.
import { describe, expect, it } from "vitest";
import { type AffinityRecord, createAffinityBook } from "./affinity.ts";
import { npcTreatyAnswer } from "./clauses.ts";

const RULES = { independenceAffinity: 80, noCauseAffinity: 30, joinRefuseAffinity: 20 };

function book(nations = [1, 2, 3, 4]) {
  const saved: AffinityRecord[] = [];
  const b = createAffinityBook({
    rules: () => RULES,
    nations: () => nations,
    rowOfOwner: (owner) => (owner >= 100 ? owner - 100 : undefined),
  });
  b.persistWith(async (record) => {
    saved.push(record);
  });
  return { b, saved };
}

describe("세력 쌍 호감(D-255 — 쌍마다 −100~100, 시작 0)", () => {
  it("가문 독립: 새 나라와 옛 나라가 크게 깎인 채 시작한다(D-591 2531 — 쌍 하나, 두 나라가 같은 값)", async () => {
    const { b, saved } = book();
    expect(b.get(1, 2)).toBe(0);
    b.independence(2, 1, 100);
    await b.settle();
    expect(b.get(1, 2)).toBe(-80);
    expect(b.get(2, 1)).toBe(-80);
    expect(saved).toEqual([{ a: 1, b: 2, score: -80, atMs: 100 }]);
    // 범위 끝에서 자른다
    b.independence(2, 1, 200);
    expect(b.get(1, 2)).toBe(-100);
  });

  it("명분 없는 선포는 선포한 나라와 다른 모든 나라의 호감을 내리고, 명분이 있으면 그대로다(D-290·2585)", () => {
    const { b } = book();
    b.declared(1, true, 100);
    expect([b.get(1, 2), b.get(1, 3), b.get(1, 4)]).toEqual([0, 0, 0]);
    b.declared(1, false, 100);
    expect([b.get(1, 2), b.get(1, 3), b.get(1, 4), b.get(2, 3)]).toEqual([-30, -30, -30, 0]);
    // NPC 판단 고리는 거울 세계 세력 ID로 알린다
    b.declaredByOwner(103, false, 200);
    expect([b.get(3, 1), b.get(3, 2), b.get(3, 4)]).toEqual([-60, -30, -30]);
    b.declaredByOwner(7, false, 200);
    expect(b.get(2, 4)).toBe(0);
  });

  it("참전 요청 거절은 거절한 나라와 요청한 나라의 호감을 내린다(D-291)", () => {
    const { b } = book();
    b.joinRefused(2, 1, 100);
    expect(b.get(1, 2)).toBe(-20);
  });

  it("켤 때 읽은 줄을 되살리고, 쓰는 곳이 붙기 전 바뀜은 붙을 때 쓴다", async () => {
    const b = createAffinityBook({ rules: () => RULES, nations: () => [1, 2], rowOfOwner: () => undefined });
    b.restore(2, 1, -40);
    expect(b.get(1, 2)).toBe(-40);
    b.joinRefused(1, 2, 50);
    const saved: AffinityRecord[] = [];
    b.persistWith(async (record) => {
      saved.push(record);
    });
    await b.settle();
    expect(saved).toEqual([{ a: 1, b: 2, score: -60, atMs: 50 }]);
  });
});

describe('NPC 조약 답과 호감(D-255 "NPC의 판단에 쓴다" — [임시 2663])', () => {
  const base = {
    clauses: [{ kind: "non_aggression" as const }],
    self: 2,
    atWar: false,
    peaceScore: 0,
    aggression: 100,
    myStrength: 10,
    otherStrength: 10,
    calmPm: 500,
  };
  it("호감 띠가 적대면 불가침·동맹을 받지 않고, 경고 이상이면 예전대로 받는다", () => {
    expect(npcTreatyAnswer(base)).toBe(true);
    expect(npcTreatyAnswer({ ...base, affinity: -59 })).toBe(true);
    expect(npcTreatyAnswer({ ...base, affinity: -60 })).toBe(false);
    expect(npcTreatyAnswer({ ...base, clauses: [{ kind: "alliance" }], affinity: -80 })).toBe(false);
  });
  it("휴전·강화는 호감과 무관하게 강화 규칙식만 본다", () => {
    expect(
      npcTreatyAnswer({
        ...base,
        clauses: [{ kind: "ceasefire" }],
        atWar: true,
        peaceScore: 1,
        affinity: -100,
      }),
    ).toBe(true);
  });
});
