import { describe, expect, it } from "vitest";
import { formatPixelRatio, pixelRatioOption, pixelRatioOverride } from "./pixelRatioParam.ts";

describe("pixelRatioOverride", () => {
  it("1~4 안의 숫자를 읽는다", () => {
    expect(pixelRatioOverride("?pixel-ratio=2")).toBe(2);
    expect(pixelRatioOverride("?pixel-ratio=2.5")).toBe(2.5);
    expect(pixelRatioOverride("?planet-debug=cracks&pixel-ratio=3.5")).toBe(3.5);
    expect(pixelRatioOverride("?pixel-ratio=1")).toBe(1);
    expect(pixelRatioOverride("?pixel-ratio=4")).toBe(4);
  });

  it("없거나, 숫자가 아니거나, 범위 밖이면 무시한다", () => {
    expect(pixelRatioOverride("")).toBeUndefined();
    expect(pixelRatioOverride("?planet-debug=cracks")).toBeUndefined();
    expect(pixelRatioOverride("?pixel-ratio=")).toBeUndefined();
    expect(pixelRatioOverride("?pixel-ratio=%20")).toBeUndefined();
    expect(pixelRatioOverride("?pixel-ratio=abc")).toBeUndefined();
    expect(pixelRatioOverride("?pixel-ratio=0.5")).toBeUndefined();
    expect(pixelRatioOverride("?pixel-ratio=4.01")).toBeUndefined();
    expect(pixelRatioOverride("?pixel-ratio=Infinity")).toBeUndefined();
    expect(pixelRatioOverride("?pixel-ratio=NaN")).toBeUndefined();
  });

  it("엔진 옵션: 값이 없으면 키를 넣지 않는다", () => {
    expect(pixelRatioOption("?pixel-ratio=3")).toEqual({ maxPixelRatio: 3 });
    expect(pixelRatioOption("?pixel-ratio=9")).toEqual({});
    expect("maxPixelRatio" in pixelRatioOption("")).toBe(false);
  });
});

describe("formatPixelRatio", () => {
  it("소수 둘째 자리까지, 끝의 0 없이", () => {
    expect(formatPixelRatio(2)).toBe("2");
    expect(formatPixelRatio(1.5)).toBe("1.5");
    expect(formatPixelRatio(3.5)).toBe("3.5");
    expect(formatPixelRatio(2.6666)).toBe("2.67");
  });
});
