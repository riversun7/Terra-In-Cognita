import { describe, expect, it } from "vitest";
import { createBuildMode } from "./buildMode.ts";

describe("건축 모드 상태", () => {
  it("열기 → 고르기 → 누르기 → 돌리기 → 닫기, 꺼져 있으면 누르기를 가로채지 않는다", () => {
    const mode = createBuildMode();
    let calls = 0;
    mode.subscribe(() => {
      calls += 1;
    });
    expect(mode.tap({ x: 1, y: 1 })).toBe(false);
    mode.open();
    // 시설을 고르기 전에는 가로채기만 하고 자리는 없다
    expect(mode.tap({ x: 5, y: 6 })).toBe(true);
    expect(mode.snapshot().tap).toBeNull();
    mode.choose("workshop");
    expect(mode.tap({ x: 5.5, y: 6.5 })).toBe(true);
    expect(mode.snapshot()).toMatchObject({ active: true, facility: "workshop", tap: { x: 5.5, y: 6.5 } });
    mode.rotate();
    expect(mode.snapshot().rotation).toBe(90);
    // 다른 시설을 고르면 자리를 지운다
    mode.choose("sawmill");
    expect(mode.snapshot().tap).toBeNull();
    mode.close();
    expect(mode.snapshot()).toEqual({ active: false, facility: null, tap: null, rotation: 0 });
    expect(calls).toBeGreaterThan(0);
  });
});
