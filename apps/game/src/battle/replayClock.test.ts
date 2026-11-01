import { describe, expect, it } from "vitest";
import { ReplayClock, clockText } from "./replayClock.ts";

describe("다시보기 시계", () => {
  it("재생 중에만 배속만큼 밀고, 끝에 닿으면 멈춘다", () => {
    const clock = new ReplayClock(1000);
    expect(clock.tick(0)).toBe(false);
    clock.play();
    clock.tick(0);
    clock.tick(100);
    expect(clock.timeMs).toBe(100);
    clock.setSpeed(4);
    clock.tick(200);
    expect(clock.timeMs).toBe(500);
    expect(clock.tick(400)).toBe(false);
    expect(clock.timeMs).toBe(1000);
    expect(clock.playing).toBe(false);
  });

  it("한 프레임 간격을 잘라 숨긴 탭에서 돌아와도 크게 뛰지 않는다", () => {
    const clock = new ReplayClock(100_000);
    clock.play();
    clock.tick(0);
    clock.tick(60_000);
    expect(clock.timeMs).toBe(250);
  });

  it("멈춤·찾기·처음부터·끝에서 재생은 처음부터", () => {
    const clock = new ReplayClock(1000);
    clock.seek(700);
    clock.play();
    clock.tick(0);
    clock.pause();
    clock.tick(5000);
    expect(clock.timeMs).toBe(700);
    clock.seek(5000);
    expect(clock.timeMs).toBe(1000);
    clock.play();
    expect(clock.timeMs).toBe(0);
    clock.seek(300);
    clock.restart();
    expect(clock).toMatchObject({ timeMs: 0, playing: true });
  });

  it("시각 글자는 m:ss", () => {
    expect(clockText(0)).toBe("0:00");
    expect(clockText(65_400)).toBe("1:05");
    expect(clockText(600_000)).toBe("10:00");
  });
});
