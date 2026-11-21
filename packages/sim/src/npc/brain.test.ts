import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  type FactionView,
  type RivalView,
  chooseAction,
  decideAction,
  peaceScore,
  scoreActions,
} from "./brain.ts";
import { TEST_NPC_COEFFICIENTS as c } from "./coefficients.ts";
import { inheritTraits, rollTraits, type Traits } from "./traits.ts";

const calm: Traits = { aggression: 100, commerce: 500, faith: 500, station: 500 };
const warlike: Traits = { aggression: 900, commerce: 200, faith: 200, station: 500 };

/** 알박기 후보 점수(없으면 undefined) */
const claimScoreOf = (me: FactionView, rivals: readonly RivalView[] = []): number | undefined =>
  scoreActions(me, rivals, c).find((entry) => entry.action.kind === "claim")?.score;

/** 폐허 복원 후보 점수(없으면 undefined) */
const restoreScoreOf = (me: FactionView): number | undefined =>
  scoreActions(me, [], c).find((entry) => entry.action.kind === "restore")?.score;

function view(over: Partial<FactionView> = {}): FactionView {
  return {
    id: 1,
    traits: calm,
    cities: 2,
    strength: 100,
    treasury: 100_000n,
    satisfaction: 70,
    foodPm: 1000,
    crowded: false,
    foundCost: 5000n,
    research: null,
    sellableShares: false,
    poor: false,
    overlord: null,
    vassals: 0,
    restores: [],
    claims: [],
    ...over,
  };
}

function rival(over: Partial<RivalView> = {}): RivalView {
  return {
    id: 2,
    strength: 40,
    takeable: 1,
    atWar: false,
    truce: false,
    related: false,
    rebel: false,
    ...over,
  };
}

describe("성향(D-327, 질문 192 가)", () => {
  it("축마다 범위 안 정수, 같은 시드는 같은 값", () => {
    const a = rollTraits(createRng(7), c);
    expect(rollTraits(createRng(7), c)).toEqual(a);
    for (const value of Object.values(a)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(c.traitMin);
      expect(value).toBeLessThanOrEqual(c.traitMax);
    }
  });

  it("유동 세력은 부모 값 ± 폭 안(범위에서 자름)", () => {
    const parent: Traits = { aggression: 950, commerce: 20, faith: 500, station: 500 };
    for (let seed = 0; seed < 50; seed++) {
      const child = inheritTraits(parent, createRng(seed), c);
      expect(Math.abs(child.aggression - parent.aggression)).toBeLessThanOrEqual(c.traitDrift);
      expect(child.aggression).toBeLessThanOrEqual(c.traitMax);
      expect(child.commerce).toBeGreaterThanOrEqual(c.traitMin);
      expect(Math.abs(child.faith - parent.faith)).toBeLessThanOrEqual(c.traitDrift);
    }
  });
});

