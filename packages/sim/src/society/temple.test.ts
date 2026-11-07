// 신전·종교 규칙 시험(docs/adr/2026-11-07-temple-religion.md, D-517): 비활성 구간, 의식 막는 것, 휴먼 환생, 기도·헌금 신앙도
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS as S } from "./coefficients.ts";
import { FAITH_MAX } from "./faith.ts";
import {
  OLD_TEMPLE_COEFFICIENTS as C,
  addDevotion,
  devotionGain,
  inactiveWindow,
  isInactiveAt,
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
});
