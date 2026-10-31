import { DEFAULT_CYBORG_APPEARANCE } from "@terra/shared/cyborg";
import { describe, expect, it } from "vitest";
import { type CyborgGateState, gateHolds, gateRedirect, opensWithoutCyborg } from "./cyborgGate.ts";

const none: CyborgGateState = { status: "none", userId: "u" };
const ready: CyborgGateState = {
  status: "ready",
  userId: "u",
  name: "Nova",
  appearance: DEFAULT_CYBORG_APPEARANCE,
};
const checking: CyborgGateState = { status: "checking", userId: "u" };
const unknown: CyborgGateState = { status: "unknown", userId: "u" };

describe("첫 접속 길잡이", () => {
  it("플레이어는 설정·만들기 화면만 사이보그 없이 연다", () => {
    expect(opensWithoutCyborg("settings", ["player"])).toBe(true);
    expect(opensWithoutCyborg("start", ["player"])).toBe(true);
    for (const id of ["home", "map", "units", "cyborg", "faction", "economy_market", "admin", "dev"] as const)
      expect(opensWithoutCyborg(id, ["player"])).toBe(false);
  });

  it("dev·admin은 관리자·개발자 도구·지도도 연다(D-445 177)", () => {
    for (const id of ["admin", "dev", "dev_planet_editor", "map", "map_planet"] as const) {
      expect(opensWithoutCyborg(id, ["player", "dev"])).toBe(true);
      expect(opensWithoutCyborg(id, ["player", "admin"])).toBe(true);
    }
    expect(opensWithoutCyborg("home", ["player", "admin"])).toBe(false);
    expect(opensWithoutCyborg("units", ["player", "dev"])).toBe(false);
  });

  it("사이보그가 없으면 /start로, 만들었으면 /start에서 홈으로, 모르면 그대로", () => {
    expect(gateRedirect(none, "home", ["player"])).toBe("start");
    expect(gateRedirect(none, "settings", ["player"])).toBeNull();
    expect(gateRedirect(none, "start", ["player"])).toBeNull();
    expect(gateRedirect(none, "map", ["player", "dev"])).toBeNull();
    expect(gateRedirect(ready, "start", ["player"])).toBe("home");
    expect(gateRedirect(ready, "home", ["player"])).toBeNull();
    expect(gateRedirect(unknown, "home", ["player"])).toBeNull();
    expect(gateRedirect(checking, "home", ["player"])).toBeNull();
    // 없는 주소는 "없는 화면" 안내 그대로
    expect(gateRedirect(none, null, ["player"])).toBeNull();
  });

  it("묻는 중·보내는 중에는 막는 주소를 그리지 않는다. 설정은 늘 그린다", () => {
    expect(gateHolds(checking, "home", ["player"])).toBe(true);
    expect(gateHolds(checking, "settings", ["player"])).toBe(false);
    expect(gateHolds(checking, "start", ["player"])).toBe(true);
    expect(gateHolds(none, "home", ["player"])).toBe(true);
    expect(gateHolds(none, "start", ["player"])).toBe(false);
    expect(gateHolds(ready, "start", ["player"])).toBe(true);
    expect(gateHolds(ready, "home", ["player"])).toBe(false);
    expect(gateHolds(unknown, "home", ["player"])).toBe(false);
    expect(gateHolds({ status: "idle" }, "units", ["player"])).toBe(true);
  });
});
