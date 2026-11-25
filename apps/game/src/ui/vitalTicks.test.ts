// 생명·전투 자원 절대값 눈금 계산(10 / 50 / 100 단위 및 고수치 자동 축척) 단위 시험
import { describe, expect, it } from "vitest";
import { vitalTickScale, vitalTickVars } from "./vitalTicks.ts";

describe("vitalTickScale", () => {
  it("0 이하이거나 10 이하인 수치는 내부 눈금이 없으므로 null을 돌려준다", () => {
    expect(vitalTickScale(0)).toBeNull();
    expect(vitalTickScale(-5)).toBeNull();
    expect(vitalTickScale(8)).toBeNull();
    expect(vitalTickScale(10)).toBeNull();
  });

  it("일반 막대는 250 이하에서 10 / 50 / 100 단위를 쓴다", () => {
    expect(vitalTickScale(16)).toEqual({ minor: 10, mid: 50, major: 100 });
    expect(vitalTickScale(47)).toEqual({ minor: 10, mid: 50, major: 100 });
    expect(vitalTickScale(93)).toEqual({ minor: 10, mid: 50, major: 100 });
    expect(vitalTickScale(109)).toEqual({ minor: 10, mid: 50, major: 100 });
    expect(vitalTickScale(250)).toEqual({ minor: 10, mid: 50, major: 100 });
  });

  it("최대치가 커지면 50/100/500 → 100/500/1000 → 500/1000/5000 순으로 자동 상향한다", () => {
    expect(vitalTickScale(251)).toEqual({ minor: 50, mid: 100, major: 500 });
    expect(vitalTickScale(1250)).toEqual({ minor: 50, mid: 100, major: 500 });
    expect(vitalTickScale(1251)).toEqual({ minor: 100, mid: 500, major: 1000 });
    expect(vitalTickScale(2500)).toEqual({ minor: 100, mid: 500, major: 1000 });
    expect(vitalTickScale(2501)).toEqual({ minor: 500, mid: 1000, major: 5000 });
    expect(vitalTickScale(15000)).toEqual({ minor: 1000, mid: 5000, major: 10000 });
  });

  it("좁은 전투 머리 위 막대(compact)는 120 이하에서 10/50/100을 쓰고 더 일찍 상향한다", () => {
    expect(vitalTickScale(109, true)).toEqual({ minor: 10, mid: 50, major: 100 });
    expect(vitalTickScale(120, true)).toEqual({ minor: 10, mid: 50, major: 100 });
    expect(vitalTickScale(121, true)).toEqual({ minor: 50, mid: 100, major: 500 });
    expect(vitalTickScale(601, true)).toEqual({ minor: 100, mid: 500, major: 1000 });
  });
});

describe("vitalTickVars", () => {
  it("max보다 크거나 같은 단계는 200%로 비활성화하고 내부 단계만 백분율로 계산한다", () => {
    expect(vitalTickVars(16)).toEqual({
      "--vt-minor": "62.5000%",
      "--vt-mid": "200%",
      "--vt-major": "200%",
    });
    expect(vitalTickVars(93)).toEqual({
      "--vt-minor": "10.7527%",
      "--vt-mid": "53.7634%",
      "--vt-major": "200%",
    });
    expect(vitalTickVars(100)).toEqual({
      "--vt-minor": "10.0000%",
      "--vt-mid": "50.0000%",
      "--vt-major": "200%",
    });
    expect(vitalTickVars(109)).toEqual({
      "--vt-minor": "9.1743%",
      "--vt-mid": "45.8716%",
      "--vt-major": "91.7431%",
    });
  });
});
