// 바닷가 NPC 도시의 부두 목표 시험(기획 D-541 1281 나, npc/cityBuild.ts withCoastalDock) — 목표에 부두 하나, 이미 있으면 그대로
import { describe, expect, it } from "vitest";
import { withCoastalDock } from "./cityBuild.ts";

describe("바닷가 부두 목표", () => {
  it("바닷가면 부두 하나를 더하고, 아니면 목표 그대로", () => {
    const base = new Map([["farm", 2]]);
    expect(withCoastalDock(base, undefined)).toBe(base);
    expect(withCoastalDock(undefined, undefined)).toBeUndefined();
    const coast = withCoastalDock(base, "dock");
    expect(coast?.get("dock")).toBe(1);
    expect(coast?.get("farm")).toBe(2);
    // 원래 목표는 고치지 않는다
    expect(base.has("dock")).toBe(false);
    expect(withCoastalDock(undefined, "dock")?.get("dock")).toBe(1);
    // 나라 목표에 이미 부두가 있으면 그대로
    const already = new Map([["dock", 2]]);
    expect(withCoastalDock(already, "dock")).toBe(already);
  });
});