describe("판단 틀(D-323): 지표 → 후보 점수 → 가장 높은 행동", () => {
  it("할 만한 것이 없으면 쉰다", () => {
    expect(decideAction(view(), [], 0, c)).toEqual({ kind: "idle" });
  });

  it("공격 성향이 높고 힘이 세면 약한 이웃을 친다(새 선포)", () => {
    const action = decideAction(view({ traits: warlike }), [rival()], 0, c);
    expect(action).toEqual({ kind: "attack", target: 2, declare: true });
  });

  it("선포 명분 몫(D-290 제재 — 서버 고리 causeBonus)은 무명분 선포 몫까지만 치기 점수를 올리고, 이미 하는 전쟁에는 쓰지 않는다", () => {
    const me = view({ traits: warlike });
    const attackOf = (r: RivalView): number =>
      scoreActions(me, [r], c).find((entry) => entry.action.kind === "attack")?.score ?? Number.NaN;
    const plain = attackOf(rival());
    expect(attackOf(rival({ causeBonus: 40 }))).toBe(plain + 40);
    expect(attackOf(rival({ causeBonus: 99_999 }))).toBe(plain + c.attackDeclarePenalty);
    expect(attackOf(rival({ causeBonus: -50 }))).toBe(plain);
    expect(attackOf(rival({ atWar: true, causeBonus: 40 }))).toBe(attackOf(rival({ atWar: true })));
  });

  it("나라 단위 판단을 멈춘 나라(선출된 플레이어 지도자·빈자리 — 질문 2440 나·2434 나)는 새 선포·강화·봉신 독립을 하지 않는다", () => {
    const locked = view({ traits: warlike, nationLocked: true });
    // 새 선포는 후보에서 빠진다
    expect(scoreActions(locked, [rival()], c).some((entry) => entry.action.kind === "attack")).toBe(false);
    // 이미 하는 전쟁의 공격은 잇는다
    expect(decideAction(locked, [rival({ atWar: true })], 0, c)).toEqual({
      kind: "attack",
      target: 2,
      declare: false,
    });
    // 강화·봉신 독립 후보 없음
    const weary = view({
      traits: calm,
      satisfaction: 10,
      nationLocked: true,
      overlord: { id: 9, strength: 1 },
    });
    const kinds = scoreActions(weary, [rival({ atWar: true, strength: 500 })], c).map(
      (entry) => entry.action.kind,
    );
    expect(kinds).not.toContain("peace");
    expect(kinds).not.toContain("break_vassal");
    const free = scoreActions({ ...weary, nationLocked: false }, [rival({ atWar: true, strength: 500 })], c);
    expect(free.map((entry) => entry.action.kind)).toContain("peace");
  });

  it("공격 성향이 낮으면 같은 상황에서 치지 않는다", () => {
    expect(decideAction(view(), [rival()], 0, c).kind).not.toBe("attack");
  });

  it("힘 비가 모자라거나 불가침·상하 관계·칠 도시가 없으면 치지 않는다", () => {
    const me = view({ traits: warlike });
    expect(decideAction(me, [rival({ strength: 90 })], 0, c).kind).toBe("idle");
    expect(decideAction(me, [rival({ truce: true })], 0, c).kind).toBe("idle");
    expect(decideAction(me, [rival({ related: true })], 0, c).kind).toBe("idle");
    expect(decideAction(me, [rival({ takeable: 0 })], 0, c).kind).toBe("idle");
  });

  it("만족도가 낮으면 치지 않는다(전쟁은 만족도를 낮춘다)", () => {
    const action = decideAction(view({ traits: warlike, satisfaction: 50 }), [rival()], 0, c);
    expect(action.kind).not.toBe("attack");
  });

  it("이미 전쟁 중인 상대가 새 상대보다 먼저다(선포가 아님)", () => {
    const action = decideAction(
      view({ traits: warlike }),
      [rival({ id: 2, strength: 30 }), rival({ id: 3, strength: 50, atWar: true })],
      0,
      c,
    );
    expect(action).toEqual({ kind: "attack", target: 3, declare: false });
  });

  it("다음 기술 단계가 연구 시설에 막혀 있으면 연구 시설을 올린다", () => {
    const action = decideAction(view({ research: { cost: 2000n, blocked: true } }), [], 0, c);
    expect(action).toEqual({ kind: "research" });
  });

  it("연구 시설 값의 예비금이 없으면 올리지 않는다", () => {
    const action = decideAction(
      view({ treasury: 3000n, research: { cost: 2000n, blocked: true } }),
      [],
      0,
      c,
    );
    expect(action.kind).toBe("idle");
  });

  it("붐비는 도시가 있고 돈이 있으면 마을을 세운다", () => {
    expect(decideAction(view({ crowded: true }), [], 0, c)).toEqual({ kind: "found" });
    expect(decideAction(view({ crowded: true, treasury: 6000n }), [], 0, c).kind).toBe("idle");
  });

  it("국고가 모자라면 상업 성향 세력은 지분을 판다", () => {
    const merchant: Traits = { aggression: 100, commerce: 900, faith: 100, station: 500 };
    const action = decideAction(view({ traits: merchant, poor: true, sellableShares: true }), [], 0, c);
    expect(action).toEqual({ kind: "sell_shares" });
  });

  it("지는 전쟁·지친 백성이면 강화를 제안한다", () => {
    const action = decideAction(
      view({ satisfaction: 45 }),
      [rival({ id: 5, strength: 150, atWar: true })],
      0,
      c,
    );
    expect(action).toEqual({ kind: "peace", target: 5 });
  });

  it("상위 세력보다 세지면 공격 성향 봉신은 독립을 선언한다", () => {
    const action = decideAction(
      view({ traits: warlike, overlord: { id: 9, strength: 80 } }),
      [rival({ id: 9, related: true, strength: 80 })],
      0,
      c,
    );
    expect(action).toEqual({ kind: "break_vassal" });
  });

  it("같은 점수는 굴림으로 고르고, 점수 목록은 결정적이다", () => {
    const scored = [
      { action: { kind: "found" } as const, score: 500 },
      { action: { kind: "research" } as const, score: 500 },
      { action: { kind: "idle" } as const, score: 100 },
    ];
    expect(chooseAction(scored, 0)).toEqual({ kind: "found" });
    expect(chooseAction(scored, 1)).toEqual({ kind: "research" });
    const me = view({ traits: warlike, crowded: true, research: { cost: 10n, blocked: false } });
    expect(scoreActions(me, [rival()], c)).toEqual(scoreActions(me, [rival()], c));
  });

  it("폐허 복원(484 다): 상업 성향·옛 내 도시·도시가 적을수록 정부 짓기 점수가 오르고, 예비금이 없으면 짓지 않는다", () => {
    const merchant: Traits = { aggression: 100, commerce: 900, faith: 300, station: 500 };
    const claim = { ruin: 7, cost: 2000n, former: true } as const;
    // 상인 + 옛 내 도시 + 도시 둘 → 400 + 225 + 150 − 80 = 695 > 쉬기 250
    expect(decideAction(view({ traits: merchant, restores: [claim] }), [], 0, c)).toEqual({
      kind: "restore",
      ruin: 7,
    });
    const base = restoreScoreOf(view({ traits: merchant, restores: [claim] })) ?? 0;
    expect(base).toBe(c.restoreClaimScore + 225 + c.restoreFormerBonus - 2 * c.restoreCityPenalty);
    expect(restoreScoreOf(view({ traits: calm, restores: [claim] }))).toBeLessThan(base);
    expect(restoreScoreOf(view({ traits: merchant, restores: [{ ...claim, former: false }] }))).toBe(
      base - c.restoreFormerBonus,
    );
    expect(restoreScoreOf(view({ traits: merchant, cities: 6, restores: [claim] }))).toBe(
      base - 4 * c.restoreCityPenalty,
    );
    // 예비금(값 × 2)이 없으면 정부 짓기는 후보가 아니다
    expect(restoreScoreOf(view({ traits: merchant, treasury: 3000n, restores: [claim] }))).toBeUndefined();
    // 후보가 여럿이면 가장 높은 하나(옛 내 폐허)
    expect(
      decideAction(
        view({ traits: merchant, restores: [{ ...claim, ruin: 3, former: false }, claim] }),
        [],
        0,
        c,
      ),
    ).toEqual({ kind: "restore", ruin: 7 });
  });

  it("알박기(빈틈 2243): 상업 성향 +, 공격 성향·가진 도시·바깥 전쟁 −, 붐빔 +, 남이 짓는 중 −, 예비금·생필품이 없으면 후보 아님", () => {
    const merchant: Traits = { aggression: 100, commerce: 900, faith: 300, station: 500 };
    const site = { site: 4105, cost: 2000n, contested: false } as const;
    // 상인 + 도시 둘 → 350 + 135 − 15 − 80 = 390 > 쉬기 250
    expect(decideAction(view({ traits: merchant, claims: [site] }), [], 0, c)).toEqual({
      kind: "claim",
      site: 4105,
    });
    const base = claimScoreOf(view({ traits: merchant, claims: [site] })) ?? 0;
    expect(base).toBe(c.claimScore + 135 - 15 - 2 * c.claimCityPenalty);
    // 공격 성향이 높으면 내려간다(싸우려는 나라는 땅보다 전쟁)
    expect(claimScoreOf(view({ traits: warlike, claims: [site] }))).toBeLessThan(base);
    expect(claimScoreOf(view({ traits: merchant, cities: 5, claims: [site] }))).toBe(
      base - 3 * c.claimCityPenalty,
    );
    expect(claimScoreOf(view({ traits: merchant, crowded: true, claims: [site] }))).toBe(
      base + c.claimCrowdedBonus,
    );
    expect(claimScoreOf(view({ traits: merchant, claims: [{ ...site, contested: true }] }))).toBe(
      base - c.claimContestPenalty,
    );
    // 바깥 전쟁마다 빼고, 반란 소탕은 세지 않는다
    expect(claimScoreOf(view({ traits: merchant, claims: [site] }), [rival({ atWar: true })])).toBe(
      base - c.claimWarPenalty,
    );
    expect(
      claimScoreOf(view({ traits: merchant, claims: [site] }), [rival({ atWar: true, rebel: true })]),
    ).toBe(base);
    expect(claimScoreOf(view({ traits: merchant, treasury: 3000n, claims: [site] }))).toBeUndefined();
    expect(claimScoreOf(view({ traits: merchant, foodPm: 400, claims: [site] }))).toBeUndefined();
    // 후보가 없으면 그대로(옛 판과 같은 후보 목록)
    expect(scoreActions(view({ traits: merchant }), [], c).some((e) => e.action.kind === "claim")).toBe(
      false,
    );
  });

  it("강화 수락: 이기고 있는 공격 성향 세력은 받지 않고, 지는 쪽·순한 쪽은 받는다", () => {
    const proposer = rival({ id: 2, strength: 40, atWar: true });
    expect(peaceScore(view({ traits: warlike, strength: 100 }), proposer, c)).toBeLessThanOrEqual(0);
    expect(peaceScore(view({ traits: calm, strength: 100 }), proposer, c)).toBeGreaterThan(0);
    expect(peaceScore(view({ traits: warlike, strength: 20 }), rival({ strength: 40 }), c)).toBeGreaterThan(
      0,
    );
  });
});
