// 신전·종교 규칙 시험(docs/adr/2026-11-07-temple-religion.md, D-517·기획 답 456): 비활성 구간, 의식 막는 것, 휴먼 환생, 기도·헌금 신앙도,
// 수호신 방어 버프
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS as S } from "./coefficients.ts";
import { FAITH_MAX } from "./faith.ts";
import {
  GUARDIAN_BUFFS,
  OLD_TEMPLE_COEFFICIENTS as C,
  HUMAN_BASE_K_PM,
  addDevotion,
  applyRebirthAdvantage,
  devotionGain,
  guardianBuffValue,
  guardianDefensePm,
  inactiveWindow,
  isGuardianBuff,
  isInactiveAt,
  rebirthAdvantage,
  rebirthHuman,
  riteBlockers,
  riteCost,
} from "./temple.ts";

describe("신전·종교", () => {
  it("비활성 = 수명 끝부터. 상한이 없으면(출발값) 떠나지 않고, 상한이 있으면 수명 끝 + 상한까지", () => {
    const w = inactiveWindow(1_000, 5_000, C);
    expect(w).toEqual({ sinceMs: 6_000, departsAtMs: null });
    expect(isInactiveAt(w, 5_999)).toBe(false);
    expect(isInactiveAt(w, 6_000)).toBe(true);
    expect(isInactiveAt(w, Number.MAX_SAFE_INTEGER)).toBe(true);
    const capped = inactiveWindow(1_000, 5_000, { ...C, inactiveCapMs: 100 });
    expect(capped).toEqual({ sinceMs: 6_000, departsAtMs: 6_100 });
    expect(isInactiveAt(capped, 6_099)).toBe(true);
    expect(isInactiveAt(capped, 6_100)).toBe(false);
  });

  it("의식을 막는 것: 비활성·신앙도 문턱·화폐·(신격화) 도시당 수호신 상한", () => {
    const window = inactiveWindow(0, 100, C);
    const ok = { nowMs: 100, window, guardians: 0 };
    const rebirth = riteCost("rebirth", C);
    expect(
      riteBlockers({ ...ok, rite: "rebirth", faith: rebirth.faith, currency: rebirth.currency }, C),
    ).toEqual([]);
    expect(riteBlockers({ ...ok, rite: "rebirth", nowMs: 99, faith: 0, currency: 0n }, C)).toEqual([
      "not_inactive",
      "faith",
      "currency",
    ]);
    const deify = riteCost("deify", C);
    expect(
      riteBlockers(
        { ...ok, rite: "deify", faith: deify.faith, currency: deify.currency, guardians: C.guardianCap },
        C,
      ),
    ).toEqual(["guardian_cap"]);
    expect(
      riteBlockers(
        { ...ok, rite: "rebirth", faith: rebirth.faith, currency: rebirth.currency, guardians: 99 },
        C,
      ),
    ).toEqual([]);
  });

  it("휴먼 환생: 레벨 1·태어난 시각 = 지금·수명 T4 굴림·환생 +1·신앙도 0, 다른 칸은 그대로", () => {
    const human = {
      level: 7,
      rebirths: 2,
      bornAtMs: 0,
      lifespanMs: 10,
      faith: 80,
      stats: [1, 2, 3, 4, 5, 6],
    };
    const reborn = rebirthHuman(human, 500, 0, S);
    expect(reborn).toEqual({
      ...human,
      level: 1,
      rebirths: 3,
      bornAtMs: 500,
      lifespanMs: S.lifespanMinMs,
      faith: 0,
    });
    expect(rebirthHuman(human, 500, 9_999, S).lifespanMs).toBeLessThanOrEqual(S.lifespanMaxMs);
  });

  it("기도·헌금: 기도 = prayFaith, 헌금 = max(1, ⌊금액 ÷ 50⌋), 신앙도는 100에서 멈추고 포인트는 쌓인다", () => {
    expect(devotionGain("pray", 0n, C)).toBe(1);
    expect(devotionGain("offer", 1n, C)).toBe(1);
    expect(devotionGain("offer", 149n, C)).toBe(2);
    expect(devotionGain("offer", 10n ** 30n, C)).toBe(2_147_483_647);
    expect(addDevotion(95, 10, 20)).toEqual({ faith: FAITH_MAX, faithPoints: 30 });
    expect(addDevotion(0, 0, 0)).toEqual({ faith: 0, faithPoints: 0 });
  });

  it("수호신 방어 버프(기획 답 456 가): 방어 버프 수호신마다 guardianDefensePm을 더하고 다른 버프·음수 칸은 0", () => {
    expect(GUARDIAN_BUFFS).toEqual(["defense", "satisfaction", "production"]);
    expect(isGuardianBuff("defense")).toBe(true);
    expect(isGuardianBuff("attack")).toBe(false);
    expect(guardianDefensePm([], C)).toBe(0);
    expect(guardianDefensePm(["defense", "production", "defense"], C)).toBe(2 * C.guardianDefensePm);
    expect(guardianDefensePm(["satisfaction"], C)).toBe(0);
    expect(guardianDefensePm(["defense"], { ...C, guardianDefensePm: -5 })).toBe(0);
  });

  it("수호신 만족도·생산 버프(기획 답 470 가): 그 종류 수호신마다 한 명 몫을 더한다", () => {
    const buffs = ["satisfaction", "production", "satisfaction", "defense"] as const;
    expect(guardianBuffValue(buffs, "satisfaction", C)).toBe(2 * C.guardianSatisfactionMilli);
    expect(guardianBuffValue(buffs, "production", C)).toBe(C.guardianProductionPm);
    expect(guardianBuffValue(buffs, "defense", C)).toBe(guardianDefensePm(buffs, C));
    expect(guardianBuffValue(["production"], "production", { ...C, guardianProductionPm: -1 })).toBe(0);
  });
});

