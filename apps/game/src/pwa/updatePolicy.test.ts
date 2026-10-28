import { describe, expect, it } from "vitest";
import {
  INITIAL_VISIBILITY,
  UPDATE_TIMING,
  canAutoReload,
  decideReadyAction,
  onHidden,
  onVisible,
  parseStoredTime,
} from "./updatePolicy.ts";

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

describe("새 버전이 준비됐을 때", () => {
  it("켠 뒤 15초 안, 입력 전이면 바로 적용한다 (경계 포함)", () => {
    const launch = { startedAt: T0, inputSeen: false };
    expect(decideReadyAction(launch, T0)).toBe("apply");
    expect(decideReadyAction(launch, T0 + UPDATE_TIMING.launchWindowMs)).toBe("apply");
  });

  it("15초가 지나면 배너로 안내한다", () => {
    const launch = { startedAt: T0, inputSeen: false };
    expect(decideReadyAction(launch, T0 + UPDATE_TIMING.launchWindowMs + 1)).toBe("prompt");
  });

  it("첫 입력 뒤에는 15초 안이어도 배너로 안내한다", () => {
    expect(decideReadyAction({ startedAt: T0, inputSeen: true }, T0 + 1_000)).toBe("prompt");
  });

  it("시계가 켠 시각보다 뒤로 가 있으면 바로 적용하지 않는다", () => {
    expect(decideReadyAction({ startedAt: T0, inputSeen: false }, T0 - 1)).toBe("prompt");
  });
});

describe("자동 새로고침 반복 막기", () => {
  it("처음이거나 60초가 지났으면 허용", () => {
    expect(canAutoReload(null, T0)).toBe(true);
    expect(canAutoReload(T0, T0 + UPDATE_TIMING.autoReloadGuardMs)).toBe(true);
  });

  it("60초 안에 다시 하려면 막는다", () => {
    expect(canAutoReload(T0, T0 + UPDATE_TIMING.autoReloadGuardMs - 1)).toBe(false);
    expect(canAutoReload(T0, T0)).toBe(false);
  });

  it("시계가 크게 뒤로 갔으면 허용한다 (영원히 막히지 않게)", () => {
    expect(canAutoReload(T0, T0 - 10 * MINUTE)).toBe(true);
  });

  it("저장된 시각 읽기: 숫자만 받는다", () => {
    expect(parseStoredTime(String(T0))).toBe(T0);
    expect(parseStoredTime(null)).toBeNull();
    expect(parseStoredTime("")).toBeNull();
    expect(parseStoredTime("abc")).toBeNull();
    expect(parseStoredTime("-5")).toBeNull();
    expect(parseStoredTime("Infinity")).toBeNull();
  });
});

describe("화면이 다시 보일 때", () => {
  it("30분 넘게 숨겨졌다 돌아오면 다시 켠 것으로 보고 확인한다", () => {
    const hidden = onHidden(INITIAL_VISIBILITY, T0);
    const outcome = onVisible(hidden, T0 + UPDATE_TIMING.resumeAfterHiddenMs);
    expect(outcome.resumed).toBe(true);
    expect(outcome.check).toBe(true);
    expect(outcome.next).toEqual({ hiddenAt: null, lastCheckAt: T0 + UPDATE_TIMING.resumeAfterHiddenMs });
  });

  it("30분이 안 됐으면 다시 켠 것이 아니다", () => {
    const hidden = onHidden(INITIAL_VISIBILITY, T0);
    expect(onVisible(hidden, T0 + UPDATE_TIMING.resumeAfterHiddenMs - 1).resumed).toBe(false);
  });

  it("숨김이 여러 번 와도 처음 숨겨진 시각을 쓴다", () => {
    const hidden = onHidden(onHidden(INITIAL_VISIBILITY, T0), T0 + 20 * MINUTE);
    expect(onVisible(hidden, T0 + 30 * MINUTE).resumed).toBe(true);
  });

  it("새 버전 확인은 10분에 1번까지", () => {
    let tracker = INITIAL_VISIBILITY;
    const visibleAt = (now: number): boolean => {
      tracker = onHidden(tracker, now - 1_000);
      const outcome = onVisible(tracker, now);
      tracker = outcome.next;
      return outcome.check;
    };
    expect(visibleAt(T0)).toBe(true);
    expect(visibleAt(T0 + 2 * MINUTE)).toBe(false);
    expect(visibleAt(T0 + 10 * MINUTE - 1)).toBe(false);
    expect(visibleAt(T0 + 10 * MINUTE)).toBe(true);
    expect(visibleAt(T0 + 11 * MINUTE)).toBe(false);
  });
});
