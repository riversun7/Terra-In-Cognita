import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS as c } from "./coefficients.ts";
import { settlementGrant } from "./settlementGrant.ts";

describe("정착 지원금(D-455 190, D-163·D-218, 49 N39)", () => {
  it("NPC 세력: 기본액 × 세력 배율, 가장 덜 붐빈 세력이 가장 많이 받는다", () => {
    expect(c.cyborg.grantBase).toBe(72);
    // 가장 적게 시작한 세력(배율 최대 1500‰)
    expect(settlementGrant({ kind: "npc", started: 3 }, 3, c)).toBe(108n);
    // 가장 적은 세력보다 4명 많으면 1500 − 4 × 50 = 1300‰
    expect(settlementGrant({ kind: "npc", started: 7 }, 3, c)).toBe(93n);
    // 배율은 최소(1000‰) 아래로 내려가지 않는다
    expect(settlementGrant({ kind: "npc", started: 500 }, 3, c)).toBe(72n);
  });

  it("유저 세력: 지도자·의회가 정한 양(고리만, 없으면 0)", () => {
    expect(settlementGrant({ kind: "user", leaderAmount: 500n }, 0, c)).toBe(500n);
    expect(settlementGrant({ kind: "user", leaderAmount: null }, 0, c)).toBe(0n);
  });
});
