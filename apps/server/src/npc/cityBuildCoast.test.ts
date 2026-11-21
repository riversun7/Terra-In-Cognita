// 바닷가 NPC 도시의 부두 목표 시험(기획 D-541 1281 나, npc/cityBuild.ts withCoastalDock) — 목표에 부두 하나, 이미 있으면 그대로
import { describe, expect, it } from "vitest";
import { wantsShareExchange, withCoastalDock } from "./cityBuild.ts";

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

describe("증권 거래소 목표(D-587 2474 다 — 상업 성향 문턱)", () => {
  const npc = { traitMin: 0, traitMax: 1000 };
  it("상업 성향 배율(500~1500‰)이 문턱 이상이면 짓는다, 문턱이 없거나 1501이면 짓지 않는다", () => {
    expect(wantsShareExchange(500, { npc, business: { cityShareNpcExchangePm: 1000 } })).toBe(true);
    expect(wantsShareExchange(499, { npc, business: { cityShareNpcExchangePm: 1000 } })).toBe(false);
    expect(wantsShareExchange(1000, { npc, business: { cityShareNpcExchangePm: 1501 } })).toBe(false);
    expect(wantsShareExchange(1000, { npc, business: {} })).toBe(false);
    expect(wantsShareExchange(1000, { business: { cityShareNpcExchangePm: 500 } })).toBe(false);
  });
});
