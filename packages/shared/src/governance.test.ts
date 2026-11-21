import { describe, expect, it } from "vitest";
import { type ElectionCandidate, isHouseKey, quorumMet, tallyElection, tallyMotion } from "./governance.ts";

const v = (choice: string, weight: number | bigint = 1) => ({ choice, weight: BigInt(weight) });

describe("tallyMotion", () => {
  const rules = { quorumPm: 300, thresholdPm: 500 };
  it("과반 찬성이면 가결, 같으면 동점 부결", () => {
    expect(tallyMotion([v("yes"), v("yes"), v("no")], 5n, rules)).toMatchObject({
      passed: true,
      reason: null,
    });
    expect(tallyMotion([v("yes"), v("no")], 5n, rules)).toMatchObject({ passed: false, reason: "tie" });
  });
  it("기권을 고른 표는 정족수에 들고 찬반에는 들지 않는다", () => {
    // 10표 가운데 3표가 던짐(찬성 1·기권 2) → 정족수 30% 채움, 찬성 1 > 반대 0
    const result = tallyMotion([v("yes"), v("abstain"), v("abstain")], 10n, rules);
    expect(result).toMatchObject({ passed: true, cast: 3n, abstain: 2n });
  });
  it("던지지 않은 표는 정족수에 들지 않는다", () => {
    expect(tallyMotion([v("yes"), v("yes")], 10n, rules)).toMatchObject({ passed: false, reason: "quorum" });
    expect(quorumMet(0n, 0n, 0)).toBe(false);
  });
  it("2/3 문턱(666‰)", () => {
    const two = { quorumPm: 0, thresholdPm: 666 };
    expect(tallyMotion([v("yes", 2), v("no", 1)], 3n, two).passed).toBe(true);
    expect(tallyMotion([v("yes", 666), v("no", 334)], 1000n, two).passed).toBe(false);
  });
  it("무게(지분)를 더한다", () => {
    const result = tallyMotion([v("yes", 600n), v("no", 400n)], 1000n, rules);
    expect(result).toMatchObject({ passed: true, yes: 600n, no: 400n });
  });
});

const cand = (key: "p:1" | "p:2" | "n:3", registeredAtMs: number, boardScore = 0): ElectionCandidate => ({
  key,
  registeredAtMs,
  boardScore,
});

describe("tallyElection", () => {
  const candidates = [cand("p:1", 10), cand("p:2", 20), cand("n:3", 5)];
  it("단순 다수", () => {
    const result = tallyElection([v("p:1"), v("p:2"), v("p:2")], candidates, 5n, 300, "n:3");
    expect(result.winner).toBe("p:2");
  });
  it("동점: 현직 → 가문 판 점수 → 먼저 등록", () => {
    expect(tallyElection([v("p:1"), v("n:3")], candidates, 4n, 0, "n:3").winner).toBe("n:3");
    const scored = [cand("p:1", 10, 5), cand("p:2", 20, 9)];
    expect(tallyElection([v("p:1"), v("p:2")], scored, 4n, 0, null).winner).toBe("p:2");
    const flat = [cand("p:1", 10), cand("p:2", 20)];
    expect(tallyElection([v("p:1"), v("p:2")], flat, 4n, 0, null).winner).toBe("p:1");
  });
  it("정족수 미달·후보 없음이면 현직 그대로(null)", () => {
    expect(tallyElection([v("p:1")], candidates, 10n, 300, "n:3")).toMatchObject({
      winner: null,
      reason: "quorum",
    });
    expect(tallyElection([v("p:1")], [], 1n, 0, null)).toMatchObject({
      winner: null,
      reason: "no_candidates",
    });
  });
  it("후보가 아닌 표는 기권으로 센다", () => {
    const result = tallyElection([v("p:9"), v("p:1")], candidates, 2n, 1000, null);
    expect(result).toMatchObject({ winner: "p:1", abstain: 1n, cast: 2n });
  });
  it("가문 열쇠 꼴", () => {
    expect(isHouseKey("p:12")).toBe(true);
    expect(isHouseKey("n:0")).toBe(false);
    expect(isHouseKey("o:3")).toBe(false);
  });
});
