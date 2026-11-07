// 지도에서 짓기 자리 고르기 연결점 시험 — 고르는 중에만 칸을 받고(내림), 칸 밖은 받지 않고, 폼이 읽은 뒤 지운다
import { afterEach, describe, expect, it } from "vitest";
import {
  clearBuildPick,
  offerBuildPick,
  peekBuildPick,
  pendingBuildPick,
  requestBuildPick,
} from "./buildPick.ts";

afterEach(() => clearBuildPick());

describe("짓기 자리 고르기(경제 폼 ↔ 2차맵)", () => {
  it("고르는 중이 아니면 2차맵 누르기는 원래대로(false)", () => {
    expect(offerBuildPick(7, { x: 10, y: 10 })).toBe(false);
    expect(peekBuildPick()).toBeNull();
  });

  it("고르는 중이면 누른 칸(배치 칸, 내림)을 돌려주고 고르기를 끝낸다", () => {
    requestBuildPick({ facility: "lumber_camp" });
    expect(pendingBuildPick()).toEqual({ facility: "lumber_camp" });
    expect(offerBuildPick(7, { x: 40.9, y: 12.2 })).toBe(true);
    expect(pendingBuildPick()).toBeNull();
    expect(peekBuildPick()).toEqual({ facility: "lumber_camp", mapKey: 7, x: 40, y: 12 });
    clearBuildPick();
    expect(peekBuildPick()).toBeNull();
  });

  it("칸 밖(0~255 밖)은 받지 않고 계속 고른다", () => {
    requestBuildPick({ facility: "farm" });
    expect(offerBuildPick(7, { x: -0.5, y: 3 })).toBe(false);
    expect(offerBuildPick(7, { x: 256, y: 3 })).toBe(false);
    expect(pendingBuildPick()).toEqual({ facility: "farm" });
  });
});
