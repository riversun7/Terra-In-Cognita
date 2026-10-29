import { describe, expect, it } from "vitest";
import { planetViewOption, planetViewOverride } from "./planetViewParam.ts";

describe("planetViewOverride", () => {
  it("위도,경도[,거리 km]를 읽는다", () => {
    expect(planetViewOverride("?planet-view=20,30")).toEqual({ latDeg: 20, lonDeg: 30 });
    expect(planetViewOverride("?planet-view=-45.5,%20170,1500")).toEqual({
      latDeg: -45.5,
      lonDeg: 170,
      distanceM: 1_500_000,
    });
    expect(planetViewOverride("?planet-time=1&planet-view=0,-180,12")).toEqual({
      latDeg: 0,
      lonDeg: -180,
      distanceM: 12_000,
    });
  });

  it("없거나 틀리면 무시한다", () => {
    expect(planetViewOverride("")).toBeUndefined();
    expect(planetViewOverride("?planet-view=")).toBeUndefined();
    expect(planetViewOverride("?planet-view=20")).toBeUndefined();
    expect(planetViewOverride("?planet-view=20,30,40,50")).toBeUndefined();
    expect(planetViewOverride("?planet-view=91,0")).toBeUndefined();
    expect(planetViewOverride("?planet-view=0,400")).toBeUndefined();
    expect(planetViewOverride("?planet-view=0,0,0")).toBeUndefined();
    expect(planetViewOverride("?planet-view=0,0,-5")).toBeUndefined();
    expect(planetViewOverride("?planet-view=a,b")).toBeUndefined();
    expect(planetViewOverride("?planet-view=0,,5")).toBeUndefined();
  });

  it("엔진 옵션: 값이 없으면 키를 넣지 않는다", () => {
    expect(planetViewOption("?planet-view=1,2,3")).toEqual({
      initialView: { latDeg: 1, lonDeg: 2, distanceM: 3000 },
    });
    expect("initialView" in planetViewOption("?planet-view=x")).toBe(false);
  });
});
