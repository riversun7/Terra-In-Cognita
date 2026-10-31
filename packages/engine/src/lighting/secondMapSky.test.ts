import { cellKey } from "@terra/planet";
import { describe, expect, it } from "vitest";
import { FIXED_SECOND_MAP_LIGHT, secondMapPlace, utcMsForLocalHour } from "./secondMapLight.ts";
import { LIGHT_BLEND_MS, SecondMapSky } from "./secondMapSky.ts";

const place = secondMapPlace(cellKey(0, 9, 256, 256));
if (!place) throw new Error("no place");
const noon = utcMsForLocalHour(place.lonDeg, 12);
const midnight = utcMsForLocalHour(place.lonDeg, 23);

describe("2차맵 하늘 시계", () => {
  it("끔·자리 없음은 고정 빛이고 시계가 돌지 않는다", () => {
    const off = new SecondMapSky(place);
    expect(off.tick(0)).toBe(false);
    expect(off.light).toBe(FIXED_SECOND_MAP_LIGHT);
    expect(off.clockState).toBe("off");
    expect(off.ticking).toBe(false);
    const nowhere = new SecondMapSky(null, { kind: "fixed", utcMs: midnight });
    expect(nowhere.tick(0)).toBe(false);
    expect(nowhere.clockState).toBe("off");
  });

  it("멈춘 시각은 첫 tick에 바로 그 빛이다(옮기지 않는다)", () => {
    const sky = new SecondMapSky(place, { kind: "fixed", utcMs: midnight });
    expect(sky.ticking).toBe(false);
    expect(sky.tick(0)).toBe(true);
    expect(sky.clockState).toBe("fixed");
    expect(sky.blending).toBe(false);
    expect(sky.light.day).toBe(0);
    expect(sky.tick(1000)).toBe(false);
    expect(sky.changeCount).toBe(1);
  });

  it("시계를 재기 전엔 낮(고정 빛), 재면 0.5초에 걸쳐 옮긴다", () => {
    let now: number | null = null;
    const sky = new SecondMapSky(place, { kind: "clock", serverNow: () => now, source: () => "server" });
    expect(sky.ticking).toBe(true);
    expect(sky.tick(0)).toBe(false);
    expect(sky.clockState).toBe("waiting");
    expect(sky.light).toBe(FIXED_SECOND_MAP_LIGHT);
    now = midnight;
    expect(sky.tick(1000)).toBe(true);
    expect(sky.clockState).toBe("server");
    expect(sky.blending).toBe(true);
    expect(sky.frame(1000 + LIGHT_BLEND_MS / 2)).toBe(true);
    const halfway = sky.light.day;
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(1);
    expect(sky.frame(1000 + LIGHT_BLEND_MS)).toBe(false);
    expect(sky.blending).toBe(false);
    expect(sky.light.day).toBe(0);
  });

  it("평소 걸음은 바로 바꾸고, 바뀐 게 없으면 다시 그리지 않는다", () => {
    let now = noon;
    const sky = new SecondMapSky(place, { kind: "clock", serverNow: () => now });
    expect(sky.tick(0)).toBe(true);
    expect(sky.blending).toBe(false);
    now += 1000;
    expect(sky.tick(1000)).toBe(false);
    now += 30_000;
    expect(sky.tick(2000)).toBe(true);
    expect(sky.blending).toBe(false);
  });

  it("모드를 바꾸면 옮기고, 끔으로 가면 고정 빛이 된다", () => {
    const sky = new SecondMapSky(place, { kind: "fixed", utcMs: midnight });
    sky.tick(0);
    expect(sky.setMode({ kind: "off" }, 100)).toBe(true);
    expect(sky.blending).toBe(true);
    sky.frame(100 + LIGHT_BLEND_MS);
    expect(sky.light).toBe(FIXED_SECOND_MAP_LIGHT);
    expect(sky.ticking).toBe(false);
  });
});