describe("휴먼 환생 어드밴티지(D-520)", () => {
  const T = {
    ...C,
    rebirthStatChanceBp: 3000,
    rebirthKChanceBp: 2000,
    rebirthStatAmount: 2,
    rebirthKAmountPm: 50,
  };

  it("굴림: 0~2999 초기 스탯, 3000~4999 K, 나머지 없음. 어느 스탯인지는 둘째 굴림 % 6", () => {
    expect(rebirthAdvantage(0, 3, T)).toEqual({ kind: "stat", stat: 3, amount: 2 });
    expect(rebirthAdvantage(2999, 7, T)).toEqual({ kind: "stat", stat: 1, amount: 2 });
    expect(rebirthAdvantage(3000, 0, T)).toEqual({ kind: "k", stat: 0, amount: 50 });
    expect(rebirthAdvantage(4999, 5, T)).toEqual({ kind: "k", stat: 5, amount: 50 });
    expect(rebirthAdvantage(5000, 0, T)).toEqual({ kind: "none" });
    expect(rebirthAdvantage(19_999, 0, T)).toEqual({ kind: "none" });
    // 확률 합이 10,000을 넘으면 스탯 몫이 먼저, K는 남은 만큼. 증가량이 0이면 없음
    expect(rebirthAdvantage(9999, 0, { ...T, rebirthStatChanceBp: 9000, rebirthKChanceBp: 5000 }).kind).toBe(
      "k",
    );
    expect(rebirthAdvantage(0, 0, { ...T, rebirthStatAmount: 0 })).toEqual({ kind: "none" });
  });

  it("적용: 스탯 하나 + 값, K가 없던 휴먼은 바탕 K 여섯 칸에서 시작", () => {
    const stats = [10, 11, 12, 13, 14, 15];
    expect(applyRebirthAdvantage(stats, null, { kind: "stat", stat: 2, amount: 2 })).toEqual({
      stats: [10, 11, 14, 13, 14, 15],
      kPm: null,
    });
    const k = applyRebirthAdvantage(stats, null, { kind: "k", stat: 4, amount: 50 });
    expect(k.stats).toEqual(stats);
    expect(k.kPm).toEqual(
      [1000, 1000, 1000, 1000, 1050, 1000].map((v) => (v === 1000 ? HUMAN_BASE_K_PM : v)),
    );
    expect(
      applyRebirthAdvantage(stats, [900, 900, 900, 900, 900, 900], { kind: "k", stat: 0, amount: 50 }).kPm,
    ).toEqual([950, 900, 900, 900, 900, 900]);
    expect(applyRebirthAdvantage(stats, null, { kind: "none" })).toEqual({ stats, kPm: null });
  });
});
