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

  it("그 가문에 다른 사람이 없거나 NPC 런타임 몫이 없으면 빈자리(자동 선출은 service.ts 틱이 연다)", async () => {
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

/** NPC 가문 3(가문원 유닛 11·12·13 — 서열은 작은 ID 차례로 둔 가짜) */
function npcFake(alive: number[] = [11, 12, 13]) {
  const saved: StateRow[] = [];
  const applied: number[] = [];
  let head: number | undefined = 900;
  const succession = createSuccession({
    store: {
      houseMembersOf: async () => [],
      heirOf: async () => undefined,
      saveState: async (state) => {
        saved.push(state);
      },
    },
    audit: async () => {},
    npc: {
      head: () => head,
      successor: (_house, excluded) => alive.find((unit) => !excluded.has(unit)),
      apply: (_nation, _house, unit) => {
        applied.push(unit);
        head = unit;
      },
    },
  });
  return { succession, saved, applied, setHead: (unit: number | undefined) => (head = unit) };
}

describe("NPC 지배 가문 계승(gov-fix-2 — 질문 2532 (3), D-588 5 NPC 예외 없음)", () => {
  const NPC_STATE: StateRow = { ...STATE, rulingHouseKey: "n:3" };

  it("해임 뒤 다시 뽑기가 실패하면 해임된 가문장 유닛을 뺀 다음 가문원이 잇고 빈자리가 아니다", async () => {
    const { succession, applied } = npcFake();
    const next = await succession.afterElection(
      DEMOCRACY,
      NPC_STATE,
      { barred: "n:3", barredUnit: 11 },
      null,
      100,
      500,
    );
    expect(next).toMatchObject({ rulingHouseKey: "n:3", vacantSinceMs: null, npcHeadUnit: 12 });
    expect(applied).toEqual([12]);
  });

  it("이을 가문원이 없을 때만 빈자리(자동 선출)", async () => {
    const { succession } = npcFake([]);
    expect(
      await succession.afterElection(
        DEMOCRACY,
        NPC_STATE,
        { barred: "n:3", barredUnit: 900 },
        null,
        100,
        500,
      ),
    ).toMatchObject({ vacantSinceMs: 100, rulingHouseKey: "n:3" });
  });

  it("틱: 옛 빈자리는 가문원 서열로 잇고, 계승한 가문장이 사라지면 다음 사람을 세운다", async () => {
    const vacant = npcFake();
    expect(
      await vacant.succession.tick(DEMOCRACY, { ...NPC_STATE, vacantSinceMs: 50 }, false, 100),
    ).toMatchObject({ vacantSinceMs: null, npcHeadUnit: 11 });
    const gone = npcFake([12, 13]);
    gone.setHead(12);
    // 기록된 가문장 11이 사라졌다(런타임 가문장이 다른 사람) → 11을 빼고 다음 사람
    expect(
      await gone.succession.tick(DEMOCRACY, { ...NPC_STATE, npcHeadUnit: 11 }, false, 100),
    ).toMatchObject({
      npcHeadUnit: 12,
    });
    // 기록 = 런타임 가문장이면 그대로, 기록이 없으면(국가 지도자) 그대로
    const same = { ...NPC_STATE, npcHeadUnit: 12 };
    expect(await gone.succession.tick(DEMOCRACY, same, false, 200)).toBe(same);
    expect(await gone.succession.tick(DEMOCRACY, NPC_STATE, false, 200)).toBe(NPC_STATE);
  });

  it("선출은 계승 기록을 지우지 않는다(gov-fix-3 — 2574: 해임된 국가 지도자 유닛이 다시 가문장이 되지 않게)", async () => {
    const { succession, applied } = npcFake();
    // 같은 가문이 다시 뽑혀도, 다른 가문이 뽑혀도 기록 그대로(다른 NPC 가문은 서열 첫 사람이 이끈다 — 런타임 headOf·다음 틱)
    expect(
      await succession.afterElection(DEMOCRACY, { ...NPC_STATE, npcHeadUnit: 12 }, {}, "n:3", 100, 500),
    ).toMatchObject({ rulingHouseKey: "n:3", npcHeadUnit: 12 });
    expect(
      await succession.afterElection(DEMOCRACY, { ...NPC_STATE, npcHeadUnit: 12 }, {}, "n:4", 100, 500),
    ).toMatchObject({ rulingHouseKey: "n:4", npcHeadUnit: 12 });
    expect(applied).toEqual([]);
  });

  it("해임 뒤 다시 뽑기에서 다른 NPC 가문이 이기면 해임된 가문장 유닛을 빼고 그 가문 서열 첫 사람을 세운다(gov-fix-3)", async () => {
    const { succession, applied } = npcFake([900, 21, 22]);
    expect(
      await succession.afterElection(
        DEMOCRACY,
        NPC_STATE,
        { barred: "n:3", barredUnit: 900 },
        "n:4",
        100,
        500,
      ),
    ).toMatchObject({ rulingHouseKey: "n:4", npcHeadUnit: 21, vacantSinceMs: null });
    expect(applied).toEqual([21]);
    // 플레이어 가문이 이기면 세우지 않는다(NPC 가문장 칸은 NPC 가문에만)
    const player = npcFake([900, 21]);
    const won = await player.succession.afterElection(
      DEMOCRACY,
      NPC_STATE,
      { barred: "n:3", barredUnit: 900 },
      "p:7",
      100,
      500,
    );
    expect(won.rulingHouseKey).toBe("p:7");
    expect(won.npcHeadUnit ?? null).toBeNull();
    expect(player.applied).toEqual([]);
  });
});
