// 빈자리 자동 계승 시험(succession.ts — 질문 2491, 사용자 결정 D-584·D-588 5, 줄기 governance-6). 가짜 표(메모리)로 본다. 계정 ID는 가짜 값이다.
import { describe, expect, it } from "vitest";
import { createSuccession, pickSuccessor } from "./succession.ts";
import type { HouseMemberRow, StateRow } from "./store.ts";

const member = (userId: string, role: "leader" | "member", joinedAtMs: number): HouseMemberRow => ({
  userId,
  role,
  joinedAtMs,
});

const STATE: StateRow = {
  nationId: 9,
  rulingHouseKey: "p:5",
  electedAtMs: 0,
  termEndsAtMs: 1_000_000,
  shareVotesSuspended: false,
  vacantSinceMs: null,
};

/** 가문 5의 가문원·후계자를 들고, 가문장 세우기를 가문원 표에 반영하는 가짜 */
function fake(members: HouseMemberRow[], heir?: string) {
  const saved: StateRow[] = [];
  const audits: string[] = [];
  const promoted: string[] = [];
  const succession = createSuccession({
    store: {
      houseMembersOf: async (row) => (row === 5 ? members : []),
      heirOf: async (row) => (row === 5 ? heir : undefined),
      saveState: async (state) => {
        saved.push(state);
      },
    },
    audit: async (_user, action) => {
      audits.push(action);
    },
    promote: async (_row, userId) => {
      promoted.push(userId);
      for (const [index, row] of members.entries())
        members[index] = { ...row, role: row.userId === userId ? "leader" : "member" };
      return true;
    },
  });
  return { succession, saved, audits, promoted };
}

const DEMOCRACY = { rowId: 9, regime: "democracy" as const };

describe("후임 고르기(D-588 5)", () => {
  it("미리 정한 후계자 → 서열(들어온 차례 [임시], 같으면 ID 차례), 이을 수 없는 사람은 뺀다", () => {
    const members = [member("u-c", "member", 30), member("u-h", "leader", 0), member("u-b", "member", 10)];
    expect(pickSuccessor(members, "u-c", new Set(["u-h"]))).toBe("u-c");
    expect(pickSuccessor(members, undefined, new Set(["u-h"]))).toBe("u-b");
    // 후계자가 가문원이 아니거나 이을 수 없으면 서열
    expect(pickSuccessor(members, "u-x", new Set(["u-h"]))).toBe("u-b");
    expect(pickSuccessor(members, "u-b", new Set(["u-b", "u-h"]))).toBe("u-c");
    expect(
      pickSuccessor([member("u-z", "member", 10), member("u-a", "member", 10)], undefined, new Set()),
    ).toBe("u-a");
    expect(pickSuccessor([member("u-h", "leader", 0)], undefined, new Set(["u-h"]))).toBeNull();
  });
});

describe("빈자리 자동 계승(D-584·D-588 5 — 먼저 지배 가문, 없으면 자동 선출)", () => {
  it("해임 뒤 다시 뽑기가 실패하면 해임된 사람을 뺀 후계자가 그 가문의 가문장(= 지도자)이 되고 빈자리가 아니다", async () => {
    const { succession, audits, promoted } = fake(
      [member("u-h", "leader", 0), member("u-m", "member", 5), member("u-n", "member", 9)],
      "u-n",
    );
    const next = await succession.afterElection(
      DEMOCRACY,
      STATE,
      { barred: "p:5", barredUser: "u-h" },
      null,
      100,
      500,
    );
    expect(next).toMatchObject({ rulingHouseKey: "p:5", vacantSinceMs: null, termEndsAtMs: 600 });
    expect(promoted).toEqual(["u-n"]);
    expect(audits).toEqual(["governance.successor"]);
  });

  it("그 가문에 다른 사람이 없거나 NPC 가문이면 빈자리(자동 선출은 service.ts 틱이 연다)", async () => {
    const lone = fake([member("u-h", "leader", 0)]);
    expect(
      await lone.succession.afterElection(
        DEMOCRACY,
        STATE,
        { barred: "p:5", barredUser: "u-h" },
        null,
        100,
        500,
      ),
    ).toMatchObject({ vacantSinceMs: 100 });
    expect(lone.promoted).toEqual([]);
    const npc = fake([]);
    expect(
      await npc.succession.afterElection(
        DEMOCRACY,
        { ...STATE, rulingHouseKey: "n:3" },
        { barred: "n:3" },
        null,
        100,
        500,
      ),
    ).toMatchObject({ vacantSinceMs: 100, rulingHouseKey: "n:3" });
  });

  it("선출로 이긴 가문이 있으면 그 가문이 지배 가문(계승 없음)", async () => {
    const { succession, promoted } = fake([]);
    expect(await succession.afterElection(DEMOCRACY, STATE, {}, "p:7", 100, 500)).toMatchObject({
      rulingHouseKey: "p:7",
      electedAtMs: 100,
      vacantSinceMs: null,
    });
    expect(promoted).toEqual([]);
  });

  it("틱: 가문장이 없어진 지배 가문은 서열로 가문장을 세운다, 가문장이 있으면 그대로", async () => {
    const members = [member("u-b", "member", 20), member("u-a", "member", 10)];
    const { succession, promoted } = fake(members);
    expect(await succession.tick(DEMOCRACY, STATE, false, 100)).toMatchObject({ vacantSinceMs: null });
    expect(promoted).toEqual(["u-a"]);
    expect(await succession.tick(DEMOCRACY, STATE, false, 200)).toBe(STATE);
    expect(promoted).toEqual(["u-a"]);
  });

  it("틱: 가문에 아무도 없으면 빈자리(독재는 선출이 없어 그대로), 빈자리 선출이 열려 있으면 기다린다", async () => {
    const { succession } = fake([]);
    expect(await succession.tick(DEMOCRACY, STATE, false, 100)).toMatchObject({ vacantSinceMs: 100 });
    expect(await succession.tick({ rowId: 9, regime: "dictatorship" }, STATE, false, 100)).toBe(STATE);
    const later = fake([member("u-h", "leader", 0), member("u-m", "member", 5)]);
    const vacant = { ...STATE, vacantSinceMs: 50 };
    expect(await later.succession.tick(DEMOCRACY, vacant, true, 100)).toBe(vacant);
    // 옛 빈자리: 지금 가문장(해임된 사람으로 본다)을 빼고 잇는다
    expect(await later.succession.tick(DEMOCRACY, vacant, false, 100)).toMatchObject({ vacantSinceMs: null });
    expect(later.promoted).toEqual(["u-m"]);
  });
});
