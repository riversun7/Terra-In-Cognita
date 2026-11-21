// 지도자 신임도 고리 시험(줄기 governance-5 — 사용자 답 D-585, approval.ts): 폭 0이면 보정 없음, 신임도가 낮을수록 해임·반란이 쉽다
import { describe, expect, it } from "vitest";
import {
  rebellionShift,
  rebellionShiftOf,
  removalThresholdWithApproval,
  setRebellionShifts,
} from "./approval.ts";

describe("지도자 신임도 고리(D-585)", () => {
  it("해임 문턱: 폭 0·신임도 모름이면 그대로, 낮을수록 낮아지고 1 아래로는 내리지 않는다", () => {
    expect(removalThresholdWithApproval(666, 300, 0)).toBe(666);
    expect(removalThresholdWithApproval(666, undefined, 200)).toBe(666);
    expect(removalThresholdWithApproval(666, 300, 200)).toBe(666 - 140);
    expect(removalThresholdWithApproval(666, 1000, 200)).toBe(666);
    expect(removalThresholdWithApproval(100, 0, 1000)).toBe(1);
  });

  it("반란 문턱 보정: 폭 0이면 0, 거울 세계마다 표", () => {
    expect(rebellionShiftOf(300, 0)).toBe(0);
    expect(rebellionShiftOf(300, 20)).toBe(14);
    expect(rebellionShiftOf(1200, 20)).toBe(0);
    const world = {};
    expect(rebellionShift(world, 5)).toBe(0);
    setRebellionShifts(world, new Map([[5, 14]]));
    expect(rebellionShift(world, 5)).toBe(14);
    expect(rebellionShift(undefined, 5)).toBe(0);
  });
});
