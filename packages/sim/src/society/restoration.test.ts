import { describe, expect, it } from "vitest";
import { acceptedContribution, npcFundAmount, npcInvestAmount, restorationShares } from "./restoration.ts";

describe("폐허 복원 규칙(D-339·D-343·D-344·D-510)", () => {
  it("넣는 값은 남은 몫까지만 받는다", () => {
    expect(acceptedContribution(10_000n, 0n, 3000n)).toBe(3000n);
    expect(acceptedContribution(10_000n, 9000n, 3000n)).toBe(1000n);
    expect(acceptedContribution(10_000n, 10_000n, 1n)).toBe(0n);
    expect(acceptedContribution(10_000n, 0n, 0n)).toBe(0n);
    expect(acceptedContribution(10_000n, 0n, -5n)).toBe(0n);
  });

  it("지분 = 낸 값 비례(가장 큰 나머지), 합은 언제나 1000주", () => {
    const shares = restorationShares(
      [
        { owner: 7, amount: 1n },
        { owner: 3, amount: 1n },
        { owner: 5, amount: 1n },
      ],
      1000n,
      "democracy",
      3,
    );
    expect(shares).toEqual([
      { owner: 3, amount: 334n },
      { owner: 5, amount: 333n },
      { owner: 7, amount: 333n },
    ]);
    expect(shares.reduce((sum, h) => sum + h.amount, 0n)).toBe(1000n);
  });

  it("독재: 지배 주체가 과반이 아니면 501주 + 나머지 499주를 다른 주체 비례로, 과반이면 그대로", () => {
    const small = restorationShares(
      [
        { owner: 1, amount: 2000n },
        { owner: 9, amount: 6000n },
        { owner: 4, amount: 2000n },
      ],
      1000n,
      "dictatorship",
      1,
    );
    expect(small).toEqual([
      { owner: 1, amount: 501n },
      { owner: 4, amount: 125n },
      { owner: 9, amount: 374n },
    ]);
    const big = restorationShares(
      [
        { owner: 1, amount: 8000n },
        { owner: 2, amount: 2000n },
      ],
      1000n,
      "dictatorship",
      1,
    );
    expect(big).toEqual([
      { owner: 1, amount: 800n },
      { owner: 2, amount: 200n },
    ]);
    // 지배 주체가 내지 않았어도 과반(D-344)
    expect(restorationShares([{ owner: 2, amount: 10n }], 1000n, "dictatorship", 1)).toEqual([
      { owner: 1, amount: 501n },
      { owner: 2, amount: 499n },
    ]);
    // 낸 사람이 없으면 모두 지배 주체에게
    expect(restorationShares([], 1000n, "capitalism", 6)).toEqual([{ owner: 6, amount: 1000n }]);
  });

  it("NPC 몫: 주인 = 국고 × ‰, 다른 NPC = 국고 × ‰ × 상업 ÷ 1000, 남은 몫까지", () => {
    expect(npcFundAmount(50_000n, 10_000n, 0n, 100)).toBe(5000n);
    expect(npcFundAmount(50_000n, 10_000n, 8000n, 100)).toBe(2000n);
    expect(npcInvestAmount(100_000n, 10_000n, 0n, 20, 500)).toBe(1000n);
    expect(npcInvestAmount(100_000n, 10_000n, 0n, 20, 0)).toBe(0n);
    expect(npcInvestAmount(0n, 10_000n, 0n, 20, 900)).toBe(0n);
  });
});
