import { describe, expect, it } from "vitest";
import { FAITH_MAX, convertReligion, gainFaith, resetFaithForRebirth, spendFaithPoints } from "./faith.ts";

/** 휴먼·사이보그 모두 같은 칸(D-451): 종교 코드, 신앙도(누적), 신앙 포인트(잔고) */
const believer = {
  religion: "sun_faith",
  faith: 30,
  faithPoints: 12,
  religionSkills: ["sun_blessing"],
  name: "Mina",
};

describe("신앙도·신앙 포인트(D-451)", () => {
  it("종교 활동은 둘을 함께 쌓는다. 신앙도는 범위(0~100, REL-1)에서 멈춘다", () => {
    expect(FAITH_MAX).toBe(100);
    expect(gainFaith(believer, 15, 4)).toEqual({ ...believer, faith: 45, faithPoints: 16 });
    expect(gainFaith(believer, 500, 1).faith).toBe(100);
  });

  it("종교가 없으면 쌓이지 않는다", () => {
    const none = { religion: null, faith: 0, faithPoints: 0, religionSkills: [] };
    expect(gainFaith(none, 10, 10)).toEqual(none);
  });

  it("음수·정수가 아닌 양은 받지 않는다", () => {
    expect(() => gainFaith(believer, -1, 0)).toThrow(RangeError);
    expect(() => gainFaith(believer, 0, 1.5)).toThrow(RangeError);
  });

  it("신앙 포인트는 쓰면 줄고(모자라면 못 씀), 신앙도는 쓰지 않는다", () => {
    expect(spendFaithPoints(believer, 12)).toEqual({ ...believer, faithPoints: 0 });
    expect(spendFaithPoints(believer, 13)).toBeNull();
    expect(spendFaithPoints(believer, 5)?.faith).toBe(30);
  });

  it("환생하면 신앙도만 0(문턱, 쓰지 않음). 신앙 포인트·종교·종교 특수 스킬은 남는다", () => {
    expect(resetFaithForRebirth(believer)).toEqual({ ...believer, faith: 0 });
  });

  it("개종하면 옛 종교의 신앙도·신앙 포인트·종교 특수 스킬이 모두 사라진다(D-451·D-455 187). 같은 종교로는 바뀌지 않는다", () => {
    expect(convertReligion(believer, "moon_faith")).toEqual({
      ...believer,
      religion: "moon_faith",
      faith: 0,
      faithPoints: 0,
      religionSkills: [],
    });
    expect(convertReligion(believer, null)).toEqual({
      ...believer,
      religion: null,
      faith: 0,
      faithPoints: 0,
      religionSkills: [],
    });
    expect(convertReligion(believer, "sun_faith")).toBe(believer);
  });
});
