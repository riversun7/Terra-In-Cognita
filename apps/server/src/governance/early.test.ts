// 일찍 끝내기(early.ts — 질문 2410 가): 확정 표(NPC)만 세고, 플레이어 표·안 던진 투표권은 어느 쪽으로든 갈 수 있다고 본다
import { describe, expect, it } from "vitest";
import { electionDecided, motionDecided } from "./early.ts";

const rules = { quorumPm: 500, thresholdPm: 500 };

describe("motionDecided", () => {
  it("NPC 찬성만으로 흔들리는 무게를 다 반대에 줘도 가결이면 끝낸다", () => {
    const votes = [
      { choice: "yes", weight: 6n, fixed: true },
      { choice: "yes", weight: 1n, fixed: false },
    ];
    expect(motionDecided(votes, 10n, rules)).toBe(true);
  });
  it("플레이어 표가 뒤집을 수 있으면 끝내지 않는다", () => {
    const votes = [
      { choice: "yes", weight: 5n, fixed: true },
      { choice: "yes", weight: 2n, fixed: false },
    ];
    expect(motionDecided(votes, 10n, rules)).toBe(false);
  });
  it("정족수를 지금 던진 표로 못 채웠으면 끝내지 않는다, 부결이 정해져도 끝낸다", () => {
    expect(motionDecided([{ choice: "yes", weight: 4n, fixed: true }], 10n, rules)).toBe(false);
    expect(motionDecided([{ choice: "no", weight: 6n, fixed: true }], 10n, rules)).toBe(true);
  });
});

describe("electionDecided", () => {
  const candidates = [
    { key: "n:1" as const, registeredAtMs: 1, boardScore: 0 },
    { key: "n:2" as const, registeredAtMs: 2, boardScore: 0 },
  ];
  it("흔들리는 무게를 다른 후보에 몰아줘도 이기면 당선이 정해진다", () => {
    const votes = [
      { choice: "n:1", weight: 6n, fixed: true },
      { choice: "n:2", weight: 1n, fixed: true },
    ];
    expect(electionDecided(votes, candidates, 10n, 500, null)).toBe("n:1");
  });
  it("뒤집힐 수 있으면 null", () => {
    const votes = [
      { choice: "n:1", weight: 4n, fixed: true },
      { choice: "n:2", weight: 2n, fixed: false },
    ];
    expect(electionDecided(votes, candidates, 10n, 500, null)).toBeNull();
  });
});
