// 세력 쌍 호감 장부 시험(affinity.ts — 줄기 gov-fix-4, 사용자 결정 D-591 2531·기획 D-255·D-290·D-291). 메모리 가짜로 본다.
import { describe, expect, it } from "vitest";
import { type AffinityRecord, createAffinityBook, pairKey } from "./affinity.ts";
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

describe("호감이 오르는 길(줄기 npc-diplo — 질문 2662 [임시])", () => {
  const DAY = 86_400_000;
  const RISE = {
    ...RULES,
    affinityDriftPerDay: 1,
    treatyKeptAffinity: 1,
    peaceAffinity: 10,
    joinAcceptAffinity: 10,
  };
  function riseBook(nations = [1, 2, 3, 4]) {
    const b = createAffinityBook({
      rules: () => RISE,
      nations: () => nations,
      rowOfOwner: (owner) => (owner >= 100 ? owner - 100 : undefined),
    });
    b.persistWith(async () => {});
    return b;
  }

  it("하루마다 0 쪽으로 돌아오고(0을 넘지 않음), 지킨 조약이 있는 쌍은 그 대신 오른다", () => {
    const b = riseBook();
    b.add(1, 2, -3, 0);
    b.add(1, 3, 2, 0);
    b.daily(10 * DAY, new Map()); // 첫 걸음은 날만 정한다(켤 때 읽은 줄이 없음)
    expect([b.get(1, 2), b.get(1, 3)]).toEqual([-3, 2]);
    b.daily(10 * DAY + 3_600_000, new Map([[pairKey(1, 4), 5 * DAY]]));
    expect([b.get(1, 2), b.get(1, 3), b.get(1, 4)]).toEqual([-3, 2, 0]);
    b.daily(11 * DAY + 60_000, new Map([[pairKey(1, 4), 5 * DAY]]));
    expect([b.get(1, 2), b.get(1, 3), b.get(1, 4)]).toEqual([-2, 1, 1]);
    b.daily(12 * DAY + 60_000, new Map());
    b.daily(13 * DAY + 60_000, new Map());
    b.daily(14 * DAY + 60_000, new Map());
    expect([b.get(1, 2), b.get(1, 3), b.get(1, 4)]).toEqual([0, 0, 0]);
  });

  it("켤 때 읽은 줄의 가장 최근 시각이 마지막 걸음 날 — 밀린 날은 7날까지, 조약 몫은 맺은 뒤 날만", () => {
    const b = riseBook();
    b.restore(1, 2, -50, 3 * DAY + 500);
    b.restore(1, 3, 20, 1 * DAY);
    b.markLoaded();
    b.daily(20 * DAY + 60_000, new Map([[pairKey(2, 3), 18 * DAY + 1]]));
    expect([b.get(1, 2), b.get(1, 3), b.get(2, 3)]).toEqual([-43, 13, 2]);
  });

  it("강화(두 나라 전쟁이 끝남): 첫 번은 기준만, 그 뒤 끝난 쌍이 둘 다 살아 있으면 오른다", () => {
    const nations = [1, 2, 3, 4];
    const b = riseBook(nations);
    b.observeWars([[2, 1]], 0);
    expect(b.get(1, 2)).toBe(0);
    b.observeWars(
      [
        [1, 2],
        [3, 4],
      ],
      10,
    );
    b.observeWars([], 20);
    expect(b.get(1, 2)).toBe(10);
    // 4는 사라졌다 — 강화가 아니다
    nations.pop();
    expect(b.get(3, 4)).toBe(10);
    b.observeWars([[1, 3]], 30);
    nations.splice(2, 1);
    b.observeWars([], 40);
    expect(b.get(1, 3)).toBe(0);
  });

  it("참전 요청 수락은 들어간 나라와 요청한 나라를 올리고, 거울 세계 세력 ID로도 읽는다", () => {
    const b = riseBook();
    b.joinAccepted(2, 1, 100);
    expect(b.get(1, 2)).toBe(10);
    expect(b.getByOwner(101, 102)).toBe(10);
    expect(b.getByOwner(101, 7)).toBe(0);
  });
});
