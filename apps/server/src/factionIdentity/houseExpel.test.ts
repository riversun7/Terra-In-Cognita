// 같은 가문원을 친 사람 추방 고리 시험(줄기 fixes-d592 — 사용자 결정 D-592 2581 (4) [임시 — 해석 확인 중])
import { describe, expect, it } from "vitest";
import { EXPEL_REASON_ATTACK, attachHouseExpel, houseExpelOf, sameHouseTarget } from "./houseExpel.ts";

const HOUSES: Readonly<Record<string, number>> = { a: 9, b: 9, c: 4 };
const houseOf = (userId: string): number | undefined => HOUSES[userId];

describe("같은 가문원 공격 → 추방", () => {
  it("같은 가문 대상 = 그 가문원 사용자 주체(나 빼고)이거나 그 가문 소유 주체", () => {
    expect(sameHouseTarget(9, "a", { userId: "b", factionId: null }, houseOf)).toBe(true);
    expect(sameHouseTarget(9, "a", { userId: "c", factionId: null }, houseOf)).toBe(false);
    expect(sameHouseTarget(9, "a", { userId: "a", factionId: null }, houseOf)).toBe(false);
    expect(sameHouseTarget(9, "a", { userId: null, factionId: 9 }, houseOf)).toBe(true);
    expect(sameHouseTarget(9, "a", { userId: null, factionId: 4 }, houseOf)).toBe(false);
    expect(sameHouseTarget(9, "a", undefined, houseOf)).toBe(false);
  });

  it("치는 사람과 대상 주인이 같은 가문이면 추방 길을 부르고 가문 표를 다시 읽는다 — 다른 가문·무소속·추방 실패(가문장)면 아니다", async () => {
    const store = {
      owners: new Map([
        [1, { userId: "a", factionId: null }],
        [2, { userId: "b", factionId: null }],
        [3, { userId: "c", factionId: null }],
        [4, { userId: null, factionId: 9 }],
      ]),
    };
    const expelled: string[] = [];
    let reloaded = 0;
    const expel = attachHouseExpel(store, {
      expel: async (userId, reason) => {
        expelled.push(`${userId}:${reason}`);
        return userId === "b"
          ? { ok: false, code: "leader_cannot_leave" }
          : { ok: true, action: "kicked", factionId: 9 };
      },
      after: async () => {
        reloaded += 1;
      },
      houseOf,
    });
    expect(houseExpelOf(store)).toBe(expel);
    expect(
      attachHouseExpel(store, { expel: async () => ({ ok: false, code: "busy" }), after: async () => {} }),
    ).toBe(expel);
    expect(await expel("a", [3], 0)).toBe(false);
    expect(await expel("zz", [2], 0)).toBe(false);
    expect(await expel("a", [3, 2], 0)).toBe(true);
    expect(await expel("a", [4], 0)).toBe(true);
    // 가문장(가짜 b)은 추방 길이 거절한다 — 표를 다시 읽지 않는다
    expect(await expel("b", [1], 0)).toBe(false);
    expect(expelled).toEqual([
      `a:${EXPEL_REASON_ATTACK}`,
      `a:${EXPEL_REASON_ATTACK}`,
      `b:${EXPEL_REASON_ATTACK}`,
    ]);
    expect(reloaded).toBe(2);
  });
});
